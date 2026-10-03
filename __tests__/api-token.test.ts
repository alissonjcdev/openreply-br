import { createHash } from "crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const headerValue = vi.hoisted(() => ({ current: null as string | null }));
const findFirst = vi.hoisted(() => vi.fn());

vi.mock("next/headers", () => ({
  headers: async () => ({ get: () => headerValue.current }),
}));
vi.mock("@/lib/db/client", () => ({ prisma: { user: { findFirst } } }));

const TOKEN = "test-token-123";
const HASH = createHash("sha256").update(TOKEN).digest("hex");

async function load() {
  vi.resetModules();
  return (await import("../lib/api-token")).getApiTokenUserId;
}

beforeEach(() => {
  vi.unstubAllEnvs();
  headerValue.current = null;
  findFirst.mockReset();
  findFirst.mockResolvedValue({ id: "user_1" });
});

describe("API token auth", () => {
  it("is disabled when no hash is configured", async () => {
    vi.stubEnv("OPENREPLY_API_USER_EMAIL", "a@b.com");
    headerValue.current = `Bearer ${TOKEN}`;
    expect(await (await load())()).toBeNull();
    expect(findFirst).not.toHaveBeenCalled();
  });

  it("accepts the matching token as the configured user", async () => {
    vi.stubEnv("OPENREPLY_API_TOKEN_SHA256", HASH);
    vi.stubEnv("OPENREPLY_API_USER_EMAIL", "a@b.com");
    headerValue.current = `Bearer ${TOKEN}`;
    expect(await (await load())()).toBe("user_1");
  });

  it("rejects a wrong or missing token", async () => {
    vi.stubEnv("OPENREPLY_API_TOKEN_SHA256", HASH);
    vi.stubEnv("OPENREPLY_API_USER_EMAIL", "a@b.com");
    const get = await load();
    headerValue.current = "Bearer wrong";
    expect(await get()).toBeNull();
    headerValue.current = null;
    expect(await get()).toBeNull();
    expect(findFirst).not.toHaveBeenCalled();
  });

  it("ignores a malformed hash", async () => {
    vi.stubEnv("OPENREPLY_API_TOKEN_SHA256", "abc");
    vi.stubEnv("OPENREPLY_API_USER_EMAIL", "a@b.com");
    headerValue.current = `Bearer ${TOKEN}`;
    expect(await (await load())()).toBeNull();
  });
});
