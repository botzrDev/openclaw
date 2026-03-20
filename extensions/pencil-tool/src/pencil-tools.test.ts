import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Mock plugin-sdk
// ---------------------------------------------------------------------------

vi.mock("openclaw/plugin-sdk/agent-runtime", () => ({
  readStringParam: (raw: Record<string, unknown>, key: string, opts?: { required?: boolean }) => {
    const val = raw[key];
    if (opts?.required && (val === undefined || val === null || val === "")) {
      throw new Error(`Missing required param: ${key}`);
    }
    return typeof val === "string" ? val : undefined;
  },
  jsonResult: (data: unknown) => ({ type: "json", data }),
}));

vi.mock("openclaw/plugin-sdk/core", () => ({
  optionalStringEnum: () => ({ type: "string" }),
}));

// ---------------------------------------------------------------------------
// Mock pencil-mcp-client
// ---------------------------------------------------------------------------

const callPencilToolMock = vi.fn();
const resolvePencilMcpOptionsMock = vi.fn(() => ({ command: "pencil", args: ["mcp"] }));

vi.mock("./pencil-mcp-client.js", () => ({
  callPencilTool: callPencilToolMock,
  extractPencilResultText: (result: {
    content?: Array<{ type: string; text?: string }>;
    isError?: boolean;
  }) => {
    if (result.isError) throw new Error("Pencil MCP error");
    return (result.content ?? [])
      .filter((c) => c.type === "text" && c.text)
      .map((c) => c.text ?? "")
      .join("\n");
  },
  resolvePencilMcpOptions: resolvePencilMcpOptionsMock,
}));

// Import tools after mocks
const {
  createPencilBatchDesignTool,
  createPencilBatchGetTool,
  createPencilScreenshotTool,
  createPencilOpenDocumentTool,
  createPencilExportNodesTool,
} = await import("./pencil-tools.js");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeApi(pluginConfig: unknown = { mcpCommand: "pencil", mcpArgs: ["mcp"] }) {
  return { pluginConfig } as { pluginConfig: unknown };
}

beforeEach(() => {
  vi.clearAllMocks();
  callPencilToolMock.mockResolvedValue({
    content: [{ type: "text", text: "ok" }],
  });
});

// ---------------------------------------------------------------------------
// pencil_batch_design
// ---------------------------------------------------------------------------

describe("createPencilBatchDesignTool", () => {
  it("splits operations string on newlines and passes array to callPencilTool", async () => {
    const tool = createPencilBatchDesignTool(makeApi());
    await tool.execute("id", {
      operations: 'btn=I("parent", {text: "Click"})\nU(btn, {fill: "#007AFF"})',
    });

    expect(callPencilToolMock).toHaveBeenCalledWith(
      "batch_design",
      { operations: ['btn=I("parent", {text: "Click"})', 'U(btn, {fill: "#007AFF"})'] },
      expect.any(Object),
    );
  });

  it("filters blank lines from operations", async () => {
    const tool = createPencilBatchDesignTool(makeApi());
    await tool.execute("id", {
      operations: 'btn=I("parent", {})\n\n   \nU(btn, {})',
    });

    const [, args] = callPencilToolMock.mock.calls[0] as [
      string,
      { operations: string[] },
      unknown,
    ];
    expect(args.operations).toEqual(['btn=I("parent", {})', "U(btn, {})"]);
  });

  it("throws when operations is missing", async () => {
    const tool = createPencilBatchDesignTool(makeApi());
    await expect(tool.execute("id", {})).rejects.toThrow(/operations/);
  });
});

// ---------------------------------------------------------------------------
// pencil_batch_get
// ---------------------------------------------------------------------------

describe("createPencilBatchGetTool", () => {
  it("passes patterns array to callPencilTool", async () => {
    const tool = createPencilBatchGetTool(makeApi());
    await tool.execute("id", { patterns: ["Button*", "Header/**"] });

    expect(callPencilToolMock).toHaveBeenCalledWith(
      "batch_get",
      expect.objectContaining({ patterns: ["Button*", "Header/**"] }),
      expect.any(Object),
    );
  });

  it("passes node_ids array to callPencilTool as nodeIds", async () => {
    const tool = createPencilBatchGetTool(makeApi());
    await tool.execute("id", { node_ids: ["abc123", "def456"] });

    expect(callPencilToolMock).toHaveBeenCalledWith(
      "batch_get",
      expect.objectContaining({ nodeIds: ["abc123", "def456"] }),
      expect.any(Object),
    );
  });

  it("passes both patterns and node_ids when provided", async () => {
    const tool = createPencilBatchGetTool(makeApi());
    await tool.execute("id", { patterns: ["Foo*"], node_ids: ["n1"] });

    expect(callPencilToolMock).toHaveBeenCalledWith(
      "batch_get",
      { patterns: ["Foo*"], nodeIds: ["n1"] },
      expect.any(Object),
    );
  });

  it("passes undefined for patterns/nodeIds when omitted", async () => {
    const tool = createPencilBatchGetTool(makeApi());
    await tool.execute("id", {});

    expect(callPencilToolMock).toHaveBeenCalledWith(
      "batch_get",
      { patterns: undefined, nodeIds: undefined },
      expect.any(Object),
    );
  });
});

