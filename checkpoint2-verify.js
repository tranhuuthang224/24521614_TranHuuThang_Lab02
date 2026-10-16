/**
 * Checkpoint 2 Verification & Live Audit Script
 * Lab 02 - Exercise 2: Reactive State Machine & Delegation Hub
 */

import { useState, renderApp } from './reactive-engine.js';
import { TaskApp } from './task-app.js';

/**
 * Slide 21 Exact Checkpoint Verification Component
 */
export function Checkpoint2SimpleApp() {
  const [tasks, setTasks] = useState(['Review PR', 'Verify AST']);
  const [filter, setFilter] = useState('ALL');

  return {
    type: 'main',
    props: {
      className: 'app-container',
      children: [
        {
          type: 'header',
          props: {
            children: [
              {
                type: 'h2',
                props: {
                  children: [
                    {
                      type: 'TEXT_ELEMENT',
                      props: { nodeValue: `Tasks: ${tasks.length}`, children: [] }
                    }
                  ]
                }
              }
            ]
          }
        },
        {
          type: 'button',
          props: {
            id: 'checkpoint-add-btn',
            onClick: () => setTasks([...tasks, `Task ${Date.now()}`]),
            children: [
              {
                type: 'TEXT_ELEMENT',
                props: { nodeValue: 'Add Task', children: [] }
              }
            ]
          }
        }
      ]
    }
  };
}

/**
 * Mount the full Reactive Task Manager to #app
 */
export function initApp() {
  const root = document.getElementById('app');
  if (!root) {
    console.error('[initApp] Mounting target #app not found');
    return;
  }

  // Mount via reactive-engine renderApp
  renderApp(TaskApp, root);

  console.log('%c[Exercise 2: Reactive State Machine Mounted]', 'color: #38bdf8; font-weight: bold;');
  console.log('Centralized root event delegation active on #app.');
  console.log('Button children have 0 direct event listeners (inspect via getEventListeners(btn)).');
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
  } else {
    initApp();
  }
}
