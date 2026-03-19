/**
 * Pencil.dev Tool Plugin
 *
 * Bridges the Pencil.dev MCP server into OpenClaw agent tools so MiNA
 * can create, read, and modify .pen design files in real time.
 *
 * The Pencil MCP server is launched as a child process (stdio transport)
 * on first use. One shared client is reused for the gateway lifetime.
 *
 * Setup:
 *   Ensure the Pencil CLI is installed and on PATH:
 *     npm i -g pencil-app   (or use the npx form below)
 *
 *   Optional plugin config (~/.openclaw/config.json):
 *     plugins:
 *       pencil-tool:
 *         mcpCommand: "pencil"        # default
 *         mcpArgs: ["mcp"]            # default
 *
 *   Alternative (npx — no install required):
 *     plugins:
 *       pencil-tool:
 *         mcpCommand: "npx"
 *         mcpArgs: ["-y", "pencil-app", "mcp"]
 */

import { definePluginEntry, type AnyAgentTool } from "openclaw/plugin-sdk/core";
import {
  createPencilBatchDesignTool,
  createPencilBatchGetTool,
  createPencilEditorStateTool,
  createPencilExportNodesTool,
  createPencilGetGuidelinesTool,
  createPencilGetVariablesTool,
  createPencilOpenDocumentTool,
  createPencilScreenshotTool,
  createPencilSetVariablesTool,
  createPencilSnapshotLayoutTool,
} from "./src/pencil-tools.js";

export default definePluginEntry({
  id: "pencil-tool",
  name: "Pencil.dev Tool",
  description: "Pencil.dev MCP bridge — create and edit .pen design files from the agent loop",
  register(api) {
    api.registerTool(createPencilEditorStateTool(api) as AnyAgentTool);
    api.registerTool(createPencilOpenDocumentTool(api) as AnyAgentTool);
    api.registerTool(createPencilBatchGetTool(api) as AnyAgentTool);
    api.registerTool(createPencilBatchDesignTool(api) as AnyAgentTool);
    api.registerTool(createPencilSnapshotLayoutTool(api) as AnyAgentTool);
    api.registerTool(createPencilScreenshotTool(api) as AnyAgentTool);
    api.registerTool(createPencilGetVariablesTool(api) as AnyAgentTool);
    api.registerTool(createPencilSetVariablesTool(api) as AnyAgentTool);
    api.registerTool(createPencilGetGuidelinesTool(api) as AnyAgentTool);
    api.registerTool(createPencilExportNodesTool(api) as AnyAgentTool);
  },
});
