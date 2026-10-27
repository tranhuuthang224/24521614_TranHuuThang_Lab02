/**
 * Automated Verification Test Suite for HW 2: Concurrent FIFO Audio Queue & Visualizer Engine
 * 
 * Tests:
 * 1. FIFO Queue Execution Order & Concurrency Mutex
 * 2. AbortController Cancellation (Active task abort without deadlock)
 * 3. Specific Task Cancellation & Queue Clear
 * 4. Memory Safety: Explicit AudioBufferSourceNode.disconnect() verification
 * 5. FFT Size Configuration & Range Guards
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { AudioTaskQueue } from './audio-queue-controller.js';
import { AudioEngine } from './audio-engine.js';

// --- Lightweight Headless Web Audio Mock ---
class MockAudioBuffer {
  constructor(duration = 5) {
    this.duration = duration;
    this.sampleRate = 44100;
    this.numberOfChannels = 2;
  }
}

class MockAudioBufferSourceNode {
  constructor() {
    this.buffer = null;
    this.onended = null;
    this.isConnected = false;
    this.isStopped = false;
    this.disconnectCalls = 0;
    this.stopCalls = 0;
  }

  connect(dest) {
    this.isConnected = true;
  }

  disconnect() {
    this.isConnected = false;
    this.disconnectCalls++;
  }

  start(when = 0, offset = 0) {}

  stop() {
    this.isStopped = true;
    this.stopCalls++;
  }
}

class MockAnalyserNode {
  constructor() {
    this.fftSize = 512;
    this.smoothingTimeConstant = 0.82;
    this.minDecibels = -90;
    this.maxDecibels = -10;
  }

  get frequencyBinCount() {
    return this.fftSize / 2;
  }

  connect(dest) {}
  getByteFrequencyData(array) { array.fill(120); }
  getByteTimeDomainData(array) { array.fill(128); }
}

class MockGainNode {
  constructor() {
    this.gain = {
      setValueAtTime: () => {},
      setTargetAtTime: () => {}
    };
  }
  connect(dest) {}
}

class MockAudioContext {
  constructor() {
    this.state = 'running';
    this.currentTime = 0;
    this.destination = {};
  }

  createAnalyser() {
    return new MockAnalyserNode();
  }

  createGain() {
    return new MockGainNode();
  }

  createBufferSource() {
    return new MockAudioBufferSourceNode();
  }

  async decodeAudioData(arrayBuffer) {
    // Simulate decoding delay
    await new Promise((r) => setTimeout(r, 10));
    return new MockAudioBuffer(3.5);
  }

  resume() {
    this.state = 'running';
    return Promise.resolve();
  }

  close() {
    this.state = 'closed';
    return Promise.resolve();
  }
}

// Global fetch mock helper
function setupMockFetch(urlMap = {}) {
  globalThis.fetch = async (url, options = {}) => {
    const signal = options.signal;

    return new Promise((resolve, reject) => {
      if (signal && signal.aborted) {
        return reject(new DOMException('Aborted', 'AbortError'));
      }

      const timer = setTimeout(() => {
        if (signal && signal.aborted) {
          return reject(new DOMException('Aborted', 'AbortError'));
        }
        resolve({
          ok: true,
          status: 200,
          statusText: 'OK',
          arrayBuffer: async () => new ArrayBuffer(1024)
        });
      }, urlMap[url]?.delay || 15);

      if (signal) {
        signal.addEventListener('abort', () => {
          clearTimeout(timer);
          reject(new DOMException('Aborted', 'AbortError'));
        });
      }
    });
  };
}

test('Task 2.1 - 2.2: FIFO Queue ordering and concurrency mutex', async () => {
  setupMockFetch({
    'track1.wav': { delay: 25 },
    'track2.wav': { delay: 10 },
    'track3.wav': { delay: 5 }
  });

  const ctx = new MockAudioContext();
  const queue = new AudioTaskQueue(ctx);
  const resolvedOrder = [];

  // Enqueue 3 tracks simultaneously
  const p1 = queue.enqueue('track1.wav', { title: 'Track 1' }).then((buf) => {
    resolvedOrder.push(1);
    return buf;
  });

  const p2 = queue.enqueue('track2.wav', { title: 'Track 2' }).then((buf) => {
    resolvedOrder.push(2);
    return buf;
  });

  const p3 = queue.enqueue('track3.wav', { title: 'Track 3' }).then((buf) => {
    resolvedOrder.push(3);
    return buf;
  });

  // Verify that isProcessing lock is engaged immediately
  assert.equal(queue.isProcessing, true);

  await Promise.all([p1, p2, p3]);

  // CRITICAL INVARIANT: Despite track2 and track3 having shorter network delays,
  // FIFO guarantees track 1 resolves -> track 2 resolves -> track 3 resolves!
  assert.deepEqual(resolvedOrder, [1, 2, 3], 'FIFO Execution order violated!');
  assert.equal(queue.isProcessing, false);
  assert.equal(queue.queue.length, 0);
});

test('Task 2.3: AbortController cancellation of in-flight task without deadlock', async () => {
  setupMockFetch({
    'slow-track.wav': { delay: 60 },
    'fast-track.wav': { delay: 10 }
  });

  const ctx = new MockAudioContext();
  const queue = new AudioTaskQueue(ctx);

  const p1 = queue.enqueue('slow-track.wav', { title: 'Slow Track' });
  const p2 = queue.enqueue('fast-track.wav', { title: 'Fast Track' });

  // Wait 15ms so slow-track is actively downloading
  await new Promise((r) => setTimeout(r, 15));

  // User hits 'Skip' or 'Cancel'
  queue.cancelCurrent();

  // Task 1 must reject with AbortError
  await assert.rejects(p1, (err) => {
    return err.name === 'AbortError';
  }, 'Cancelled in-flight task did not reject with AbortError');

  // Task 2 MUST NOT be blocked; it must continue and resolve cleanly!
  const buf2 = await p2;
  assert.notEqual(buf2, null);
  assert.equal(buf2.duration, 3.5);
  assert.equal(queue.isProcessing, false);
});

test('Task 2.3: cancelTask and clearQueue operations', async () => {
  setupMockFetch();
  const ctx = new MockAudioContext();
  const queue = new AudioTaskQueue(ctx);

  const p1 = queue.enqueue('track1.wav');
  const p2 = queue.enqueue('track2.wav');
  const p3 = queue.enqueue('track3.wav');

  // Cancel pending task 3 from queue
  const state = queue.getState();
  const task3 = state.queue.find((t) => t.trackUrl === 'track3.wav');
  assert.notEqual(task3, undefined);

  queue.cancelTask(task3.id);
  await assert.rejects(p3, (err) => err.name === 'AbortError');

  // Clear entire queue
  queue.clearQueue();
  await assert.rejects(p1, (err) => err.name === 'AbortError');
  await assert.rejects(p2, (err) => err.name === 'AbortError');

  assert.equal(queue.queue.length, 0);
  assert.equal(queue.isProcessing, false);
});

test('Task 2.4: AudioEngine memory safety - explicit source disconnect on finish and replace', () => {
  const engine = new AudioEngine({ fftSize: 256 });
  const mockCtx = new MockAudioContext();
  engine.ctx = mockCtx;
  engine.analyser = mockCtx.createAnalyser();
  engine.gainNode = mockCtx.createGain();

  const bufferA = new MockAudioBuffer(4);
  const bufferB = new MockAudioBuffer(5);

  // Play Track A
  engine.playBuffer(bufferA);
  const sourceA = engine.currentSource;
  assert.notEqual(sourceA, null);
  assert.equal(sourceA.isConnected, true);
  assert.equal(engine.metrics.sourcesCreated, 1);
  assert.equal(engine.metrics.activeSources, 1);

  // Interrupt and Play Track B
  engine.playBuffer(bufferB);
  const sourceB = engine.currentSource;

  // VERIFY: sourceA was explicitly disconnected to enable Garbage Collection!
  assert.equal(sourceA.isConnected, false);
  assert.equal(sourceA.disconnectCalls, 1);
  assert.equal(sourceA.stopCalls, 1);
  assert.notEqual(sourceB, sourceA);
  assert.equal(sourceB.isConnected, true);

  // Natural track finish
  sourceB.onended();
  assert.equal(sourceB.isConnected, false);
  assert.equal(sourceB.disconnectCalls, 1);
  assert.equal(engine.currentSource, null);
  assert.equal(engine.metrics.activeSources, 0);
});

test('Task 2.4: FFT Size configuration and range bounds', () => {
  const engine = new AudioEngine({ fftSize: 256 });
  const mockCtx = new MockAudioContext();
  engine.ctx = mockCtx;
  engine.analyser = mockCtx.createAnalyser();
  engine.setFftSize(256);

  assert.equal(engine.fftSize, 256);
  assert.equal(engine.analyser.frequencyBinCount, 128);

  // Switch to 512
  engine.setFftSize(512);
  assert.equal(engine.fftSize, 512);
  assert.equal(engine.analyser.fftSize, 512);
  assert.equal(engine.analyser.frequencyBinCount, 256);

  // Range error check
  assert.throws(() => engine.setFftSize(1024), RangeError);
  assert.throws(() => engine.setFftSize(128), RangeError);
});
