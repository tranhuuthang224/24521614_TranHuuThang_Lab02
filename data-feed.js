/**
 * Resilient State Machine & Skeleton Loader Component
 * Lab 02 - Exercise 3: Resilient State Machine & Skeleton Loader
 * 
 * Finite State Machine: 'IDLE' | 'LOADING' | 'SUCCESS' | 'ERROR'
 * Constraints: Zero div-soup, race condition immunity, pulsing skeleton feedback, retry mechanism.
 */

import { createElement } from './mini-react.js';
import { useState } from './reactive-engine.js';

/**
 * Finite State Machine Type Definitions
 * @template T
 * @typedef {
 *   | { status: 'IDLE' }
 *   | { status: 'LOADING' }
 *   | { status: 'SUCCESS'; data: T }
 *   | { status: 'ERROR'; error: string }
 * } ViewState
 */

/**
 * Default sample feed data
 */
export const SAMPLE_FEED_ITEMS = [
  {
    id: 'feed-1',
    title: 'Modern React Architecture: Virtual DOM Internals',
    category: 'Architecture',
    summary: 'Deconstructing the O(n) heuristic diffing algorithm and linear closure memory.',
    timestamp: '2 mins ago'
  },
  {
    id: 'feed-2',
    title: 'AST Compilation Pipelines: Babel vs SWC vs ESBuild',
    category: 'Compilers',
    summary: 'How token streams are parsed into syntax trees and transformed into executable JS.',
    timestamp: '15 mins ago'
  },
  {
    id: 'feed-3',
    title: 'Root Event Delegation vs 10,000 Listeners',
    category: 'Performance',
    summary: 'Solving memory churn and event listener fragmentation using DOM bubbling.',
    timestamp: '1 hour ago'
  }
];

/**
 * Mock async network fetcher with simulated latency and error injection.
 * @param {Object} [config]
 * @param {boolean} [config.shouldFail=false] - Injects artificial network failure
 * @param {number} [config.delay=800] - Simulated network latency in ms
 * @returns {Promise<typeof SAMPLE_FEED_ITEMS>}
 */
export function fetchFeed({ shouldFail = false, delay = 800 } = {}) {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      if (shouldFail) {
        reject(new Error('NetworkTimeoutException: Unable to establish connection to upstream feed server (504 Gateway Timeout).'));
      } else {
        resolve(SAMPLE_FEED_ITEMS);
      }
    }, delay);
  });
}

// Module-scoped request sequence tracker to eliminate race conditions
let activeRequestId = 0;

/**
 * Configuration hook for toggling error simulation in UI
 */
let forceErrorNextRequest = false;
export function setForceError(val) {
  forceErrorNextRequest = Boolean(val);
}
export function getForceError() {
  return forceErrorNextRequest;
}

/**
 * Resilient DataFeed Component (Slide 26)
 * Strictly conforms to 4-state Finite State Machine.
 */
