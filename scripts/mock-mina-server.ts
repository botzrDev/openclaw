#!/usr/bin/env bun
/**
 * mock-mina-server.ts
 *
 * Tiny OpenAI-compatible mock server that stands in for MiNA during
 * local development and end-to-end testing of the OpenClaw design gateway.
 *
 * Usage:
 *   bun scripts/mock-mina-server.ts            # port 8000
 *   MOCK_MINA_PORT=9000 bun scripts/mock-mina-server.ts
 *   MOCK_MINA_STREAMING=0 bun scripts/mock-mina-server.ts  # non-streaming
 *
 * Endpoints:
 *   GET  /v1/models                 — list the 4 MiNA model IDs
 *   POST /v1/chat/completions       — return a canned design response
 *                                     (streaming by default, SSE)
 *   GET  /health                    — liveness probe
 */

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";

const PORT = Number(process.env.MOCK_MINA_PORT ?? 8000);
const STREAMING = process.env.MOCK_MINA_STREAMING !== "0";

// ---------------------------------------------------------------------------
// Model catalogue
// ---------------------------------------------------------------------------

const MODELS = [
  { id: "mina/design-expert", object: "model", created: 1_700_000_000, owned_by: "mina" },
  { id: "mina/code-expert", object: "model", created: 1_700_000_000, owned_by: "mina" },
  { id: "mina/ux-researcher", object: "model", created: 1_700_000_000, owned_by: "mina" },
  { id: "mina/asset-generator", object: "model", created: 1_700_000_000, owned_by: "mina" },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function json(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(payload),
  });
  res.end(payload);
}

function makeId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

// ---------------------------------------------------------------------------
// Canned completion content
//
// In a real integration MiNA produces the actual AI response. The mock
// returns a structured JSON summary so the design gateway's agent can
// inspect the result text in tests without needing a live MiNA instance.
// ---------------------------------------------------------------------------

function buildDesignResponse(model: string, userMessage: string): string {
  return JSON.stringify(
    {
      status: "ok",
      model,
      task: userMessage.slice(0, 120),
      actions: [
        { tool: "pencil_editor_state", result: "checked active document" },
        { tool: "pencil_batch_design", result: "applied design operations" },
      ],
      summary: "Mock MiNA completed the design task successfully.",
    },
    null,
    2,
  );
}

// ---------------------------------------------------------------------------
// Streaming response (SSE)
// ---------------------------------------------------------------------------

function sendStreaming(
  res: ServerResponse,
  model: string,
  completionId: string,
  content: string,
): void {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "Transfer-Encoding": "chunked",
  });

  const created = Math.floor(Date.now() / 1000);

  // Role chunk
  const roleChunk = JSON.stringify({
    id: completionId,
    object: "chat.completion.chunk",
    created,
    model,
    choices: [{ index: 0, delta: { role: "assistant", content: "" }, finish_reason: null }],
  });
  res.write(`data: ${roleChunk}\n\n`);

  // Content in small chunks so streaming parsers are exercised
  const chunkSize = 40;
  for (let i = 0; i < content.length; i += chunkSize) {
    const slice = content.slice(i, i + chunkSize);
    const chunk = JSON.stringify({
      id: completionId,
      object: "chat.completion.chunk",
      created,
      model,
      choices: [{ index: 0, delta: { content: slice }, finish_reason: null }],
    });
    res.write(`data: ${chunk}\n\n`);
  }

  // Stop chunk
  const stopChunk = JSON.stringify({
    id: completionId,
    object: "chat.completion.chunk",
    created,
    model,
    choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
  });
  res.write(`data: ${stopChunk}\n\n`);
  res.write("data: [DONE]\n\n");
  res.end();
}

// ---------------------------------------------------------------------------
// Non-streaming response
// ---------------------------------------------------------------------------

function sendNonStreaming(
  res: ServerResponse,
  model: string,
  completionId: string,
  content: string,
): void {
  json(res, 200, {
    id: completionId,
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [
      {
        index: 0,
        message: { role: "assistant", content },
        finish_reason: "stop",
      },
    ],
    usage: {
      prompt_tokens: 64,
      completion_tokens: content.length,
      total_tokens: 64 + content.length,
    },
  });
}

// ---------------------------------------------------------------------------
// Request router
// ---------------------------------------------------------------------------

async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = req.url ?? "/";
  const method = req.method ?? "GET";

  console.log(`[mock-mina] ${method} ${url}`);

  // Liveness probe
  if (url === "/health" && method === "GET") {
    return json(res, 200, { status: "ok", server: "mock-mina" });
  }

  // Model list
  if (url === "/v1/models" && (method === "GET" || method === "HEAD")) {
    return json(res, 200, { object: "list", data: MODELS });
  }

  // Chat completions
  if (url === "/v1/chat/completions" && method === "POST") {
    let body: Record<string, unknown> = {};
    try {
      const raw = await readBody(req);
      body = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return json(res, 400, {
        error: { message: "invalid JSON body", type: "invalid_request_error" },
      });
    }

    const model = typeof body.model === "string" ? body.model : "mina/design-expert";
    const messages = Array.isArray(body.messages) ? body.messages : [];
    const lastUserMsg = [...messages]
      .toReversed()
      .find(
        (m): m is { role: string; content: string } =>
          typeof (m as { role?: unknown }).role === "string" &&
          (m as { role: string }).role === "user",
      );
    const userText = lastUserMsg?.content ?? "";

    const content = buildDesignResponse(model, userText);
    const completionId = makeId("chatcmpl");
    const wantsStream = STREAMING && (body.stream === true || body.stream === undefined);

    if (wantsStream) {
      return sendStreaming(res, model, completionId, content);
    }
    return sendNonStreaming(res, model, completionId, content);
  }

  // Fallthrough — 404
  return json(res, 404, { error: { message: `${method} ${url} not found`, type: "not_found" } });
}

// ---------------------------------------------------------------------------
// Server bootstrap
// ---------------------------------------------------------------------------

const server = createServer((req, res) => {
  handleRequest(req, res).catch((err: unknown) => {
    console.error("[mock-mina] unhandled error", err);
    if (!res.headersSent) {
      json(res, 500, { error: { message: "internal server error", type: "server_error" } });
    }
  });
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`[mock-mina] listening on http://127.0.0.1:${PORT}`);
  console.log(`[mock-mina] streaming=${STREAMING}`);
  console.log(`[mock-mina] models: ${MODELS.map((m) => m.id).join(", ")}`);
});
