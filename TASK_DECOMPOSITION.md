# Work Breakdown Structure (WBS) - HW 3: Vietnam Mega-Sale Flash Deal & Optimistic Inventory Lock Engine

- [x] Task 3.1: Precision Anti-Drift Countdown Timer using `Date.now()` delta vs `setInterval`
- [x] Task 3.2: Optimistic Inventory Lock Finite State Machine (`AVAILABLE`, `LOCKING`, `LOCKED`, `CHECKING_OUT`, `PURCHASED`, `EXPIRED`, `OUT_OF_STOCK`)
- [x] Task 3.3: Vietnam 11.11 Flash Sale Catalog & Pricing in VND (₫) with limited flash stock
- [x] Task 3.4: TTL Reservation Lease countdown timer with automatic background lock reaper
- [x] Task 3.5: Mathematical Inventory Conservation Invariant: `available + locked + sold === totalStock`
- [x] Task 3.6: High-Concurrency Bot Burst Simulator testing 50-100 simultaneous lock requests (Zero Oversell)
- [x] Task 3.7: High-Performance UI with Zero Div-Soup (100% semantic HTML5 elements)
- [x] Task 3.8: Automated Headless Test Suite (`node --test test-timer.js test-inventory.js`)
- [x] Task 3.9: Comprehensive AI Failure Mode Audit (`AI_FAILURE_AUDIT.md`) documenting 4 critical AI flaws
- [x] Task 3.10: Atomic Commits adhering to Conventional Commits specification (>= 8 discrete commits)

* INVARIANTS VERIFIED:
1. Anti-Drift Precision: Cumulative timer drift $\equiv 0.00\text{ms}$.
2. Zero Oversell: Mutual exclusion under 50+ concurrent requests on finite stock.
3. Anti-Zombie Locks: TTL expiry auto-returns abandoned reservations to available pool.
4. Zero Div-Soup: Exactly 0 `<div>` elements in component tree.
