/**
 * Reactive State Engine & Root Event Delegation Hub
 * Lab 02 - Exercise 2: Reactive State Machine & Delegation Hub
 * 
 * @module reactive-engine
 */

import { createElement, createTextElement, renderToDOM, isVNode } from './mini-react.js';

// Re-export Core Virtual DOM APIs
export { createElement, createTextElement, renderToDOM, isVNode };

/**
 * Framework Internal State Memory Structure (Slide 17 & 18)
 * Linear array storing state values across render cycles
 */
let stateStore = [];
let cursor = 0;
let triggerRender = () => {};

/**
 * Register root reconciliation / re-render callback.
 * Invoked by state setters when state mutations occur.
 * 
 * @param {Function} rerenderFn - Root render function
 */
export function setRenderer(rerenderFn) {
  if (typeof rerenderFn !== 'function') {
    throw new TypeError('[setRenderer] Expected a function');
  }
  triggerRender = rerenderFn;
}

/**
 * Reset state cursor to 0 before each component execution pass.
 * Enforces the Mathematical Call-Order Invariant (Slide 19).
 */
export function resetCursor() {
  cursor = 0;
}

/**
 * Get internal state store snapshot (for testing and debugging).
 * @returns {any[]}
 */
export function getStateSnapshot() {
  return [...stateStore];
}

/**
 * Reset entire state engine (useful for test isolation).
 */
export function clearStateStore() {
  stateStore = [];
  cursor = 0;
  triggerRender = () => {};
}
