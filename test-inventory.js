/**
 * Automated Verification Test Suite for Optimistic Inventory Lock FSM & Concurrency Engine
 * Lab 02 - HW 3: Vietnam Mega-Sale Flash Deal Engine
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { OptimisticInventoryLockManager } from './inventory-state-machine.js';
import {
  simulateFlashCrowdBurst,
  simulateCartAbandonmentAndRecovery,
  verifyStorewideConservation
} from './concurrency-simulator.js';

const SAMPLE_PRODUCTS = [
  { id: 'prod-single', title: 'Flash Deal 1K - AirPods Pro', originalPrice: 6000000, flashPrice: 1000, discountPercent: 99, totalStock: 1 },
  { id: 'prod-iphone', title: 'iPhone 16 Pro Max', originalPrice: 35000000, flashPrice: 11111111, discountPercent: 68, totalStock: 3 },
  { id: 'prod-sony', title: 'Sony WH-1000XM5', originalPrice: 8000000, flashPrice: 2990000, discountPercent: 63, totalStock: 5 },
  { id: 'prod-mac', title: 'MacBook Air M3', originalPrice: 33000000, flashPrice: 19990000, discountPercent: 39, totalStock: 2 }
];

test('Scenario 1: 100 concurrent users burst for single item (stock=1) -> exactly 1 lock granted', async () => {
  const manager = new OptimisticInventoryLockManager(SAMPLE_PRODUCTS);

  const burst = await simulateFlashCrowdBurst(manager, 'prod-single', 100, 15);

  assert.equal(burst.totalAttempts, 100);
  assert.equal(burst.acquiredCount, 1, 'Strict mutual exclusion failed: more than 1 lock granted for stock 1');
  assert.equal(burst.rejectedCount, 99);
  assert.equal(burst.oversold, false, 'Oversell detected on single-stock flash deal');
  assert.equal(burst.conservationValid, true);

  const prod = manager.getProduct('prod-single');
  assert.equal(prod.availableStock, 0);
  assert.equal(prod.lockedStock, 1);
  assert.equal(prod.soldStock, 0);

  manager.destroy();
});

test('Scenario 2: 100 concurrent users burst for product with stock=3 -> exactly 3 locks granted', async () => {
  const manager = new OptimisticInventoryLockManager(SAMPLE_PRODUCTS);

  const burst = await simulateFlashCrowdBurst(manager, 'prod-iphone', 100, 15);

  assert.equal(burst.totalAttempts, 100);
  assert.equal(burst.acquiredCount, 3, 'Oversell detected: more than 3 locks granted for stock 3');
  assert.equal(burst.rejectedCount, 97);
  assert.equal(burst.oversold, false);
  assert.equal(burst.conservationValid, true);

  const prod = manager.getProduct('prod-iphone');
  assert.equal(prod.availableStock, 0);
  assert.equal(prod.lockedStock, 3);
  assert.equal(prod.soldStock, 0);

  manager.destroy();
});

test('Scenario 3: Storewide inventory conservation remains strictly valid after heavy concurrent burst', async () => {
  const manager = new OptimisticInventoryLockManager(SAMPLE_PRODUCTS);

  // Burst on multiple products simultaneously
  await Promise.all([
    simulateFlashCrowdBurst(manager, 'prod-single', 50, 10),
    simulateFlashCrowdBurst(manager, 'prod-sony', 60, 10),
    simulateFlashCrowdBurst(manager, 'prod-mac', 40, 10)
  ]);

  const report = verifyStorewideConservation(manager);
  assert.equal(report.valid, true, `Storewide conservation violated: ${report.errors.join(', ')}`);
  assert.equal(report.errors.length, 0);

  manager.destroy();
});

test('Scenario 4: Expired lock returned to stock exactly once without inventory leakage', async () => {
  const manager = new OptimisticInventoryLockManager(SAMPLE_PRODUCTS);

  // Pre-lock 1 unit of prod-sony to ensure test is robust against pre-existing locks
  const preLock = await manager.requestLock('prod-sony', 'pre-existing-user', 60000);
  assert.equal(preLock.status, 'LOCKED');

  const sonyBefore = manager.getProduct('prod-sony');
  assert.equal(sonyBefore.availableStock, 4);
  assert.equal(sonyBefore.lockedStock, 1);

  // Simulate short 40ms abandonment
  const sim = await simulateCartAbandonmentAndRecovery(manager, 'prod-sony', 40);

  assert.equal(sim.initialAvailable, 4);
  assert.equal(sim.restoredAvailable, 4);
  assert.equal(sim.leaksDetected, false, 'Zombie lock leaked inventory or failed exact recovery');

  // Verify pre-existing lock is still intact and lockedStock returns to 1
  const sonyAfter = manager.getProduct('prod-sony');
  assert.equal(sonyAfter.availableStock, 4);
  assert.equal(sonyAfter.lockedStock, 1);
  assert.equal(sonyAfter.soldStock, 0);

  manager.destroy();
});

test('Scenario 5: Releasing same lock twice does not increment stock twice (idempotency guard)', async () => {
  const manager = new OptimisticInventoryLockManager(SAMPLE_PRODUCTS);

  const lockRes = await manager.requestLock('prod-sony', 'user-double-release', 20000);
  assert.equal(lockRes.status, 'LOCKED');
  assert.equal(manager.getProduct('prod-sony').availableStock, 4);

  // First release: succeeds
  const firstRelease = manager.releaseLock(lockRes.lockId);
  assert.equal(firstRelease, true);
  assert.equal(manager.getProduct('prod-sony').availableStock, 5);

  // Second release: must fail safely and not increment stock
  const secondRelease = manager.releaseLock(lockRes.lockId);
  assert.equal(secondRelease, false, 'Second release unexpectedly succeeded!');
  assert.equal(manager.getProduct('prod-sony').availableStock, 5, 'Stock erroneously incremented on duplicate release!');

  manager.destroy();
});

test('Scenario 6: Checking out same lock twice does not sell twice (double-spend guard)', async () => {
  const manager = new OptimisticInventoryLockManager(SAMPLE_PRODUCTS);

  const lockRes = await manager.requestLock('prod-mac', 'user-double-checkout', 20000);
  assert.equal(lockRes.status, 'LOCKED');

  // First checkout: succeeds
  const firstCheckout = await manager.confirmCheckout(lockRes.lockId);
  assert.equal(firstCheckout.success, true);
  assert.ok(firstCheckout.orderId);

  const prodMid = manager.getProduct('prod-mac');
  assert.equal(prodMid.soldStock, 1);
  assert.equal(prodMid.lockedStock, 0);

  // Second checkout: must be rejected with invalid state
  const secondCheckout = await manager.confirmCheckout(lockRes.lockId);
  assert.equal(secondCheckout.success, false);
  assert.equal(secondCheckout.reason, 'INVALID_STATE_PURCHASED');

  const prodFinal = manager.getProduct('prod-mac');
  assert.equal(prodFinal.soldStock, 1, 'Double spend occurred: soldStock incremented twice!');
  assert.equal(prodFinal.lockedStock, 0);

  manager.destroy();
});

test('Scenario 7: Non-existent product ID returns clear rejection / error', async () => {
  const manager = new OptimisticInventoryLockManager(SAMPLE_PRODUCTS);

  const badLock = await manager.requestLock('prod-ghost-nonexistent', 'user-test');
  assert.equal(badLock.success, false);
  assert.equal(badLock.status, 'PRODUCT_NOT_FOUND');
  assert.equal(badLock.reason, 'PRODUCT_NOT_FOUND');

  await assert.rejects(
    async () => simulateFlashCrowdBurst(manager, 'prod-ghost-nonexistent', 10),
    /Product prod-ghost-nonexistent not found/
  );

  await assert.rejects(
    async () => simulateCartAbandonmentAndRecovery(manager, 'prod-ghost-nonexistent', 50),
    /Product prod-ghost-nonexistent not found/
  );

  manager.destroy();
});

test('Scenario 8: Simulator rejects invalid userCount or maxJitterMs with RangeError', async () => {
  const manager = new OptimisticInventoryLockManager(SAMPLE_PRODUCTS);

  await assert.rejects(
    async () => simulateFlashCrowdBurst(manager, 'prod-sony', 0),
    RangeError
  );

  await assert.rejects(
    async () => simulateFlashCrowdBurst(manager, 'prod-sony', -5),
    RangeError
  );

  await assert.rejects(
    async () => simulateFlashCrowdBurst(manager, 'prod-sony', 2.5),
    RangeError
  );

  await assert.rejects(
    async () => simulateFlashCrowdBurst(manager, 'prod-sony', 10, -1),
    RangeError
  );

  await assert.rejects(
    async () => simulateCartAbandonmentAndRecovery(manager, 'prod-sony', 0),
    RangeError
  );

  await assert.rejects(
    async () => simulateCartAbandonmentAndRecovery(manager, 'prod-sony', -50),
    RangeError
  );

  manager.destroy();
});

test('Scenario 9: Regular checkout flow transitions locked stock to sold stock', async () => {
  const manager = new OptimisticInventoryLockManager(SAMPLE_PRODUCTS);

  const lockRes = await manager.requestLock('prod-sony', 'regular-buyer', 15000);
  assert.equal(lockRes.success, true);
  assert.equal(lockRes.status, 'LOCKED');

  const checkoutRes = await manager.confirmCheckout(lockRes.lockId);
  assert.equal(checkoutRes.success, true);
  assert.ok(checkoutRes.orderId.startsWith('VN1111-'));

  const finalSony = manager.getProduct('prod-sony');
  assert.equal(finalSony.availableStock, 4);
  assert.equal(finalSony.lockedStock, 0);
  assert.equal(finalSony.soldStock, 1);

  const lockRecord = manager.getLock(lockRes.lockId);
  assert.equal(lockRecord.status, 'PURCHASED');

  manager.destroy();
});

test('Scenario 10: resetInventory restores all products to baseline and invalidates prior locks', async () => {
  const manager = new OptimisticInventoryLockManager(SAMPLE_PRODUCTS);

  // Lock and checkout some items
  const lock1 = await manager.requestLock('prod-single', 'buyer-1', 10000);
  assert.equal(lock1.status, 'LOCKED');

  const lock2 = await manager.requestLock('prod-iphone', 'buyer-2', 10000);
  assert.equal(lock2.status, 'LOCKED');
  await manager.confirmCheckout(lock2.lockId);

  // Stock before reset
  assert.equal(manager.getProduct('prod-single').availableStock, 0);
  assert.equal(manager.getProduct('prod-iphone').soldStock, 1);

  // Trigger resetInventory
  let resetNotified = false;
  manager.subscribe((evt) => {
    if (evt.type === 'INVENTORY_RESET') resetNotified = true;
  });

  manager.resetInventory(SAMPLE_PRODUCTS);

  assert.equal(resetNotified, true);
  assert.equal(manager.getProduct('prod-single').availableStock, 1);
  assert.equal(manager.getProduct('prod-single').lockedStock, 0);
  assert.equal(manager.getProduct('prod-single').soldStock, 0);

  assert.equal(manager.getProduct('prod-iphone').availableStock, 3);
  assert.equal(manager.getProduct('prod-iphone').lockedStock, 0);
  assert.equal(manager.getProduct('prod-iphone').soldStock, 0);

  const report = verifyStorewideConservation(manager);
  assert.equal(report.valid, true);

  manager.destroy();
});

