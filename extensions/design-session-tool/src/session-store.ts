/**
 * In-process design session store.
 *
 * Keyed by session key (matching the OpenClaw hook session key MiNA passes).
 * Sessions expire after TTL_MS of inactivity and are pruned lazily on writes.
 * Because extensions are singletons within a process, this Map outlives any
 * single agent turn and gives MiNA continuity across multiple /hooks/agent calls.
 */

const TTL_MS = 4 * 60 * 60 * 1000; // 4 hours
const MAX_SESSIONS = 500;

export type ActiveTool = "pencil" | "figma" | "illustrator";

/** All fields are optional — MiNA sets only what it knows. */
export type DesignSession = {
  sessionKey: string;
  /** Which design tool is currently in use. */
  activeTool?: ActiveTool;
  /** Figma file key (e.g. "abc123xyz") or Pencil .pen file path. */
  activeFile?: string;
  /** Comma-separated node/layer IDs that MiNA is focused on. */
  activeNodeIds?: string;
  /** Active page or frame ID within the file. */
  activePageId?: string;
  /** Free-form notes MiNA wants to persist across turns. */
  notes?: string;
  createdAt: number;
  updatedAt: number;
};

type StoredEntry = {
  session: DesignSession;
  expiresAt: number;
};

const store = new Map<string, StoredEntry>();

/** Retrieve a session. Returns null if not found or expired. */
export function getSession(sessionKey: string): DesignSession | null {
  const entry = store.get(sessionKey);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    store.delete(sessionKey);
    return null;
  }
  return entry.session;
}

/** Create or update a session, returning the merged result. */
export function upsertSession(
  sessionKey: string,
  fields: Partial<Omit<DesignSession, "sessionKey" | "createdAt" | "updatedAt">>,
): DesignSession {
  const existing = getSession(sessionKey);
  const now = Date.now();
  const session: DesignSession = {
    ...(existing ?? { sessionKey, createdAt: now }),
    ...fields,
    sessionKey,
    updatedAt: now,
  };
  store.delete(sessionKey); // reset insertion order for LRU eviction
  store.set(sessionKey, { session, expiresAt: now + TTL_MS });
  prune();
  return session;
}

/** Remove a session entirely. */
export function clearSession(sessionKey: string): boolean {
  return store.delete(sessionKey);
}

function prune(): void {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (entry.expiresAt < now) store.delete(key);
  }
  while (store.size > MAX_SESSIONS) {
    const oldest = store.keys().next().value;
    if (!oldest) break;
    store.delete(oldest);
  }
}
