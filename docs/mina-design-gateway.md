# MiNA Design Gateway

This document covers every change introduced in the `mina-design-gateway` branch.
The goal is to strip OpenClaw down to a **tool execution layer** that MiNA — an
autonomous system design engineering team running as a separate REST service — can
drive remotely.

## Architecture overview

```
MiNA (REST brain)
  │
  │  POST /hooks/agent  ──────────────────────────────┐
  │  GET  /hooks/result/:runId  (poll for result)     │
  │  Provider calls: POST /v1/chat/completions        │
  │                                                   ▼
  └──────────────────────────────────►  OpenClaw design gateway  (port 18790)
                                           │
                                     ┌─────┴──────────────────────────────┐
                                     │  Agent tools                       │
                                     │  ├── pencil_*  (Pencil.dev MCP)    │
                                     │  ├── figma_*   (Figma REST API)    │
                                     │  └── design_session_*  (state)     │
                                     └────────────────────────────────────┘
```

MiNA is the reasoning brain. OpenClaw is its hands — it receives tasks via the hook
endpoint, runs a local agent turn with the design tools, and lets MiNA poll for the
result. MiNA is also registered as an OpenAI-compatible provider so it can serve as
the model for those agent turns.

---

## Core gateway changes

### `src/gateway/run-result-store.ts` (new)

In-memory TTL store that tracks the lifecycle of hook agent runs so MiNA can poll
for results without needing a messaging channel.

| State     | Description                                                    |
| --------- | -------------------------------------------------------------- |
| `pending` | Run queued; agent turn not yet complete                        |
| `ok`      | Agent turn finished; `output` and optional `summary` available |
| `error`   | Agent turn failed; `error` message available                   |

Key details:

- Default TTL: **30 minutes**
- Maximum entries: **2,000** (oldest evicted when exceeded)
- Pruning is lazy — happens on every write, not on a timer

```typescript
export class RunResultStore {
  setPending(runId: string): void;
  setOk(runId: string, output: string, summary?: string): void;
  setError(runId: string, error: string): void;
  get(runId: string): RunResult | null; // null = unknown or expired
}
```

### `src/gateway/server/hooks.ts` (modified)

`createGatewayHooksRequestHandler` now accepts an optional `runResultStore` parameter.

When a `POST /hooks/agent` fires:

1. `runResultStore.setPending(runId)` is called immediately — pollers see the run
   before the agent turn starts.
2. After `runCronIsolatedAgentTurn` resolves: `setOk` or `setError` is called.
3. `runId` is returned in the `POST` response body so MiNA knows what to poll.

### `src/gateway/server-http.ts` (modified)

Added a `GET /hooks/result/:runId` polling endpoint alongside the existing
`POST /hooks/agent`. The same bearer token auth applies.

Response shapes:

```jsonc
// pending
{ "ok": true, "runId": "...", "status": "pending", "queuedAt": 1234567890 }

// succeeded
{ "ok": true, "runId": "...", "status": "ok", "output": "...", "summary": "..." }

// failed
{ "ok": true, "runId": "...", "status": "error", "error": "..." }

// unknown / expired
{ "ok": false, "error": "run not found" }   // HTTP 404
```

`HEAD` is also supported for cheap liveness checks. The `Allow` header now reports
`GET, HEAD, POST`.

### `src/gateway/server-runtime-state.ts` (modified)

Constructs a `RunResultStore` instance and threads it into
`createGatewayHooksRequestHandler`. The store shares the same process lifetime as
the gateway; a restart clears all pending results.

---

## Extensions

### `extensions/mina-provider` (new)

Registers MiNA as an OpenAI-compatible provider so OpenClaw can use MiNA as its
AI model for agent turns.

**Provider ID:** `mina`
**Default base URL:** `http://localhost:8000`
**Auth:** `MINA_API_KEY` env var or `models.providers.mina.apiKey` config

Models exposed:

| Model ID               | Role                                   |
| ---------------------- | -------------------------------------- |
| `mina/design-expert`   | Lead design MoE router — default model |
| `mina/code-expert`     | Frontend / CSS specialist              |
| `mina/ux-researcher`   | UX research and design critique        |
| `mina/asset-generator` | Image and visual asset generation      |

Discovery order is `"late"` so MiNA is tried after built-in cloud providers.
The standard `openclaw/plugin-sdk/self-hosted-provider-setup` wizard handles both
interactive and non-interactive auth configuration.

**Files:**

- `extensions/mina-provider/package.json`
- `extensions/mina-provider/index.ts`

---

### `extensions/figma-tool` (new)

Eight agent tools wrapping the Figma REST API v1. Auth comes from
`plugins.figma-tool.token` config or the `FIGMA_TOKEN` env var.

