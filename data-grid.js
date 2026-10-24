/**
 * Production Enterprise Data-Grid (WCAG 2.2 AA)
 * Adheres strictly to Lab 02 HW 1 Specifications & W3C APG Grid Pattern
 * 
 * Invariants:
 * - Full ARIA grid semantics (role="grid", role="row", role="columnheader", role="gridcell")
 * - 4.5:1 color contrast ratio (WCAG 2.2 Level AA)
 * - 2D Keyboard Navigation with Roving Tabindex
 * - Screen Reader Live Announcements (aria-live="polite")
 * - Zero Div-Soup (Strictly native semantic HTML5 & table elements)
 */

/**
 * @template T
 * @typedef {Object} ColumnDef
 * @property {string} header - Visible column header title
 * @property {keyof T} accessorKey - Key in data object to display
 * @property {boolean} [sortable=false] - Whether column supports ascending/descending sorting
 * @property {(value: any, item: T) => string | HTMLElement} [cellRenderer] - Custom accessible cell formatter
 */

/**
 * @template T
 * @typedef {Object} DataGridProps
 * @property {T[]} data - Array of data records
 * @property {ColumnDef<T>[]} columns - Column configuration definitions
 * @property {(item: T) => void} [onRowSelect] - Row selection callback
 * @property {string} ariaLabel - Mandatory accessible label describing grid purpose
 * @property {number} [initialPageSize=10] - Default rows per page
 */

/**
 * Creates and mounts an accessible, production-grade Data-Grid.
 * 
 * @template T
 * @param {HTMLElement} container - DOM container element to mount the grid into
 * @param {DataGridProps<T>} props - Component configuration properties
 * @returns {Object} Data-Grid instance controller
 */
