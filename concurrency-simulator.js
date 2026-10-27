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
 * @param {number} [userCount=50]
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
  if (!Number.isSafeInteger(userCount) || userCount <= 0) {
    throw new RangeError('userCount must be a positive safe integer');
  }
  if (!Number.isFinite(maxJitterMs) || maxJitterMs < 0) {
    throw new RangeError('maxJitterMs must be a non-negative finite number');
  }

  const productBefore = lockManager.getProduct(productId);
  if (!productBefore) {
    throw new Error(`Product ${productId} not found.`);
  }

  const availableStockBefore = productBefore.availableStock;

  // Generate N unique user lock attempts with randomized network jitter
  const promises = Array.from({ length: userCount }, async (_, idx) => {
    const jitter = Math.floor(Math.random() * maxJitterMs);
    if (jitter > 0) {
      await new Promise((r) => setTimeout(r, jitter));
    }
    return lockManager.requestLock(productId, `sim-user-${idx + 1}-${Date.now()}`);
  });

  const results = await Promise.all(promises);
  const acquired = results.filter((r) => r?.status === 'LOCKED' || (r?.success === true && r?.lock?.status === 'LOCKED'));
  const rejected = results.filter((r) => !r || (r.status !== 'LOCKED' && !r.success));

  const productAfter = lockManager.getProduct(productId);
  const validStockValues = [
    productAfter.availableStock,
    productAfter.lockedStock,
    productAfter.soldStock,
    productAfter.totalStock,
  ].every((val) => Number.isSafeInteger(val) && val >= 0);

  const totalSum = productAfter.availableStock + productAfter.lockedStock + productAfter.soldStock;
  const conservationValid = validStockValues && totalSum === productAfter.totalStock;

  const oversold =
    !validStockValues ||
    productAfter.availableStock < 0 ||
    productAfter.soldStock > productAfter.totalStock ||
    acquired.length > availableStockBefore ||
    totalSum > productAfter.totalStock;

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
 * @param {number} [leaseMs=50] - Short lease duration to test
 * @returns {Promise<{
 *   initialAvailable: number,
 *   lockedCount: number,
 *   restoredAvailable: number,
 *   leaksDetected: boolean
 * }>}
 */
export async function simulateCartAbandonmentAndRecovery(lockManager, productId, leaseMs = 50) {
  if (!Number.isFinite(leaseMs) || leaseMs <= 0) {
    throw new RangeError('leaseMs must be a positive finite number');
  }

  const prodBefore = lockManager.getProduct(productId);
  if (!prodBefore) {
    throw new Error(`Product ${productId} not found.`);
  }

  const initialAvailable = prodBefore.availableStock;
  const initialLocked = prodBefore.lockedStock;

  if (initialAvailable <= 0) {
    throw new Error(`Cannot simulate cart abandonment: Product ${productId} has zero available stock.`);
  }

  // Lock 1 item with ultra-short lease
  const res = await lockManager.requestLock(productId, `abandon-user-${Date.now()}`, leaseMs);
  if (!res.success && res.status !== 'LOCKED') {
    throw new Error(`Could not acquire lock: ${res.reason || res.status}`);
  }

  const lockId = res.lockId || res.lock?.lockId;
  const prodLocked = lockManager.getProduct(productId);
  const lockedCount = prodLocked.lockedStock;

  // Wait for lease to expire + trigger reaper
  await new Promise((r) => setTimeout(r, leaseMs + 40));
  lockManager.reapExpiredLocks();

  const prodAfter = lockManager.getProduct(productId);
  const restoredAvailable = prodAfter.availableStock;
  const finalLock = lockManager.getLock(lockId);

  const restoredCorrectly =
    prodAfter.availableStock === initialAvailable &&
    prodAfter.lockedStock === initialLocked;

  const leaksDetected = !restoredCorrectly || finalLock?.status !== 'EXPIRED';

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
    const valid = [p.availableStock, p.lockedStock, p.soldStock, p.totalStock].every(
      (v) => Number.isSafeInteger(v) && v >= 0
    );
    if (!valid) {
      errors.push(
        `Invalid stock values for ${p.id}: available=${p.availableStock}, locked=${p.lockedStock}, sold=${p.soldStock}, total=${p.totalStock}`
      );
      return;
    }

    const sum = p.availableStock + p.lockedStock + p.soldStock;
    if (sum !== p.totalStock) {
      errors.push(
        `Conservation failed for ${p.id}: available (${p.availableStock}) + locked (${p.lockedStock}) + sold (${p.soldStock}) = ${sum} !== total (${p.totalStock})`
      );
    }
  });

  return {
    valid: errors.length === 0,
    errors
  };
}
