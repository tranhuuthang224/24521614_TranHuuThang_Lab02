/**
 * Automated Verification Test Suite for Optimistic Inventory Lock FSM
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
  { id: 'prod-iphone', title: 'iPhone 16 Pro Max', originalPrice: 35000000, flashPrice: 11111111, discountPercent: 68, totalStock: 3 },
  { id: 'prod-sony', title: 'Sony WH-1000XM5', originalPrice: 8000000, flashPrice: 2990000, discountPercent: 63, totalStock: 5 },
  { id: 'prod-mac', title: 'MacBook Air M3', originalPrice: 33000000, flashPrice: 19990000, discountPercent: 39, totalStock: 2 }
];

test('Task 3.2: Optimistic Lock acquisition & inventory conservation', async () => {
  const manager = new OptimisticInventoryLockManager(SAMPLE_PRODUCTS);

  const initialIphone = manager.getProduct('prod-iphone');
  assert.equal(initialIphone.availableStock, 3);
  assert.equal(initialIphone.lockedStock, 0);
  assert.equal(initialIphone.soldStock, 0);

  // User 1 requests lock
  const res1 = await manager.requestLock('prod-iphone', 'user-1', 10000);
  assert.equal(res1.success, true);
  assert.notEqual(res1.lock, undefined);
  assert.equal(res1.lock.status, 'LOCKED');

  const afterLock1 = manager.getProduct('prod-iphone');
  assert.equal(afterLock1.availableStock, 2);
  assert.equal(afterLock1.lockedStock, 1);
  assert.equal(afterLock1.soldStock, 0);

  // Conservation law invariant check
  const check = verifyStorewideConservation(manager);
  assert.equal(check.valid, true);

  manager.destroy();
});

test('Task 3.2: High-concurrency Flash Crowd Burst eliminates Overselling (Race Condition Guard)', async () => {
  const manager = new OptimisticInventoryLockManager(SAMPLE_PRODUCTS);

  // MacBook Air has totalStock = 2. Simulate 50 concurrent bots attempting to buy it simultaneously!
  const burst = await simulateFlashCrowdBurst(manager, 'prod-mac', 50, 10);

  assert.equal(burst.totalAttempts, 50);
  assert.equal(burst.acquiredCount, 2, 'Oversell detected: More locks were granted than totalStock!');
  assert.equal(burst.rejectedCount, 48, 'Rejection count incorrect');
  assert.equal(burst.oversold, false, 'Overselling flag triggered!');
  assert.equal(burst.conservationValid, true, 'Conservation violated!');

  const finalMac = manager.getProduct('prod-mac');
  assert.equal(finalMac.availableStock, 0);
  assert.equal(finalMac.lockedStock, 2);
  assert.equal(finalMac.soldStock, 0);

  manager.destroy();
});

test('Task 3.2: Checkout confirmation transitions locked stock to sold stock', async () => {
  const manager = new OptimisticInventoryLockManager(SAMPLE_PRODUCTS);

  const lockRes = await manager.requestLock('prod-sony', 'user-buyer', 15000);
  assert.equal(lockRes.success, true);

  const checkoutRes = await manager.confirmCheckout(lockRes.lock.lockId);
  assert.equal(checkoutRes.success, true);
  assert.ok(checkoutRes.orderId.startsWith('VN1111-'));

  const finalSony = manager.getProduct('prod-sony');
  assert.equal(finalSony.availableStock, 4); // 5 - 1
  assert.equal(finalSony.lockedStock, 0);
  assert.equal(finalSony.soldStock, 1);

  // Lock status is now PURCHASED
  const lockRecord = manager.getLock(lockRes.lock.lockId);
  assert.equal(lockRecord.status, 'PURCHASED');

  manager.destroy();
});

test('Task 3.2: TTL Lease Expiry recovers abandoned stock (Anti-Zombie Lock)', async () => {
  const manager = new OptimisticInventoryLockManager(SAMPLE_PRODUCTS);

  // Short 40ms lease simulation
  const sim = await simulateCartAbandonmentAndRecovery(manager, 'prod-iphone', 40);

  assert.equal(sim.initialAvailable, 3);
  assert.equal(sim.lockedCount, 1);
  assert.equal(sim.restoredAvailable, 3, 'Expired lock was not returned to available pool!');
  assert.equal(sim.leaksDetected, false, 'Zombie lock leaked inventory!');

  manager.destroy();
});

test('Task 3.2: Manual user cancellation returns stock immediately', async () => {
  const manager = new OptimisticInventoryLockManager(SAMPLE_PRODUCTS);

  const lockRes = await manager.requestLock('prod-iphone', 'user-cancel', 20000);
  assert.equal(lockRes.success, true);

  assert.equal(manager.getProduct('prod-iphone').availableStock, 2);

  // User manually clicks cancel
  const releaseOk = manager.releaseLock(lockRes.lock.lockId);
  assert.equal(releaseOk, true);

  // Stock is immediately restored
  const finalIphone = manager.getProduct('prod-iphone');
  assert.equal(finalIphone.availableStock, 3);
  assert.equal(finalIphone.lockedStock, 0);

  manager.destroy();
});
