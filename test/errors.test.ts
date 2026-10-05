import { describe, expect, it, vi } from "vitest";
import { FriendlyError, redactSecrets, toToolError } from "../src/errors.js";

describe("redactSecrets", () => {
  it("removes the API key and MCP secret from text", () => {
    vi.stubEnv("STEAM_API_KEY", "MYKEY123456");
    vi.stubEnv("MCP_SECRET", "my-long-secret-value");
    const text = "failed https://api.steampowered.com/x/?key=MYKEY123456&steamid=1 via /mcp/my-long-secret-value";
    const safe = redactSecrets(text);
    expect(safe).not.toContain("MYKEY123456");
    expect(safe).not.toContain("my-long-secret-value");
    expect(safe).toContain("steamid=1");
  });

  it("doesn't mangle messages when a configured value is very short", () => {
    vi.stubEnv("STEAM_API_KEY", "k");
    expect(redactSecrets("Steam rejected the API key")).toBe("Steam rejected the API key");
  });

  it("hides key= values in URLs even if they don't match the configured key", () => {
    expect(redactSecrets("https://x/?format=json&key=SOMEOTHERKEY&a=1")).toBe("https://x/?format=json&key=[redacted]&a=1");
  });
});

describe("toToolError", () => {
  it("shows FriendlyError messages as-is", () => {
    expect(toToolError(new FriendlyError("Be nice")).content[0].text).toBe("Be nice");
  });

  it("hides unexpected errors behind a generic message and logs them redacted", () => {
    vi.stubEnv("STEAM_API_KEY", "MYKEY123456");
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const result = toToolError(new Error("boom key=MYKEY123456"));
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/Something unexpected went wrong/);
    expect(String(error.mock.calls[0])).not.toContain("MYKEY123456");
    error.mockRestore();
  });
});
