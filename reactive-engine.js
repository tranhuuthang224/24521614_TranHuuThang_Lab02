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
 * Custom reactive useState hook.
 * Stores state in an external linear array indexed by a global cursor pointer (Slide 18).
 * 
 * @template T
 * @param {T | (() => T)} initialValue - Initial state value or lazy initializer
 * @returns {[T, (nextValue: T | ((prev: T) => T)) => void]} Tuple of current state and dispatcher
 */
export function useState(initialValue) {
  const currentCursor = cursor;

  // 1. Initialization: allocate initial state if undefined at current cursor
  if (stateStore[currentCursor] === undefined) {
    stateStore[currentCursor] = typeof initialValue === 'function'
      ? initialValue()
      : initialValue;
  }

  // 2. Dispatcher Creation: bound to currentCursor via closure
  const setState = (nextValue) => {
    // 3. Invariant Protection: support functional state updaters (Slide 28 Challenge B)
    const resolvedValue = typeof nextValue === 'function'
      ? nextValue(stateStore[currentCursor])
      : nextValue;

    // 4. Re-render Trigger: invoke reconciliation only if state changed (Object.is)
    if (!Object.is(stateStore[currentCursor], resolvedValue)) {
      stateStore[currentCursor] = resolvedValue;
      triggerRender(); // Re-execute component tree
    }
  };

  cursor++;
  return [stateStore[currentCursor], setState];
}

/**
 * Event Architecture: Root Event Delegation Hub (Slide 20).
 * Replaces thousands of individual event listeners with a single centralized listener
 * on the root container, dispatching events via DOM bubbling and __vnode inspection.
 * 
 * @param {HTMLElement} rootContainer - Root container DOM element
 */
export function setupEventDelegation(rootContainer) {
  if (!rootContainer) return;
  if (rootContainer.__delegationInitialized) return;
  rootContainer.__delegationInitialized = true;

  const supportedEvents = ['click', 'input', 'keydown', 'change', 'submit'];

  supportedEvents.forEach((eventType) => {
    rootContainer.addEventListener(eventType, (nativeEvent) => {
      let target = nativeEvent.target;
      const handlerProp = `on${eventType.charAt(0).toUpperCase() + eventType.slice(1)}`;

      // Traverse up the DOM tree from event target to rootContainer
      while (target && target !== rootContainer) {
        if (
          target.__vnode &&
          target.__vnode.props &&
          typeof target.__vnode.props[handlerProp] === 'function'
        ) {
          target.__vnode.props[handlerProp](nativeEvent);
          break;
        }
        target = target.parentElement;
      }
    });
  });
}

/**
 * Root Application Mounting & Reactive Lifecycle Manager (Slide 21 Checkpoint).
 * Coordinates cursor resets, virtual DOM rendering, and root event delegation.
 * 
 * @param {() => VNode} Component - Functional root component
 * @param {HTMLElement} rootContainer - DOM mounting node
 */
export function renderApp(Component, rootContainer) {
  if (typeof Component !== 'function') {
    throw new TypeError('[renderApp] Component must be a function');
  }
  if (!rootContainer) {
    throw new Error('[renderApp] Root container element is required');
  }

  // 1. Attach centralized event delegation hub to root container
  setupEventDelegation(rootContainer);

  // 2. Bind reconciliation renderer to useState triggers
  const rerender = () => {
    resetCursor();
    const vApp = Component();
    const dom = renderToDOM(vApp, { delegateEvents: true });
    rootContainer.replaceChildren(dom);
  };

  setRenderer(rerender);

  // 3. Perform initial mount
  rerender();
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
