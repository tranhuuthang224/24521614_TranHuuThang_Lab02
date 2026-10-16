/**
 * Reactive Task Manager Component with Dynamic Filter Toggles
 * Lab 02 - Exercise 2: Reactive State Machine & Delegation Hub
 * 
 * Strict Constraints: Zero div-soup, root event delegation, unidirectional data flow.
 */

import { createElement } from './mini-react.js';
import { useState } from './reactive-engine.js';

/**
 * Filter Constants
 */
export const FILTERS = {
  ALL: 'ALL',
  ACTIVE: 'ACTIVE',
  COMPLETED: 'COMPLETED'
};

/**
 * Normalizes task items into consistent state objects.
 */
function normalizeTask(task, index) {
  if (typeof task === 'string') {
    return {
      id: `task-${index}-${task.replace(/\s+/g, '-').toLowerCase()}`,
      text: task,
      completed: false
    };
  }
  return task;
}

/**
 * Reactive Task Manager Component (Slide 21 Checkpoint & Application)
 */
export function TaskApp() {
  // State 1: Task Items list (Initial tasks matching Slide 21)
  const [tasks, setTasks] = useState([
    { id: 'task-1', text: 'Review PR', completed: false },
    { id: 'task-2', text: 'Verify AST', completed: true }
  ]);

  // State 2: Dynamic Filter Toggle ('ALL' | 'ACTIVE' | 'COMPLETED')
  const [filter, setFilter] = useState(FILTERS.ALL);

  // State 3: Controlled input buffer
  const [draftText, setDraftText] = useState('');

  // Normalize tasks to ensure object structure
  const normalizedTasks = tasks.map(normalizeTask);

  // Derived State: Filtered tasks
  const visibleTasks = normalizedTasks.filter((t) => {
    if (filter === FILTERS.ACTIVE) return !t.completed;
    if (filter === FILTERS.COMPLETED) return t.completed;
    return true;
  });

  // Action handlers
  const handleAddTask = () => {
    const title = draftText.trim() || `Task ${Date.now().toString().slice(-4)}`;
    const newTask = {
      id: `task-${Date.now()}`,
      text: title,
      completed: false
    };
    setTasks([...normalizedTasks, newTask]);
    setDraftText('');
  };

  const handleToggleTask = (taskId) => {
    setTasks(
      normalizedTasks.map((t) =>
        t.id === taskId ? { ...t, completed: !t.completed } : t
      )
    );
  };

  const handleDeleteTask = (taskId) => {
    setTasks(normalizedTasks.filter((t) => t.id !== taskId));
  };

  // Construct Semantic VNode Tree (Zero Div-Soup)
  return createElement(
    'main',
    { className: 'app-container', role: 'main', id: 'task-manager' },

    // Header section
    createElement(
      'header',
      { className: 'task-header' },
      createElement('h2', null, `Tasks: ${normalizedTasks.length}`),
      createElement(
        'p',
        { className: 'subtitle' },
        `Active: ${normalizedTasks.filter((t) => !t.completed).length} | Completed: ${
          normalizedTasks.filter((t) => t.completed).length
        }`
      )
    ),

    // Filter controls section
    createElement(
      'section',
      { className: 'filter-bar', 'aria-label': 'Filter tasks' },
      createElement(
        'button',
        {
          className: filter === FILTERS.ALL ? 'filter-btn active' : 'filter-btn',
          onClick: () => setFilter(FILTERS.ALL)
        },
        'All'
      ),
      createElement(
        'button',
        {
          className: filter === FILTERS.ACTIVE ? 'filter-btn active' : 'filter-btn',
          onClick: () => setFilter(FILTERS.ACTIVE)
        },
        'Active'
      ),
      createElement(
        'button',
        {
          className: filter === FILTERS.COMPLETED ? 'filter-btn active' : 'filter-btn',
          onClick: () => setFilter(FILTERS.COMPLETED)
        },
        'Completed'
      )
    ),

    // Task Creation Form Section
    createElement(
      'section',
      { className: 'task-input-bar' },
      createElement('input', {
        type: 'text',
        placeholder: 'Enter new task title...',
        value: draftText,
        onInput: (e) => setDraftText(e.target.value),
        onKeydown: (e) => {
          if (e.key === 'Enter') handleAddTask();
        }
      }),
      createElement(
        'button',
        {
          id: 'add-task-btn',
          className: 'primary-btn',
          onClick: handleAddTask
        },
        'Add Task'
      )
    ),

    // Task List Section
    createElement(
      'section',
      { className: 'task-list-section' },
      visibleTasks.length === 0
        ? createElement('p', { className: 'empty-msg' }, 'No tasks in this view.')
        : createElement(
            'ul',
            { className: 'task-list' },
            ...visibleTasks.map((t) =>
              createElement(
                'li',
                {
                  key: t.id,
                  className: t.completed ? 'task-item completed' : 'task-item'
                },
                createElement(
                  'button',
                  {
                    className: 'toggle-btn',
                    onClick: () => handleToggleTask(t.id)
                  },
                  t.completed ? '✓' : '○'
                ),
                createElement('span', { className: 'task-title' }, t.text),
                createElement(
                  'button',
                  {
                    className: 'delete-btn',
                    onClick: () => handleDeleteTask(t.id)
                  },
                  '✕'
                )
              )
            )
          )
    )
  );
}
