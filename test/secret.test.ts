import { describe, expect, it, vi } from "vitest";
import { handleRequest } from "../api/mcp.js";
import { describeRejection, getSecretFromRequest, isValidSecret } from "../src/secret.js";

const SECRET = "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6";

describe("isValidSecret", () => {
  it("accepts the right secret", () => {
    expect(isValidSecret(SECRET, SECRET)).toBe(true);
  });

  it("rejects a wrong secret, including one that is almost right", () => {
    expect(isValidSecret("wrong", SECRET)).toBe(false);
    expect(isValidSecret(SECRET.slice(0, -1) + "x", SECRET)).toBe(false);
    expect(isValidSecret(SECRET + "extra", SECRET)).toBe(false);
  });

  it("rejects a missing secret", () => {
    expect(isValidSecret(undefined, SECRET)).toBe(false);
    expect(isValidSecret("", SECRET)).toBe(false);
  });

  it("rejects everything when MCP_SECRET is not set", () => {
    expect(isValidSecret("anything", undefined)).toBe(false);
    expect(isValidSecret("", "")).toBe(false);
  });

  it("rejects everything when MCP_SECRET is too short to be safe", () => {
    expect(isValidSecret("short", "short")).toBe(false);
    const thirtyOne = "a".repeat(31);
    expect(isValidSecret(thirtyOne, thirtyOne)).toBe(false);
  });

  it("rejects secrets with characters that don't survive a URL", () => {
    const withSlash = "abcdefghijklmnop/qrstuvwxyz0123456789";
    const withPercent = "abcdefghijklmnop%qrstuvwxyz0123456789";
    expect(isValidSecret(withSlash, withSlash)).toBe(false);
    expect(isValidSecret(withPercent, withPercent)).toBe(false);
  });

  it("rejects the example secrets printed in the docs", () => {
    const fromEnvExample = "replace-me-with-a-long-random-string";
    const fromReadme = "3f9c1e7a0b5d4c2e8f6a9b1c3d5e7f9a0b2c4d6e8f0a1b3c5d7e9f1a3b5c7d9";
    expect(isValidSecret(fromEnvExample, fromEnvExample)).toBe(false);
    expect(isValidSecret(fromReadme, fromReadme)).toBe(false);
    expect(describeRejection(fromReadme, fromReadme)).toMatch(/example value from the docs/);
  });
});

describe("getSecretFromRequest", () => {
  const secretOf = (url: string) => getSecretFromRequest(new Request(url));

  it("reads the secret from the /mcp/<secret> path", () => {
    expect(secretOf(`https://app.vercel.app/mcp/${SECRET}`)).toBe(SECRET);
    expect(secretOf(`https://app.vercel.app/mcp/${SECRET}/`)).toBe(SECRET);
  });

  it("reads the secret from the query string added by the Vercel rewrite", () => {
    expect(secretOf(`https://app.vercel.app/api/mcp?secret=${SECRET}`)).toBe(SECRET);
  });

  it("returns undefined when there is no secret", () => {
    expect(secretOf("https://app.vercel.app/mcp")).toBeUndefined();
    expect(secretOf("https://app.vercel.app/api/mcp")).toBeUndefined();
    expect(secretOf(`https://app.vercel.app/mcp/${SECRET}/extra`)).toBeUndefined();
  });

  it("ignores spaces around the secret", () => {
    expect(secretOf(`https://app.vercel.app/mcp/%20${SECRET}%20`)).toBe(SECRET);
  });

  it("returns undefined for malformed encoding instead of crashing", () => {
    expect(secretOf("https://app.vercel.app/mcp/%E0%A4%A")).toBeUndefined();
  });
});

describe("describeRejection", () => {
  it("explains each reason without revealing either secret", () => {
    expect(describeRejection(SECRET, undefined)).toMatch(/MCP_SECRET is not set/);
    expect(describeRejection("short", "short")).toMatch(/only 5 characters/);
    expect(describeRejection(undefined, SECRET)).toMatch(/URL has no secret/);
    const mismatch = describeRejection("wrong-secret-value", SECRET);
    expect(mismatch).toMatch(/URL secret: 18 characters, MCP_SECRET: 32 characters/);
    expect(mismatch).not.toContain(SECRET);
    expect(mismatch).not.toContain("wrong-secret-value");
  });
});

describe("handleRequest secret check", () => {
  const post = (url: string) =>
    handleRequest(
      new Request(url, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
      }),
    );

  it("returns 404 for a wrong or missing secret", async () => {
    vi.stubEnv("MCP_SECRET", SECRET);
    expect((await post("https://app.vercel.app/mcp/wrong-secret-wrong-secret")).status).toBe(404);
    expect((await post("https://app.vercel.app/api/mcp")).status).toBe(404);
    expect((await post("https://app.vercel.app/mcp")).status).toBe(404);
  });

  it("returns 404 for everyone when MCP_SECRET is not configured", async () => {
    vi.stubEnv("MCP_SECRET", "");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect((await post("https://app.vercel.app/mcp/anything-at-all-here")).status).toBe(404);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("accepts the right secret even if MCP_SECRET was pasted with spaces or a line break", async () => {
    vi.stubEnv("MCP_SECRET", `  ${SECRET}\n`);
    expect((await post(`https://app.vercel.app/mcp/${SECRET}`)).status).toBe(200);
  });

  it("logs why a request was refused, without the secret", async () => {
    vi.stubEnv("MCP_SECRET", SECRET);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await post("https://app.vercel.app/mcp/wrong-secret-wrong-secret");
    const logged = String(warn.mock.calls[0]);
    expect(logged).toMatch(/doesn't match MCP_SECRET/);
    expect(logged).not.toContain(SECRET);
    warn.mockRestore();
  });

  it("refuses JSON-RPC batches, even with the right secret", async () => {
    vi.stubEnv("MCP_SECRET", SECRET);
    const response = await handleRequest(
      new Request(`https://app.vercel.app/mcp/${SECRET}`, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
        body: JSON.stringify([
          { jsonrpc: "2.0", id: 1, method: "tools/list", params: {} },
          { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} },
        ]),
      }),
    );
    expect(response.status).toBe(400);
    expect((await response.json()).error.message).toMatch(/Batched requests are not supported/);
  });

  it("lets the request through with the right secret", async () => {
    vi.stubEnv("MCP_SECRET", SECRET);
    const response = await post(`https://app.vercel.app/mcp/${SECRET}`);
    expect(response.status).toBe(200);
  });

  it("does not reveal the secret in the 404 body", async () => {
    vi.stubEnv("MCP_SECRET", SECRET);
    const body = await (await post("https://app.vercel.app/mcp/nope-nope-nope-nope")).text();
    expect(body).not.toContain(SECRET);
  });
});
