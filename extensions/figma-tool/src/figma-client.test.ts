import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FigmaApiError, resolveFigmaToken } from "./figma-client.js";

// ---------------------------------------------------------------------------
// resolveFigmaToken
// ---------------------------------------------------------------------------

describe("resolveFigmaToken", () => {
  const originalEnv = process.env["FIGMA_TOKEN"];

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env["FIGMA_TOKEN"];
    } else {
      process.env["FIGMA_TOKEN"] = originalEnv;
    }
  });

  it("returns the config token when set", () => {
    process.env["FIGMA_TOKEN"] = "env-token";
    const token = resolveFigmaToken({ token: "config-token" });
    expect(token).toBe("config-token");
  });

  it("prefers config token over env var", () => {
    process.env["FIGMA_TOKEN"] = "env-token";
    const token = resolveFigmaToken({ token: "config-wins" });
    expect(token).toBe("config-wins");
  });

  it("falls back to FIGMA_TOKEN env var when config token is absent", () => {
    process.env["FIGMA_TOKEN"] = "env-fallback";
    const token = resolveFigmaToken({});
    expect(token).toBe("env-fallback");
  });

  it("falls back to FIGMA_TOKEN env var when config is null", () => {
    process.env["FIGMA_TOKEN"] = "env-fallback-null";
    const token = resolveFigmaToken(null);
    expect(token).toBe("env-fallback-null");
  });

  it("falls back to FIGMA_TOKEN env var when config token is empty string", () => {
    process.env["FIGMA_TOKEN"] = "env-fallback-empty";
    const token = resolveFigmaToken({ token: "   " });
    expect(token).toBe("env-fallback-empty");
  });

  it("throws when neither config token nor env var is set", () => {
    delete process.env["FIGMA_TOKEN"];
    expect(() => resolveFigmaToken({})).toThrow(/Figma token not configured/);
  });

  it("throws when config is undefined and env var is absent", () => {
    delete process.env["FIGMA_TOKEN"];
    expect(() => resolveFigmaToken(undefined)).toThrow(/Figma token not configured/);
  });
});

// ---------------------------------------------------------------------------
// FigmaApiError
// ---------------------------------------------------------------------------

describe("FigmaApiError", () => {
  it("carries the HTTP status code", () => {
    const err = new FigmaApiError(403, "Forbidden");
    expect(err.status).toBe(403);
  });

  it("formats the message with status and body text", () => {
    const err = new FigmaApiError(404, "File not found");
    expect(err.message).toContain("404");
    expect(err.message).toContain("File not found");
  });

  it("is an instance of Error", () => {
    const err = new FigmaApiError(500, "Internal Error");
    expect(err).toBeInstanceOf(Error);
  });

  it("has name FigmaApiError", () => {
    const err = new FigmaApiError(401, "Unauthorized");
    expect(err.name).toBe("FigmaApiError");
  });
});
