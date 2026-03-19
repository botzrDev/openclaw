/**
 * Thin Figma REST API v1 client.
 *
 * Auth: personal access token or OAuth2 bearer token stored in OpenClaw config
 * under `plugins.figma-tool.token` or the env var FIGMA_TOKEN.
 *
 * Figma REST API docs: https://www.figma.com/developers/api
 */

const FIGMA_API_BASE = "https://api.figma.com/v1";

export type FigmaClientOptions = {
  /** Figma personal access token or OAuth bearer token. */
  token: string;
};

export class FigmaApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(`Figma API ${status}: ${message}`);
    this.name = "FigmaApiError";
  }
}

async function figmaFetch(
  token: string,
  path: string,
  options: RequestInit = {},
): Promise<unknown> {
  const url = `${FIGMA_API_BASE}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      "X-Figma-Token": token,
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
    },
  });
  const body = await res.text();
  if (!res.ok) {
    throw new FigmaApiError(res.status, body);
  }
  try {
    return JSON.parse(body);
  } catch {
    return body;
  }
}

// ---------------------------------------------------------------------------
// Files
// ---------------------------------------------------------------------------

export type FigmaGetFileOptions = {
  /** Comma-separated node IDs to retrieve (omit for full file). */
  ids?: string;
  /** Depth of the document tree to return (1–4 recommended for large files). */
  depth?: number;
  /** Return only geometry data. */
  geometry?: "paths";
  /** Return plugin data for listed plugin IDs. */
  plugin_data?: string;
};

export async function figmaGetFile(
  opts: FigmaClientOptions,
  fileKey: string,
  params: FigmaGetFileOptions = {},
): Promise<unknown> {
  const qs = new URLSearchParams();
  if (params.ids) qs.set("ids", params.ids);
  if (params.depth !== undefined) qs.set("depth", String(params.depth));
  if (params.geometry) qs.set("geometry", params.geometry);
  if (params.plugin_data) qs.set("plugin_data", params.plugin_data);
  const query = qs.toString() ? `?${qs}` : "";
  return figmaFetch(opts.token, `/files/${fileKey}${query}`);
}

// ---------------------------------------------------------------------------
// Nodes
// ---------------------------------------------------------------------------

export type FigmaGetNodesOptions = {
  /** Node IDs (required). */
  ids: string;
  depth?: number;
  geometry?: "paths";
};

export async function figmaGetNodes(
  opts: FigmaClientOptions,
  fileKey: string,
  params: FigmaGetNodesOptions,
): Promise<unknown> {
  const qs = new URLSearchParams({ ids: params.ids });
  if (params.depth !== undefined) qs.set("depth", String(params.depth));
  if (params.geometry) qs.set("geometry", params.geometry);
  return figmaFetch(opts.token, `/files/${fileKey}/nodes?${qs}`);
}

// ---------------------------------------------------------------------------
// Images (export render)
// ---------------------------------------------------------------------------

export type FigmaGetImagesOptions = {
  /** Comma-separated node IDs to render. */
  ids: string;
  /** Scale (0.01–4). Default 1. */
  scale?: number;
  /** Format. Default png. */
  format?: "jpg" | "png" | "svg" | "pdf";
  /** SVG options. */
  svg_include_id?: boolean;
  svg_simplify_stroke?: boolean;
  /** Use absolute bounding box. */
  use_absolute_bounds?: boolean;
  /** A specific version of the file. */
  version?: string;
};

export async function figmaGetImages(
  opts: FigmaClientOptions,
  fileKey: string,
  params: FigmaGetImagesOptions,
): Promise<unknown> {
  const qs = new URLSearchParams({ ids: params.ids });
  if (params.scale !== undefined) qs.set("scale", String(params.scale));
  if (params.format) qs.set("format", params.format);
  if (params.svg_include_id) qs.set("svg_include_id", "true");
  if (params.svg_simplify_stroke) qs.set("svg_simplify_stroke", "true");
  if (params.use_absolute_bounds) qs.set("use_absolute_bounds", "true");
  if (params.version) qs.set("version", params.version);
  return figmaFetch(opts.token, `/images/${fileKey}?${qs}`);
}

// ---------------------------------------------------------------------------
// Comments
// ---------------------------------------------------------------------------

export async function figmaGetComments(
  opts: FigmaClientOptions,
  fileKey: string,
): Promise<unknown> {
  return figmaFetch(opts.token, `/files/${fileKey}/comments`);
}

export async function figmaPostComment(
  opts: FigmaClientOptions,
  fileKey: string,
  body: {
    message: string;
    /** Anchor to a specific node. */
    client_meta?: { node_id?: string; node_offset?: { x: number; y: number } };
  },
): Promise<unknown> {
  return figmaFetch(opts.token, `/files/${fileKey}/comments`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

export async function figmaGetFileComponents(
  opts: FigmaClientOptions,
  fileKey: string,
): Promise<unknown> {
  return figmaFetch(opts.token, `/files/${fileKey}/components`);
}

// ---------------------------------------------------------------------------
// Variables (Figma Variables API — beta)
// ---------------------------------------------------------------------------

export async function figmaGetLocalVariables(
  opts: FigmaClientOptions,
  fileKey: string,
): Promise<unknown> {
  return figmaFetch(opts.token, `/files/${fileKey}/variables/local`);
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

export async function figmaGetFileStyles(
  opts: FigmaClientOptions,
  fileKey: string,
): Promise<unknown> {
  return figmaFetch(opts.token, `/files/${fileKey}/styles`);
}

// ---------------------------------------------------------------------------
// Token resolution helper
// ---------------------------------------------------------------------------

export function resolveFigmaToken(pluginConfig: unknown): string {
  const cfg = pluginConfig as Record<string, unknown> | null | undefined;
  const fromConfig = typeof cfg?.token === "string" ? cfg.token.trim() : "";
  const fromEnv = process.env["FIGMA_TOKEN"]?.trim() ?? "";
  const token = fromConfig || fromEnv;
  if (!token) {
    throw new Error(
      "Figma token not configured. Set FIGMA_TOKEN env var or plugins.figma-tool.token in config.",
    );
  }
  return token;
}
