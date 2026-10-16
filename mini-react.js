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
