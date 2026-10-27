/**
 * Optimistic Inventory Lock Finite State Machine (FSM)
 * Simulates high-concurrency e-commerce flash sales (Shopee / Lazada 11.11 Midnight Sale).
 * 
 * Prevents:
 * 1. Overselling & Double-Spend via Atomic Check-and-Lock
 * 2. Zombie Reservations via TTL Lease Auto-Expiry
 * 3. Phantom Stock via Strict Mathematical Conservation: (available + locked + sold === total)
 * 
 * Lab 02 - HW 3: Vietnam Mega-Sale Flash Deal Engine
 */

/**
 * @typedef {'AVAILABLE' | 'LOCKING' | 'LOCKED' | 'CHECKING_OUT' | 'PURCHASED' | 'EXPIRED' | 'RELEASED' | 'OUT_OF_STOCK'} LockStatus
 */

/**
 * @typedef {Object} LockRecord
 * @property {string} lockId - Unique reservation token
 * @property {string} productId - Product identifier
 * @property {string} userId - User identifier
 * @property {number} quantity - Number of units locked
 * @property {number} lockedAt - Timestamp when lock was acquired
 * @property {number} expiresAt - Absolute timestamp when lock lease expires
 * @property {LockStatus} status - Current state
 * @property {number} [orderId] - Order ID if checked out
 */

/**
 * @typedef {Object} ProductInventory
 * @property {string} id - Product ID
 * @property {string} title - Product name
 * @property {number} originalPrice - Regular price in VND
 * @property {number} flashPrice - 11.11 Deal price in VND
 * @property {number} discountPercent - Discount percentage
 * @property {number} totalStock - Total stock allocated for flash sale
 * @property {number} availableStock - Units currently available for locking
 * @property {number} lockedStock - Units currently reserved under active TTL lease
 * @property {number} soldStock - Units successfully checked out and purchased
 * @property {string} image - Product icon / visual
 */

export class OptimisticInventoryLockManager {
  /**
   * @param {ProductInventory[]} initialProducts
   */
  constructor(initialProducts = []) {
    /** @type {Map<string, ProductInventory>} */
    this.products = new Map();
    /** @type {Map<string, LockRecord>} */
    this.locks = new Map();
    /** @type {Set<(event: { type: string, product?: ProductInventory, lock?: LockRecord }) => void>} */
    this.subscribers = new Set();
    /** Epoch sequence counter to invalidate in-flight async checkouts across resets */
    this.epoch = 0;

    initialProducts.forEach((p) => {
      this.products.set(p.id, {
        ...p,
        availableStock: p.totalStock,
        lockedStock: 0,
        soldStock: 0
      });
    });

    // Start background lease reaper every 500ms
    this.reapTimer = setInterval(() => {
      this.reapExpiredLocks();
    }, 500);
  }

  /**
   * Get an immutable snapshot of all products
   * @returns {ProductInventory[]}
   */
  getProducts() {
    return Array.from(this.products.values()).map((p) => ({ ...p }));
  }

  /**
   * Get a specific product by ID
   * @param {string} productId
   * @returns {ProductInventory | null}
   */
  getProduct(productId) {
    const p = this.products.get(productId);
    return p ? { ...p } : null;
  }

  /**
   * Get a specific lock by ID
   * @param {string} lockId
   * @returns {LockRecord | null}
   */
  getLock(lockId) {
    const l = this.locks.get(lockId);
    return l ? { ...l } : null;
  }

