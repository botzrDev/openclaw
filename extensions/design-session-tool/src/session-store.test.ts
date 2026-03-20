import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearSession, getSession, upsertSession } from "./session-store.js";

// Each test uses a unique prefix to avoid bleed between tests (store is module-level).
let keySeq = 0;
function key(label = "k"): string {
  return `test:${label}:${++keySeq}`;
}

afterEach(() => {
  vi.useRealTimers();
});

describe("getSession", () => {
  it("returns null for unknown key", () => {
    expect(getSession("no-such-key-xyz")).toBeNull();
  });

  it("returns the session after upsert", () => {
    const k = key("get");
    upsertSession(k, { activeTool: "figma", activeFile: "abc123" });
    const s = getSession(k);
    expect(s).not.toBeNull();
    expect(s?.sessionKey).toBe(k);
    expect(s?.activeTool).toBe("figma");
    expect(s?.activeFile).toBe("abc123");
  });

  it("returns null after the session expires", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));

    const k = key("expire");
    upsertSession(k, { activeTool: "pencil" });
    expect(getSession(k)).not.toBeNull();

    // Advance past the 4-hour TTL
    vi.setSystemTime(new Date("2026-01-01T04:01:00Z"));
    expect(getSession(k)).toBeNull();
  });
});

describe("upsertSession", () => {
  it("creates a new session with provided fields", () => {
    const k = key("create");
    const s = upsertSession(k, { activeTool: "pencil", activeFile: "/designs/ui.pen" });
    expect(s.sessionKey).toBe(k);
    expect(s.activeTool).toBe("pencil");
    expect(s.activeFile).toBe("/designs/ui.pen");
    expect(s.createdAt).toBeGreaterThan(0);
    expect(s.updatedAt).toBeGreaterThan(0);
  });

  it("merges fields on subsequent calls — preserves existing values", () => {
    const k = key("merge");
    upsertSession(k, { activeTool: "figma", activeFile: "abc123" });
    const s = upsertSession(k, { activeNodeIds: "1:2,3:4" });
    // Original fields survive
    expect(s.activeTool).toBe("figma");
    expect(s.activeFile).toBe("abc123");
    // New field added
    expect(s.activeNodeIds).toBe("1:2,3:4");
  });

  it("overwrites a field when re-set", () => {
    const k = key("overwrite");
    upsertSession(k, { activeTool: "pencil", activeFile: "old.pen" });
    const s = upsertSession(k, { activeFile: "new.pen" });
    expect(s.activeFile).toBe("new.pen");
    expect(s.activeTool).toBe("pencil"); // unchanged
  });

  it("preserves createdAt but updates updatedAt on subsequent upserts", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T10:00:00Z"));

    const k = key("timestamps");
    const first = upsertSession(k, { activeTool: "figma" });
    const createdAt = first.createdAt;

    vi.setSystemTime(new Date("2026-01-01T10:05:00Z"));
    const second = upsertSession(k, { activeFile: "xyz" });

    expect(second.createdAt).toBe(createdAt);
    expect(second.updatedAt).toBeGreaterThan(createdAt);
  });

  it("refreshes TTL on update so session does not expire mid-task", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));

    const k = key("refresh-ttl");
    upsertSession(k, { activeTool: "figma" });

    // Advance 3 h 55 min — close to expiry but not yet
    vi.setSystemTime(new Date("2026-01-01T03:55:00Z"));
    // Touch the session — this should reset its TTL
    upsertSession(k, { notes: "still working" });

    // Advance another 3 h 55 min — would have expired without the refresh
    vi.setSystemTime(new Date("2026-01-01T07:50:00Z"));
    expect(getSession(k)).not.toBeNull();
  });

  it("stores all optional fields", () => {
    const k = key("all-fields");
    const s = upsertSession(k, {
      activeTool: "illustrator",
      activeFile: "poster.ai",
      activeNodeIds: "g1,g2",
      activePageId: "page-artboard-1",
      notes: "working on the hero section",
    });
    expect(s.activeTool).toBe("illustrator");
    expect(s.activeFile).toBe("poster.ai");
    expect(s.activeNodeIds).toBe("g1,g2");
    expect(s.activePageId).toBe("page-artboard-1");
    expect(s.notes).toBe("working on the hero section");
  });
});

describe("clearSession", () => {
  it("returns false for a non-existent key", () => {
    expect(clearSession("ghost-key-xyz")).toBe(false);
  });

  it("removes the session and returns true", () => {
    const k = key("clear");
    upsertSession(k, { activeTool: "figma" });
    expect(clearSession(k)).toBe(true);
    expect(getSession(k)).toBeNull();
  });

  it("is idempotent — second clear returns false", () => {
    const k = key("clear-twice");
    upsertSession(k, { activeTool: "pencil" });
    expect(clearSession(k)).toBe(true);
    expect(clearSession(k)).toBe(false);
  });
});

describe("TTL pruning", () => {
  it("prunes expired entries lazily on next write", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));

    const k1 = key("prune-1");
    const k2 = key("prune-2");
    upsertSession(k1, { activeTool: "figma" });

    // Advance past TTL
    vi.setSystemTime(new Date("2026-01-01T04:01:00Z"));

    // k2 write triggers prune — k1 should be gone
    upsertSession(k2, { activeTool: "pencil" });

    expect(getSession(k1)).toBeNull();
    expect(getSession(k2)).not.toBeNull();
  });
});
