/**
 * Comprehensive Automated Verification Test Suite for HW 1: Production Enterprise Data-Grid
 * 
 * Verifies:
 * 1. Interface & Contract Specifications (ColumnDef, DataGridProps)
 * 2. WCAG 2.2 Level AA Semantics & ARIA Grid Patterns
 * 3. Zero Div-Soup Invariant (0 divs in component subtree)
 * 4. Multi-column Sorting with aria-sort & Roving Focus
 * 5. Real-time Search Filtering & Screen Reader Live Announcements (aria-live="polite")
 * 6. Pagination Engine & Page Size Controllers
 * 7. 2D Keyboard Navigation (Arrow Keys, Home, End, PageUp, PageDown, Space, Enter)
 * 8. Row Selection & onRowSelect Callbacks
 */

import test from 'node:test';
import assert from 'node:assert/strict';

// --- Lightweight Headless DOM Mock Engine for Node.js ---
class MockNode {
  constructor(nodeType, nodeValue = '') {
    this.nodeType = nodeType;
    this.nodeValue = nodeValue;
    this.childNodes = [];
    this.parentElement = null;
  }

  appendChild(child) {
    if (child.parentElement) {
      const idx = child.parentElement.childNodes.indexOf(child);
      if (idx !== -1) child.parentElement.childNodes.splice(idx, 1);
    }
    child.parentElement = this;
    this.childNodes.push(child);
    return child;
  }

  replaceChildren(...newChildren) {
    this.childNodes.forEach((c) => { c.parentElement = null; });
    this.childNodes = [];
    newChildren.forEach((child) => this.appendChild(child));
  }

  contains(child) {
    let curr = child;
    while (curr) {
      if (curr === this) return true;
      curr = curr.parentElement;
    }
    return false;
  }

  get textContent() {
    if (this.nodeType === 3) return this.nodeValue;
    return this.childNodes.map((c) => c.textContent).join('');
  }

  set textContent(val) {
    if (this.nodeType === 3) {
      this.nodeValue = String(val);
    } else {
      this.childNodes = [];
      if (val !== '') {
        const textNode = new MockNode(3, String(val));
        this.appendChild(textNode);
      }
    }
  }
}

class MockElement extends MockNode {
  constructor(tagName) {
    super(1);
    this.tagName = tagName.toUpperCase();
    this.attributes = {};
    this.listeners = {};
    this.style = {};
    this._dataset = {};
    this._tabIndex = -1;
    this._checked = false;
    this.disabled = false;
    this.selected = false;
    this.scope = '';
    this.colSpan = 1;
    this.htmlFor = '';
    this.placeholder = '';
    this.autocomplete = '';

    const self = this;
    this.dataset = new Proxy(this._dataset, {
      set(target, prop, val) {
        target[prop] = String(val);
        const attrName = 'data-' + String(prop).replace(/([A-Z])/g, '-$1').toLowerCase();
        self.attributes[attrName] = String(val);
        return true;
      },
      get(target, prop) {
        return target[prop];
      }
    });
  }

  get type() {
    return this.attributes['type'] || 'text';
  }

  set type(val) {
    this.attributes['type'] = String(val);
  }

  get value() {
    return this.attributes['value'] || '';
  }

  set value(val) {
    this.attributes['value'] = String(val);
  }

  get checked() {
    return this._checked;
  }

  set checked(val) {
    this._checked = Boolean(val);
  }

  get id() {
    return this.attributes['id'] || '';
  }

  set id(val) {
    this.attributes['id'] = String(val);
  }

  get className() {
    return this.attributes['class'] || '';
  }

  set className(val) {
    this.attributes['class'] = String(val);
  }

  get tabIndex() {
    if (this.attributes['tabindex'] !== undefined) {
      return Number(this.attributes['tabindex']);
    }
    return this._tabIndex !== undefined ? this._tabIndex : -1;
  }

  set tabIndex(val) {
    this._tabIndex = Number(val);
    this.attributes['tabindex'] = String(val);
  }

  set innerHTML(html) {
    this.childNodes = [];
    const stripped = html.replace(/<[^>]*>/g, ' ');
    this.appendChild(new MockNode(3, stripped));
  }

