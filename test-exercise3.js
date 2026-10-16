import test from 'node:test';
import assert from 'node:assert/strict';
import {
  useState,
  resetCursor,
  clearStateStore,
  setRenderer
} from './reactive-engine.js';
import {
  DataFeed,
  fetchFeed,
  SAMPLE_FEED_ITEMS
} from './data-feed.js';

// Helper to check for zero div-soup in VNode tree
function hasDivElement(vNode) {
  if (!vNode || typeof vNode !== 'object') return false;
  if (vNode.type === 'div') return true;
  for (const child of vNode.props?.children || []) {
    if (hasDivElement(child)) return true;
  }
  return false;
}

test('Task 3.1: FSM Initial State is IDLE and has zero div-soup', () => {
  clearStateStore();
  resetCursor();

  const vNode = DataFeed();
  assert.equal(vNode.type, 'main');
  assert.equal(hasDivElement(vNode), false, 'Zero div-soup violated in IDLE state');

  // Verify IDLE content rendered
  const contentSection = vNode.props.children.find(
    (c) => c && c.props && c.props.className === 'feed-content'
  );
  assert.ok(contentSection, 'feed-content section not found');

  const idleCard = contentSection.props.children.find(
    (c) => c && c.props && c.props.className === 'idle-card'
  );
  assert.ok(idleCard, 'idle-card not rendered in IDLE state');
});

test('Task 3.2: FSM LOADING state renders animated pulsing skeleton without div-soup', () => {
  clearStateStore();

  // Simulate setting state to LOADING
  resetCursor();
  let [state, setState] = useState({ status: 'LOADING' });

  resetCursor();
  const vNode = DataFeed();
  assert.equal(hasDivElement(vNode), false, 'Zero div-soup violated in LOADING state');

  const contentSection = vNode.props.children.find(
    (c) => c && c.props && c.props.className === 'feed-content'
  );
  const skeletonWrapper = contentSection.props.children.find(
    (c) => c && c.props && c.props.className === 'skeleton-wrapper'
  );
  assert.ok(skeletonWrapper, 'skeleton-wrapper not rendered in LOADING state');
  assert.equal(skeletonWrapper.props['aria-busy'], 'true');

  // Verify skeleton cards have pulse-anim
  const skeletonCards = skeletonWrapper.props.children.filter(
    (c) => c && c.props && c.props.className?.includes('pulse-anim')
  );
  assert.equal(skeletonCards.length, 3, 'Expected 3 pulsing skeleton placeholder cards');
});

test('Task 3.3: FSM SUCCESS state renders fetched items without div-soup', () => {
  clearStateStore();

  // Simulate setting state to SUCCESS
  resetCursor();
  let [state, setState] = useState({
    status: 'SUCCESS',
    data: SAMPLE_FEED_ITEMS
  });

  resetCursor();
  const vNode = DataFeed();
  assert.equal(hasDivElement(vNode), false, 'Zero div-soup violated in SUCCESS state');

  const contentSection = vNode.props.children.find(
    (c) => c && c.props && c.props.className === 'feed-content'
  );
  const feedList = contentSection.props.children.find(
    (c) => c && c.props && c.props.className === 'feed-list'
  );
  assert.ok(feedList, 'feed-list not rendered in SUCCESS state');
  assert.equal(feedList.props.children.length, SAMPLE_FEED_ITEMS.length);
});

test('Task 3.4: FSM ERROR state renders error boundary with Retry Connection button', () => {
  clearStateStore();

  // Simulate setting state to ERROR
  resetCursor();
  const errorMessage = '504 Gateway Timeout';
  let [state, setState] = useState({
    status: 'ERROR',
    error: errorMessage
  });

  resetCursor();
  const vNode = DataFeed();
  assert.equal(hasDivElement(vNode), false, 'Zero div-soup violated in ERROR state');

  const contentSection = vNode.props.children.find(
    (c) => c && c.props && c.props.className === 'feed-content'
  );
  const errorBoundary = contentSection.props.children.find(
    (c) => c && c.props && c.props.className === 'error-boundary-card'
  );
  assert.ok(errorBoundary, 'error-boundary-card not rendered in ERROR state');
  assert.equal(errorBoundary.props.role, 'alert');

  // Verify Retry Connection button exists
  const retryBtn = errorBoundary.props.children.find(
    (c) => c && c.props && c.props.id === 'retry-connection-btn'
  );
  assert.ok(retryBtn, 'Retry Connection button not found in error boundary');
  assert.equal(retryBtn.props.children[0].props.nodeValue, 'Retry Connection');
  assert.equal(typeof retryBtn.props.onClick, 'function');
});

test('Task 3.5: Async Data Loading Lifecycle & State Transitions', async () => {
  clearStateStore();
  let renderPasses = [];
  setRenderer(() => {
    resetCursor();
    renderPasses.push(DataFeed());
  });

  // Test successful fetch
  const data = await fetchFeed({ shouldFail: false, delay: 10 });
  assert.equal(data.length, 3);

  // Test failure fetch throws error
  await assert.rejects(
    () => fetchFeed({ shouldFail: true, delay: 10 }),
    /NetworkTimeoutException/
  );
});
