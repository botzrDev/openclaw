/**
 * Agent tools for reading and writing design session state.
 *
 * MiNA passes a session_key matching the OpenClaw hook session key so each
 * design task picks up where the previous one left off (active file, tool,
 * node focus, free-form notes).
 */

import { Type } from "@sinclair/typebox";
import { jsonResult, readStringParam } from "openclaw/plugin-sdk/agent-runtime";
import { optionalStringEnum } from "openclaw/plugin-sdk/core";
import { clearSession, getSession, upsertSession } from "./session-store.js";

// ---------------------------------------------------------------------------
// design_session_get
// ---------------------------------------------------------------------------

export const designSessionGetTool = {
  name: "design_session_get",
  label: "Design Session: Get",
  description:
    "Retrieve the current design session state for a given session key. " +
    "Returns the active tool, file, node focus, and any notes MiNA has stored. " +
    "Returns null fields when no session exists yet.",
  parameters: Type.Object(
    {
      session_key: Type.String({
        description:
          "Session key identifying this design context (matches the OpenClaw hook session key).",
      }),
    },
    { additionalProperties: false },
  ),
  execute: async (_id: string, raw: Record<string, unknown>) => {
    const sessionKey = readStringParam(raw, "session_key", { required: true });
    const session = getSession(sessionKey);
    return jsonResult(session ?? { sessionKey, exists: false });
  },
};

// ---------------------------------------------------------------------------
// design_session_set
// ---------------------------------------------------------------------------

export const designSessionSetTool = {
  name: "design_session_set",
  label: "Design Session: Set",
  description:
    "Create or update design session state. Only the fields you provide are changed; " +
    "omitted fields keep their previous values. Use this to record which file and tool " +
    "MiNA is currently working with so subsequent agent turns can resume context.",
  parameters: Type.Object(
    {
      session_key: Type.String({
        description: "Session key for this design context.",
      }),
      active_tool: optionalStringEnum(["pencil", "figma", "illustrator"] as const, {
        description: "Design tool currently in use.",
      }),
      active_file: Type.Optional(
        Type.String({
          description: "Figma file key (e.g. 'abc123xyz') or Pencil .pen file path currently open.",
        }),
      ),
      active_node_ids: Type.Optional(
        Type.String({
          description: "Comma-separated node or layer IDs MiNA is focused on.",
        }),
      ),
      active_page_id: Type.Optional(
        Type.String({
          description: "Active page or frame ID within the current file.",
        }),
      ),
      notes: Type.Optional(
        Type.String({
          description:
            "Free-form text notes MiNA wants to persist across turns (design decisions, task state, etc.).",
        }),
      ),
    },
    { additionalProperties: false },
  ),
  execute: async (_id: string, raw: Record<string, unknown>) => {
    const sessionKey = readStringParam(raw, "session_key", { required: true });
    const fields: Parameters<typeof upsertSession>[1] = {};

    const activeTool = readStringParam(raw, "active_tool");
    if (activeTool === "pencil" || activeTool === "figma" || activeTool === "illustrator") {
      fields.activeTool = activeTool;
    }

    const activeFile = readStringParam(raw, "active_file");
    if (activeFile != null) fields.activeFile = activeFile;

    const activeNodeIds = readStringParam(raw, "active_node_ids");
    if (activeNodeIds != null) fields.activeNodeIds = activeNodeIds;

    const activePageId = readStringParam(raw, "active_page_id");
    if (activePageId != null) fields.activePageId = activePageId;

    const notes = readStringParam(raw, "notes");
    if (notes != null) fields.notes = notes;

    const session = upsertSession(sessionKey, fields);
    return jsonResult({ ok: true, session });
  },
};

// ---------------------------------------------------------------------------
// design_session_clear
// ---------------------------------------------------------------------------

export const designSessionClearTool = {
  name: "design_session_clear",
  label: "Design Session: Clear",
  description:
    "Delete all stored state for a design session. " +
    "Use when a design task is fully complete and the context should be reset.",
  parameters: Type.Object(
    {
      session_key: Type.String({
        description: "Session key to clear.",
      }),
    },
    { additionalProperties: false },
  ),
  execute: async (_id: string, raw: Record<string, unknown>) => {
    const sessionKey = readStringParam(raw, "session_key", { required: true });
    const removed = clearSession(sessionKey);
    return jsonResult({ ok: true, sessionKey, removed });
  },
};
