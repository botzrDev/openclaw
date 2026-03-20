/**
 * Design Session Tool Plugin
 *
 * Provides three agent tools that let MiNA persist cross-turn context:
 *   design_session_get   — read active file, tool, node focus, notes
 *   design_session_set   — write/update any session fields
 *   design_session_clear — reset a session when a task is done
 *
 * State is held in a module-level in-process Map (TTL 4 h, max 500 sessions).
 * No external storage is required.
 */

import { definePluginEntry, type OpenClawPluginApi } from "openclaw/plugin-sdk/core";
import {
  designSessionClearTool,
  designSessionGetTool,
  designSessionSetTool,
} from "./src/session-tools.js";

export default definePluginEntry({
  id: "design-session-tool",
  name: "Design Session Tool",
  description: "Persist cross-turn design session state (active file, tool, node focus, notes)",
  register(api: OpenClawPluginApi) {
    api.registerTool(designSessionGetTool);
    api.registerTool(designSessionSetTool);
    api.registerTool(designSessionClearTool);
  },
});
