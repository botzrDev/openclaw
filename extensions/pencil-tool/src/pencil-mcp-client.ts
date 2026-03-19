/**
 * Pencil.dev MCP client — bridges the Pencil MCP server into OpenClaw tools.
 *
 * The Pencil.dev CLI ships an MCP server that exposes design operations on
 * .pen files. We connect to it via StdioClientTransport (same pattern as
 * src/browser/chrome-mcp.ts) so agents can call Pencil operations as normal
 * tool calls.
 *
 * MCP server launch command: pencil mcp  (or npx pencil-app mcp)
 * Configurable via PENCIL_MCP_COMMAND / PENCIL_MCP_ARGS env vars or plugin config.
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

export type PencilMcpClientOptions = {
  /** Shell command to launch the Pencil MCP server. Default: "pencil". */
  command?: string;
  /** Args for the MCP server command. Default: ["mcp"]. */
  args?: string[];
};

export type PencilMcpToolResult = {
  content?: Array<{ type: string; text?: string; [key: string]: unknown }>;
  isError?: boolean;
};

let sharedClient: Client | null = null;
let sharedTransport: StdioClientTransport | null = null;
let connectPromise: Promise<void> | null = null;

/** Returns a connected Pencil MCP client, creating one lazily. */
export async function getPencilMcpClient(opts: PencilMcpClientOptions = {}): Promise<Client> {
  if (sharedClient && connectPromise) {
    await connectPromise;
    return sharedClient;
  }

  const command = opts.command ?? process.env["PENCIL_MCP_COMMAND"] ?? "pencil";
  const args = opts.args ?? (process.env["PENCIL_MCP_ARGS"]?.split(" ") ?? ["mcp"]);

  sharedTransport = new StdioClientTransport({ command, args });
  sharedClient = new Client({ name: "openclaw-pencil-bridge", version: "1.0.0" }, {});

  connectPromise = sharedClient.connect(sharedTransport);
  await connectPromise;
  return sharedClient;
}

/** Call a Pencil MCP tool by name. Returns parsed result content. */
export async function callPencilTool(
  toolName: string,
  args: Record<string, unknown>,
  clientOpts?: PencilMcpClientOptions,
): Promise<PencilMcpToolResult> {
  const client = await getPencilMcpClient(clientOpts);
  const result = (await client.callTool({ name: toolName, arguments: args })) as PencilMcpToolResult;
  return result;
}

/** Extract text from MCP tool result content array. */
export function extractPencilResultText(result: PencilMcpToolResult): string {
  if (result.isError) {
    const errText = (result.content ?? [])
      .filter((c) => c.type === "text" && c.text)
      .map((c) => c.text ?? "")
      .join("\n");
    throw new Error(`Pencil MCP error: ${errText || "unknown error"}`);
  }
  return (result.content ?? [])
    .filter((c) => c.type === "text" && c.text)
    .map((c) => c.text ?? "")
    .join("\n");
}

/** Resolve plugin config for Pencil MCP command/args. */
export function resolvePencilMcpOptions(pluginConfig: unknown): PencilMcpClientOptions {
  const cfg = pluginConfig as Record<string, unknown> | null | undefined;
  return {
    command: typeof cfg?.mcpCommand === "string" ? cfg.mcpCommand : undefined,
    args: Array.isArray(cfg?.mcpArgs)
      ? (cfg.mcpArgs as string[]).filter((a) => typeof a === "string")
      : undefined,
  };
}
