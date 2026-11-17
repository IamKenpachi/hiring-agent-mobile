import type { StudioTailorPayload } from "../types";

export interface StudioPendingTailorRequest {
  source: "studio";
  payload: StudioTailorPayload;
  jobTitle: string;
  company: string;
  model: string;
  tone: string;
}

export interface JobPendingTailorRequest {
  source: "job";
  jobId: string;
  payload: {
    tone?: string;
    custom_capabilities?: string;
    model?: string;
  };
  jobTitle: string;
  company: string;
  model: string;
  tone: string;
}

export type PendingTailorRequest =
  | StudioPendingTailorRequest
  | JobPendingTailorRequest;

export const MINIMUM_TAILOR_WAIT_MS = 7000;

export const TAILOR_WITTY_MESSAGES: readonly string[] = [
  "Translating 'worked on stuff' into quantified executive impact...",
  "Negotiating peace treaties with overly picky ATS keyword parsers...",
  "Removing 'synergy' before the hiring manager notices...",
  "Polishing bullet points until they practically sparkle in PDF...",
  "Cross-examining your projects for hidden metrics and wins...",
  "Teaching your cover letter to sound confident, not desperate...",
  "Aligning your verbs with whatever the job description secretly meant...",
  "Bribing the applicant tracking system with exact-match skills...",
  "Trimming fluff with surgical precision (no adjectives were harmed)...",
  "Checking if 'proficient in Excel' can legally upgrade to 'data wizard'...",
  "Weaving your best career plot twists into a one-page narrative...",
  "Double-checking that your achievements sound as cool as they actually are...",
  "Running one last anti-buzzword sweep across your summary...",
  "Rendering crisp typography so recruiters read past line three...",
];

export interface ActiveTailorRun<T = unknown> {
  request: PendingTailorRequest;
  controller: AbortController;
  promise: Promise<T>;
  cancelPendingAbort: () => void;
  scheduleUnmountAbort: () => void;
}

let pendingTailorRequest: PendingTailorRequest | null = null;
let activeTailorRun: ActiveTailorRun<unknown> | null = null;

export function isAbortError(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "name" in err &&
    (err as { name?: unknown }).name === "AbortError"
  );
}

function createAbortError(reason?: unknown): Error {
  if (reason instanceof Error && reason.name === "AbortError") {
    return reason;
  }
  const message =
    typeof reason === "string" && reason.trim()
      ? reason
      : reason instanceof Error && reason.message
        ? reason.message
        : "Tailoring cancelled";
  const err = new Error(message);
  err.name = "AbortError";
  return err;
}

/**
 * Store a pending tailor request for the `/tailoring` screen.
 * Cancels any stale in-flight run from an earlier submission.
 */
export function setPendingTailorRequest(request: PendingTailorRequest): void {
  if (activeTailorRun) {
    activeTailorRun.cancelPendingAbort();
    activeTailorRun.controller.abort();
    activeTailorRun = null;
  }
  pendingTailorRequest = request;
}

/**
 * Non-destructive read so React StrictMode double-mounts in dev
 * never lose the pending request between mount 1 and mount 2.
 */
export function getPendingTailorRequest(): PendingTailorRequest | null {
  return pendingTailorRequest;
}

/**
 * Clear the active request and reset active run tracking.
 */
export function clearPendingTailorRequest(): void {
  if (activeTailorRun) {
    activeTailorRun.cancelPendingAbort();
    activeTailorRun = null;
  }
  pendingTailorRequest = null;
}

/**
 * Reset only the active execution (e.g. before a manual Retry) while keeping
 * `pendingTailorRequest` intact.
 */
export function resetActiveTailorRun(): void {
  if (activeTailorRun) {
    activeTailorRun.cancelPendingAbort();
    if (!activeTailorRun.controller.signal.aborted) {
      activeTailorRun.controller.abort();
    }
    activeTailorRun = null;
  }
}

/**
 * Explicit user cancellation: abort the active run and clear the session.
 */
export function abortActiveTailorRun(): void {
  resetActiveTailorRun();
  pendingTailorRequest = null;
}

