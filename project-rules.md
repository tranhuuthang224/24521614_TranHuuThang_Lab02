# Project Rules & Pedagogical Manifesto (Lab 02)

## 1. Foundational Principles
- **HTML is the Semantic Foundation**: Output must produce clean semantic tags (`<main>`, `<header>`, `<section>`, `<article>`, `<button>`). Div-soup is banned.
- **CSS Handles Presentation**: Modern layout with CSS Grid/Flexbox, CSS custom properties, and responsive typography.
- **JavaScript Governs Reactive State**: Deterministic computational behavior with pure VNode trees and immutable data flow.
- **Generate & Verify**: AI generates probabilistic code; Developers provide deterministic verification through test suites and DevTools audit.
- **Zero Monolithic Vibe Coding**: Enforce atomic task decomposition and contract-first workflows.

## 2. Deprecation Audit (Strictly Forbidden Patterns)
- **BANNED**: `var` scoping & implicit globals $\rightarrow$ **MUST USE** `const` & `let`.
- **BANNED**: `keypress` & `e.keyCode` $\rightarrow$ **MUST USE** `keydown` & `e.key` / `e.code`.
- **BANNED**: Raw `innerHTML` injection $\rightarrow$ **MUST USE** DOM APIs or sanitized text nodes (`document.createTextNode`) for XSS prevention.
- **BANNED**: Inline HTML event handlers (`onclick="..."`) $\rightarrow$ **MUST USE** dynamic `addEventListener` or centralized event delegation.
- **BANNED**: Outdated Babel standalones $\rightarrow$ **MUST USE** modern ES modules and standard browser APIs.

## 3. Engineering Contracts
- **VNode Contract**: POJO with `{ type, props: { ...attrs, children: VNode[], nodeValue?: string } }`.
- **Children Normalization**: Primitive values (strings, numbers) wrapped as `TEXT_ELEMENT` VNodes.
- **Mounting Safety**: Zero orphan DOM nodes, strict typeguard validation on runtime traversal.
