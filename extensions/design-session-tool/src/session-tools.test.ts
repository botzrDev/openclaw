import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Mock plugin-sdk before importing the tools so the import graph resolves.
// readStringParam: extracts a string from the raw params map.
// jsonResult: wraps a value in the tool result envelope the agent runtime expects.
// optionalStringEnum: used only for schema definitions — no runtime mock needed.
// ---------------------------------------------------------------------------

vi.mock("openclaw/plugin-sdk/agent-runtime", () => ({
  readStringParam: (raw: Record<string, unknown>, key: string, opts?: { required?: boolean }) => {
    const val = raw[key];
    if (opts?.required && (val === undefined || val === null || val === "")) {
      throw new Error(`Missing required param: ${key}`);
    }
    return typeof val === "string" ? val : undefined;
  },
  readNumberParam: () => undefined,
  jsonResult: (data: unknown) => ({ type: "json", data }),
}));

vi.mock("openclaw/plugin-sdk/core", () => ({
  optionalStringEnum: () => ({ type: "string" }),
  definePluginEntry: (entry: unknown) => entry,
}));

// Import after mocks are registered
const { designSessionGetTool } = await import("./session-tools.js");
const { designSessionSetTool } = await import("./session-tools.js");
const { designSessionClearTool } = await import("./session-tools.js");
const { clearSession, getSession, upsertSession } = await import("./session-store.js");

let keySeq = 0;
function key(label = "t"): string {
  return `tool-test:${label}:${++keySeq}`;
}

afterEach(() => {
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------
// design_session_get
// ---------------------------------------------------------------------------

describe("design_session_get tool", () => {
  it("returns { exists: false } for unknown session", async () => {
    const k = key("get-miss");
    const result = await designSessionGetTool.execute("id1", { session_key: k });
    expect(result.data).toMatchObject({ sessionKey: k, exists: false });
  });

  it("throws when session_key is missing", async () => {
    await expect(designSessionGetTool.execute("id2", {})).rejects.toThrow("session_key");
  });

  it("returns the stored session", async () => {
    const k = key("get-hit");
    upsertSession(k, { activeTool: "figma", activeFile: "abc123" });
    const result = await designSessionGetTool.execute("id3", { session_key: k });
    expect(result.data).toMatchObject({ sessionKey: k, activeTool: "figma", activeFile: "abc123" });
  });
});

// ---------------------------------------------------------------------------
// design_session_set
// ---------------------------------------------------------------------------

describe("design_session_set tool", () => {
  it("throws when session_key is missing", async () => {
    await expect(designSessionSetTool.execute("id4", {})).rejects.toThrow("session_key");
  });

  it("creates a session with provided fields", async () => {
    const k = key("set-create");
    const result = await designSessionSetTool.execute("id5", {
      session_key: k,
      active_tool: "pencil",
      active_file: "/projects/ui.pen",
      active_node_ids: "n1,n2",
      active_page_id: "page-1",
      notes: "initial setup",
    });
    expect(result.data.ok).toBe(true);
    expect(result.data.session).toMatchObject({
      sessionKey: k,
      activeTool: "pencil",
      activeFile: "/projects/ui.pen",
      activeNodeIds: "n1,n2",
      activePageId: "page-1",
      notes: "initial setup",
    });
  });

  it("merges partial updates without clobbering existing fields", async () => {
    const k = key("set-merge");
    upsertSession(k, { activeTool: "figma", activeFile: "file123", notes: "original" });

    const result = await designSessionSetTool.execute("id6", {
      session_key: k,
      active_node_ids: "x:1",
    });
    const session = result.data.session;
    // Existing fields preserved
    expect(session.activeTool).toBe("figma");
    expect(session.activeFile).toBe("file123");
    expect(session.notes).toBe("original");
    // New field added
    expect(session.activeNodeIds).toBe("x:1");
  });

  it("ignores unknown active_tool values", async () => {
    const k = key("set-bad-tool");
    const result = await designSessionSetTool.execute("id7", {
      session_key: k,
      active_tool: "photoshop", // not a valid ActiveTool
    });
    // Should still succeed but activeTool not set
    expect(result.data.ok).toBe(true);
    expect(result.data.session.activeTool).toBeUndefined();
  });

  it("persists the session so get can retrieve it", async () => {
    const k = key("set-persists");
    await designSessionSetTool.execute("id8", {
      session_key: k,
      active_tool: "illustrator",
      active_file: "poster.ai",
    });
    const stored = getSession(k);
    expect(stored?.activeTool).toBe("illustrator");
    expect(stored?.activeFile).toBe("poster.ai");
  });
});

// ---------------------------------------------------------------------------
// design_session_clear
// ---------------------------------------------------------------------------

describe("design_session_clear tool", () => {
  it("throws when session_key is missing", async () => {
    await expect(designSessionClearTool.execute("id9", {})).rejects.toThrow("session_key");
  });

  it("removes an existing session and reports removed=true", async () => {
    const k = key("clear-hit");
    upsertSession(k, { activeTool: "pencil" });

    const result = await designSessionClearTool.execute("id10", { session_key: k });
    expect(result.data).toMatchObject({ ok: true, sessionKey: k, removed: true });
    expect(getSession(k)).toBeNull();
  });

  it("reports removed=false for a non-existent session", async () => {
    const k = key("clear-miss");
    const result = await designSessionClearTool.execute("id11", { session_key: k });
    expect(result.data).toMatchObject({ ok: true, sessionKey: k, removed: false });
  });

  it("is idempotent — second clear returns removed=false", async () => {
    const k = key("clear-idempotent");
    upsertSession(k, { activeTool: "figma" });
    await designSessionClearTool.execute("id12", { session_key: k });
    const result = await designSessionClearTool.execute("id13", { session_key: k });
    expect(result.data.removed).toBe(false);
  });
});
