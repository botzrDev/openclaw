/**
 * OpenClaw agent tools for the Figma REST API.
 *
 * Each tool is a standalone factory so the plugin entry can tree-shake them
 * if needed. The api argument gives access to config/pluginConfig for the
 * Figma token.
 */

import { Type } from "@sinclair/typebox";
import { jsonResult, readNumberParam, readStringParam } from "openclaw/plugin-sdk/agent-runtime";
import { optionalStringEnum } from "openclaw/plugin-sdk/core";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk/core";
import {
  figmaGetComments,
  figmaGetFile,
  figmaGetFileComponents,
  figmaGetFileStyles,
  figmaGetImages,
  figmaGetLocalVariables,
  figmaGetNodes,
  figmaPostComment,
  resolveFigmaToken,
} from "./figma-client.js";

// ---------------------------------------------------------------------------
// figma_get_file
// ---------------------------------------------------------------------------

export function createFigmaGetFileTool(api: OpenClawPluginApi) {
  return {
    name: "figma_get_file",
    label: "Figma: Get File",
    description:
      "Fetch the full document tree of a Figma file. Returns pages, frames, layers, and all design properties. Use depth to limit response size for large files.",
    parameters: Type.Object(
      {
        file_key: Type.String({
          description: "Figma file key from the URL (e.g. 'abc123' from figma.com/file/abc123/...).",
        }),
        depth: Type.Optional(
          Type.Number({
            description: "Max tree depth to return (1–4). Omit for full tree.",
            minimum: 1,
            maximum: 4,
          }),
        ),
        ids: Type.Optional(
          Type.String({
            description:
              "Comma-separated node IDs to filter the response. Omit to return the whole file.",
          }),
        ),
      },
      { additionalProperties: false },
    ),
    execute: async (_id: string, raw: Record<string, unknown>) => {
      const token = resolveFigmaToken(api.pluginConfig);
      const fileKey = readStringParam(raw, "file_key", { required: true });
      const depth = readNumberParam(raw, "depth", { integer: true });
      const ids = readStringParam(raw, "ids");
      return jsonResult(await figmaGetFile({ token }, fileKey, { depth, ids }));
    },
  };
}

// ---------------------------------------------------------------------------
// figma_get_nodes
// ---------------------------------------------------------------------------

export function createFigmaGetNodesTool(api: OpenClawPluginApi) {
  return {
    name: "figma_get_nodes",
    label: "Figma: Get Nodes",
    description:
      "Fetch specific nodes by ID from a Figma file. Faster than figma_get_file when you know which nodes you need.",
    parameters: Type.Object(
      {
        file_key: Type.String({ description: "Figma file key." }),
        ids: Type.String({
          description: "Comma-separated node IDs to retrieve (e.g. '1:2,3:4').",
        }),
        depth: Type.Optional(
          Type.Number({ description: "Tree depth limit.", minimum: 1, maximum: 4 }),
        ),
      },
      { additionalProperties: false },
    ),
    execute: async (_id: string, raw: Record<string, unknown>) => {
      const token = resolveFigmaToken(api.pluginConfig);
      const fileKey = readStringParam(raw, "file_key", { required: true });
      const ids = readStringParam(raw, "ids", { required: true });
      const depth = readNumberParam(raw, "depth", { integer: true });
      return jsonResult(await figmaGetNodes({ token }, fileKey, { ids, depth }));
    },
  };
}

// ---------------------------------------------------------------------------
// figma_get_images
// ---------------------------------------------------------------------------

export function createFigmaGetImagesTool(api: OpenClawPluginApi) {
  return {
    name: "figma_get_images",
    label: "Figma: Export Node Images",
    description:
      "Export one or more Figma nodes as rendered images (PNG/JPG/SVG/PDF). Returns URLs to the rendered assets hosted by Figma.",
    parameters: Type.Object(
      {
        file_key: Type.String({ description: "Figma file key." }),
        ids: Type.String({ description: "Comma-separated node IDs to render." }),
        format: optionalStringEnum(["png", "jpg", "svg", "pdf"] as const, {
          description: "Output format. Default: png.",
        }),
        scale: Type.Optional(
          Type.Number({ description: "Scale factor 0.01–4. Default: 1.", minimum: 0.01, maximum: 4 }),
        ),
      },
      { additionalProperties: false },
    ),
    execute: async (_id: string, raw: Record<string, unknown>) => {
      const token = resolveFigmaToken(api.pluginConfig);
      const fileKey = readStringParam(raw, "file_key", { required: true });
      const ids = readStringParam(raw, "ids", { required: true });
      const formatRaw = readStringParam(raw, "format");
      const format =
        formatRaw === "jpg" || formatRaw === "svg" || formatRaw === "pdf" ? formatRaw : "png";
      const scale = readNumberParam(raw, "scale");
      return jsonResult(await figmaGetImages({ token }, fileKey, { ids, format, scale }));
    },
  };
}