| Tool                   | API call                             | Description                                     |
| ---------------------- | ------------------------------------ | ----------------------------------------------- |
| `figma_get_file`       | `GET /v1/files/:key`                 | Full document tree, optional depth/node filter  |
| `figma_get_nodes`      | `GET /v1/files/:key/nodes`           | Specific nodes by ID                            |
| `figma_get_images`     | `GET /v1/images/:key`                | Export nodes as PNG/JPG/SVG/PDF                 |
| `figma_get_comments`   | `GET /v1/files/:key/comments`        | All comments on a file                          |
| `figma_post_comment`   | `POST /v1/files/:key/comments`       | Add a comment, optionally anchored to a node    |
| `figma_get_components` | `GET /v1/files/:key/components`      | Published components                            |
| `figma_get_styles`     | `GET /v1/files/:key/styles`          | Published styles (colors, text, effects, grids) |
| `figma_get_variables`  | `GET /v1/files/:key/variables/local` | Local design variables / tokens                 |

**Files:**

- `extensions/figma-tool/package.json`
- `extensions/figma-tool/src/figma-client.ts` — thin Figma REST client + `FigmaApiError`
- `extensions/figma-tool/src/figma-tools.ts` — tool factory functions
- `extensions/figma-tool/index.ts` — plugin entry, registers all 8 tools

---

### `extensions/pencil-tool` (new)

Ten agent tools that bridge the Pencil.dev MCP server into OpenClaw. The bridge uses
`StdioClientTransport` from `@modelcontextprotocol/sdk`, mirroring the pattern in
`src/browser/chrome-mcp.ts`. A singleton MCP client connects lazily on first use.

MCP server launch is configurable via:

- `plugins.pencil-tool.mcpCommand` / `plugins.pencil-tool.mcpArgs` in config
- `PENCIL_MCP_COMMAND` / `PENCIL_MCP_ARGS` env vars
- Default: `pencil mcp`

| Tool                     | Pencil MCP tool    | Description                                             |
| ------------------------ | ------------------ | ------------------------------------------------------- |
| `pencil_editor_state`    | `get_editor_state` | Current active file and selection                       |
| `pencil_open_document`   | `open_document`    | Open a .pen file or create new                          |
| `pencil_batch_get`       | `batch_get`        | Read nodes by glob pattern or IDs                       |
| `pencil_batch_design`    | `batch_design`     | Execute design operations (insert/update/delete/move/…) |
| `pencil_snapshot_layout` | `snapshot_layout`  | Computed layout rectangles for all nodes                |
| `pencil_screenshot`      | `get_screenshot`   | Screenshot of a node or full canvas                     |
| `pencil_get_variables`   | `get_variables`    | Extract design variables / tokens                       |
| `pencil_set_variables`   | `set_variables`    | Add or update design variables                          |
| `pencil_get_guidelines`  | `get_guidelines`   | Design guidelines for a topic                           |
| `pencil_export_nodes`    | `export_nodes`     | Export nodes as PNG/JPEG/WEBP/PDF                       |

**Files:**

- `extensions/pencil-tool/package.json`
- `extensions/pencil-tool/src/pencil-mcp-client.ts` — singleton MCP client
- `extensions/pencil-tool/src/pencil-tools.ts` — tool factory functions
- `extensions/pencil-tool/index.ts` — plugin entry, registers all 10 tools

---

### `extensions/design-session-tool` (new)

Three agent tools that persist design context across multiple `/hooks/agent` calls
in the same session. Without session state, each agent turn starts cold — MiNA would
have to re-specify which file it is working on every time.

State is held in a **module-level `Map`** inside the extension process. Because
extensions are singletons, the Map outlives any single agent turn.

| Field           | Type                                   | Description                           |
| --------------- | -------------------------------------- | ------------------------------------- |
| `activeTool`    | `"pencil" \| "figma" \| "illustrator"` | Design tool in use                    |
| `activeFile`    | `string`                               | Figma file key or Pencil .pen path    |
| `activeNodeIds` | `string`                               | Comma-separated node IDs in focus     |
| `activePageId`  | `string`                               | Active page or frame ID               |
| `notes`         | `string`                               | Free-form notes MiNA wants to persist |

Storage limits: **TTL 4 hours**, **max 500 sessions**, lazy pruning on every write.

| Tool                                   | Description                                  |
| -------------------------------------- | -------------------------------------------- |
| `design_session_get(session_key)`      | Retrieve full session or `{ exists: false }` |
| `design_session_set(session_key, ...)` | Create or partially update a session         |
| `design_session_clear(session_key)`    | Delete a session when the task is done       |

Recommended agent workflow (baked into `configs/design-gateway.json`):

1. `design_session_get` — restore prior context
2. Inspect the document (`pencil_editor_state` or `figma_get_file`)
3. Execute design operations
4. Validate (`pencil_screenshot` or `figma_get_images`)
5. `design_session_set` — persist updated context
6. Return a JSON result summary

**Files:**

