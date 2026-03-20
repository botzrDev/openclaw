/**
 * RunResultStore — in-memory store for hook agent run results.
 *
 * Used by the MiNA design gateway so external callers (MiNA) can poll
 * GET /hooks/result/:runId after posting to POST /hooks/agent.
 *
 * Results are kept for TTL_MS (default 30 min) and pruned lazily on each
 * write. The store is intentionally simple: one process, one store, no
 * persistence — restarts clear all pending results.
 */

/** Run is queued but not yet started. */
type RunResultPending = { status: "pending"; queuedAt: number };

/** Run completed successfully. */
type RunResultOk = {
  status: "ok";
  /** The agent's final text output. */
  output: string;
  /** Short summary if the runner produced one. */
  summary?: string;
  completedAt: number;
};

/** Run failed or timed out. */
type RunResultError = {
  status: "error";
  error: string;
  completedAt: number;
};

export type RunResult = RunResultPending | RunResultOk | RunResultError;

type StoredEntry = {
  result: RunResult;
  /** Absolute ms timestamp after which the entry may be pruned. */
  expiresAt: number;
};

const DEFAULT_TTL_MS = 30 * 60 * 1000; // 30 minutes
const MAX_ENTRIES = 2000;

export class RunResultStore {
  private readonly entries = new Map<string, StoredEntry>();
  private readonly ttlMs: number;

  constructor(ttlMs: number = DEFAULT_TTL_MS) {
    this.ttlMs = ttlMs;
  }

  /** Record that a run has been queued (before async execution starts). */
  setPending(runId: string): void {
    this.upsert(runId, { status: "pending", queuedAt: Date.now() });
  }

  /** Record a successful run result. */
  setOk(runId: string, output: string, summary?: string): void {
    this.upsert(runId, { status: "ok", output, summary, completedAt: Date.now() });
  }

  /** Record a failed/timed-out run. */
  setError(runId: string, error: string): void {
    this.upsert(runId, { status: "error", error, completedAt: Date.now() });
  }

  /** Retrieve a result. Returns null if the runId is unknown or expired. */
  get(runId: string): RunResult | null {
    const entry = this.entries.get(runId);
    if (!entry) {
      return null;
    }
    if (Date.now() > entry.expiresAt) {
      this.entries.delete(runId);
      return null;
    }
    return entry.result;
  }

  private upsert(runId: string, result: RunResult): void {
    const expiresAt = Date.now() + this.ttlMs;
    this.entries.delete(runId);
    this.entries.set(runId, { result, expiresAt });
    this.prune();
  }

  /** Evict expired entries and trim to MAX_ENTRIES. */
  private prune(): void {
    const now = Date.now();
    for (const [key, entry] of this.entries) {
      if (entry.expiresAt < now) {
        this.entries.delete(key);
      }
    }
    // If still too large, evict oldest (Map insertion order).
    while (this.entries.size > MAX_ENTRIES) {
      const oldest = this.entries.keys().next().value;
      if (!oldest) {
        break;
      }
      this.entries.delete(oldest);
    }
  }
}
