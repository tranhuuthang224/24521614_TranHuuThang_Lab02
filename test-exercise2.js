import test from 'node:test';
import assert from 'node:assert/strict';
import {
  resetCursor,
  setRenderer,
  getStateSnapshot,
  clearStateStore
} from './reactive-engine.js';

test('Task 2.1: stateStore and resetCursor engine initialization', () => {
  clearStateStore();
  assert.deepEqual(getStateSnapshot(), []);

  let renderCount = 0;
  setRenderer(() => { renderCount++; });

  resetCursor();
  assert.equal(typeof resetCursor, 'function');
  assert.equal(typeof setRenderer, 'function');
});