export function createDataGrid(container, props) {
  // 1. Strict Contract Invariant Validations
  if (!container || !(container instanceof HTMLElement)) {
    throw new TypeError('[createDataGrid] Container must be a valid HTMLElement.');
  }
  if (!props || typeof props !== 'object') {
    throw new TypeError('[createDataGrid] Props must be an object.');
  }
  if (!Array.isArray(props.data)) {
    throw new TypeError('[createDataGrid] props.data must be an array.');
  }
  if (!Array.isArray(props.columns) || props.columns.length === 0) {
    throw new TypeError('[createDataGrid] props.columns must be a non-empty array.');
  }
  if (typeof props.ariaLabel !== 'string' || !props.ariaLabel.trim()) {
    throw new TypeError('[createDataGrid] props.ariaLabel is required for WCAG compliance.');
  }

  // 2. Component Reactive State
  const state = {
    allData: [...props.data],
    columns: props.columns,
    ariaLabel: props.ariaLabel,
    onRowSelect: props.onRowSelect,
    sortKey: null,
    sortDirection: 'none', // 'ascending' | 'descending' | 'none'
    filterQuery: '',
    currentPage: 1,
    pageSize: props.initialPageSize || 10,
    selectedIds: new Set(),
    focusedCell: { rowIndex: 0, colIndex: 0 }, // 0 = header row, 1..N = data rows
    instanceId: `grid-${Math.random().toString(36).substring(2, 9)}`
  };

  // Helper to announce changes to Screen Readers
  function announce(message) {
    const liveRegion = container.querySelector(`#${state.instanceId}-live-announcer`);
    if (liveRegion) {
      liveRegion.textContent = '';
      // Allow DOM to register text clearing then set new message
      setTimeout(() => {
        liveRegion.textContent = message;
      }, 50);
    }
  }

  // 3. Data Processing Pipeline (Filtering & Sorting)
  function getProcessedData() {
    let result = [...state.allData];

    // Filter stage
    if (state.filterQuery.trim()) {
      const q = state.filterQuery.toLowerCase();
      result = result.filter((item) => {
        return state.columns.some((col) => {
          const val = item[col.accessorKey];
          return val !== null && val !== undefined && String(val).toLowerCase().includes(q);
        });
      });
    }

    // Sort stage
    if (state.sortKey && state.sortDirection !== 'none') {
      const col = state.columns.find((c) => c.accessorKey === state.sortKey);
      if (col && col.sortable) {
        result.sort((a, b) => {
          const valA = a[state.sortKey];
          const valB = b[state.sortKey];

          if (valA === valB) return 0;
          if (valA === null || valA === undefined) return 1;
          if (valB === null || valB === undefined) return -1;

          let cmp = 0;
          if (typeof valA === 'number' && typeof valB === 'number') {
            cmp = valA - valB;
          } else {
            cmp = String(valA).localeCompare(String(valB), undefined, { numeric: true });
          }

          return state.sortDirection === 'ascending' ? cmp : -cmp;
        });
      }
    }

    return result;
  }

  // 4. Semantic DOM Rendering Pipeline (Zero Div-Soup)
  function render() {
    const processed = getProcessedData();
    const totalRecords = processed.length;
    const totalPages = Math.max(1, Math.ceil(totalRecords / state.pageSize));

    // Keep currentPage in valid bounds
    if (state.currentPage > totalPages) {
      state.currentPage = totalPages;
    }
    if (state.currentPage < 1) {
      state.currentPage = 1;
    }

    const startIndex = (state.currentPage - 1) * state.pageSize;
    const paginatedData = processed.slice(startIndex, startIndex + state.pageSize);
    const numRows = paginatedData.length;
    const numCols = state.columns.length + 1; // +1 for row selection checkbox column

    // Guard focusedCell boundaries
    state.focusedCell.rowIndex = Math.max(0, Math.min(numRows, state.focusedCell.rowIndex));
    state.focusedCell.colIndex = Math.max(0, Math.min(numCols - 1, state.focusedCell.colIndex));

    // Clear container without innerHTML injection
    container.replaceChildren();

    // SECTION 1: Toolbar (Search, Page Size, Status)
    const toolbar = document.createElement('section');
    toolbar.className = 'datagrid-toolbar';
    toolbar.setAttribute('aria-label', `${state.ariaLabel} controls`);

    // Search Form
    const searchForm = document.createElement('form');
    searchForm.className = 'datagrid-search-form';
    searchForm.setAttribute('role', 'search');
    searchForm.onsubmit = (e) => e.preventDefault();

    const searchLabel = document.createElement('label');
    searchLabel.htmlFor = `${state.instanceId}-search`;
    searchLabel.textContent = 'Search records:';

    const searchInput = document.createElement('input');
    searchInput.id = `${state.instanceId}-search`;
    searchInput.type = 'search';
    searchInput.placeholder = 'Filter by name, ID, major...';
    searchInput.value = state.filterQuery;
    searchInput.autocomplete = 'off';
    searchInput.addEventListener('input', (e) => {
      state.filterQuery = e.target.value;
      state.currentPage = 1;
      render();
      const count = getProcessedData().length;
      announce(`${count} records found matching "${state.filterQuery}"`);
      // Restore input focus
      const refreshedInput = container.querySelector(`#${state.instanceId}-search`);
      if (refreshedInput) {
        refreshedInput.focus();
        refreshedInput.setSelectionRange(refreshedInput.value.length, refreshedInput.value.length);
      }
    });

    searchForm.appendChild(searchLabel);
    searchForm.appendChild(searchInput);

    // Page Size Selector
    const pageSizeWrap = document.createElement('section');
    pageSizeWrap.className = 'datagrid-pagesize-control';

    const pageSizeLabel = document.createElement('label');
    pageSizeLabel.htmlFor = `${state.instanceId}-pagesize`;
    pageSizeLabel.textContent = 'Rows per page:';

    const pageSizeSelect = document.createElement('select');
    pageSizeSelect.id = `${state.instanceId}-pagesize`;
    [5, 10, 25].forEach((size) => {
      const opt = document.createElement('option');
      opt.value = String(size);
      opt.textContent = String(size);
      if (size === state.pageSize) opt.selected = true;
      pageSizeSelect.appendChild(opt);
    });
    pageSizeSelect.addEventListener('change', (e) => {
      state.pageSize = Number(e.target.value);
      state.currentPage = 1;
      render();
      announce(`Showing ${state.pageSize} rows per page`);
    });

    pageSizeWrap.appendChild(pageSizeLabel);
    pageSizeWrap.appendChild(pageSizeSelect);

    // Live Region for Screen Readers
    const liveAnnouncer = document.createElement('p');
    liveAnnouncer.id = `${state.instanceId}-live-announcer`;
    liveAnnouncer.className = 'sr-only';
    liveAnnouncer.setAttribute('aria-live', 'polite');
    liveAnnouncer.setAttribute('aria-atomic', 'true');

    toolbar.appendChild(searchForm);
    toolbar.appendChild(pageSizeWrap);
    toolbar.appendChild(liveAnnouncer);

    // SECTION 2: Grid Table (Full ARIA Grid Semantics)
    const tableWrapper = document.createElement('section');
    tableWrapper.className = 'datagrid-table-container';

    const table = document.createElement('table');
    table.className = 'datagrid-table';
    table.setAttribute('role', 'grid');
    table.setAttribute('aria-label', state.ariaLabel);
    table.setAttribute('aria-rowcount', String(totalRecords + 1));
    table.setAttribute('aria-colcount', String(numCols));

    // Accessible Table Caption
    const caption = document.createElement('caption');
    caption.className = 'sr-only';
    caption.textContent = `${state.ariaLabel}. Use arrow keys to navigate grid cells, Enter to select row, Space to toggle selection.`;
    table.appendChild(caption);

    // THEAD
    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    headerRow.setAttribute('role', 'row');
    headerRow.setAttribute('aria-rowindex', '1');

    // Selection Header (Col 0)
    const selectAllTh = document.createElement('th');
    selectAllTh.scope = 'col';
    selectAllTh.setAttribute('role', 'columnheader');
    selectAllTh.setAttribute('aria-colindex', '1');
    selectAllTh.className = 'col-select';
    selectAllTh.tabIndex = (state.focusedCell.rowIndex === 0 && state.focusedCell.colIndex === 0) ? 0 : -1;
    selectAllTh.dataset.row = '0';
    selectAllTh.dataset.col = '0';

    const selectAllBtn = document.createElement('button');
    selectAllBtn.type = 'button';
    selectAllBtn.className = 'select-all-btn';
    const isAllSelected = paginatedData.length > 0 && paginatedData.every((item) => state.selectedIds.has(item.id || item));
    const isSomeSelected = paginatedData.some((item) => state.selectedIds.has(item.id || item));

    selectAllBtn.setAttribute('aria-label', isAllSelected ? 'Deselect all visible rows' : 'Select all visible rows');
    selectAllBtn.textContent = isAllSelected ? '☑' : (isSomeSelected ? '☒' : '☐');
    selectAllBtn.tabIndex = -1; // Keep gridcell itself keyboard navigable
    selectAllBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (isAllSelected) {
        paginatedData.forEach((item) => state.selectedIds.delete(item.id || item));
        announce('Deselected all rows on current page');
      } else {
        paginatedData.forEach((item) => state.selectedIds.add(item.id || item));
        announce('Selected all rows on current page');
      }
      render();
    });
    selectAllTh.appendChild(selectAllBtn);
    headerRow.appendChild(selectAllTh);

    // Column Headers (Col 1..N)
    state.columns.forEach((col, idx) => {
      const colIndex = idx + 1;
      const th = document.createElement('th');
      th.scope = 'col';
      th.setAttribute('role', 'columnheader');
      th.setAttribute('aria-colindex', String(colIndex + 1));
      th.dataset.row = '0';
      th.dataset.col = String(colIndex);
      th.tabIndex = (state.focusedCell.rowIndex === 0 && state.focusedCell.colIndex === colIndex) ? 0 : -1;

      if (col.sortable) {
        const isCurrentSort = state.sortKey === col.accessorKey;
        const currentSortDir = isCurrentSort ? state.sortDirection : 'none';
        th.setAttribute('aria-sort', currentSortDir);

        const sortBtn = document.createElement('button');
        sortBtn.type = 'button';
        sortBtn.className = 'sort-trigger-btn';
        sortBtn.tabIndex = -1; // Roving tabindex is on th cell

        let sortText = `${col.header}, sortable column`;
        if (currentSortDir === 'ascending') sortText += ', sorted ascending';
        if (currentSortDir === 'descending') sortText += ', sorted descending';
        sortBtn.setAttribute('aria-label', sortText);

        const headerTitle = document.createElement('span');
        headerTitle.className = 'header-title';
        headerTitle.textContent = col.header;

        const sortIcon = document.createElement('span');
        sortIcon.className = 'sort-indicator';
        sortIcon.setAttribute('aria-hidden', 'true');
        sortIcon.textContent = currentSortDir === 'ascending' ? ' ▲' : (currentSortDir === 'descending' ? ' ▼' : ' ⇅');

        sortBtn.appendChild(headerTitle);
        sortBtn.appendChild(sortIcon);

        const toggleSort = () => {
          if (state.sortKey !== col.accessorKey) {
            state.sortKey = col.accessorKey;
            state.sortDirection = 'ascending';
          } else if (state.sortDirection === 'ascending') {
            state.sortDirection = 'descending';
          } else if (state.sortDirection === 'descending') {
            state.sortKey = null;
            state.sortDirection = 'none';
          }
          state.currentPage = 1;
          render();
          announce(`Table sorted by ${col.header} ${state.sortDirection}`);
          focusCell(0, colIndex);
        };

        sortBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          toggleSort();
        });
        th.addEventListener('click', toggleSort);

        th.appendChild(sortBtn);
      } else {
        th.textContent = col.header;
      }

      headerRow.appendChild(th);
    });

    thead.appendChild(headerRow);
    table.appendChild(thead);

    // TBODY
    const tbody = document.createElement('tbody');
    tbody.setAttribute('role', 'rowgroup');

    if (paginatedData.length === 0) {
      const emptyRow = document.createElement('tr');
      emptyRow.setAttribute('role', 'row');
      emptyRow.setAttribute('aria-rowindex', '2');

      const emptyCell = document.createElement('td');
      emptyCell.setAttribute('role', 'gridcell');
      emptyCell.colSpan = numCols;
      emptyCell.className = 'empty-grid-msg';
      emptyCell.tabIndex = (state.focusedCell.rowIndex === 1 && state.focusedCell.colIndex === 0) ? 0 : -1;
      emptyCell.dataset.row = '1';
      emptyCell.dataset.col = '0';
      emptyCell.textContent = state.filterQuery
        ? `No records found matching "${state.filterQuery}". Try a different search term.`
        : 'No records available in this dataset.';

      emptyRow.appendChild(emptyCell);
      tbody.appendChild(emptyRow);
    } else {
      paginatedData.forEach((item, rIdx) => {
        const rowPos = rIdx + 1; // 1-based data row
        const rowElement = document.createElement('tr');
        rowElement.setAttribute('role', 'row');
        rowElement.setAttribute('aria-rowindex', String(startIndex + rowPos + 1));

        const itemId = item.id || item;
        const isSelected = state.selectedIds.has(itemId);
        rowElement.setAttribute('aria-selected', isSelected ? 'true' : 'false');
        if (isSelected) rowElement.className = 'row-selected';

        // Checkbox Cell (Col 0)
        const selectTd = document.createElement('td');
        selectTd.setAttribute('role', 'gridcell');
        selectTd.setAttribute('aria-colindex', '1');
        selectTd.className = 'col-select';
        selectTd.dataset.row = String(rowPos);
        selectTd.dataset.col = '0';
        selectTd.tabIndex = (state.focusedCell.rowIndex === rowPos && state.focusedCell.colIndex === 0) ? 0 : -1;

        const rowCheckbox = document.createElement('input');
        rowCheckbox.type = 'checkbox';
        rowCheckbox.checked = isSelected;
        rowCheckbox.tabIndex = -1;
        rowCheckbox.setAttribute('aria-label', `Select row for ${item.fullName || item.studentId || `item ${rowPos}`}`);

        const toggleRowSelection = (e) => {
          if (e) e.stopPropagation();
          if (state.selectedIds.has(itemId)) {
            state.selectedIds.delete(itemId);
            announce(`Deselected ${item.fullName || 'row'}`);
          } else {
            state.selectedIds.add(itemId);
            announce(`Selected ${item.fullName || 'row'}`);
          }
          if (state.onRowSelect) {
            state.onRowSelect(item);
          }
          render();
          focusCell(rowPos, 0);
        };

        rowCheckbox.addEventListener('change', toggleRowSelection);
        selectTd.appendChild(rowCheckbox);
        rowElement.appendChild(selectTd);

        // Data Cells (Col 1..N)
        state.columns.forEach((col, cIdx) => {
          const colIndex = cIdx + 1;
          const td = document.createElement('td');
          td.setAttribute('role', 'gridcell');
          td.setAttribute('aria-colindex', String(colIndex + 1));
          td.dataset.row = String(rowPos);
          td.dataset.col = String(colIndex);
          td.tabIndex = (state.focusedCell.rowIndex === rowPos && state.focusedCell.colIndex === colIndex) ? 0 : -1;

          const rawVal = item[col.accessorKey];

          // Format value or custom render
          if (col.accessorKey === 'status') {
            const badge = document.createElement('span');
            badge.className = `status-pill status-${String(rawVal).toLowerCase()}`;
            badge.textContent = String(rawVal);
            td.appendChild(badge);
          } else if (col.accessorKey === 'gpa' && typeof rawVal === 'number') {
            td.textContent = rawVal.toFixed(2);
            td.className = 'numeric-cell';
          } else if (col.accessorKey === 'credits' && typeof rawVal === 'number') {
            td.textContent = String(rawVal);
            td.className = 'numeric-cell';
          } else {
            td.textContent = (rawVal !== null && rawVal !== undefined) ? String(rawVal) : '—';
          }

          // Clicking a data cell moves roving focus and selects
          td.addEventListener('click', () => {
            focusCell(rowPos, colIndex);
          });

          rowElement.appendChild(td);
        });

        tbody.appendChild(rowElement);
      });
    }

    table.appendChild(tbody);
    tableWrapper.appendChild(table);

    // SECTION 3: Pagination Navigation (Zero Div-Soup)
    const paginationFooter = document.createElement('footer');
    paginationFooter.className = 'datagrid-pagination';
    paginationFooter.setAttribute('aria-label', `${state.ariaLabel} pagination`);

    const pageSummary = document.createElement('p');
    pageSummary.className = 'pagination-summary';
    const startRecordNum = totalRecords === 0 ? 0 : startIndex + 1;
    const endRecordNum = Math.min(totalRecords, startIndex + state.pageSize);
    pageSummary.innerHTML = `Showing <strong>${startRecordNum}–${endRecordNum}</strong> of <strong>${totalRecords}</strong> records (Page ${state.currentPage} of ${totalPages})`;

    const pageNav = document.createElement('nav');
    pageNav.className = 'pagination-controls';
    pageNav.setAttribute('aria-label', 'Pagination control buttons');

    // First Page Button
    const firstBtn = document.createElement('button');
    firstBtn.type = 'button';
    firstBtn.className = 'page-btn';
    firstBtn.setAttribute('aria-label', 'Go to first page');
    firstBtn.textContent = '«';
    firstBtn.disabled = state.currentPage === 1;
    firstBtn.addEventListener('click', () => {
      state.currentPage = 1;
      render();
      announce('Navigated to first page');
    });

    // Previous Page Button
    const prevBtn = document.createElement('button');
    prevBtn.type = 'button';
    prevBtn.className = 'page-btn';
    prevBtn.setAttribute('aria-label', 'Go to previous page');
    prevBtn.textContent = '‹';
    prevBtn.disabled = state.currentPage === 1;
    prevBtn.addEventListener('click', () => {
      state.currentPage = Math.max(1, state.currentPage - 1);
      render();
      announce(`Navigated to page ${state.currentPage}`);
    });

    pageNav.appendChild(firstBtn);
    pageNav.appendChild(prevBtn);

    // Page Number Buttons (Show window around current page)
    const windowStart = Math.max(1, state.currentPage - 2);
    const windowEnd = Math.min(totalPages, windowStart + 4);

    for (let p = windowStart; p <= windowEnd; p++) {
      const pageBtn = document.createElement('button');
      pageBtn.type = 'button';
      pageBtn.className = p === state.currentPage ? 'page-btn active-page' : 'page-btn';
      pageBtn.textContent = String(p);
      pageBtn.setAttribute('aria-label', `Page ${p}`);
      if (p === state.currentPage) {
        pageBtn.setAttribute('aria-current', 'page');
      }
      const targetPage = p;
      pageBtn.addEventListener('click', () => {
        state.currentPage = targetPage;
        render();
        announce(`Navigated to page ${targetPage}`);
      });
      pageNav.appendChild(pageBtn);
    }

    // Next Page Button
    const nextBtn = document.createElement('button');
    nextBtn.type = 'button';
    nextBtn.className = 'page-btn';
    nextBtn.setAttribute('aria-label', 'Go to next page');
    nextBtn.textContent = '›';
    nextBtn.disabled = state.currentPage === totalPages;
    nextBtn.addEventListener('click', () => {
      state.currentPage = Math.min(totalPages, state.currentPage + 1);
      render();
      announce(`Navigated to page ${state.currentPage}`);
    });

    // Last Page Button
    const lastBtn = document.createElement('button');
    lastBtn.type = 'button';
    lastBtn.className = 'page-btn';
    lastBtn.setAttribute('aria-label', 'Go to last page');
    lastBtn.textContent = '»';
    lastBtn.disabled = state.currentPage === totalPages;
    lastBtn.addEventListener('click', () => {
      state.currentPage = totalPages;
      render();
      announce(`Navigated to last page (${totalPages})`);
    });

    pageNav.appendChild(nextBtn);
    pageNav.appendChild(lastBtn);

    paginationFooter.appendChild(pageSummary);
    paginationFooter.appendChild(pageNav);

    // Mount everything into container (100% Zero Div-Soup)
    container.appendChild(toolbar);
    container.appendChild(tableWrapper);
    container.appendChild(paginationFooter);

    // Attach W3C APG Grid Keyboard Navigation Hub
    attachGridKeyboardHandler(table, paginatedData, numRows, numCols);
  }

  // 5. Focus a cell and update Roving Tabindex
  function focusCell(r, c) {
    state.focusedCell.rowIndex = r;
    state.focusedCell.colIndex = c;

    // Remove tabindex=0 from previous cells, set on target cell
    const cells = container.querySelectorAll('[role="grid"] [tabindex]');
    cells.forEach((cell) => {
      cell.tabIndex = -1;
    });

    const target = container.querySelector(`[role="grid"] [data-row="${r}"][data-col="${c}"]`);
    if (target) {
      target.tabIndex = 0;
      target.focus();
    }
  }

  // 6. W3C APG 2D Grid Keyboard Navigation Controller
  function attachGridKeyboardHandler(table, paginatedData, numRows, numCols) {
    table.addEventListener('keydown', (e) => {
      const activeEl = document.activeElement;
      if (!activeEl || !table.contains(activeEl)) return;

      const r = Number(activeEl.dataset.row);
      const c = Number(activeEl.dataset.col);

      if (isNaN(r) || isNaN(c)) return;

      let nextR = r;
      let nextC = c;
      let handled = false;

      switch (e.key) {
        case 'ArrowRight':
          nextC = Math.min(numCols - 1, c + 1);
          handled = true;
          break;

        case 'ArrowLeft':
          nextC = Math.max(0, c - 1);
          handled = true;
          break;

        case 'ArrowDown':
          nextR = Math.min(numRows, r + 1);
          handled = true;
          break;

        case 'ArrowUp':
          nextR = Math.max(0, r - 1);
          handled = true;
          break;

        case 'Home':
          if (e.ctrlKey) {
            nextR = 0;
            nextC = 0;
          } else {
            nextC = 0;
          }
          handled = true;
          break;

        case 'End':
          if (e.ctrlKey) {
            nextR = numRows;
            nextC = numCols - 1;
          } else {
            nextC = numCols - 1;
          }
          handled = true;
          break;

        case 'PageDown':
          state.currentPage = Math.min(
            Math.ceil(getProcessedData().length / state.pageSize),
            state.currentPage + 1
          );
          render();
          focusCell(r, c);
          handled = true;
          break;

        case 'PageUp':
          state.currentPage = Math.max(1, state.currentPage - 1);
          render();
          focusCell(r, c);
          handled = true;
          break;

        case 'Enter':
          // Enter selects the row
          if (r > 0 && r <= paginatedData.length) {
            const currentItem = paginatedData[r - 1];
            if (state.onRowSelect) {
              state.onRowSelect(currentItem);
            }
            announce(`Activated row for ${currentItem.fullName || 'student'}`);
            handled = true;
          } else if (r === 0) {
            // Sort column if header button focused
            const btn = activeEl.querySelector('button');
            if (btn) btn.click();
            handled = true;
          }
          break;

        case ' ':
          // Space toggles row selection
          if (r > 0 && r <= paginatedData.length) {
            const currentItem = paginatedData[r - 1];
            const itemId = currentItem.id || currentItem;
            if (state.selectedIds.has(itemId)) {
              state.selectedIds.delete(itemId);
              announce(`Deselected ${currentItem.fullName || 'row'}`);
            } else {
              state.selectedIds.add(itemId);
              announce(`Selected ${currentItem.fullName || 'row'}`);
            }
            if (state.onRowSelect) {
              state.onRowSelect(currentItem);
            }
            render();
            focusCell(r, c);
            handled = true;
          } else if (r === 0) {
            // Space on header toggles selection or sort
            const btn = activeEl.querySelector('button');
            if (btn) btn.click();
            handled = true;
          }
          break;
      }

      if (handled) {
        e.preventDefault();
        e.stopPropagation();
        focusCell(nextR, nextC);
      }
    });
  }

  // Initial render
  render();

  // Return public API controller
  return {
    getState: () => ({ ...state }),
    setData: (newData) => {
      state.allData = [...newData];
      state.currentPage = 1;
      render();
    },
    setFilter: (query) => {
      state.filterQuery = query;
      state.currentPage = 1;
      render();
    },
    setSort: (key, direction) => {
      state.sortKey = key;
      state.sortDirection = direction;
      render();
    },
    getSelectedRows: () => {
      return state.allData.filter((item) => state.selectedIds.has(item.id || item));
    },
    refresh: () => render()
  };
}
