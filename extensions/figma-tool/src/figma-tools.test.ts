import { describe, expect, it, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mock plugin-sdk before importing tools
// ---------------------------------------------------------------------------

vi.mock("openclaw/plugin-sdk/agent-runtime", () => ({
  readStringParam: (raw: Record<string, unknown>, key: string, opts?: { required?: boolean }) => {
    const val = raw[key];
    if (opts?.required && (val === undefined || val === null || val === "")) {
      throw new Error(`Missing required param: ${key}`);
    }
    return typeof val === "string" ? val : undefined;
  },
  readNumberParam: (raw: Record<string, unknown>, key: string) => {
    const val = raw[key];
    return typeof val === "number" ? val : undefined;
  },
  jsonResult: (data: unknown) => ({ type: "json", data }),
}));

vi.mock("openclaw/plugin-sdk/core", () => ({
  optionalStringEnum: () => ({ type: "string" }),
}));

// ---------------------------------------------------------------------------
// Mock figma-client
// ---------------------------------------------------------------------------

const figmaGetFileMock = vi.fn();
const figmaGetNodesMock = vi.fn();
const figmaGetImagesMock = vi.fn();
const figmaGetCommentsMock = vi.fn();
const figmaPostCommentMock = vi.fn();
const figmaGetFileComponentsMock = vi.fn();
const figmaGetFileStylesMock = vi.fn();
const figmaGetLocalVariablesMock = vi.fn();
const resolveFigmaTokenMock = vi.fn(() => "mocked-token");

vi.mock("./figma-client.js", () => ({
  figmaGetFile: figmaGetFileMock,
  figmaGetNodes: figmaGetNodesMock,
  figmaGetImages: figmaGetImagesMock,
  figmaGetComments: figmaGetCommentsMock,
  figmaPostComment: figmaPostCommentMock,
  figmaGetFileComponents: figmaGetFileComponentsMock,
  figmaGetFileStyles: figmaGetFileStylesMock,
  figmaGetLocalVariables: figmaGetLocalVariablesMock,
  resolveFigmaToken: resolveFigmaTokenMock,
}));

// Import after mocks
const {
  createFigmaGetFileTool,
  createFigmaGetNodesTool,
  createFigmaGetImagesTool,
  createFigmaGetCommentsTool,
  createFigmaPostCommentTool,
  createFigmaGetComponentsTool,
  createFigmaGetStylesTool,
  createFigmaGetVariablesTool,
} = await import("./figma-tools.js");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeApi(pluginConfig: unknown = { token: "cfg-token" }) {
  return { pluginConfig } as { pluginConfig: unknown };
}

beforeEach(() => {
  vi.clearAllMocks();
  figmaGetFileMock.mockResolvedValue({ document: {} });
  figmaGetNodesMock.mockResolvedValue({ nodes: {} });
  figmaGetImagesMock.mockResolvedValue({ images: {} });
  figmaGetCommentsMock.mockResolvedValue({ comments: [] });
  figmaPostCommentMock.mockResolvedValue({ id: "c1" });
  figmaGetFileComponentsMock.mockResolvedValue({ meta: {} });
  figmaGetFileStylesMock.mockResolvedValue({ meta: {} });
  figmaGetLocalVariablesMock.mockResolvedValue({ meta: {} });
});

// ---------------------------------------------------------------------------
// figma_get_file
// ---------------------------------------------------------------------------

describe("createFigmaGetFileTool", () => {
  it("calls figmaGetFile with correct file key", async () => {
    const tool = createFigmaGetFileTool(makeApi());
    await tool.execute("id", { file_key: "abc123" });
    expect(figmaGetFileMock).toHaveBeenCalledWith(
      { token: "mocked-token" },
      "abc123",
      expect.any(Object),
    );
  });

  it("throws when file_key is missing", async () => {
    const tool = createFigmaGetFileTool(makeApi());
    await expect(tool.execute("id", {})).rejects.toThrow(/file_key/);
  });

  it("passes depth and ids params", async () => {
    const tool = createFigmaGetFileTool(makeApi());
    await tool.execute("id", { file_key: "f1", depth: 2, ids: "1:2,3:4" });
    expect(figmaGetFileMock).toHaveBeenCalledWith(
      expect.any(Object),
      "f1",
      expect.objectContaining({ depth: 2, ids: "1:2,3:4" }),
    );
  });
});

// ---------------------------------------------------------------------------
// figma_get_nodes
// ---------------------------------------------------------------------------

describe("createFigmaGetNodesTool", () => {
  it("calls figmaGetNodes with file key and node IDs", async () => {
    const tool = createFigmaGetNodesTool(makeApi());
    await tool.execute("id", { file_key: "f1", ids: "1:2,3:4" });
    expect(figmaGetNodesMock).toHaveBeenCalledWith(
      { token: "mocked-token" },
      "f1",
      expect.objectContaining({ ids: "1:2,3:4" }),
    );
  });

  it("throws when file_key is missing", async () => {
    const tool = createFigmaGetNodesTool(makeApi());
    await expect(tool.execute("id", { ids: "1:2" })).rejects.toThrow(/file_key/);
  });

  it("throws when ids is missing", async () => {
    const tool = createFigmaGetNodesTool(makeApi());
    await expect(tool.execute("id", { file_key: "f1" })).rejects.toThrow(/ids/);
  });
});

// ---------------------------------------------------------------------------
// figma_get_images
// ---------------------------------------------------------------------------

describe("createFigmaGetImagesTool", () => {
  it("defaults to format png when omitted", async () => {
    const tool = createFigmaGetImagesTool(makeApi());
    await tool.execute("id", { file_key: "f1", ids: "1:2" });
    expect(figmaGetImagesMock).toHaveBeenCalledWith(
      expect.any(Object),
      "f1",
      expect.objectContaining({ format: "png" }),
    );
  });

  it("passes through jpg format", async () => {
    const tool = createFigmaGetImagesTool(makeApi());
    await tool.execute("id", { file_key: "f1", ids: "1:2", format: "jpg" });
    expect(figmaGetImagesMock).toHaveBeenCalledWith(
      expect.any(Object),
      "f1",
      expect.objectContaining({ format: "jpg" }),
    );
  });

  it("passes through svg format", async () => {
    const tool = createFigmaGetImagesTool(makeApi());
    await tool.execute("id", { file_key: "f1", ids: "1:2", format: "svg" });
    expect(figmaGetImagesMock).toHaveBeenCalledWith(
      expect.any(Object),
      "f1",
      expect.objectContaining({ format: "svg" }),
    );
  });

  it("passes through pdf format", async () => {
    const tool = createFigmaGetImagesTool(makeApi());
    await tool.execute("id", { file_key: "f1", ids: "1:2", format: "pdf" });
    expect(figmaGetImagesMock).toHaveBeenCalledWith(
      expect.any(Object),
      "f1",
      expect.objectContaining({ format: "pdf" }),
    );
  });

  it("defaults unknown format to png", async () => {
    const tool = createFigmaGetImagesTool(makeApi());
    await tool.execute("id", { file_key: "f1", ids: "1:2", format: "bmp" });
    expect(figmaGetImagesMock).toHaveBeenCalledWith(
      expect.any(Object),
      "f1",
      expect.objectContaining({ format: "png" }),
    );
  });

  it("throws when file_key is missing", async () => {
    const tool = createFigmaGetImagesTool(makeApi());
    await expect(tool.execute("id", { ids: "1:2" })).rejects.toThrow(/file_key/);
  });
});

// ---------------------------------------------------------------------------
// figma_post_comment
// ---------------------------------------------------------------------------

describe("createFigmaPostCommentTool", () => {
  it("posts comment without node_id for file-level comment", async () => {
    const tool = createFigmaPostCommentTool(makeApi());
    await tool.execute("id", { file_key: "f1", message: "hello" });
    expect(figmaPostCommentMock).toHaveBeenCalledWith({ token: "mocked-token" }, "f1", {
      message: "hello",
    });
  });

  it("includes client_meta.node_id when node_id is provided", async () => {
    const tool = createFigmaPostCommentTool(makeApi());
    await tool.execute("id", { file_key: "f1", message: "hey", node_id: "1:5" });
    expect(figmaPostCommentMock).toHaveBeenCalledWith({ token: "mocked-token" }, "f1", {
      message: "hey",
      client_meta: { node_id: "1:5" },
    });
  });

  it("throws when file_key is missing", async () => {
    const tool = createFigmaPostCommentTool(makeApi());
    await expect(tool.execute("id", { message: "hi" })).rejects.toThrow(/file_key/);
  });

  it("throws when message is missing", async () => {
    const tool = createFigmaPostCommentTool(makeApi());
    await expect(tool.execute("id", { file_key: "f1" })).rejects.toThrow(/message/);
  });
});

// ---------------------------------------------------------------------------
// figma_get_components / figma_get_styles / figma_get_variables
// ---------------------------------------------------------------------------

describe("createFigmaGetComponentsTool", () => {
  it("calls figmaGetFileComponents with file key", async () => {
    const tool = createFigmaGetComponentsTool(makeApi());
    await tool.execute("id", { file_key: "f1" });
    expect(figmaGetFileComponentsMock).toHaveBeenCalledWith({ token: "mocked-token" }, "f1");
  });
});

describe("createFigmaGetStylesTool", () => {
  it("calls figmaGetFileStyles with file key", async () => {
    const tool = createFigmaGetStylesTool(makeApi());
    await tool.execute("id", { file_key: "f1" });
    expect(figmaGetFileStylesMock).toHaveBeenCalledWith({ token: "mocked-token" }, "f1");
  });
});

describe("createFigmaGetVariablesTool", () => {
  it("calls figmaGetLocalVariables with file key", async () => {
    const tool = createFigmaGetVariablesTool(makeApi());
    await tool.execute("id", { file_key: "f1" });
    expect(figmaGetLocalVariablesMock).toHaveBeenCalledWith({ token: "mocked-token" }, "f1");
  });
});