// ---------------------------------------------------------------------------
// pencil_screenshot
// ---------------------------------------------------------------------------

describe("createPencilScreenshotTool", () => {
  it("omits nodeId from MCP args when node_id is not provided", async () => {
    const tool = createPencilScreenshotTool(makeApi());
    await tool.execute("id", {});

    expect(callPencilToolMock).toHaveBeenCalledWith("get_screenshot", {}, expect.any(Object));
  });

  it("passes nodeId when node_id is provided", async () => {
    const tool = createPencilScreenshotTool(makeApi());
    await tool.execute("id", { node_id: "abc123" });

    expect(callPencilToolMock).toHaveBeenCalledWith(
      "get_screenshot",
      { nodeId: "abc123" },
      expect.any(Object),
    );
  });
});

// ---------------------------------------------------------------------------
// pencil_open_document
// ---------------------------------------------------------------------------

describe("createPencilOpenDocumentTool", () => {
  it("passes path as filePathOrNew", async () => {
    const tool = createPencilOpenDocumentTool(makeApi());
    await tool.execute("id", { path: "/designs/ui.pen" });

    expect(callPencilToolMock).toHaveBeenCalledWith(
      "open_document",
      { filePathOrNew: "/designs/ui.pen" },
      expect.any(Object),
    );
  });

  it("passes 'new' as filePathOrNew for new document", async () => {
    const tool = createPencilOpenDocumentTool(makeApi());
    await tool.execute("id", { path: "new" });

    expect(callPencilToolMock).toHaveBeenCalledWith(
      "open_document",
      { filePathOrNew: "new" },
      expect.any(Object),
    );
  });

  it("throws when path is missing", async () => {
    const tool = createPencilOpenDocumentTool(makeApi());
    await expect(tool.execute("id", {})).rejects.toThrow(/path/);
  });
});

// ---------------------------------------------------------------------------
// pencil_export_nodes
// ---------------------------------------------------------------------------

describe("createPencilExportNodesTool", () => {
  it("defaults to format png when omitted", async () => {
    const tool = createPencilExportNodesTool(makeApi());
    await tool.execute("id", { node_ids: ["n1"], output_folder: "/tmp/exports" });

    expect(callPencilToolMock).toHaveBeenCalledWith(
      "export_nodes",
      expect.objectContaining({ format: "png" }),
      expect.any(Object),
    );
  });

  it("passes node_ids as nodeIds array", async () => {
    const tool = createPencilExportNodesTool(makeApi());
    await tool.execute("id", { node_ids: ["n1", "n2"], output_folder: "/tmp/out" });

    expect(callPencilToolMock).toHaveBeenCalledWith(
      "export_nodes",
      expect.objectContaining({ nodeIds: ["n1", "n2"] }),
      expect.any(Object),
    );
  });

  it("passes explicit format through", async () => {
    const tool = createPencilExportNodesTool(makeApi());
    await tool.execute("id", { node_ids: ["n1"], output_folder: "/tmp/out", format: "jpeg" });

    expect(callPencilToolMock).toHaveBeenCalledWith(
      "export_nodes",
      expect.objectContaining({ format: "jpeg" }),
      expect.any(Object),
    );
  });

  it("passes output_folder as outputFolder", async () => {
    const tool = createPencilExportNodesTool(makeApi());
    await tool.execute("id", { node_ids: ["n1"], output_folder: "/my/exports" });

    expect(callPencilToolMock).toHaveBeenCalledWith(
      "export_nodes",
      expect.objectContaining({ outputFolder: "/my/exports" }),
      expect.any(Object),
    );
  });

  it("throws when output_folder is missing", async () => {
    const tool = createPencilExportNodesTool(makeApi());
    await expect(tool.execute("id", { node_ids: ["n1"] })).rejects.toThrow(/output_folder/);
  });
});
