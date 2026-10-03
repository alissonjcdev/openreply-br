// Link previews for posts and reels shared into DMs. Meta returns those
// shares as instagram.com permalinks (an HTML page), so the cover image and
// author come from the page's Open Graph tags.
//
// Only instagram.com URLs are fetched (no open proxy / SSRF), each with a
// short timeout, and results are cached in memory so polling the inbox does
// not refetch the same page.

export interface LinkPreview {
  image?: string;
  author?: string;
}

const ALLOWED_HOSTS = new Set(["www.instagram.com", "instagram.com"]);
const TTL_MS = 6 * 60 * 60 * 1000;
const FAIL_TTL_MS = 30 * 60 * 1000;
const MAX_ENTRIES = 1000;
const cache = new Map<string, { value: LinkPreview; expires: number }>();

export function isInstagramPermalink(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && ALLOWED_HOSTS.has(u.hostname);
  } catch {
    return false;
  }
}

function decodeEntities(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)));
}

function metaContent(html: string, property: string): string | undefined {
  const match =
    html.match(new RegExp(`<meta[^>]+property="${property}"[^>]+content="([^"]*)"`, "i")) ??
    html.match(new RegExp(`<meta[^>]+content="([^"]*)"[^>]+property="${property}"`, "i"));
  return match ? decodeEntities(match[1]) : undefined;
}

export function parseLinkPreview(html: string): LinkPreview {
  const image = metaContent(html, "og:image");
  const title = metaContent(html, "og:title");
  // "Name on Instagram: "caption"" -> "Name"
  const author = title?.split(/ on Instagram/i)[0]?.trim() || undefined;
  return {
    image: image && image.startsWith("https://") ? image : undefined,
    author,
  };
}

async function fetchPreview(url: string): Promise<LinkPreview> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "user-agent": "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
        accept: "text/html",
      },
    });
    if (!response.ok) return {};
    // A redirect off Instagram (login wall elsewhere, etc.) is not trusted.
    if (!isInstagramPermalink(response.url)) return {};
    const html = (await response.text()).slice(0, 200_000);
    return parseLinkPreview(html);
  } catch {
    return {};
  } finally {
    clearTimeout(timer);
  }
}

export async function getLinkPreviews(urls: string[]): Promise<Map<string, LinkPreview>> {
  const now = Date.now();
  const result = new Map<string, LinkPreview>();
  const pending: string[] = [];
  for (const url of new Set(urls)) {
    if (!isInstagramPermalink(url)) continue;
    const hit = cache.get(url);
    if (hit && hit.expires > now) result.set(url, hit.value);
    else pending.push(url);
  }

  // Small batches keep a thread full of shares from fanning out at once.
  for (let i = 0; i < pending.length; i += 6) {
    const batch = pending.slice(i, i + 6);
    const values = await Promise.all(batch.map(fetchPreview));
    batch.forEach((url, index) => {
      const value = values[index];
      result.set(url, value);
      cache.set(url, { value, expires: now + (value.image ? TTL_MS : FAIL_TTL_MS) });
    });
  }

  if (cache.size > MAX_ENTRIES) {
    for (const key of [...cache.keys()].slice(0, cache.size - MAX_ENTRIES)) cache.delete(key);
  }
  return result;
}
