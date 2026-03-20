import type { ServerResponse } from "node:http";
import { describe, expect, test, vi } from "vitest";
import type { createSubsystemLogger } from "../logging/subsystem.js";
import { createHooksConfig } from "./hooks-test-helpers.js";
import { createGatewayRequest } from "./hooks-test-helpers.js";
import { RunResultStore } from "./run-result-store.js";
import { createHooksRequestHandler } from "./server-http.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeLogger() {
  return {
    warn: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
  } as unknown as ReturnType<typeof createSubsystemLogger>;
}

function createResponse() {
  const setHeader = vi.fn();
  let body = "";
  const end = vi.fn((chunk?: unknown) => {
    if (typeof chunk === "string") {
      body = chunk;
    } else if (chunk == null) {
      body = "";
    } else {
      body = JSON.stringify(chunk);
    }
  });
  const res = {
    headersSent: false,
    statusCode: 200,
    setHeader,
    end,
  } as unknown as ServerResponse;
  return { res, setHeader, end, getBody: () => body };
}

function createHandler(store: RunResultStore | null = null) {
  return createHooksRequestHandler({
    getHooksConfig: () => createHooksConfig(),
    bindHost: "127.0.0.1",
    port: 18789,
    logHooks: makeLogger(),
    dispatchWakeHook: vi.fn(),
    dispatchAgentHook: vi.fn(() => "run-dispatched"),
    getRunResultStore: store ? () => store : undefined,
  });
}

function getRequest(path: string, method = "GET", authorization = "Bearer hook-secret") {
  return createGatewayRequest({ path, method, authorization, host: "127.0.0.1:18789" });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("GET /hooks/result/:runId", () => {
  test("returns 404 when result store is not configured", async () => {
    const handler = createHandler(null);
    const req = getRequest("/hooks/result/run-1");
    const { res, getBody } = createResponse();

    const handled = await handler(req, res);

    expect(handled).toBe(true);
    expect(res.statusCode).toBe(404);
    expect(JSON.parse(getBody())).toMatchObject({ ok: false, error: "result polling not enabled" });
  });

  test("returns 401 when bearer token is missing", async () => {
    const store = new RunResultStore();
    store.setPending("run-1");
    const handler = createHandler(store);

    const req = createGatewayRequest({
      path: "/hooks/result/run-1",
      method: "GET",
      host: "127.0.0.1:18789",
      // no authorization header
    });
    const { res } = createResponse();

    const handled = await handler(req, res);

    expect(handled).toBe(true);
    expect(res.statusCode).toBe(401);
  });

  test("returns 401 when bearer token is wrong", async () => {
    const store = new RunResultStore();
    store.setPending("run-1");
    const handler = createHandler(store);

    const req = getRequest("/hooks/result/run-1", "GET", "Bearer wrong-token");
    const { res } = createResponse();

    const handled = await handler(req, res);

    expect(handled).toBe(true);
    expect(res.statusCode).toBe(401);
  });

  test("returns 404 for unknown runId", async () => {
    const store = new RunResultStore();
    const handler = createHandler(store);

    const req = getRequest("/hooks/result/no-such-run");
    const { res, getBody } = createResponse();

    const handled = await handler(req, res);

    expect(handled).toBe(true);
    expect(res.statusCode).toBe(404);
    expect(JSON.parse(getBody())).toMatchObject({ ok: false, error: "run not found" });
  });

  test("returns pending result", async () => {
    const store = new RunResultStore();
    store.setPending("run-pending");
    const handler = createHandler(store);

    const req = getRequest("/hooks/result/run-pending");
    const { res, getBody } = createResponse();

    const handled = await handler(req, res);

    expect(handled).toBe(true);
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(getBody());
    expect(body).toMatchObject({ ok: true, runId: "run-pending", status: "pending" });
    expect(typeof body.queuedAt).toBe("number");
  });

  test("returns ok result with output and summary", async () => {
    const store = new RunResultStore();
    store.setOk("run-ok", "agent output text", "brief summary");
    const handler = createHandler(store);

    const req = getRequest("/hooks/result/run-ok");
    const { res, getBody } = createResponse();

    const handled = await handler(req, res);

    expect(handled).toBe(true);
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(getBody());
    expect(body).toMatchObject({
      ok: true,
      runId: "run-ok",
      status: "ok",
      output: "agent output text",
      summary: "brief summary",
    });
  });

  test("returns error result", async () => {
    const store = new RunResultStore();
    store.setError("run-err", "agent crashed");
    const handler = createHandler(store);

    const req = getRequest("/hooks/result/run-err");
    const { res, getBody } = createResponse();

    const handled = await handler(req, res);

    expect(handled).toBe(true);
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(getBody());
    expect(body).toMatchObject({
      ok: true,
      runId: "run-err",
      status: "error",
      error: "agent crashed",
    });
  });
});

describe("HEAD /hooks/result/:runId", () => {
  test("returns 200 without body for existing result", async () => {
    const store = new RunResultStore();
    store.setPending("run-head");
    const handler = createHandler(store);

    const req = getRequest("/hooks/result/run-head", "HEAD");
    const { res, end } = createResponse();

    const handled = await handler(req, res);

    expect(handled).toBe(true);
    expect(res.statusCode).toBe(200);
    // HEAD must end with no body args
    expect(end).toHaveBeenCalledWith();
  });

  test("HEAD returns 404 for unknown runId", async () => {
    const store = new RunResultStore();
    const handler = createHandler(store);

    const req = getRequest("/hooks/result/no-such", "HEAD");
    const { res } = createResponse();

    const handled = await handler(req, res);

    expect(handled).toBe(true);
    expect(res.statusCode).toBe(404);
  });

  test("HEAD returns 401 with wrong token", async () => {
    const store = new RunResultStore();
    store.setPending("run-head-auth");
    const handler = createHandler(store);

    const req = getRequest("/hooks/result/run-head-auth", "HEAD", "Bearer bad");
    const { res } = createResponse();

    const handled = await handler(req, res);

    expect(handled).toBe(true);
    expect(res.statusCode).toBe(401);
  });
});

describe("405 Method Not Allowed on hooks path", () => {
  test("DELETE on /hooks path returns 405 with Allow: GET, HEAD, POST", async () => {
    const store = new RunResultStore();
    const handler = createHandler(store);

    // Use the hooks base path with an unsupported method
    const req = getRequest("/hooks/result/some-run", "DELETE");
    const { res, setHeader } = createResponse();

    const handled = await handler(req, res);

    expect(handled).toBe(true);
    expect(res.statusCode).toBe(405);
    expect(setHeader).toHaveBeenCalledWith("Allow", expect.stringContaining("GET"));
    expect(setHeader).toHaveBeenCalledWith("Allow", expect.stringContaining("HEAD"));
  });
});
