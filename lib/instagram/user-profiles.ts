import * as meta from "@/lib/meta/client";
import type { InstagramContext } from "./context";

// Profile photos for inbox contacts. The picture URL is a signed CDN link that
// expires, so entries live a few hours; the inbox polls, so without the cache
// every refresh would call the profile API once per conversation.
const TTL_MS = 3 * 60 * 60 * 1000;
const MAX_ENTRIES = 2000;
const cache = new Map<string, { value: meta.InstagramUserProfile | null; expires: number }>();

export async function getUserProfiles(
  context: InstagramContext,
  /** The business account the IGSIDs belong to (IGSIDs are per account). */
  accountId: string,
  igsids: string[]
): Promise<Map<string, meta.InstagramUserProfile>> {
  const result = new Map<string, meta.InstagramUserProfile>();
  // Zernio does not expose the profile API.
  if (context.provider !== "META") return result;

  const now = Date.now();
  const pending: string[] = [];
  for (const id of new Set(igsids.filter(Boolean))) {
    const key = `${accountId}:${id}`;
    const hit = cache.get(key);
    if (hit && hit.expires > now) {
      if (hit.value) result.set(id, hit.value);
    } else pending.push(id);
  }

  for (let i = 0; i < pending.length; i += 8) {
    const batch = pending.slice(i, i + 8);
    const values = await Promise.all(
      batch.map((id) => meta.getUserProfile(context.accessToken, id))
    );
    batch.forEach((id, index) => {
      const value = values[index];
      cache.set(`${accountId}:${id}`, { value, expires: now + TTL_MS });
      if (value) result.set(id, value);
    });
  }

  if (cache.size > MAX_ENTRIES) {
    for (const key of [...cache.keys()].slice(0, cache.size - MAX_ENTRIES)) cache.delete(key);
  }
  return result;
}
