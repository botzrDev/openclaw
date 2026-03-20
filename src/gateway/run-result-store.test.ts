import { afterEach, describe, expect, it, vi } from "vitest";
import { RunResultStore } from "./run-result-store.js";

afterEach(() => {
  vi.useRealTimers();
});

describe("RunResultStore.get", () => {
  it("returns null for unknown runId", () => {
    const store = new RunResultStore();
    expect(store.get("no-such-id")).toBeNull();
  });

  it("returns pending entry after setPending", () => {
    const store = new RunResultStore();
    store.setPending("run-1");
    const result = store.get("run-1");
    expect(result).not.toBeNull();
    expect(result?.status).toBe("pending");
    if (result?.status === "pending") {
      expect(typeof result.queuedAt).toBe("number");
      expect(result.queuedAt).toBeGreaterThan(0);
    }
  });

  it("returns ok entry after setOk", () => {
    const store = new RunResultStore();
    store.setOk("run-2", "some output", "short summary");
    const result = store.get("run-2");
    expect(result?.status).toBe("ok");
    if (result?.status === "ok") {
      expect(result.output).toBe("some output");
      expect(result.summary).toBe("short summary");
      expect(typeof result.completedAt).toBe("number");
    }
  });

  it("returns ok entry without summary", () => {
    const store = new RunResultStore();
    store.setOk("run-3", "output only");
    const result = store.get("run-3");
    expect(result?.status).toBe("ok");
    if (result?.status === "ok") {
      expect(result.output).toBe("output only");
      expect(result.summary).toBeUndefined();
    }
  });

  it("returns error entry after setError", () => {
    const store = new RunResultStore();
    store.setError("run-4", "timed out");
    const result = store.get("run-4");
    expect(result?.status).toBe("error");
    if (result?.status === "error") {
      expect(result.error).toBe("timed out");
      expect(typeof result.completedAt).toBe("number");
    }
  });

  it("returns null after TTL expiry", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));

    const ttlMs = 30 * 60 * 1000;
    const store = new RunResultStore(ttlMs);
    store.setPending("run-ttl");
    expect(store.get("run-ttl")).not.toBeNull();

    // Advance past 30-minute TTL
    vi.setSystemTime(new Date("2026-01-01T00:31:00Z"));
    expect(store.get("run-ttl")).toBeNull();
  });

  it("returns null after default 30-min TTL", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));

    const store = new RunResultStore();
    store.setPending("run-default-ttl");
    expect(store.get("run-default-ttl")).not.toBeNull();

    vi.setSystemTime(new Date("2026-01-01T00:31:00Z"));
    expect(store.get("run-default-ttl")).toBeNull();
  });
});

describe("RunResultStore lifecycle", () => {
  it("setOk after setPending on same runId returns ok", () => {
    const store = new RunResultStore();
    store.setPending("lifecycle-1");
    store.setOk("lifecycle-1", "completed output");
    const result = store.get("lifecycle-1");
    expect(result?.status).toBe("ok");
    if (result?.status === "ok") {
      expect(result.output).toBe("completed output");
    }
  });

  it("setError after setPending on same runId returns error", () => {
    const store = new RunResultStore();
    store.setPending("lifecycle-2");
    store.setError("lifecycle-2", "agent failed");
    const result = store.get("lifecycle-2");
    expect(result?.status).toBe("error");
    if (result?.status === "error") {
      expect(result.error).toBe("agent failed");
    }
  });
});

describe("RunResultStore max-entries eviction", () => {
  it("evicts the oldest entry when exceeding 2000 entries", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));

    const store = new RunResultStore();

    // Fill up to 2000 entries
    for (let i = 0; i < 2000; i++) {
      store.setPending(`run-evict-${i}`);
    }
    expect(store.get("run-evict-0")).not.toBeNull();

    // Insert entry 2001 — should evict run-evict-0
    store.setPending("run-evict-2000");
    expect(store.get("run-evict-0")).toBeNull();
    expect(store.get("run-evict-2000")).not.toBeNull();
  });
});
