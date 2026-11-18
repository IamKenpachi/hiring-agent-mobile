import test from "node:test";
import assert from "node:assert/strict";
import {
  MINIMUM_TAILOR_WAIT_MS,
  TAILOR_WITTY_MESSAGES,
  abortActiveTailorRun,
  clearPendingTailorRequest,
  executeWithMinimumDelay,
  getOrStartTailorRun,
  getPendingTailorRequest,
  isAbortError,
  resetActiveTailorRun,
  setPendingTailorRequest,
} from "../tailorSession.ts";

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

test("MINIMUM_TAILOR_WAIT_MS is 7000 and TAILOR_WITTY_MESSAGES has 12-16 non-empty unique quips", () => {
  assert.equal(MINIMUM_TAILOR_WAIT_MS, 7000);
  assert.ok(Array.isArray(TAILOR_WITTY_MESSAGES));
  assert.ok(
    TAILOR_WITTY_MESSAGES.length >= 12 && TAILOR_WITTY_MESSAGES.length <= 16,
    `Expected 12-16 messages, got ${TAILOR_WITTY_MESSAGES.length}`
  );
  const unique = new Set();
  for (const msg of TAILOR_WITTY_MESSAGES) {
    assert.equal(typeof msg, "string");
    assert.ok(msg.trim().length > 10, `Message too short: ${msg}`);
    unique.add(msg);
  }
  assert.equal(unique.size, TAILOR_WITTY_MESSAGES.length);
});

test("setPendingTailorRequest, getPendingTailorRequest, and clearPendingTailorRequest preserve state across StrictMode reads", () => {
  clearPendingTailorRequest();
  assert.equal(getPendingTailorRequest(), null);

  const studioReq = {
    source: "studio",
    payload: {
      job_title: "Senior Data Analyst",
      company: "Monzo",
      job_description: "Build scalable dbt models and dashboards in Snowflake.",
      tone: "Modern & Impactful",
      model: "gemini-3.8-flash",
    },
    jobTitle: "Senior Data Analyst",
    company: "Monzo",
    model: "gemini-3.8-flash",
    tone: "Modern & Impactful",
  };

  setPendingTailorRequest(studioReq);
  // Repeated reads (simulating React StrictMode double-mount) must not clear the request
  assert.deepEqual(getPendingTailorRequest(), studioReq);
  assert.deepEqual(getPendingTailorRequest(), studioReq);

  const jobReq = {
    source: "job",
    jobId: "job-123",
    payload: {
      tone: "Technical & Direct",
      custom_capabilities: "Kafka + Airflow",
      model: "gemini-4-hydrogen",
    },
    jobTitle: "Analytics Engineer",
    company: "Revolut",
    model: "gemini-4-hydrogen",
    tone: "Technical & Direct",
  };

  setPendingTailorRequest(jobReq);
  assert.deepEqual(getPendingTailorRequest(), jobReq);

  clearPendingTailorRequest();
  assert.equal(getPendingTailorRequest(), null);
});

test("executeWithMinimumDelay enforces minimum delay when task completes quickly", async () => {
  const minDelayMs = 120;
  const start = Date.now();
  const result = await executeWithMinimumDelay(async () => {
    await delay(10);
    return { id: "out-fast" };
  }, minDelayMs);
  const elapsed = Date.now() - start;

  assert.deepEqual(result, { id: "out-fast" });
  assert.ok(
    elapsed >= minDelayMs - 15,
    `Expected elapsed >= ${minDelayMs - 15}ms, got ${elapsed}ms`
  );
});

test("executeWithMinimumDelay resolves immediately once task completes if task exceeds minDelayMs", async () => {
  const start = Date.now();
  const result = await executeWithMinimumDelay(async () => {
    await delay(140);
    return { id: "out-slow" };
  }, 40);
  const elapsed = Date.now() - start;

  assert.deepEqual(result, { id: "out-slow" });
  assert.ok(elapsed >= 120, `Expected elapsed >= 120ms, got ${elapsed}ms`);
});