// ---------------------------------------------------------------------------
// figma_get_comments
// ---------------------------------------------------------------------------

export function createFigmaGetCommentsTool(api: OpenClawPluginApi) {
  return {
    name: "figma_get_comments",
    label: "Figma: Get Comments",
    description: "Retrieve all comments on a Figma file.",
    parameters: Type.Object(
      {
        file_key: Type.String({ description: "Figma file key." }),
      },
      { additionalProperties: false },
    ),
    execute: async (_id: string, raw: Record<string, unknown>) => {
      const token = resolveFigmaToken(api.pluginConfig);
      const fileKey = readStringParam(raw, "file_key", { required: true });
      return jsonResult(await figmaGetComments({ token }, fileKey));
    },
  };
}

// ---------------------------------------------------------------------------
// figma_post_comment
// ---------------------------------------------------------------------------

export function createFigmaPostCommentTool(api: OpenClawPluginApi) {
  return {
    name: "figma_post_comment",
    label: "Figma: Post Comment",
    description: "Add a comment to a Figma file, optionally anchored to a specific node.",
    parameters: Type.Object(
      {
        file_key: Type.String({ description: "Figma file key." }),
        message: Type.String({ description: "Comment text to post." }),
        node_id: Type.Optional(
          Type.String({
            description: "Node ID to anchor the comment to. Omit for a file-level comment.",
          }),
        ),
      },
      { additionalProperties: false },
    ),
    execute: async (_id: string, raw: Record<string, unknown>) => {
      const token = resolveFigmaToken(api.pluginConfig);
      const fileKey = readStringParam(raw, "file_key", { required: true });
      const message = readStringParam(raw, "message", { required: true });
      const nodeId = readStringParam(raw, "node_id");
      const body: Parameters<typeof figmaPostComment>[2] = { message };
      if (nodeId) {
        body.client_meta = { node_id: nodeId };
      }
      return jsonResult(await figmaPostComment({ token }, fileKey, body));
    },
  };
}

// ---------------------------------------------------------------------------
// figma_get_components
// ---------------------------------------------------------------------------

export function createFigmaGetComponentsTool(api: OpenClawPluginApi) {
  return {
    name: "figma_get_components",
    label: "Figma: Get Components",
    description: "List all published components in a Figma file.",
    parameters: Type.Object(
      {
        file_key: Type.String({ description: "Figma file key." }),
      },
      { additionalProperties: false },
    ),
    execute: async (_id: string, raw: Record<string, unknown>) => {
      const token = resolveFigmaToken(api.pluginConfig);
      const fileKey = readStringParam(raw, "file_key", { required: true });
      return jsonResult(await figmaGetFileComponents({ token }, fileKey));
    },
  };
}

// ---------------------------------------------------------------------------
// figma_get_styles
// ---------------------------------------------------------------------------

export function createFigmaGetStylesTool(api: OpenClawPluginApi) {
  return {
    name: "figma_get_styles",
    label: "Figma: Get Styles",
    description: "List all published styles (colors, text, effects, grids) in a Figma file.",
    parameters: Type.Object(
      {
        file_key: Type.String({ description: "Figma file key." }),
      },
      { additionalProperties: false },
    ),
    execute: async (_id: string, raw: Record<string, unknown>) => {
      const token = resolveFigmaToken(api.pluginConfig);
      const fileKey = readStringParam(raw, "file_key", { required: true });
      return jsonResult(await figmaGetFileStyles({ token }, fileKey));
    },
  };
}

// ---------------------------------------------------------------------------
// figma_get_variables
// ---------------------------------------------------------------------------

export function createFigmaGetVariablesTool(api: OpenClawPluginApi) {
  return {
    name: "figma_get_variables",
    label: "Figma: Get Variables",
    description: "Fetch all local design variables (tokens) defined in a Figma file.",
    parameters: Type.Object(
      {
        file_key: Type.String({ description: "Figma file key." }),
      },
      { additionalProperties: false },
    ),
    execute: async (_id: string, raw: Record<string, unknown>) => {
      const token = resolveFigmaToken(api.pluginConfig);
      const fileKey = readStringParam(raw, "file_key", { required: true });
      return jsonResult(await figmaGetLocalVariables({ token }, fileKey));
    },
  };
}
