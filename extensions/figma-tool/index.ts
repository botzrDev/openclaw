/**
 * Figma Tool Plugin
 *
 * Exposes Figma REST API v1 as agent tools so MiNA (or any OpenClaw agent)
 * can read files, export renders, inspect components/styles/variables, and
 * post comments — all without leaving the agent loop.
 *
 * Setup:
 *   Set FIGMA_TOKEN env var or add to config:
 *     plugins:
 *       figma-tool:
 *         token: "<personal-access-token>"
 *
 * Write operations (creating/moving layers) require the Figma Plugin API which
 * runs inside the Figma desktop app. For those, use the figma_browser_* tools
 * from the browser-tool plugin to drive the Figma web app via Playwright.
 */

import { definePluginEntry, type AnyAgentTool } from "openclaw/plugin-sdk/core";
import {
  createFigmaGetCommentsTool,
  createFigmaGetComponentsTool,
  createFigmaGetFileTool,
  createFigmaGetImagesTool,
  createFigmaGetNodesTool,
  createFigmaGetStylesTool,
  createFigmaGetVariablesTool,
  createFigmaPostCommentTool,
} from "./src/figma-tools.js";

export default definePluginEntry({
  id: "figma-tool",
  name: "Figma Tool",
  description: "Figma REST API tools for reading and annotating Figma design files",
  register(api) {
    api.registerTool(createFigmaGetFileTool(api) as AnyAgentTool);
    api.registerTool(createFigmaGetNodesTool(api) as AnyAgentTool);
    api.registerTool(createFigmaGetImagesTool(api) as AnyAgentTool);
    api.registerTool(createFigmaGetCommentsTool(api) as AnyAgentTool);
    api.registerTool(createFigmaPostCommentTool(api) as AnyAgentTool);
    api.registerTool(createFigmaGetComponentsTool(api) as AnyAgentTool);
    api.registerTool(createFigmaGetStylesTool(api) as AnyAgentTool);
    api.registerTool(createFigmaGetVariablesTool(api) as AnyAgentTool);
  },
});
