/**
 * Mini-React VNode & Mounting Engine
 * Core Implementation adhering to Lab 02 Architectural Specifications
 * 
 * @module mini-react
 */

/**
 * @typedef {string | ((props: any) => VNode)} VNodeType
 * 
 * @typedef {Object} VNodeProps
 * @property {VNode[]} children
 * @property {string} [nodeValue]
 * @property {string} [className]
 * @property {string} [id]
 * @property {string} [role]
 * @property {Record<string, any>} [key]
 * 
 * @typedef {Object} VNode
 * @property {VNodeType} type
 * @property {VNodeProps} props
 */

/**
 * Strict typeguard to verify if an unknown input conforms to the VNode contract.
 * @param {any} node
 * @returns {boolean}
 */
export function isVNode(node) {
  return (
    typeof node === 'object' &&
    node !== null &&
    (typeof node.type === 'string' || typeof node.type === 'function') &&
    typeof node.props === 'object' &&
    node.props !== null &&
    Array.isArray(node.props.children)
  );
}

/**
 * Strict typeguard to verify if a VNode is a normalized text element.
 * @param {any} node
 * @returns {boolean}
 */
export function isTextVNode(node) {
  return (
    isVNode(node) &&
    node.type === 'TEXT_ELEMENT' &&
    typeof node.props.nodeValue === 'string'
  );
}

/**
 * Strict typeguard to verify if a VNode is a standard HTML element.
 * @param {any} node
 * @returns {boolean}
 */
export function isElementVNode(node) {
  return isVNode(node) && node.type !== 'TEXT_ELEMENT';
}

/**
 * Factory for normalizing raw text and primitive values into standard VNode leaf nodes.
 * Enforces structural uniformity across the virtual DOM tree.
 * 
 * @param {string | number} text - Raw primitive string or number
 * @returns {VNode} Normalized TEXT_ELEMENT VNode
 */
export function createTextElement(text) {
  return {
    type: 'TEXT_ELEMENT',
    props: {
      nodeValue: String(text),
      children: []
    }
  };
}

/**
 * Core createElement factory function.
 * Constructs an immutable, normalized VNode tree from component declarations.
 * 
 * @param {VNodeType} type - HTML tag string (e.g., 'main', 'button') or Component function
 * @param {Record<string, any> | null} props - Element attributes, event handlers, and properties
 * @param {...any} children - Variadic child elements, primitives, or nested arrays
 * @returns {VNode} Normalized VNode object
 */
export function createElement(type, props, ...children) {
  if (typeof type !== 'string' && typeof type !== 'function') {
    throw new TypeError(`[createElement] Invalid element type: expected string or function, got ${typeof type}`);
  }

  return {
    type,
    props: {
      ...(props || {}),
      children: children
        .flat(Infinity)
        .filter((c) => c !== null && c !== undefined && typeof c !== 'boolean' && c !== false)
        .map((child) =>
          typeof child === 'object' && child !== null && 'type' in child
            ? child
            : createTextElement(child)
        )
    }
  };
}

/**
 * SVG namespace for live defense Challenge A compatibility.
 */
const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';
const SVG_TAGS = new Set([
  'svg', 'path', 'circle', 'rect', 'line', 'polyline', 'polygon', 'g', 'defs', 'use'
]);

/**
 * Recursive Mounting Engine: Transforms in-memory VNode trees into physical browser DOM elements.
 * Adheres to strict XSS sanitization standards by generating text nodes for strings.
 * 
 * @param {VNode} vNode - Virtual DOM node to be rendered
 * @returns {Node} Physical DOM Node (Element or Text)
 * @throws {TypeError} If vNode fails the strict typeguard contract
 */
export function renderToDOM(vNode, options = {}) {
  // Strict Typeguard Verification
  if (!isVNode(vNode)) {
    throw new TypeError(
      `[renderToDOM] Invalid VNode contract: expected a valid VNode object, got ${
        vNode === null ? 'null' : typeof vNode
      }`
    );
  }

  // 1. Create text node or standard HTML/SVG element
  let dom;
  if (vNode.type === 'TEXT_ELEMENT') {
    // XSS Prevention: Raw text nodes never parse innerHTML or execute scripts
    dom = document.createTextNode(vNode.props.nodeValue ?? '');
  } else if (typeof vNode.type === 'string') {
    if (SVG_TAGS.has(vNode.type.toLowerCase())) {
      dom = document.createElementNS(SVG_NAMESPACE, vNode.type);
    } else {
      dom = document.createElement(vNode.type);
    }
  } else {
    throw new TypeError(`[renderToDOM] Unsupported VNode type: ${typeof vNode.type}`);
  }

  // 2. Assign attributes, event listeners, and DOM properties
  Object.keys(vNode.props)
    .filter((key) => key !== 'children' && key !== 'nodeValue')
    .forEach((name) => {
      const val = vNode.props[name];

      if (name.startsWith('on') && typeof val === 'function') {
        // Event listener binding: if root event delegation is enabled, skip direct DOM listener
        if (!options.delegateEvents) {
          const eventType = name.slice(2).toLowerCase();
          dom.addEventListener(eventType, val);
        }
      } else if (name === 'className') {
        // Class attribute normalization
        dom.className = val;
        dom.setAttribute('class', val);
      } else if (name === 'style' && typeof val === 'object' && val !== null) {
        // Inline styles assignment
        Object.assign(dom.style, val);
      } else if (typeof val === 'boolean') {
        // Boolean attributes (e.g., disabled, checked)
        if (val) {
          dom.setAttribute(name, '');
          try { dom[name] = true; } catch (_) {}
        } else {
          dom.removeAttribute(name);
          try { dom[name] = false; } catch (_) {}
        }
      } else if (val !== null && val !== undefined) {
        // Standard attribute reflection
        dom.setAttribute(name, String(val));
        try {
          dom[name] = val;
        } catch (_) {
          // Read-only DOM properties fallback to setAttribute
        }
      }
    });

  // Attach VNode reference to DOM node for Event Delegation and DevTools inspection
  if (dom && dom.nodeType === 1) {
    dom.__vnode = vNode;
  }

  // 3. Recursive traversal for children mounting
  vNode.props.children.forEach((child) => {
    dom.appendChild(renderToDOM(child, options));
  });

  return dom;
}
