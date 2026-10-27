/**
 * Precision Anti-Drift Countdown Timer Engine
 * Eliminates cumulative timing drift using Date.now() delta vs drift-prone setInterval.
 * 
 * Invariants:
 * 1. Zero Cumulative Drift: Remaining time is always derived deterministically from (targetTime - Date.now()).
 * 2. Background Tab Resiliency: Listens to document.visibilityState to resync instantaneously on refocus.
 * 3. High-precision Formatting: Emits millisecond-accurate breakdowns (hours, minutes, seconds, milliseconds).
 * 
 * Lab 02 - HW 3: Vietnam Mega-Sale Flash Deal Engine
 */

/**
 * @typedef {Object} TimeBreakdown
 * @property {number} totalMs - Total remaining milliseconds
 * @property {number} hours - Remaining hours [0..N]
 * @property {number} minutes - Remaining minutes [0..59]
 * @property {number} seconds - Remaining seconds [0..59]
 * @property {number} milliseconds - Remaining milliseconds [0..999]
 * @property {string} formatted - Formatted string HH:MM:SS.mmm
 * @property {string} displayHours - Zero-padded hours string (e.g. "02")
 * @property {string} displayMinutes - Zero-padded minutes string (e.g. "15")
 * @property {string} displaySeconds - Zero-padded seconds string (e.g. "09")
 * @property {string} displayMillis - Zero-padded 3-digit millis string (e.g. "482")
 */

/**
 * Calculates zero-padded time components from milliseconds
 * @param {number} ms - Milliseconds remaining
 * @returns {TimeBreakdown}
 */
export function formatDuration(ms) {
  const safeMs = Math.max(0, Math.floor(ms));
  const hours = Math.floor(safeMs / (1000 * 60 * 60));
  const minutes = Math.floor((safeMs % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((safeMs % (1000 * 60)) / 1000);
  const milliseconds = safeMs % 1000;

  const displayHours = String(hours).padStart(2, '0');
  const displayMinutes = String(minutes).padStart(2, '0');
  const displaySeconds = String(seconds).padStart(2, '0');
  const displayMillis = String(milliseconds).padStart(3, '0');

  return {
    totalMs: safeMs,
    hours,
    minutes,
    seconds,
    milliseconds,
    formatted: `${displayHours}:${displayMinutes}:${displaySeconds}.${displayMillis}`,
    displayHours,
    displayMinutes,
    displaySeconds,
    displayMillis
  };
}

/**
 * Creates an Anti-Drift Countdown Timer.
 * Uses requestAnimationFrame with deterministic Date.now() delta.
 * 
 * @param {number} durationMs - Timer countdown duration in milliseconds
 * @param {(time: TimeBreakdown) => void} onTick - Callback executed on each animation frame
 * @param {() => void} [onComplete] - Callback executed when timer reaches 0
 * @returns {() => void} Teardown cancel function
 */
export function createAntiDriftTimer(durationMs, onTick, onComplete) {
  if (typeof durationMs !== 'number' || durationMs < 0 || isNaN(durationMs)) {
    throw new TypeError('[createAntiDriftTimer] durationMs must be a non-negative number.');
  }
  if (typeof onTick !== 'function') {
    throw new TypeError('[createAntiDriftTimer] onTick callback is required.');
  }

  const startTime = Date.now();
  const targetTime = startTime + durationMs;
  let rafId = null;
  let isCancelled = false;
  let hasCompleted = false;

  function tick() {
    if (isCancelled) return;

    const now = Date.now();
    const remaining = Math.max(0, targetTime - now);
    const breakdown = formatDuration(remaining);

    onTick(breakdown);

    if (remaining > 0) {
      // Check if in browser or node
      if (typeof requestAnimationFrame === 'function') {
        rafId = requestAnimationFrame(tick);
      } else {
        rafId = setTimeout(tick, 16);
      }
    } else if (!hasCompleted) {
      hasCompleted = true;
      if (onComplete) {
        onComplete();
      }
    }
  }

  // Handle Tab Backgrounding: Immediately resync when user tabs back
  const handleVisibilityChange = () => {
    if (typeof document !== 'undefined' && !document.hidden && !isCancelled && !hasCompleted) {
      // Resynchronize immediately
      tick();
    }
  };

  if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
    document.addEventListener('visibilitychange', handleVisibilityChange);
  }

  // Kick off first frame
  if (typeof requestAnimationFrame === 'function') {
    rafId = requestAnimationFrame(tick);
  } else {
    rafId = setTimeout(tick, 0);
  }

  // Return cancel controller
  return () => {
    isCancelled = true;
    if (rafId !== null) {
      if (typeof cancelAnimationFrame === 'function') {
        cancelAnimationFrame(rafId);
      } else {
        clearTimeout(rafId);
      }
      rafId = null;
    }
    if (typeof document !== 'undefined' && typeof document.removeEventListener === 'function') {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    }
  };
}