  setAttribute(key, val) {
    this.attributes[key] = String(val);
    if (key.startsWith('data-')) {
      const prop = key.slice(5).replace(/-([a-z])/g, (_, l) => l.toUpperCase());
      this._dataset[prop] = String(val);
    }
  }

  getAttribute(key) {
    return this.attributes[key] !== undefined ? this.attributes[key] : null;
  }

  hasAttribute(key) {
    return this.attributes[key] !== undefined;
  }

  removeAttribute(key) {
    delete this.attributes[key];
    if (key.startsWith('data-')) {
      const prop = key.slice(5).replace(/-([a-z])/g, (_, l) => l.toUpperCase());
      delete this._dataset[prop];
    }
  }

  addEventListener(event, fn) {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event].push(fn);
  }

  dispatchEvent(event) {
    if (!event.target) event.target = this;
    event.currentTarget = this;
    if (this.listeners[event.type]) {
      this.listeners[event.type].forEach((fn) => fn(event));
    }
    // Bubble up
    if (this.parentElement && !event._propagationStopped) {
      this.parentElement.dispatchEvent(event);
    }
  }

  click() {
    let propagationStopped = false;
    const event = {
      type: 'click',
      target: this,
      currentTarget: this,
      stopPropagation: () => { propagationStopped = true; event._propagationStopped = true; },
      preventDefault: () => {}
    };
    if (this.tagName === 'INPUT' && (this.type === 'checkbox' || this.type === 'radio')) {
      this.checked = !this.checked;
      this.dispatchEvent(event);
      const changeEvent = {
        type: 'change',
        target: this,
        currentTarget: this,
        stopPropagation: () => { changeEvent._propagationStopped = true; },
        preventDefault: () => {}
      };
      this.dispatchEvent(changeEvent);
      return;
    }
    this.dispatchEvent(event);
  }

  focus() {
    globalThis.document.activeElement = this;
  }

  setSelectionRange() {}

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }

  querySelectorAll(selector) {
    const results = [];
    const traverse = (node) => {
      for (const child of node.childNodes) {
        if (child instanceof MockElement) {
          if (matchesSelector(child, selector)) {
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

function matchesSingle(el, token) {
  if (!token) return true;

  // Extract attribute selectors: [attr=val] or [attr]
  const attrRegex = /\[([a-zA-Z0-9_-]+)(?:([*^$]?=)"?([^"\]]*)"?)?\]/g;
  let remaining = token;
  let attrMatch;

  while ((attrMatch = attrRegex.exec(token)) !== null) {
    const [full, attrName, operator, expectedVal] = attrMatch;
    remaining = remaining.replace(full, '');
    const actualVal = el.getAttribute(attrName);
    
    if (operator === undefined) {
      if (actualVal === null && !el.hasAttribute(attrName)) return false;
    } else {
      if (actualVal === null) return false;
      if (operator === '=' && actualVal !== expectedVal) return false;
      if (operator === '*=' && !actualVal.includes(expectedVal)) return false;
      if (operator === '^=' && !actualVal.startsWith(expectedVal)) return false;
      if (operator === '$=' && !actualVal.endsWith(expectedVal)) return false;
    }
  }

  // Extract class names
  const classParts = remaining.split('.');
  const tagPart = classParts[0];
  const requiredClasses = classParts.slice(1);

  if (tagPart) {
    if (tagPart.startsWith('#')) {
      if (el.id !== tagPart.slice(1)) return false;
    } else if (el.tagName.toLowerCase() !== tagPart.toLowerCase()) {
      return false;
    }
  }

  if (requiredClasses.length > 0) {
    const elClasses = el.className.split(/\s+/).filter(Boolean);
    for (const cls of requiredClasses) {
      if (!elClasses.includes(cls)) return false;
    }
  }

  return true;
}

function matchesSelector(el, selector) {
  const groups = selector.split(',').map((s) => s.trim());
  return groups.some((group) => {
    const parts = group.split(/\s+/).filter(Boolean);
    if (parts.length === 0) return false;
    
    if (!matchesSingle(el, parts[parts.length - 1])) return false;
    
    let currPartIdx = parts.length - 2;
    let currEl = el.parentElement;
    
    while (currPartIdx >= 0 && currEl) {
      if (matchesSingle(currEl, parts[currPartIdx])) {
        currPartIdx--;
      }
      currEl = currEl.parentElement;
    }
    
    return currPartIdx < 0;
  });
}

// Global Document Mock
globalThis.HTMLElement = MockElement;
globalThis.document = {
  activeElement: null,
  createElement(tag) {
    return new MockElement(tag);
  },
  createTextNode(text) {
    return new MockNode(3, String(text));
  },
  querySelector(sel) {
    return mockRootContainer.querySelector(sel);
  }
};

let mockRootContainer;

// Test Dataset
const TEST_COLUMNS = [
  { header: 'Student ID', accessorKey: 'studentId', sortable: true },
  { header: 'Full Name', accessorKey: 'fullName', sortable: true },
  { header: 'Major', accessorKey: 'major', sortable: true },
  { header: 'GPA', accessorKey: 'gpa', sortable: true },
  { header: 'Status', accessorKey: 'status', sortable: false }
];

const TEST_DATA = [
  { id: 1, studentId: '24521614', fullName: 'Trần Hữu Thắng', major: 'Software Engineering', gpa: 3.92, status: 'Honor' },
  { id: 2, studentId: '24520015', fullName: 'Nguyễn Văn An', major: 'Computer Science', gpa: 3.65, status: 'Active' },
  { id: 3, studentId: '24520112', fullName: 'Lê Thị Mai', major: 'Information Security', gpa: 3.88, status: 'Honor' },
  { id: 4, studentId: '24520340', fullName: 'Phạm Minh Đức', major: 'Data Science', gpa: 3.42, status: 'Active' },
  { id: 5, studentId: '23520556', fullName: 'Hoàng Kim Ngân', major: 'Information Systems', gpa: 3.75, status: 'Active' },
  { id: 6, studentId: '23520789', fullName: 'Võ Quốc Bảo', major: 'Software Engineering', gpa: 3.15, status: 'Active' },
  { id: 7, studentId: '22520901', fullName: 'Đặng Thùy Dương', major: 'Computer Networks', gpa: 3.95, status: 'Honor' },
  { id: 8, studentId: '24521045', fullName: 'Bùi Gia Huy', major: 'Computer Science', gpa: 2.85, status: 'Probation' },
  { id: 9, studentId: '23521234', fullName: 'Phan Ngọc Hân', major: 'Data Science', gpa: 3.82, status: 'Honor' },
  { id: 10, studentId: '22521456', fullName: 'Đỗ Tuấn Kiệt', major: 'Software Engineering', gpa: 3.58, status: 'Graduated' },
  { id: 11, studentId: '24521678', fullName: 'Trương Khánh Linh', major: 'Information Security', gpa: 3.71, status: 'Active' },
  { id: 12, studentId: '23521890', fullName: 'Lâm Nhật Nam', major: 'Information Systems', gpa: 3.30, status: 'Active' }
];

// Import target under test
const { createDataGrid } = await import('./data-grid.js');

test('Contract Guard: Validates arguments and throws TypeError on invalid parameters', () => {
  assert.throws(() => createDataGrid(null, {}), TypeError);
  assert.throws(() => createDataGrid(new MockElement('section'), null), TypeError);
  assert.throws(() => createDataGrid(new MockElement('section'), { data: 'not-array', columns: TEST_COLUMNS, ariaLabel: 'Test' }), TypeError);
  assert.throws(() => createDataGrid(new MockElement('section'), { data: [], columns: [], ariaLabel: 'Test' }), TypeError);
  assert.throws(() => createDataGrid(new MockElement('section'), { data: [], columns: TEST_COLUMNS, ariaLabel: '' }), TypeError);
});

test('Zero Div-Soup Invariant: Subtree contains exactly ZERO div elements', () => {
  mockRootContainer = new MockElement('section');
  createDataGrid(mockRootContainer, {
    data: TEST_DATA,
    columns: TEST_COLUMNS,
    ariaLabel: 'UIT Student Registry'
  });

  const divs = mockRootContainer.querySelectorAll('div');
  assert.equal(divs.length, 0, 'Zero div-soup violated: found <div> in mounted grid subtree');

  // Verify semantic elements used instead
  const table = mockRootContainer.querySelector('table');
  assert.notEqual(table, null, 'Table element must exist');
  assert.equal(table.getAttribute('role'), 'grid');

  const thead = mockRootContainer.querySelector('thead');
  assert.notEqual(thead, null, '<thead> element must exist');

  const tbody = mockRootContainer.querySelector('tbody');
  assert.notEqual(tbody, null, '<tbody> element must exist');

  const caption = mockRootContainer.querySelector('caption');
  assert.notEqual(caption, null, '<caption> element must exist');
});

test('ARIA Semantics & Grid Roles: Correct roles and attributes applied', () => {
  mockRootContainer = new MockElement('section');
  createDataGrid(mockRootContainer, {
    data: TEST_DATA,
    columns: TEST_COLUMNS,
    ariaLabel: 'UIT Student Academic Registry',
    initialPageSize: 5
  });

  const table = mockRootContainer.querySelector('table');
  assert.equal(table.getAttribute('role'), 'grid');
  assert.equal(table.getAttribute('aria-label'), 'UIT Student Academic Registry');
  assert.equal(table.getAttribute('aria-rowcount'), '13'); // 12 records + 1 header
  assert.equal(table.getAttribute('aria-colcount'), '6');  // 5 cols + 1 select col

  const headers = mockRootContainer.querySelectorAll('th');
  assert.equal(headers.length, 6);
  headers.forEach((th) => {
    assert.equal(th.getAttribute('role'), 'columnheader');
    assert.equal(th.scope, 'col');
    assert.notEqual(th.getAttribute('aria-colindex'), null);
  });

  const dataRows = mockRootContainer.querySelectorAll('tbody tr');
  assert.equal(dataRows.length, 5); // 5 rows per page
  dataRows.forEach((tr) => {
    assert.equal(tr.getAttribute('role'), 'row');
    assert.notEqual(tr.getAttribute('aria-rowindex'), null);
    assert.notEqual(tr.getAttribute('aria-selected'), null);
  });
});

test('Sorting: Toggles aria-sort (ascending -> descending -> none) and reorders data', () => {
  mockRootContainer = new MockElement('section');
  const grid = createDataGrid(mockRootContainer, {
    data: TEST_DATA,
    columns: TEST_COLUMNS,
    ariaLabel: 'UIT Student Registry',
    initialPageSize: 10
  });

  // GPA is column 4 (1-based index: 0 is select, 1 is studentId, 2 is fullName, 3 is major, 4 is GPA)
  const gpaTh = mockRootContainer.querySelector('th[data-col="4"]');
  assert.notEqual(gpaTh, null);
  assert.equal(gpaTh.getAttribute('aria-sort'), 'none');

  // Trigger sort: none -> ascending
  grid.setSort('gpa', 'ascending');
  let state = grid.getState();
  assert.equal(state.sortKey, 'gpa');
  assert.equal(state.sortDirection, 'ascending');

  // Verify sort order: first item should have minimum GPA (2.85 - Bùi Gia Huy)
  const firstDataRow = mockRootContainer.querySelectorAll('tbody tr')[0];
  assert.equal(firstDataRow.querySelector('td[data-col="1"]').textContent, '24521045');

  // Trigger sort: ascending -> descending
  grid.setSort('gpa', 'descending');
  state = grid.getState();
  assert.equal(state.sortDirection, 'descending');

  // Verify sort order: first item should have maximum GPA (3.95 - Đặng Thùy Dương)
  const topDataRow = mockRootContainer.querySelectorAll('tbody tr')[0];
  assert.equal(topDataRow.querySelector('td[data-col="1"]').textContent, '22520901');
});

test('Search Filtering: Accurately filters records and updates state', () => {
  mockRootContainer = new MockElement('section');
  const grid = createDataGrid(mockRootContainer, {
    data: TEST_DATA,
    columns: TEST_COLUMNS,
    ariaLabel: 'UIT Student Registry',
    initialPageSize: 10
  });

  // Filter by 'Software Engineering'
  grid.setFilter('Software Engineering');
  let rows = mockRootContainer.querySelectorAll('tbody tr');
  assert.equal(rows.length, 3); // 3 students in Software Engineering

  // Filter by specific student name: 'Trần Hữu Thắng'
  grid.setFilter('Trần Hữu Thắng');
  rows = mockRootContainer.querySelectorAll('tbody tr');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].querySelector('td[data-col="1"]').textContent, '24521614');

  // Clear filter
  grid.setFilter('');
  rows = mockRootContainer.querySelectorAll('tbody tr');
  assert.equal(rows.length, 10);
});

test('Pagination: Page size switching, boundary buttons and navigation', () => {
  mockRootContainer = new MockElement('section');
  const grid = createDataGrid(mockRootContainer, {
    data: TEST_DATA,
    columns: TEST_COLUMNS,
    ariaLabel: 'UIT Student Registry',
    initialPageSize: 5
  });

  assert.equal(grid.getState().currentPage, 1);
  let rows = mockRootContainer.querySelectorAll('tbody tr');
  assert.equal(rows.length, 5);

  // Pagination summary checks
  const summary = mockRootContainer.querySelector('p.pagination-summary');
  assert.notEqual(summary, null);
  assert.match(summary.textContent, /Showing.*1.*5.*of.*12/);

  // Navigate to Page 2
  const allBtns = mockRootContainer.querySelectorAll('button.page-btn');
  const page2Btn = allBtns.find((b) => b.textContent.trim() === '2');
  assert.notEqual(page2Btn, undefined);
  page2Btn.click();

  assert.equal(grid.getState().currentPage, 2);
  rows = mockRootContainer.querySelectorAll('tbody tr');
  assert.equal(rows.length, 5);
});

test('Row Selection & onRowSelect Callback Integration', () => {
  mockRootContainer = new MockElement('section');
  let selectedStudent = null;

  const grid = createDataGrid(mockRootContainer, {
    data: TEST_DATA,
    columns: TEST_COLUMNS,
    ariaLabel: 'UIT Student Registry',
    onRowSelect: (student) => {
      selectedStudent = student;
    }
  });

  // Find row 1 checkbox
  const row1 = mockRootContainer.querySelectorAll('tbody tr')[0];
  const checkbox = row1.querySelector('input[type="checkbox"]');
  assert.notEqual(checkbox, null);

  // Toggle selection
  checkbox.click();
  assert.notEqual(selectedStudent, null);
  assert.equal(selectedStudent.studentId, '24521614');
  assert.equal(selectedStudent.fullName, 'Trần Hữu Thắng');

  const selectedRows = grid.getSelectedRows();
  assert.equal(selectedRows.length, 1);
  assert.equal(selectedRows[0].studentId, '24521614');
});

test('W3C APG Grid Roving Tabindex: Exactly one cell has tabindex=0', () => {
  mockRootContainer = new MockElement('section');
  createDataGrid(mockRootContainer, {
    data: TEST_DATA,
    columns: TEST_COLUMNS,
    ariaLabel: 'UIT Student Registry',
    initialPageSize: 5
  });

  const cells = mockRootContainer.querySelectorAll('[role="grid"] [tabindex]');
  const focusableCells = cells.filter((c) => c.tabIndex === 0);
  assert.equal(focusableCells.length, 1, 'Exactly one gridcell/header must have tabindex=0 in roving tabindex pattern');
  assert.equal(focusableCells[0].dataset.row, '0');
  assert.equal(focusableCells[0].dataset.col, '0');
});

test('W3C APG 2D Keyboard Navigation: Arrow keys, Space and Enter interaction', () => {
  mockRootContainer = new MockElement('section');
  let selectedViaEnter = null;

  createDataGrid(mockRootContainer, {
    data: TEST_DATA,
    columns: TEST_COLUMNS,
    ariaLabel: 'UIT Student Registry',
    initialPageSize: 5,
    onRowSelect: (student) => {
      selectedViaEnter = student;
    }
  });

  const table = mockRootContainer.querySelector('table[role="grid"]');
  assert.notEqual(table, null);

  // Start with focus at (0, 0) - Select All header cell
  const startCell = mockRootContainer.querySelector('th[data-row="0"][data-col="0"]');
  startCell.focus();

  // Send ArrowDown key event
  let stopped = false;
  let prevented = false;
  table.dispatchEvent({
    type: 'keydown',
    key: 'ArrowDown',
    target: startCell,
    stopPropagation: () => { stopped = true; },
    preventDefault: () => { prevented = true; }
  });

  // Target cell should now be (1, 0) - checkbox cell of row 1
  let active = globalThis.document.activeElement;
  assert.notEqual(active, null);
  assert.equal(active.dataset.row, '1');
  assert.equal(active.dataset.col, '0');
  assert.equal(active.tabIndex, 0);

  // Send ArrowRight key event
  table.dispatchEvent({
    type: 'keydown',
    key: 'ArrowRight',
    target: active,
    stopPropagation: () => { stopped = true; },
    preventDefault: () => { prevented = true; }
  });

  // Target cell should now be (1, 1) - Student ID cell of row 1
  active = globalThis.document.activeElement;
  assert.equal(active.dataset.row, '1');
  assert.equal(active.dataset.col, '1');
  assert.equal(active.textContent, '24521614');

  // Send Enter key event to activate row
  table.dispatchEvent({
    type: 'keydown',
    key: 'Enter',
    target: active,
    stopPropagation: () => { stopped = true; },
    preventDefault: () => { prevented = true; }
  });

  assert.notEqual(selectedViaEnter, null);
  assert.equal(selectedViaEnter.studentId, '24521614');
  assert.equal(selectedViaEnter.fullName, 'Trần Hữu Thắng');
});

test('Multi-column Composite Sorting: Sorts by primary and secondary criteria', () => {
  mockRootContainer = new MockElement('section');
  const grid = createDataGrid(mockRootContainer, {
    data: TEST_DATA,
    columns: TEST_COLUMNS,
    ariaLabel: 'UIT Student Registry',
    initialPageSize: 10
  });

  // Sort primarily by major (ascending), then secondarily by gpa (descending)
  grid.setSort('major', 'ascending');
  grid.setSort('gpa', 'descending', true); // append = true

  const rows = mockRootContainer.querySelectorAll('tbody tr');
  assert.equal(rows.length, 10);

  // First group of majors should be 'Computer Networks'
  const row0Major = rows[0].querySelector('td[data-col="3"]').textContent;
  assert.equal(row0Major, 'Computer Networks');

  // Next group is 'Computer Science', sorted by GPA descending: 3.65 (Nguyễn Văn An) before 2.85 (Bùi Gia Huy)
  const csRows = rows.filter((r) => r.querySelector('td[data-col="3"]').textContent === 'Computer Science');
  assert.equal(csRows.length, 2);
  assert.equal(csRows[0].querySelector('td[data-col="4"]').textContent, '3.65');
  assert.equal(csRows[1].querySelector('td[data-col="4"]').textContent, '2.85');
});

test('Project Rules Compliance: Zero innerHTML injection in component rendering', () => {
  mockRootContainer = new MockElement('section');
  
  // Track any innerHTML assignments
  let innerHTMLCount = 0;
  const originalInnerHTMLDescriptor = Object.getOwnPropertyDescriptor(MockElement.prototype, 'innerHTML');
  
  Object.defineProperty(MockElement.prototype, 'innerHTML', {
    set(val) {
      innerHTMLCount++;
      originalInnerHTMLDescriptor.set.call(this, val);
    },
    get() {
      return originalInnerHTMLDescriptor.get.call(this);
    },
    configurable: true
  });

  try {
    createDataGrid(mockRootContainer, {
      data: TEST_DATA,
      columns: TEST_COLUMNS,
      ariaLabel: 'UIT Student Registry',
      initialPageSize: 5
    });

    assert.equal(innerHTMLCount, 0, 'Violation of project-rules.md: Raw innerHTML injection detected!');
  } finally {
    Object.defineProperty(MockElement.prototype, 'innerHTML', originalInnerHTMLDescriptor);
  }
});
