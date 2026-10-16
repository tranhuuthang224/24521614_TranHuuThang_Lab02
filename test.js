/**
 * Node.js Headless Verification Test Suite
 * Runs via: npm test
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createElement,
  createTextElement,
  renderToDOM,
  isVNode,
  isTextVNode,
  isElementVNode
} from './mini-react.js';

// Setup Mock DOM Environment for Node.js testing
class MockNode {
  constructor(nodeType, nodeValue = '') {
    this.nodeType = nodeType;
    this.nodeValue = nodeValue;
    this.childNodes = [];
    this.parentElement = null;
  }
  appendChild(child) {
    child.parentElement = this;
    this.childNodes.push(child);
    return child;
  }
  replaceChildren(...newChildren) {
    this.childNodes = [];
    newChildren.forEach((child) => this.appendChild(child));
  }
  get textContent() {
    if (this.nodeType === 3) return this.nodeValue;
    return this.childNodes.map((c) => c.textContent).join('');
  }
  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }
  querySelectorAll(selector) {
    const results = [];
    const traverse = (node) => {
      for (const child of node.childNodes) {
        if (child instanceof MockElement) {
          if (selector === child.tagName.toLowerCase()) {
            results.push(child);
          } else if (selector.startsWith('.') && child.className.includes(selector.slice(1))) {
            results.push(child);
          } else if (selector.startsWith('#') && child.id === selector.slice(1)) {
            results.push(child);
          }
          traverse(child);
        }
      }
    };
    traverse(this);
    return results;
  }
}

class MockElement extends MockNode {
  constructor(tagName) {
    super(1);
    this.tagName = tagName.toUpperCase();
    this.attributes = {};
    this.listeners = {};
    this.style = {};
    this.className = '';
    this.id = '';
  }
  setAttribute(key, val) {
    this.attributes[key] = String(val);
    if (key === 'class') this.className = String(val);
    if (key === 'id') this.id = String(val);
  }
  getAttribute(key) {
    return this.attributes[key] ?? null;
  }
  removeAttribute(key) {
    delete this.attributes[key];
  }
  addEventListener(event, fn) {
    this.listeners[event] = fn;
  }
}

globalThis.document = {
  createElement(tag) {
    return new MockElement(tag);
  },
  createElementNS(ns, tag) {
    const el = new MockElement(tag);
    el.namespaceURI = ns;
    return el;
  },
  createTextNode(text) {
    return new MockNode(3, String(text));
  },
  getElementById(id) {
    return rootMount;
  }
};

const rootMount = new MockElement('div');
rootMount.id = 'app';

test('Task 1.1 - 1.3: createElement & createTextElement contract', () => {
  const textVNode = createTextElement('Safe Payload');
  assert.equal(textVNode.type, 'TEXT_ELEMENT');
  assert.equal(textVNode.props.nodeValue, 'Safe Payload');
  assert.deepEqual(textVNode.props.children, []);

  // Variadic children, nested arrays, and boolean filtering
  const vNode = createElement(
    'section',
    { id: 'container', className: 'box' },
    'Raw String',
    false,
    null,
    undefined,
    [createElement('button', null, 'Submit')]
  );

  assert.equal(vNode.type, 'section');
  assert.equal(vNode.props.id, 'container');
  assert.equal(vNode.props.className, 'box');
  assert.equal(vNode.props.children.length, 2);
  assert.equal(vNode.props.children[0].type, 'TEXT_ELEMENT');
  assert.equal(vNode.props.children[0].props.nodeValue, 'Raw String');
  assert.equal(vNode.props.children[1].type, 'button');
});

test('Typeguard Verification', () => {
  const vNode = createElement('main', null, 'Content');
  assert.equal(isVNode(vNode), true);
  assert.equal(isVNode(null), false);
  assert.equal(isVNode('hello'), false);
  assert.equal(isVNode({}), false);
  assert.equal(isTextVNode(createTextElement('text')), true);
  assert.equal(isTextVNode(vNode), false);
  assert.equal(isElementVNode(vNode), true);
});

test('Task 1.4: renderToDOM checkpoint verification suite', () => {
  let pingCount = 0;
  const vApp = createElement(
    'main',
    { id: 'root-view', role: 'main' },
    createElement(
      'header',
      { className: 'hero' },
      createElement('h1', null, 'Mini React Engine'),
      createElement('p', null, '<img onerror=alert(1)> Safe Text')
    ),
    createElement('button', { onClick: () => { pingCount++; } }, 'Click')
  );

  const domNode = renderToDOM(vApp);
  rootMount.replaceChildren(domNode);

  // Assert button mounted
  const button = rootMount.querySelector('button');
  assert.notEqual(button, null, 'Mount Failed: button not found');
  assert.equal(button.textContent, 'Click');

  // Trigger event listener
  button.listeners['click']();
  assert.equal(pingCount, 1, 'Event listener was not triggered');

  // Verify Semantic Constraint (Zero div-soup)
  const divs = rootMount.querySelectorAll('div');
  assert.equal(divs.length, 0, 'Zero div-soup violated: found div element');
  assert.equal(domNode.tagName, 'MAIN');
  assert.equal(domNode.getAttribute('role'), 'main');
  assert.equal(domNode.id, 'root-view');

  // Verify Security Checkpoint (XSS resistance)
  const imgTags = rootMount.querySelectorAll('img');
  const scriptTags = rootMount.querySelectorAll('script');
  assert.equal(imgTags.length, 0, 'XSS Flaw: <img> element was created');
  assert.equal(scriptTags.length, 0, 'XSS Flaw: <script> element was created');

  const p = rootMount.querySelector('p');
  assert.equal(p.textContent, '<img onerror=alert(1)> Safe Text');

  // Verify __vnode attachment
  assert.equal(domNode.__vnode, vApp);
});

test('renderToDOM throws TypeError on invalid VNode', () => {
  assert.throws(() => renderToDOM(null), TypeError);
  assert.throws(() => renderToDOM({}), TypeError);
  assert.throws(() => renderToDOM('string'), TypeError);
});
