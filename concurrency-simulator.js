/**
 * Concurrency & Flash Crowd Burst Simulator Engine
 * Simulates extreme e-commerce rush hour traffic (11.11 Midnight Flash Sale).
 * 
 * Verifies:
 * 1. Mutual Exclusion under 100+ concurrent requests on a single inventory item.
 * 2. Mathematical Inventory Conservation Law (available + locked + sold === total).
 * 3. TTL Expiry Recovery for Cart Abandonment (Zombie Locks).
 * 
 * Lab 02 - HW 3: Vietnam Mega-Sale Flash Deal Engine
 */

/**
 * Simulates a high-concurrency rush of N users attempting to lock an item simultaneously.
 * 
 * @param {import('./inventory-state-machine.js').OptimisticInventoryLockManager} lockManager
 * @param {string} productId
 * @param {number} userCount
 * @param {number} [maxJitterMs=20] - Network jitter delay
 * @returns {Promise<{
 *   totalAttempts: number,
 *   acquiredCount: number,
 *   rejectedCount: number,
 *   oversold: boolean,
 *   conservationValid: boolean,
 *   productState: Object
 * }>}
 */
export async function simulateFlashCrowdBurst(lockManager, productId, userCount = 50, maxJitterMs = 20) {
  const productBefore = lockManager.getProduct(productId);
  if (!productBefore) {
    throw new Error(`Product ${productId} not found.`);
  }

  // Generate N unique user lock attempts with randomized network jitter
  const promises = Array.from({ length: userCount }, async (_, idx) => {
    const jitter = Math.floor(Math.random() * maxJitterMs);
    if (jitter > 0) {
      await new Promise((r) => setTimeout(r, jitter));
    }
    return lockManager.requestLock(productId, `sim-user-${idx + 1}-${Date.now()}`);
  });

  const results = await Promise.all(promises);
  const acquired = results.filter((r) => r.success);
  const rejected = results.filter((r) => !r.success);

  const productAfter = lockManager.getProduct(productId);
  const totalSum = productAfter.availableStock + productAfter.lockedStock + productAfter.soldStock;
  const conservationValid = totalSum === productAfter.totalStock;
  const oversold = productAfter.availableStock < 0 || totalSum > productAfter.totalStock;

  return {
    totalAttempts: userCount,
    acquiredCount: acquired.length,
    rejectedCount: rejected.length,
    oversold,
    conservationValid,
    productState: productAfter
  };
}

/**
 * Simulates user checkout abandonment where locked items expire and return to inventory pool.
 * 
 * @param {import('./inventory-state-machine.js').OptimisticInventoryLockManager} lockManager
 * @param {string} productId
 * @param {number} leaseMs - Short lease duration to test
 * @returns {Promise<{
 *   initialAvailable: number,
 *   lockedCount: number,
 *   restoredAvailable: number,
 *   leaksDetected: boolean
 * }>}
 */
export async function simulateCartAbandonmentAndRecovery(lockManager, productId, leaseMs = 50) {
  const prodBefore = lockManager.getProduct(productId);
  const initialAvailable = prodBefore.availableStock;

  // Lock 1 item with ultra-short lease
  const res = await lockManager.requestLock(productId, `abandon-user-${Date.now()}`, leaseMs);
  if (!res.success) {
    throw new Error(`Could not acquire lock: ${res.reason}`);
  }

  const prodLocked = lockManager.getProduct(productId);
  const lockedCount = prodLocked.lockedStock;

  // Wait for lease to expire + trigger reaper
  await new Promise((r) => setTimeout(r, leaseMs + 40));
  lockManager.reapExpiredLocks();

  const prodAfter = lockManager.getProduct(productId);
  const restoredAvailable = prodAfter.availableStock;
  const leaksDetected = restoredAvailable !== initialAvailable || prodAfter.lockedStock !== 0;

  return {
    initialAvailable,
    lockedCount,
    restoredAvailable,
    leaksDetected
  };
}

/**
 * Validates mathematical conservation across all registered products in store.
 * @param {import('./inventory-state-machine.js').OptimisticInventoryLockManager} lockManager
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function verifyStorewideConservation(lockManager) {
  const products = lockManager.getProducts();
  const errors = [];

  products.forEach((p) => {
    const sum = p.availableStock + p.lockedStock + p.soldStock;
    if (sum !== p.totalStock) {
      errors.push(`Conservation failed for ${p.id}: available (${p.availableStock}) + locked (${p.lockedStock}) + sold (${p.soldStock}) = ${sum} !== total (${p.totalStock})`);
    }
  });

  return {
    valid: errors.length === 0,
    errors
  };
}
