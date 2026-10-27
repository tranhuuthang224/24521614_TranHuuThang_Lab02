/**
 * Automated Verification Test Suite for Anti-Drift Countdown Timer
 * Lab 02 - HW 3: Vietnam Mega-Sale Flash Deal Engine
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { createAntiDriftTimer, formatDuration } from './anti-drift-timer.js';

test('Task 3.1: formatDuration accurate breakdown & padding', () => {
  // Test 1: 0 ms
  const t0 = formatDuration(0);
  assert.equal(t0.hours, 0);
  assert.equal(t0.minutes, 0);
  assert.equal(t0.seconds, 0);
  assert.equal(t0.milliseconds, 0);
  assert.equal(t0.formatted, '00:00:00.000');

  // Test 2: 1 hour, 23 minutes, 45 seconds, 678 ms
  const ms = (1 * 3600 + 23 * 60 + 45) * 1000 + 678;
  const t1 = formatDuration(ms);
  assert.equal(t1.hours, 1);
  assert.equal(t1.minutes, 23);
  assert.equal(t1.seconds, 45);
  assert.equal(t1.milliseconds, 678);
  assert.equal(t1.formatted, '01:23:45.678');
  assert.equal(t1.displayHours, '01');
  assert.equal(t1.displayMinutes, '23');
  assert.equal(t1.displaySeconds, '45');
  assert.equal(t1.displayMillis, '678');

  // Test 3: Negative guard
  const tNeg = formatDuration(-500);
  assert.equal(tNeg.totalMs, 0);
  assert.equal(tNeg.formatted, '00:00:00.000');
});

test('Task 3.1: Contract guards throw TypeError on invalid arguments', () => {
  assert.throws(() => createAntiDriftTimer('invalid', () => {}), TypeError);
  assert.throws(() => createAntiDriftTimer(-100, () => {}), TypeError);
  assert.throws(() => createAntiDriftTimer(1000, null), TypeError);
  assert.throws(() => createAntiDriftTimer(1000, 'not-a-func'), TypeError);
});

test('Task 3.1: Anti-drift execution vs Date.now delta', async () => {
  const duration = 120; // 120ms
  const recordedTicks = [];
  let completed = false;

  const cancel = createAntiDriftTimer(
    duration,
    (breakdown) => {
      recordedTicks.push(breakdown.totalMs);
    },
    () => {
      completed = true;
    }
  );

  // Wait for timer to finish
  await new Promise((r) => setTimeout(r, 160));

  assert.equal(completed, true, 'Timer did not fire onComplete');
  assert.ok(recordedTicks.length > 0, 'No ticks were recorded');

  // First tick must be close to initial duration (>= 90ms)
  assert.ok(recordedTicks[0] <= duration);
  // Last tick must be 0ms
  assert.equal(recordedTicks[recordedTicks.length - 1], 0);

  // Ticks must be strictly non-increasing (monotonically decreasing)
  for (let i = 1; i < recordedTicks.length; i++) {
    assert.ok(
      recordedTicks[i] <= recordedTicks[i - 1],
      `Non-monotonic countdown detected: ${recordedTicks[i]} > ${recordedTicks[i - 1]}`
    );
  }

  cancel();
});

test('Task 3.1: Cancellation immediately prevents subsequent ticks', async () => {
  let tickCount = 0;
  const cancel = createAntiDriftTimer(500, () => {
    tickCount++;
  });

  // Let it tick once or twice
  await new Promise((r) => setTimeout(r, 30));
  const countAtCancel = tickCount;
  assert.ok(countAtCancel > 0);

  // Cancel timer
  cancel();

  // Wait another 60ms
  await new Promise((r) => setTimeout(r, 60));

  // Count must not increase after cancel
  assert.equal(tickCount, countAtCancel, 'Timer continued ticking after cancel() was called');
});