export function DataFeed() {
  // FSM State: Strictly typed union
  const [state, setState] = useState({ status: 'IDLE' });

  // Verified Component State Transition with Race Condition Guard
  const loadData = async (forceFail = null) => {
    // Increment request ID to invalidate stale responses (Race Condition Elimination)
    const currentRequestId = ++activeRequestId;

    // Transition: -> 'LOADING'
    setState({ status: 'LOADING' });

    const shouldFail = forceFail !== null ? forceFail : forceErrorNextRequest;

    try {
      const items = await fetchFeed({ shouldFail, delay: 600 });
      // Invariant: Only update state if this is still the freshest active request
      if (currentRequestId === activeRequestId) {
        setState({ status: 'SUCCESS', data: items });
      }
    } catch (err) {
      if (currentRequestId === activeRequestId) {
        setState({ status: 'ERROR', error: err.message || 'Unknown network failure occurred' });
      }
    }
  };

  // Render Strategy based on FSM Status: Zero Div-Soup
  return createElement(
    'main',
    { className: 'datafeed-container', role: 'main', id: 'data-feed' },

    // Top Header & Control Toolbar
    createElement(
      'header',
      { className: 'feed-header' },
      createElement('h2', null, 'Engineering Knowledge Feed'),
      createElement(
        'p',
        { className: 'fsm-badge' },
        `Current FSM Status: ${state.status}`
      ),
      createElement(
        'nav',
        { className: 'feed-toolbar', 'aria-label': 'Feed operations' },
        createElement(
          'button',
          {
            className: 'action-btn primary-btn',
            disabled: state.status === 'LOADING',
            onClick: () => {
              forceErrorNextRequest = false;
              loadData(false);
            }
          },
          state.status === 'LOADING' ? 'Fetching Data...' : 'Fetch Feed (Success)'
        ),
        createElement(
          'button',
          {
            className: 'action-btn danger-btn',
            disabled: state.status === 'LOADING',
            onClick: () => {
              forceErrorNextRequest = true;
              loadData(true);
            }
          },
          'Simulate Network Error'
        )
      )
    ),

    // Content Display Area (Switches based on 4-state lifecycle)
    createElement(
      'section',
      { className: 'feed-content', 'aria-live': 'polite' },

      // 1. STATE: 'IDLE'
      state.status === 'IDLE' &&
        createElement(
          'article',
          { className: 'idle-card' },
          createElement('h3', null, 'System Ready'),
          createElement(
            'p',
            null,
            'No active network request initiated. Click "Fetch Feed" to trigger asynchronous data ingestion.'
          )
        ),

      // 2. STATE: 'LOADING' -> Animated Pulsing CSS Placeholder Skeleton
      state.status === 'LOADING' &&
        createElement(
          'section',
          { className: 'skeleton-wrapper', 'aria-busy': 'true', 'aria-label': 'Loading content' },
          createElement(
            'article',
            { className: 'skeleton-card pulse-anim' },
            createElement('header', { className: 'skeleton-line skeleton-title' }),
            createElement('p', { className: 'skeleton-line skeleton-meta' }),
            createElement('p', { className: 'skeleton-line skeleton-body' })
          ),
          createElement(
            'article',
            { className: 'skeleton-card pulse-anim' },
            createElement('header', { className: 'skeleton-line skeleton-title' }),
            createElement('p', { className: 'skeleton-line skeleton-meta' }),
            createElement('p', { className: 'skeleton-line skeleton-body' })
          ),
          createElement(
            'article',
            { className: 'skeleton-card pulse-anim' },
            createElement('header', { className: 'skeleton-line skeleton-title' }),
            createElement('p', { className: 'skeleton-line skeleton-meta' }),
            createElement('p', { className: 'skeleton-line skeleton-body' })
          )
        ),

      // 3. STATE: 'SUCCESS' -> Render Real Fetched Items
      state.status === 'SUCCESS' &&
        createElement(
          'ul',
          { className: 'feed-list' },
          ...state.data.map((item) =>
            createElement(
              'li',
              { key: item.id, className: 'feed-item-card' },
              createElement(
                'header',
                { className: 'feed-item-header' },
                createElement('h3', null, item.title),
                createElement('span', { className: 'category-badge' }, item.category)
              ),
              createElement('p', { className: 'feed-item-summary' }, item.summary),
              createElement('footer', { className: 'feed-item-time' }, item.timestamp)
            )
          )
        ),

      // 4. STATE: 'ERROR' -> Human-readable Error with 'Retry Connection' Button
      state.status === 'ERROR' &&
        createElement(
          'section',
          { className: 'error-boundary-card', role: 'alert' },
          createElement('h3', null, 'Connection Failure Detected'),
          createElement('p', { className: 'error-detail' }, state.error),
          createElement(
            'button',
            {
              id: 'retry-connection-btn',
              className: 'retry-btn',
              onClick: () => {
                forceErrorNextRequest = false;
                loadData(false);
              }
            },
            'Retry Connection'
          )
        )
    )
  );
}
