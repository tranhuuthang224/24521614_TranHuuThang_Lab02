/**
 * Concurrent FIFO Audio Visualizer Queue Engine
 * Advanced async concurrency controller with AbortController cancellation.
 * Lab 02 - HW 2: Web Audio API & Concurrency Control
 */

/**
 * @typedef {'PENDING' | 'DOWNLOADING' | 'DECODING' | 'READY' | 'ABORTED' | 'ERROR'} TaskStatus
 */

/**
 * @typedef {Object} AudioTask
 * @property {string} id - Unique task identifier
 * @property {string} trackUrl - URL or blob URL of the audio file
 * @property {string} title - Display title of the track
 * @property {string} [artist] - Artist name
 * @property {AbortController} controller - AbortController instance for cancellation
 * @property {(buffer: AudioBuffer) => void} resolve - Promise resolution callback
 * @property {(reason: any) => void} reject - Promise rejection callback
 * @property {TaskStatus} status - Current lifecycle status
 * @property {number} createdAt - Timestamp when task was enqueued
 * @property {number} [duration] - Track duration in seconds
 * @property {string} [error] - Error message if failed
 */

export class AudioTaskQueue {
  /**
   * @param {AudioContext} [audioContext] - Web Audio API AudioContext instance
   */
  constructor(audioContext) {
    this.audioContext = audioContext || null;
    /** @type {AudioTask[]} */
    this.queue = [];
    this.isProcessing = false;
    /** @type {AudioTask | null} */
    this.activeTask = null;
    /** @type {Set<(state: { queue: AudioTask[], activeTask: AudioTask | null, isProcessing: boolean }) => void>} */
    this.listeners = new Set();
  }

  /**
   * Set or update AudioContext instance
   * @param {AudioContext} ctx
   */
  setAudioContext(ctx) {
    this.audioContext = ctx;
  }

  /**
   * Enqueue a new audio track for sequential download and decoding.
   * Concurrency invariant: Strictly FIFO with AbortController cancellation token.
   * 
   * @param {string} trackUrl - Target URL or Blob URI
   * @param {Object} [metadata] - Optional track metadata (title, artist, duration)
   * @returns {Promise<AudioBuffer>}
   */
  async enqueue(trackUrl, metadata = {}) {
    if (!trackUrl || typeof trackUrl !== 'string') {
      throw new TypeError('[AudioTaskQueue] trackUrl must be a non-empty string.');
    }

    const controller = new AbortController();
    const id = `task-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

    return new Promise((resolve, reject) => {
      /** @type {AudioTask} */
      const task = {
        id,
        trackUrl,
        title: metadata.title || `Track ${this.queue.length + 1}`,
        artist: metadata.artist || 'Procedural Audio',
        controller,
        resolve,
        reject,
        status: 'PENDING',
        createdAt: Date.now(),
        duration: metadata.duration
      };

      this.queue.push(task);
      this._notify();
      this.processNext();
    });
  }

  /**
   * Concurrency Controller: Processes the next FIFO task in queue.
   * Guarantees mutex execution via `isProcessing` lock.
   */
  async processNext() {
    if (this.isProcessing || this.queue.length === 0) {
      return;
    }

    this.isProcessing = true;
    this.activeTask = this.queue.shift();
    this._notify();

    const task = this.activeTask;

    try {
      // Step 1: Pre-execution cancellation check
      if (task.controller.signal.aborted) {
        throw new DOMException('Task was aborted before network request.', 'AbortError');
      }

      // Step 2: Fetch raw audio ArrayBuffer with AbortSignal
      task.status = 'DOWNLOADING';
      this._notify();

      const response = await fetch(task.trackUrl, {
        signal: task.controller.signal
      });

      if (!response.ok) {
        throw new Error(`HTTP Error ${response.status}: ${response.statusText}`);
      }

      const rawArrayBuffer = await response.arrayBuffer();

      // Step 3: Check cancellation between download and decoding
      if (task.controller.signal.aborted) {
        throw new DOMException('Task was aborted before audio decoding.', 'AbortError');
      }

      // Step 4: Decode audio into native AudioBuffer
      task.status = 'DECODING';
      this._notify();

      if (!this.audioContext) {
        throw new Error('[AudioTaskQueue] AudioContext is not initialized.');
      }

      // Standard AudioContext.decodeAudioData (cloning ArrayBuffer prevents detached buffer errors)
      const bufferCopy = rawArrayBuffer.slice(0);
      const audioBuffer = await this.audioContext.decodeAudioData(bufferCopy);

      task.status = 'READY';
      task.duration = audioBuffer.duration;
      this._notify();

      task.resolve(audioBuffer);

    } catch (err) {
      const isAbort = err.name === 'AbortError' || task.controller.signal.aborted;
      task.status = isAbort ? 'ABORTED' : 'ERROR';
      task.error = err.message || String(err);
      this._notify();

      task.reject(err);
    } finally {
      this.activeTask = null;
      this.isProcessing = false;
      this._notify();

      // Recurse to next task in FIFO sequence
      this.processNext();
    }
  }

  /**
   * Aborts the currently in-flight download or decode task.
   */
  cancelCurrent() {
    if (this.activeTask && this.activeTask.controller) {
      this.activeTask.controller.abort();
    }
  }

  /**
   * Cancels a specific task by ID (either active or pending in queue).
   * @param {string} taskId
   */
  cancelTask(taskId) {
    if (this.activeTask && this.activeTask.id === taskId) {
      this.cancelCurrent();
      return true;
    }

    const pendingIndex = this.queue.findIndex((t) => t.id === taskId);
    if (pendingIndex !== -1) {
      const [removedTask] = this.queue.splice(pendingIndex, 1);
      removedTask.status = 'ABORTED';
      removedTask.reject(new DOMException('Task cancelled from queue.', 'AbortError'));
      this._notify();
      return true;
    }

    return false;
  }

  /**
   * Clears all pending tasks and aborts the active task.
   */
  clearQueue() {
    this.cancelCurrent();

    while (this.queue.length > 0) {
      const task = this.queue.shift();
      task.status = 'ABORTED';
      task.reject(new DOMException('Queue was cleared.', 'AbortError'));
    }

    this._notify();
  }

  /**
   * Subscribe to queue state updates (reactive listener).
   * @param {(state: { queue: AudioTask[], activeTask: AudioTask | null, isProcessing: boolean }) => void} callback
   * @returns {() => void} Unsubscribe function
   */
  subscribe(callback) {
    this.listeners.add(callback);
    callback(this.getState());
    return () => {
      this.listeners.delete(callback);
    };
  }

  /**
   * Get an immutable snapshot of queue state.
   */
  getState() {
    return {
      queue: [...this.queue],
      activeTask: this.activeTask ? { ...this.activeTask } : null,
      isProcessing: this.isProcessing
    };
  }

  /**
   * Internal notification dispatcher
   */
  _notify() {
    const state = this.getState();
    this.listeners.forEach((listener) => {
      try {
        listener(state);
      } catch (err) {
        console.error('[AudioTaskQueue] Error in queue listener:', err);
      }
    });
  }
}