test("executeWithMinimumDelay rejects immediately on failure without waiting out minimum timer", async () => {
  const start = Date.now();
  await assert.rejects(
    () =>
      executeWithMinimumDelay(async () => {
        await delay(15);
        throw new Error("Gemini quota exhausted");
      }, MINIMUM_TAILOR_WAIT_MS),
    (err) => {
      assert.ok(err instanceof Error);
      assert.equal(err.message, "Gemini quota exhausted");
      return true;
    }
  );
  const elapsed = Date.now() - start;
  assert.ok(
    elapsed < 1000,
    `Expected immediate failure without waiting 7000ms, took ${elapsed}ms`
  );
});

test("executeWithMinimumDelay rejects immediately on pre-aborted signal and mid-flight abort", async () => {
  const preAborted = new AbortController();
  preAborted.abort();
  let taskCalled = false;

  await assert.rejects(
    () =>
      executeWithMinimumDelay(
        async () => {
          taskCalled = true;
          return "never";
        },
        MINIMUM_TAILOR_WAIT_MS,
        preAborted.signal
      ),
    (err) => isAbortError(err)
  );
  assert.equal(taskCalled, false);

  const midFlight = new AbortController();
  const start = Date.now();
  const timer = setTimeout(() => midFlight.abort(), 25);
  let lateTimer = null;

  try {
    await assert.rejects(
      () =>
        executeWithMinimumDelay(
          () =>
            new Promise((resolve) => {
              lateTimer = setTimeout(() => resolve("late"), 5000);
            }),
          MINIMUM_TAILOR_WAIT_MS,
          midFlight.signal
        ),
      (err) => isAbortError(err)
    );
  } finally {
    clearTimeout(timer);
    if (lateTimer) clearTimeout(lateTimer);
  }
  const elapsed = Date.now() - start;
  assert.ok(
    elapsed < 1000,
    `Expected immediate abort rejection without waiting 7000ms, took ${elapsed}ms`
  );
});

test("getOrStartTailorRun deduplicates across StrictMode unmount+remount and supports cancel/retry", async () => {
  clearPendingTailorRequest();
  const req = {
    source: "job",
    jobId: "job-strict",
    payload: { tone: "Modern & Impactful", model: "gemini-3.8-flash" },
    jobTitle: "Data Scientist",
    company: "Stripe",
    model: "gemini-3.8-flash",
    tone: "Modern & Impactful",
  };
  setPendingTailorRequest(req);

  let invocations = 0;
  const run1 = getOrStartTailorRun(req, async (signal) => {
    invocations += 1;
    assert.equal(signal.aborted, false);
    await delay(30);
    return { id: "out-1" };
  });

  // Simulate StrictMode cleanup followed synchronously by remount
  run1.scheduleUnmountAbort();
  const run2 = getOrStartTailorRun(req, async () => {
    invocations += 1;
    return { id: "out-2" };
  });

  assert.equal(run1, run2);
  const res = await run2.promise;
  assert.deepEqual(res, { id: "out-1" });
  assert.equal(invocations, 1);
  assert.equal(run1.controller.signal.aborted, false);

  // Genuine unmount aborts on next tick
  resetActiveTailorRun();
  let capturedSignal = null;
  const run3 = getOrStartTailorRun(req, async (signal) => {
    capturedSignal = signal;
    await delay(200);
    return { id: "out-3" };
  });
  run3.scheduleUnmountAbort();
  await delay(20);
  assert.equal(capturedSignal?.aborted, true);

  // abortActiveTailorRun clears both active run and pending request
  const run4 = getOrStartTailorRun(req, async (signal) => {
    await delay(200);
    return { id: "out-4", aborted: signal.aborted };
  });
  abortActiveTailorRun();
  assert.equal(run4.controller.signal.aborted, true);
  assert.equal(getPendingTailorRequest(), null);
});