/**
 * Reuse an existing in-flight run for the same `PendingTailorRequest` across
 * React StrictMode double-mounts, or start a fresh run with its own AbortController.
 */
export function getOrStartTailorRun<T>(
  request: PendingTailorRequest,
  runner: (signal: AbortSignal) => Promise<T>
): ActiveTailorRun<T> {
  if (
    activeTailorRun &&
    activeTailorRun.request === request &&
    !activeTailorRun.controller.signal.aborted
  ) {
    activeTailorRun.cancelPendingAbort();
    return activeTailorRun as ActiveTailorRun<T>;
  }

  const controller = new AbortController();
  let unmountAbortTimer: ReturnType<typeof setTimeout> | null = null;

  let promise: Promise<T>;
  try {
    promise = Promise.resolve(runner(controller.signal));
  } catch (syncErr) {
    promise = Promise.reject(syncErr);
  }
  promise.catch(() => {
    // Prevent unhandled rejection warnings if aborted after unmount.
  });

  const run: ActiveTailorRun<T> = {
    request,
    controller,
    promise,
    cancelPendingAbort: () => {
      if (unmountAbortTimer !== null) {
        clearTimeout(unmountAbortTimer);
        unmountAbortTimer = null;
      }
    },
    scheduleUnmountAbort: () => {
      if (unmountAbortTimer !== null) {
        clearTimeout(unmountAbortTimer);
      }
      unmountAbortTimer = setTimeout(() => {
        unmountAbortTimer = null;
        controller.abort();
        if (activeTailorRun === run) {
          activeTailorRun = null;
        }
      }, 0);
    },
  };

  activeTailorRun = run as ActiveTailorRun<unknown>;
  return run;
}

/**
 * Run `task()` and a minimum delay timer in parallel via `Promise.all`:
 * - Waits at least `minDelayMs` when `task()` succeeds quickly.
 * - Rejects immediately when `task()` fails without waiting out the remaining timer.
 * - Cleans up timers and rejects immediately on `signal` abort.
 */
export async function executeWithMinimumDelay<T>(
  task: () => Promise<T>,
  minDelayMs: number = MINIMUM_TAILOR_WAIT_MS,
  signal?: AbortSignal
): Promise<T> {
  if (signal?.aborted) {
    throw createAbortError(signal.reason);
  }

  let delayTimer: ReturnType<typeof setTimeout> | null = null;
  let abortListener: (() => void) | null = null;
  let settled = false;

  const effectiveDelay =
    typeof minDelayMs === "number" && Number.isFinite(minDelayMs) && minDelayMs > 0
      ? minDelayMs
      : 0;

  let taskPromise: Promise<T>;
  try {
    taskPromise = Promise.resolve(task());
  } catch (syncErr) {
    return Promise.reject(syncErr);
  }

  taskPromise.catch(() => {
    // Prevent unhandled rejection when abort wins before task settles.
  });

  const delayPromise = new Promise<void>((resolve) => {
    if (effectiveDelay <= 0) {
      resolve();
      return;
    }
    delayTimer = setTimeout(() => {
      delayTimer = null;
      resolve();
    }, effectiveDelay);
  });

  const cleanup = () => {
    if (delayTimer !== null) {
      clearTimeout(delayTimer);
      delayTimer = null;
    }
    if (signal && abortListener) {
      signal.removeEventListener("abort", abortListener);
      abortListener = null;
    }
  };

  if (!signal) {
    try {
      const [result] = await Promise.all([taskPromise, delayPromise]);
      settled = true;
      return result;
    } finally {
      cleanup();
    }
  }

  const abortPromise = new Promise<never>((_, reject) => {
    abortListener = () => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(createAbortError(signal.reason));
    };
    signal.addEventListener("abort", abortListener, { once: true });
  });

  try {
    const [result] = await Promise.race([
      Promise.all([taskPromise, delayPromise]),
      abortPromise,
    ]);
    settled = true;
    return result;
  } finally {
    settled = true;
    cleanup();
  }
}