- `extensions/design-session-tool/package.json`
- `extensions/design-session-tool/src/session-store.ts` — TTL Map store
- `extensions/design-session-tool/src/session-tools.ts` — 3 tool definitions
- `extensions/design-session-tool/index.ts` — plugin entry

---

## Configuration

### `configs/design-gateway.json` (new)

Drop-in gateway config for the MiNA design executor. Copy to `~/.openclaw/config.json`
(or pass `--config configs/design-gateway.json`) when running the design gateway.

Key settings:

| Setting                        | Value        | Notes                                     |
| ------------------------------ | ------------ | ----------------------------------------- |
| `gateway.port`                 | `18790`      | Separate port from the default gateway    |
| `gateway.bind`                 | `"loopback"` | Loopback only; MiNA runs on the same host |
| `defaultAgent`                 | `"mina"`     | Uses `mina/design-expert` as the model    |
| `hooks.enabled`                | `true`       | Required for `POST /hooks/agent`          |
| `hooks.allowRequestSessionKey` | `true`       | MiNA passes its own session keys          |

Before use, replace the three placeholders:

```json
"baseUrl": "<MINA_ENDPOINT>"   // MiNA REST base URL, e.g. "http://localhost:8000"
"token":   "<HOOK_TOKEN>"      // Bearer token for POST /hooks/agent auth
"token":   "<FIGMA_TOKEN>"     // Figma personal access token
```

All messaging channels are listed under `_disabledChannels` so no chat connectors
start up — the gateway exists purely to serve MiNA's hook requests.

---

## Development tooling

### `scripts/mock-mina-server.ts` (new)

A zero-dependency Bun/Node HTTP server that mimics MiNA's OpenAI-compatible REST API
for local development and end-to-end testing.

```bash
pnpm dev:mock-mina                    # port 8000, streaming on
MOCK_MINA_PORT=9000 pnpm dev:mock-mina
MOCK_MINA_STREAMING=0 pnpm dev:mock-mina   # non-streaming JSON responses
```

Endpoints:

| Method | Path                   | Response                                   |
| ------ | ---------------------- | ------------------------------------------ |
| `GET`  | `/health`              | `{ status: "ok" }`                         |
| `GET`  | `/v1/models`           | All 4 MiNA model objects                   |
| `POST` | `/v1/chat/completions` | Canned JSON design summary; SSE by default |

The canned response is a JSON object describing the task, a mock action list, and a
summary — enough for integration tests without a live MiNA instance.

---

## Tests

### `extensions/design-session-tool/src/session-store.test.ts` (new)

17 tests covering the `DesignSessionStore` Map directly:

- `getSession`: miss, hit, expiry after TTL
- `upsertSession`: create, field merge, overwrite, timestamp behavior, TTL refresh,
  all optional fields stored correctly
- `clearSession`: unknown key returns false, removes and returns true, idempotent
- TTL pruning: expired entries swept lazily on next write

### `extensions/design-session-tool/src/session-tools.test.ts` (new)

8 tests covering the tool `execute` handlers with mocked plugin-sdk imports:

- `design_session_get`: miss returns `exists: false`, missing param throws, hit returns session
- `design_session_set`: missing param throws, creates session, merges partial updates,
  ignores invalid `active_tool` values, persists to store
- `design_session_clear`: missing param throws, removes and reports `removed: true`,
  miss reports `removed: false`, idempotent

Run all tests:

```bash
pnpm test -- extensions/design-session-tool
```

---

## Full file index

```
src/gateway/
  run-result-store.ts          NEW  In-memory TTL store for hook run results
  server/hooks.ts              MOD  Wires RunResultStore into hook dispatcher
  server-http.ts               MOD  Adds GET /hooks/result/:runId polling endpoint
  server-runtime-state.ts      MOD  Constructs RunResultStore, passes to hooks handler

extensions/
  mina-provider/
    package.json               NEW
    index.ts                   NEW  MiNA as OpenAI-compatible provider (4 models)
  figma-tool/
    package.json               NEW
    src/figma-client.ts        NEW  Figma REST API v1 client
    src/figma-tools.ts         NEW  8 agent tools (get_file, get_nodes, images, …)
    index.ts                   NEW  Plugin entry
  pencil-tool/
    package.json               NEW
    src/pencil-mcp-client.ts   NEW  StdioClientTransport MCP bridge (singleton)
    src/pencil-tools.ts        NEW  10 agent tools (editor_state, batch_design, …)
    index.ts                   NEW  Plugin entry
  design-session-tool/
    package.json               NEW
    src/session-store.ts       NEW  Module-level TTL Map (4 h, 500 sessions)
    src/session-tools.ts       NEW  3 tools: get, set, clear
    src/session-store.test.ts  NEW  17 unit tests
    src/session-tools.test.ts  NEW  8 unit tests
    index.ts                   NEW  Plugin entry

configs/
  design-gateway.json          NEW  Gateway config for MiNA design executor

scripts/
  mock-mina-server.ts          NEW  OpenAI-compatible mock REST server for testing
```
