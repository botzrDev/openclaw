import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Mock MCP SDK before importing the client
// ---------------------------------------------------------------------------

const mockConnect = vi.fn().mockResolvedValue(undefined);
const mockCallTool = vi.fn().mockResolvedValue({ content: [{ type: "text", text: "ok" }] });

function MockClient() {
  return { connect: mockConnect, callTool: mockCallTool };
}
function MockStdioTransport() {
  return {};
}

vi.mock("@modelcontextprotocol/sdk/client/index.js", () => ({
  Client: MockClient,
}));

vi.mock("@modelcontextprotocol/sdk/client/stdio.js", () => ({
  StdioClientTransport: MockStdioTransport,
}));

// Import after mocks (must use dynamic import because of module-level singleton state)

// ---------------------------------------------------------------------------
// resolvePencilMcpOptions
// ---------------------------------------------------------------------------

describe("resolvePencilMcpOptions", () => {
  it("reads mcpCommand from plugin config", async () => {
    const { resolvePencilMcpOptions } = await import("./pencil-mcp-client.js");
    const opts = resolvePencilMcpOptions({
      mcpCommand: "custom-pencil",
      mcpArgs: ["mcp", "--verbose"],
    });
    expect(opts.command).toBe("custom-pencil");
    expect(opts.args).toEqual(["mcp", "--verbose"]);
  });

  it("returns undefined command when config has no mcpCommand", async () => {
    const { resolvePencilMcpOptions } = await import("./pencil-mcp-client.js");
    const opts = resolvePencilMcpOptions({});
    expect(opts.command).toBeUndefined();
  });

  it("returns undefined args when config has no mcpArgs", async () => {
    const { resolvePencilMcpOptions } = await import("./pencil-mcp-client.js");
    const opts = resolvePencilMcpOptions({});
    expect(opts.args).toBeUndefined();
  });

  it("handles null config gracefully", async () => {
    const { resolvePencilMcpOptions } = await import("./pencil-mcp-client.js");
    const opts = resolvePencilMcpOptions(null);
    expect(opts.command).toBeUndefined();
    expect(opts.args).toBeUndefined();
  });

  it("filters non-string entries from mcpArgs", async () => {
    const { resolvePencilMcpOptions } = await import("./pencil-mcp-client.js");
    const opts = resolvePencilMcpOptions({ mcpArgs: ["mcp", 42, null, "extra"] });
    expect(opts.args).toEqual(["mcp", "extra"]);
  });
});

// ---------------------------------------------------------------------------
// extractPencilResultText
// ---------------------------------------------------------------------------

describe("extractPencilResultText", () => {
  it("joins text content items with newlines", async () => {
    const { extractPencilResultText } = await import("./pencil-mcp-client.js");
    const result = {
      content: [
        { type: "text", text: "line 1" },
        { type: "text", text: "line 2" },
      ],
    };
    expect(extractPencilResultText(result)).toBe("line 1\nline 2");
  });

  it("returns single text item without trailing newline", async () => {
    const { extractPencilResultText } = await import("./pencil-mcp-client.js");
    const result = { content: [{ type: "text", text: "single" }] };
    expect(extractPencilResultText(result)).toBe("single");
  });

  it("skips non-text content items", async () => {
    const { extractPencilResultText } = await import("./pencil-mcp-client.js");
    const result = {
      content: [
        { type: "image", data: "base64..." },
        { type: "text", text: "text only" },
      ],
    };
    expect(extractPencilResultText(result)).toBe("text only");
  });

  it("throws on isError: true results", async () => {
    const { extractPencilResultText } = await import("./pencil-mcp-client.js");
    const result = {
      isError: true,
      content: [{ type: "text", text: "something went wrong" }],
    };
    expect(() => extractPencilResultText(result)).toThrow(/Pencil MCP error/);
    expect(() => extractPencilResultText(result)).toThrow(/something went wrong/);
  });

  it("throws with 'unknown error' when isError and no text", async () => {
    const { extractPencilResultText } = await import("./pencil-mcp-client.js");
    expect(() => extractPencilResultText({ isError: true })).toThrow(/unknown error/);
  });

  it("returns empty string for empty content array", async () => {
    const { extractPencilResultText } = await import("./pencil-mcp-client.js");
    expect(extractPencilResultText({ content: [] })).toBe("");
  });
});

// ---------------------------------------------------------------------------
// getPencilMcpClient — singleton reuse
// ---------------------------------------------------------------------------

describe("getPencilMcpClient", () => {
  beforeEach(() => {
    mockConnect.mockClear();
    mockCallTool.mockClear();
  });

  it("creates a client and connects on first call", async () => {
    const { getPencilMcpClient } = await import("./pencil-mcp-client.js");
    await getPencilMcpClient({ command: "pencil", args: ["mcp"] });
    expect(mockConnect).toHaveBeenCalled();
  });

  it("reuses the same client object on repeated calls", async () => {
    const { getPencilMcpClient } = await import("./pencil-mcp-client.js");
    const client1 = await getPencilMcpClient({ command: "pencil", args: ["mcp"] });
    const connectCallCount = mockConnect.mock.calls.length;
    const client2 = await getPencilMcpClient({ command: "pencil", args: ["mcp"] });
    expect(client1).toBe(client2);
    // connect should not have been called again
    expect(mockConnect.mock.calls.length).toBe(connectCallCount);
  });
});