  /**
   * Atomically requests an inventory reservation lease.
   * Optimistic Locking Invariant: Available stock is decremented immediately.
   * 
   * @param {string} productId
   * @param {string} userId
   * @param {number} [leaseDurationMs=30000] - Lease duration (default 30s)
   * @returns {Promise<{ success: boolean, lock?: LockRecord, reason?: string }>}
   */
  async requestLock(productId, userId, leaseDurationMs = 30000) {
    if (!Number.isFinite(leaseDurationMs) || leaseDurationMs <= 0) {
      throw new RangeError('leaseDurationMs must be a positive finite number');
    }

    const product = this.products.get(productId);
    if (!product) {
      return { success: false, status: 'PRODUCT_NOT_FOUND', reason: 'PRODUCT_NOT_FOUND' };
    }

    // Check existing active lock for this user on this product
    for (const activeLock of this.locks.values()) {
      if (activeLock.productId === productId && activeLock.userId === userId && activeLock.status === 'LOCKED') {
        if (Date.now() < activeLock.expiresAt) {
          return { success: true, status: 'LOCKED', lockId: activeLock.lockId, lock: { ...activeLock } };
        }
      }
    }

    // Atomic Stock Guard
    if (product.availableStock <= 0) {
      return { success: false, status: 'OUT_OF_STOCK', reason: 'OUT_OF_STOCK' };
    }

    // Decrement available, increment locked
    product.availableStock -= 1;
    product.lockedStock += 1;

    const now = Date.now();
    const lockId = `lock-${now}-${Math.random().toString(36).substring(2, 8)}`;

    /** @type {LockRecord} */
    const lockRecord = {
      lockId,
      productId,
      userId,
      quantity: 1,
      lockedAt: now,
      expiresAt: now + leaseDurationMs,
      status: 'LOCKED'
    };

    this.locks.set(lockId, lockRecord);
    this._assertConservation(product);
    this._notify('LOCK_ACQUIRED', product, lockRecord);

    return {
      success: true,
      status: 'LOCKED',
      lockId,
      expiresAt: lockRecord.expiresAt,
      lock: { ...lockRecord }
    };
  }

  /**
   * Confirms payment checkout and finalizes stock reduction.
   * Converts temporary locked stock into permanent sold stock.
   * 
   * @param {string} lockId
   * @returns {Promise<{ success: boolean, orderId?: string, reason?: string }>}
   */
  async confirmCheckout(lockId) {
    const lock = this.locks.get(lockId);
    if (!lock) {
      return { success: false, reason: 'LOCK_NOT_FOUND' };
    }

    const product = this.products.get(lock.productId);
    if (!product) {
      return { success: false, reason: 'PRODUCT_NOT_FOUND' };
    }

    // 1. MUST verify status FIRST: Only 'LOCKED' records can ever checkout!
    // Prevents running _releaseExpiredLock on already PURCHASED/RELEASED locks.
    if (lock.status !== 'LOCKED') {
      return { success: false, reason: `INVALID_STATE_${lock.status}` };
    }

    // 2. Lease expiry guard: Only release if record was actively 'LOCKED'
    if (Date.now() >= lock.expiresAt) {
      this._releaseExpiredLock(lock, product);
      return { success: false, reason: 'LOCK_EXPIRED' };
    }

    // Capture current epoch to detect if reset occurs during async gateway latency
    const checkoutEpoch = this.epoch;

    lock.status = 'CHECKING_OUT';
    this._notify('CHECKOUT_STARTED', product, lock);

    // Simulate transient payment network gateway latency (15ms - 50ms)
    await new Promise((r) => setTimeout(r, 20));

    // 3. Post-await verification: verify transaction was not aborted by a store reset
    if (
      this.epoch !== checkoutEpoch ||
      lock.status !== 'CHECKING_OUT' ||
      this.locks.get(lockId) !== lock ||
      !this.products.has(lock.productId)
    ) {
      return { success: false, reason: 'TRANSACTION_ABORTED_RESET' };
    }

    // Finalize purchase
    product.lockedStock -= 1;
    product.soldStock += 1;

    const orderId = `VN1111-${Date.now()}-${Math.floor(Math.random() * 9000 + 1000)}`;
    lock.status = 'PURCHASED';
    lock.orderId = orderId;

    this._assertConservation(product);
    this._notify('PURCHASE_CONFIRMED', product, lock);

    return { success: true, orderId };
  }

  /**
   * User manually releases their reserved lock.
   * Stock immediately returns to available pool.
   * 
   * @param {string} lockId
   * @returns {boolean}
   */
  releaseLock(lockId) {
    const lock = this.locks.get(lockId);
    if (!lock || lock.status !== 'LOCKED') return false;

    const product = this.products.get(lock.productId);
    if (!product) return false;

    product.lockedStock -= 1;
    product.availableStock += 1;

    lock.status = 'RELEASED';
    this._assertConservation(product);
    this._notify('LOCK_RELEASED', product, lock);

    return true;
  }

  /**
   * Background Reaper: Scans all active leases and auto-expires overdue locks.
   */
  reapExpiredLocks() {
    const now = Date.now();
    for (const lock of this.locks.values()) {
      if (lock.status === 'LOCKED' && now > lock.expiresAt) {
        const product = this.products.get(lock.productId);
        if (product) {
          this._releaseExpiredLock(lock, product);
        }
      }
    }
  }

