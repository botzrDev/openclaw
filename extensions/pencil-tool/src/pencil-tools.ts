/**
 * OpenClaw agent tools for Pencil.dev via its MCP server.
 *
 * These wrap the Pencil MCP tool names 1:1 — MiNA calls these tools the
 * same way it calls Figma tools. The MCP layer handles the actual .pen file
 * manipulation protocol.
 *
 * Pencil MCP tool catalog (from pencil MCP server):
 *   get_editor_state       - current active file + selection
 *   open_document          - open a .pen file or create new
 *   batch_get              - read nodes by pattern or IDs
 *   batch_design           - insert/copy/update/replace/move/delete nodes
 *   snapshot_layout        - get computed layout rectangles
 *   get_screenshot         - screenshot of a node
 *   get_variables          - extract variables/themes
 *   set_variables          - add/update variables
 *   find_empty_space       - find empty canvas area
 *   get_guidelines         - design guidelines for a topic
 *   get_style_guide        - style guide by tags or name
 *   get_style_guide_tags   - available style guide tags
 *   export_nodes           - export nodes as PNG/JPEG/PDF
 */

import { Type } from "@sinclair/typebox";
import { jsonResult, readStringParam } from "openclaw/plugin-sdk/agent-runtime";
import { optionalStringEnum } from "openclaw/plugin-sdk/core";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk/core";
import {
  callPencilTool,
  extractPencilResultText,
  resolvePencilMcpOptions,
} from "./pencil-mcp-client.js";

// ---------------------------------------------------------------------------
// pencil_editor_state
// ---------------------------------------------------------------------------

export function createPencilEditorStateTool(api: OpenClawPluginApi) {
  return {
    name: "pencil_editor_state",
    label: "Pencil: Editor State",
    description:
      "Get the current Pencil.dev editor state — active .pen file, selected nodes, and context. Call this first to understand what is open.",
    parameters: Type.Object({}, { additionalProperties: false }),
    execute: async (_id: string, _raw: Record<string, unknown>) => {
      const opts = resolvePencilMcpOptions(api.pluginConfig);
      const result = await callPencilTool("get_editor_state", {}, opts);
      return jsonResult({ text: extractPencilResultText(result) });
    },
  };
}

// ---------------------------------------------------------------------------
// pencil_open_document
// ---------------------------------------------------------------------------

export function createPencilOpenDocumentTool(api: OpenClawPluginApi) {
  return {
    name: "pencil_open_document",
    label: "Pencil: Open Document",
    description:
      "Open an existing .pen file by path, or pass 'new' to create a blank document.",
    parameters: Type.Object(
      {
        path: Type.String({
          description: "Absolute path to a .pen file, or the string 'new' to create a blank file.",
        }),
      },
      { additionalProperties: false },
    ),
    execute: async (_id: string, raw: Record<string, unknown>) => {
      const opts = resolvePencilMcpOptions(api.pluginConfig);
      const path = readStringParam(raw, "path", { required: true });
      const result = await callPencilTool("open_document", { filePathOrNew: path }, opts);
      return jsonResult({ text: extractPencilResultText(result) });
    },
  };
}

// ---------------------------------------------------------------------------
// pencil_batch_get
// ---------------------------------------------------------------------------

export function createPencilBatchGetTool(api: OpenClawPluginApi) {
  return {
    name: "pencil_batch_get",
    label: "Pencil: Batch Get Nodes",
    description:
      "Read nodes from the active .pen file by glob pattern or explicit node IDs. Use to inspect the design structure.",
    parameters: Type.Object(
      {
        patterns: Type.Optional(
          Type.Array(Type.String(), {
            description: "Glob patterns to match node names (e.g. ['Button*', 'Header/**']).",
          }),
        ),
        node_ids: Type.Optional(
          Type.Array(Type.String(), {
            description: "Explicit node IDs to retrieve.",
          }),
        ),
      },
      { additionalProperties: false },
    ),
    execute: async (_id: string, raw: Record<string, unknown>) => {
      const opts = resolvePencilMcpOptions(api.pluginConfig);
      const patterns = Array.isArray(raw.patterns) ? raw.patterns : undefined;
      const nodeIds = Array.isArray(raw.node_ids) ? raw.node_ids : undefined;
      const result = await callPencilTool("batch_get", { patterns, nodeIds }, opts);
      return jsonResult({ text: extractPencilResultText(result) });
    },
  };
}

// ---------------------------------------------------------------------------
// pencil_batch_design
// ---------------------------------------------------------------------------

export function createPencilBatchDesignTool(api: OpenClawPluginApi) {
  return {
    name: "pencil_batch_design",
    label: "Pencil: Batch Design Operations",
    description:
      "Execute design operations on the active .pen file. Operations are a small script — one operation per line. Supported: insert (I), copy (C), update (U), replace (R), move (M), delete (D), generate-image (G). Example: 'btn=I(\"parent\", {text: \"Click me\", fill: \"#007AFF\"})'.",
    parameters: Type.Object(
      {
        operations: Type.String({
          description:
            "Multi-line design script. Each line is one operation call. Max ~25 operations per call.",
        }),
      },
      { additionalProperties: false },
    ),
    execute: async (_id: string, raw: Record<string, unknown>) => {
      const opts = resolvePencilMcpOptions(api.pluginConfig);
      const operations = readStringParam(raw, "operations", { required: true });
      // Parse the operations string into the array format Pencil MCP expects
      const ops = operations
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean);
      const result = await callPencilTool("batch_design", { operations: ops }, opts);
      return jsonResult({ text: extractPencilResultText(result) });
    },
  };
}

// ---------------------------------------------------------------------------
// pencil_snapshot_layout
// ---------------------------------------------------------------------------

