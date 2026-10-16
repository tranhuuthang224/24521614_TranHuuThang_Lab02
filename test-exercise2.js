import test from 'node:test';
import assert from 'node:assert/strict';
import {
  useState,
  resetCursor,
  setRenderer,
  getStateSnapshot,
  clearStateStore,
  createElement,
  renderApp
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

test('Task 2.2: reactive useState dispatcher & functional updater', () => {
  clearStateStore();
  let renderCount = 0;
  setRenderer(() => { renderCount++; });

  // Simulate Component Render Pass 1
  resetCursor();
  const [count, setCount] = useState(0);
  const [text, setText] = useState('initial');

  assert.equal(count, 0);
  assert.equal(text, 'initial');
  assert.equal(renderCount, 0);

  // Update state with functional updater (Slide 28 Challenge B)
  setCount((prev) => prev + 1);
  assert.equal(renderCount, 1);

  // Simulate Component Render Pass 2
  resetCursor();
  const [countPass2, setCountPass2] = useState(0);
  const [textPass2, setTextPass2] = useState('initial');
  assert.equal(countPass2, 1);
  assert.equal(textPass2, 'initial');

  // Object.is optimization: identical value does NOT trigger re-render
  setTextPass2('initial');
  assert.equal(renderCount, 1, 'Object.is optimization failed: re-rendered on identical value');

  // Direct value setter
  setTextPass2('updated');
  assert.equal(renderCount, 2);
});

test('Task 2.3: root event delegation and zero orphan listeners on children', () => {
  clearStateStore();

  // Mock Component simulating Checkpoint 2
  let clickCount = 0;
  function TestCounter() {
    const [count, setCount] = useState(0);
    return createElement(
      'main',
      { className: 'app-container' },
      createElement('h2', null, `Count: ${count}`),
      createElement(
        'button',
        {
          onClick: () => {
            clickCount++;
            setCount((c) => c + 1);
          }
        },
        'Increment'
      )
    );
  }

  // Setup DOM mock container
  const container = {
    tagName: 'DIV',
    listeners: {},
    childNodes: [],
    addEventListener(evt, fn) {
      if (!this.listeners[evt]) this.listeners[evt] = [];
      this.listeners[evt].push(fn);
    },
    replaceChildren(...children) {
      this.childNodes = children;
      children.forEach((c) => { c.parentElement = this; });
    },
    querySelector(selector) {
      const find = (node) => {
        if (!node) return null;
        if (node.tagName && node.tagName.toLowerCase() === selector) return node;
        for (const child of node.childNodes || []) {
          const res = find(child);
          if (res) return res;
        }
        return null;
      };
      return find(this);
    }
  };

  // Mock global document if needed
  globalThis.document = globalThis.document || {
    createElement(tag) {
      return {
        tagName: tag.toUpperCase(),
        nodeType: 1,
        childNodes: [],
        parentElement: null,
        attributes: {},
        listeners: {},
        setAttribute(k, v) { this.attributes[k] = v; },
        getAttribute(k) { return this.attributes[k]; },
        addEventListener(evt, fn) {
          this.listeners[evt] = fn;
        },
        appendChild(child) {
          child.parentElement = this;
          this.childNodes.push(child);
          return child;
        }
      };
    },
    createTextNode(text) {
      return {
        nodeType: 3,
        nodeValue: String(text),
        childNodes: [],
        parentElement: null
      };
    }
  };

  // Mount via renderApp
  renderApp(TestCounter, container);

  const button = container.querySelector('button');
  assert.notEqual(button, null, 'Button not found in rendered DOM');

  // CRITICAL CHECKPOINT AUDIT:
  // Zero event listeners attached directly to button child (Event Delegation verification)
  assert.deepEqual(button.listeners, {}, 'Audit Failed: Button has direct event listeners attached!');

  // Verify root container has the delegated click listener
  assert.ok(container.listeners['click'] && container.listeners['click'].length > 0, 'Root container lacks delegated click listener');

  // Trigger simulated bubbling click event from button
  const syntheticEvent = { target: button };
  container.listeners['click'].forEach((fn) => fn(syntheticEvent));

  assert.equal(clickCount, 1, 'Event delegation failed to invoke virtual handler');

  // Verify re-render occurred and state updated
  const updatedButton = container.querySelector('button');
  assert.notEqual(updatedButton, null);
  // Still zero orphan listeners after state mutation
  assert.deepEqual(updatedButton.listeners, {}, 'Audit Failed: Orphan event listeners found after re-render!');
});
