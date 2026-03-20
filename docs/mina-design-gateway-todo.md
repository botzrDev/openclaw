# MiNA Design Gateway — Remaining Work

Branch: `mina-design-gateway`
Reference doc: `docs/mina-design-gateway.md`

---

## 1. Unit tests — core gateway polling

**Files to test:**

- `src/gateway/run-result-store.ts`
- `src/gateway/server-http.ts` (the new `GET /hooks/result/:runId` handler)

**What to cover for `RunResultStore`:**

- `setPending` → `get` returns `{ status: "pending", queuedAt }`
- `setOk` → `get` returns `{ status: "ok", output, summary? }`
- `setError` → `get` returns `{ status: "error", error }`
- `get` returns `null` for unknown runId
- TTL expiry: entry returns `null` after 30 minutes (use `vi.useFakeTimers`)
- Max-entries eviction: inserting entry 2001 evicts the oldest
- `setOk`/`setError` after `setPending` on the same runId (normal lifecycle)

**What to cover for the polling endpoint (integration-style, no live gateway):**

- `GET /hooks/result/:runId` with a valid bearer token returns pending/ok/error JSON
- `HEAD /hooks/result/:runId` returns correct status code without body
- `GET /hooks/result/<unknown-id>` returns HTTP 404 `{ ok: false, error: "run not found" }`
- Missing or wrong bearer token returns HTTP 401
- `Allow: GET, HEAD, POST` header is present on 405 responses

---

## 2. Unit tests — Figma tool extension

**Files to test:**

- `extensions/figma-tool/src/figma-client.ts`
- `extensions/figma-tool/src/figma-tools.ts`

**What to cover for `figma-client.ts`:**

- `resolveFigmaToken` picks up `FIGMA_TOKEN` env var when config token is absent
- `resolveFigmaToken` prefers config token over env var
- `resolveFigmaToken` throws when neither is set
- `FigmaApiError` carries `status` and message from a non-2xx response

**What to cover for `figma-tools.ts` (mock `figma-client` and plugin-sdk):**

- Each tool passes the correct file key / node IDs / params to the underlying client function
- `figma_get_images` defaults to `format: "png"` when omitted
- `figma_get_images` passes through valid format values (`jpg`, `svg`, `pdf`)
- `figma_post_comment` includes `client_meta.node_id` only when `node_id` param is provided
- Required params (`file_key` on most tools) throw when missing

---

## 3. Unit tests — Pencil tool extension

**Files to test:**

- `extensions/pencil-tool/src/pencil-mcp-client.ts`
- `extensions/pencil-tool/src/pencil-tools.ts`

**What to cover for `pencil-mcp-client.ts`:**

- `resolvePencilMcpOptions` reads `mcpCommand`/`mcpArgs` from plugin config
- `resolvePencilMcpOptions` falls back to `PENCIL_MCP_COMMAND`/`PENCIL_MCP_ARGS` env vars
- `extractPencilResultText` joins text content items with newlines
- `extractPencilResultText` throws on `isError: true` results
- `getPencilMcpClient` reuses the same singleton on repeated calls (mock `StdioClientTransport`)

**What to cover for `pencil-tools.ts` (mock MCP client):**

- `pencil_batch_design` splits the operations string on newlines and passes an array to `callPencilTool`
- `pencil_batch_get` passes `patterns` and `node_ids` arrays through correctly
- `pencil_screenshot` omits `nodeId` from MCP args when not provided
- `pencil_open_document` requires `path` and passes it as `filePathOrNew`
- `pencil_export_nodes` defaults to `format: "png"` when omitted

---

## 4. E2E smoke test — full hook round-trip

**File to create:** `src/gateway/hooks-poll-roundtrip.e2e.test.ts`

Spin up a minimal gateway with the mock MiNA server running, fire
`POST /hooks/agent`, then poll `GET /hooks/result/:runId` until status is `ok`.
Validates the complete MiNA → OpenClaw → result flow without real design tools.

**Steps:**

1. Start `scripts/mock-mina-server.ts` on a random port as a child process
2. Start a gateway configured with `configs/design-gateway.json` (replace `<MINA_ENDPOINT>` with mock URL)
3. `POST /hooks/agent` with a test message and session key
4. Poll `GET /hooks/result/:runId` with exponential backoff until `status !== "pending"` or timeout
5. Assert `status === "ok"` and `output` contains expected mock summary JSON
6. Teardown both processes

Mark this test `*.e2e.test.ts` so it is excluded from the standard `pnpm test` run
and only fires via `pnpm test:e2e` or CI.

---

## 5. Illustrator tool (deferred)

**Skipped for now.** Implement when ready.

**Recommended approach:** ExtendScript JSX via AppleScript `do script` / `DoScript`
bridge — runs `.jsx` scripts inside the Illustrator desktop app directly, no browser
automation needed.

**Suggested tools:**

- `illustrator_run_script(script)` — execute a JSX string in the active Illustrator session
- `illustrator_get_document_info` — return active doc name, artboards, layers
- `illustrator_export_artboard(artboard, format, output_path)` — export as PNG/SVG/PDF
- `illustrator_place_image(image_path, x, y, width, height)` — place a linked image

**File to create:** `extensions/illustrator-tool/`

---

## 6. Verify `_disabledChannels` actually suppresses channel startup

`configs/design-gateway.json` lists channels under `"_disabledChannels"` (a
comment-style key). Confirm this key is honored by the gateway's channel loader, or
replace it with the correct config mechanism if not (e.g. setting each channel's
`enabled: false`, or omitting channel config entirely).

Run the gateway with the design config and verify no Discord/Telegram/Slack/etc.
connections are attempted in the startup log.

---

## Priority order

1. `RunResultStore` unit tests — smallest scope, directly validates the polling feature
2. Polling endpoint tests — validates the HTTP layer
3. Figma tool tests — validates token resolution and param passing
4. Pencil tool tests — validates MCP bridge and operations splitting
5. E2E smoke test — end-to-end validation of the full flow
6. `_disabledChannels` verification — config correctness check
7. Illustrator tool — deferred, implement when needed