export function createPencilSnapshotLayoutTool(api: OpenClawPluginApi) {
  return {
    name: "pencil_snapshot_layout",
    label: "Pencil: Snapshot Layout",
    description:
      "Get computed layout rectangles (x, y, width, height) for all nodes in the active .pen file. Use before inserting nodes to find good positions.",
    parameters: Type.Object({}, { additionalProperties: false }),
    execute: async (_id: string, _raw: Record<string, unknown>) => {
      const opts = resolvePencilMcpOptions(api.pluginConfig);
      const result = await callPencilTool("snapshot_layout", {}, opts);
      return jsonResult({ text: extractPencilResultText(result) });
    },
  };
}

// ---------------------------------------------------------------------------
// pencil_screenshot
// ---------------------------------------------------------------------------

export function createPencilScreenshotTool(api: OpenClawPluginApi) {
  return {
    name: "pencil_screenshot",
    label: "Pencil: Screenshot",
    description:
      "Take a screenshot of a node (or the full canvas) in the active .pen file to visually validate the current design.",
    parameters: Type.Object(
      {
        node_id: Type.Optional(
          Type.String({ description: "Node ID to screenshot. Omit for the full canvas." }),
        ),
      },
      { additionalProperties: false },
    ),
    execute: async (_id: string, raw: Record<string, unknown>) => {
      const opts = resolvePencilMcpOptions(api.pluginConfig);
      const nodeId = readStringParam(raw, "node_id");
      const result = await callPencilTool("get_screenshot", nodeId ? { nodeId } : {}, opts);
      return jsonResult({ text: extractPencilResultText(result) });
    },
  };
}

// ---------------------------------------------------------------------------
// pencil_get_variables
// ---------------------------------------------------------------------------

export function createPencilGetVariablesTool(api: OpenClawPluginApi) {
  return {
    name: "pencil_get_variables",
    label: "Pencil: Get Variables",
    description: "Extract design variables (tokens, themes) from the active .pen file.",
    parameters: Type.Object({}, { additionalProperties: false }),
    execute: async (_id: string, _raw: Record<string, unknown>) => {
      const opts = resolvePencilMcpOptions(api.pluginConfig);
      const result = await callPencilTool("get_variables", {}, opts);
      return jsonResult({ text: extractPencilResultText(result) });
    },
  };
}

// ---------------------------------------------------------------------------
// pencil_set_variables
// ---------------------------------------------------------------------------

export function createPencilSetVariablesTool(api: OpenClawPluginApi) {
  return {
    name: "pencil_set_variables",
    label: "Pencil: Set Variables",
    description: "Add or update design variables/tokens in the active .pen file.",
    parameters: Type.Object(
      {
        variables: Type.Record(Type.String(), Type.Unknown(), {
          description: "Key-value map of variable names to values.",
        }),
      },
      { additionalProperties: false },
    ),
    execute: async (_id: string, raw: Record<string, unknown>) => {
      const opts = resolvePencilMcpOptions(api.pluginConfig);
      const variables = typeof raw.variables === "object" && raw.variables ? raw.variables : {};
      const result = await callPencilTool("set_variables", { variables }, opts);
      return jsonResult({ text: extractPencilResultText(result) });
    },
  };
}

// ---------------------------------------------------------------------------
// pencil_get_guidelines
// ---------------------------------------------------------------------------

export function createPencilGetGuidelinesTool(api: OpenClawPluginApi) {
  return {
    name: "pencil_get_guidelines",
    label: "Pencil: Get Design Guidelines",
    description:
      "Fetch design guidelines for a topic. Use before generating designs to ensure they follow Pencil conventions.",
    parameters: Type.Object(
      {
        topic: optionalStringEnum(
          [
            "code",
            "table",
            "tailwind",
            "landing-page",
            "slides",
            "design-system",
            "mobile-app",
            "web-app",
          ] as const,
          { description: "Guideline topic." },
        ),
      },
      { additionalProperties: false },
    ),
    execute: async (_id: string, raw: Record<string, unknown>) => {
      const opts = resolvePencilMcpOptions(api.pluginConfig);
      const topic = readStringParam(raw, "topic");
      const args = topic ? { topic } : {};
      const result = await callPencilTool("get_guidelines", args, opts);
      return jsonResult({ text: extractPencilResultText(result) });
    },
  };
}

// ---------------------------------------------------------------------------
// pencil_export_nodes
// ---------------------------------------------------------------------------

export function createPencilExportNodesTool(api: OpenClawPluginApi) {
  return {
    name: "pencil_export_nodes",
    label: "Pencil: Export Nodes",
    description: "Export nodes from the active .pen file as PNG/JPEG/WEBP/PDF images to a folder.",
    parameters: Type.Object(
      {
        node_ids: Type.Array(Type.String(), {
          description: "Node IDs to export.",
        }),
        output_folder: Type.String({
          description: "Absolute path to the folder where images will be saved.",
        }),
        format: optionalStringEnum(["png", "jpeg", "webp", "pdf"] as const, {
          description: "Export format. Default: png.",
        }),
      },
      { additionalProperties: false },
    ),
    execute: async (_id: string, raw: Record<string, unknown>) => {
      const opts = resolvePencilMcpOptions(api.pluginConfig);
      const nodeIds = Array.isArray(raw.node_ids) ? raw.node_ids : [];
      const outputFolder = readStringParam(raw, "output_folder", { required: true });
      const format = readStringParam(raw, "format") || "png";
      const result = await callPencilTool(
        "export_nodes",
        { nodeIds, outputFolder, format },
        opts,
      );
      return jsonResult({ text: extractPencilResultText(result) });
    },
  };
}