  _releaseExpiredLock(lock, product) {
    if (lock.status !== 'LOCKED') return;
    product.lockedStock -= 1;
    product.availableStock += 1;
    lock.status = 'EXPIRED';

    this._assertConservation(product);
    this._notify('LOCK_EXPIRED', product, lock);
  }

  /**
   * Resets the entire store inventory to initial or supplied catalog state.
   * Invalidates all previous active locks, restores baseline stock,
   * validates mathematical conservation, and notifies all subscribers.
   * 
   * @param {ProductInventory[]} [initialCatalog]
   */
  resetInventory(initialCatalog) {
    const catalog = initialCatalog || Array.from(this.products.values());
    if (!Array.isArray(catalog) || catalog.length === 0) {
      throw new TypeError('initialCatalog must be a non-empty array of products');
    }

    // Validate catalog definitions BEFORE mutating any state
    for (const p of catalog) {
      if (
        !p ||
        typeof p.id !== 'string' ||
        !Number.isSafeInteger(p.totalStock) ||
        p.totalStock < 0
      ) {
        throw new TypeError(`Invalid product definition in catalog: ${JSON.stringify(p)}`);
      }
    }

    // Advance epoch to invalidate any in-flight async checkouts
    this.epoch += 1;

    // 1. Invalidate and transition all existing active locks
    for (const lock of this.locks.values()) {
      if (lock.status === 'LOCKED' || lock.status === 'CHECKING_OUT') {
        lock.status = 'RELEASED';
      }
    }
    this.locks.clear();

    // 2. Reset or re-populate product inventory baseline
    this.products.clear();
    catalog.forEach((p) => {
      const total = p.totalStock;
      const product = {
        ...p,
        totalStock: total,
        availableStock: total,
        lockedStock: 0,
        soldStock: 0
      };
      this._assertConservation(product);
      this.products.set(p.id, product);
    });

    // 3. Notify all subscribers
    this._notify('INVENTORY_RESET');
  }

  /**
   * Simulates a concurrent flash crowd burst of N users simultaneously hitting the lock button
   * Verifies mathematically that availableStock + lockedStock + soldStock === totalStock
   * 
   * @param {string} productId
   * @param {string[]} userIds
   * @returns {Promise<{ totalRequests: number, acquired: number, rejected: number }>}
   */
  async simulateConcurrentBurst(productId, userIds) {
    const promises = userIds.map((uid) => this.requestLock(productId, uid));
    const results = await Promise.all(promises);

    const acquired = results.filter((r) => r?.status === 'LOCKED' || r?.success).length;
    const rejected = results.filter((r) => r?.status !== 'LOCKED' && !r?.success).length;

    return {
      totalRequests: userIds.length,
      acquired,
      rejected
    };
  }

  /**
   * Invariant Guard: Mathematical Conservation Law
   * available + locked + sold === totalStock
   * Also ensures all stock values are non-negative safe integers.
   */
  _assertConservation(product) {
    const fields = [product.availableStock, product.lockedStock, product.soldStock, product.totalStock];
    const allValid = fields.every((v) => Number.isSafeInteger(v) && v >= 0);
    const sum = product.availableStock + product.lockedStock + product.soldStock;
    if (!allValid || sum !== product.totalStock) {
      throw new Error(
        `[INVARIANT VIOLATION] Inventory conservation failed for ${product.id}! Total: ${product.totalStock}, but sum: ${sum} (Available: ${product.availableStock}, Locked: ${product.lockedStock}, Sold: ${product.soldStock})`
      );
    }
  }

  /**
   * Subscribe to inventory & lock events
   * @param {(event: { type: string, product?: ProductInventory, lock?: LockRecord }) => void} callback
   * @returns {() => void}
   */
  subscribe(callback) {
    this.subscribers.add(callback);
    return () => this.subscribers.delete(callback);
  }

  _notify(type, product, lock) {
    const evt = {
      type,
      product: product ? { ...product } : undefined,
      lock: lock ? { ...lock } : undefined
    };
    this.subscribers.forEach((s) => {
      try {
        s(evt);
      } catch (e) {
        console.error('[InventoryLockManager] Error in subscriber:', e);
      }
    });
  }

  destroy() {
    if (this.reapTimer) {
      clearInterval(this.reapTimer);
      this.reapTimer = null;
    }
    this.subscribers.clear();
  }
}
