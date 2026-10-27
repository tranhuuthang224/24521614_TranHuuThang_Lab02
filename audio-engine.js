/**
 * Web Audio Engine & Lifecycle Manager
 * Handles AudioContext, AnalyserNode (FFT 256/512), GainNode, and zero-leak source cleanup.
 * Lab 02 - HW 2: Web Audio API Integration
 */

export class AudioEngine {
  /**
   * @param {Object} [options]
   * @param {number} [options.fftSize=512] - FFT size (256 or 512 bins)
   * @param {number} [options.smoothingTimeConstant=0.82] - Smoothing factor
   */
  constructor(options = {}) {
    this.fftSize = options.fftSize || 512;
    this.smoothingTimeConstant = options.smoothingTimeConstant ?? 0.82;

    this.ctx = null;
    this.analyser = null;
    this.gainNode = null;
    this.currentSource = null;
    this.isPlaying = false;
    this.isPaused = false;
    this.startTime = 0;
    this.pausedAt = 0;
    this.currentBuffer = null;

    // Verifiable Memory & GC Metrics
    this.metrics = {
      sourcesCreated: 0,
      sourcesCleanedUp: 0,
      activeSources: 0
    };

    /** @type {Set<(state: { isPlaying: boolean, isPaused: boolean, currentTime: number, duration: number }) => void>} */
    this.playbackListeners = new Set();
  }

  /**
   * Initializes AudioContext upon user gesture (Chrome Autoplay policy compliance)
   */
  ensureContext() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioCtx();

      // Configure AnalyserNode
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = this.fftSize;
      this.analyser.smoothingTimeConstant = this.smoothingTimeConstant;
      this.analyser.minDecibels = -90;
      this.analyser.maxDecibels = -10;

      // Configure GainNode (Volume)
      this.gainNode = this.ctx.createGain();
      this.gainNode.gain.setValueAtTime(0.8, this.ctx.currentTime);

      // Connect: Analyser -> Gain -> Speakers
      this.analyser.connect(this.gainNode);
      this.gainNode.connect(this.ctx.destination);
    }

    if (this.ctx.state === 'suspended') {
      return this.ctx.resume();
    }

    return Promise.resolve();
  }

  /**
   * Reconfigures FFT resolution dynamically (256 or 512 bins)
   * @param {256 | 512} newFftSize
   */
  setFftSize(newFftSize) {
    if (newFftSize !== 256 && newFftSize !== 512) {
      throw new RangeError('[AudioEngine] fftSize must be 256 or 512.');
    }
    this.fftSize = newFftSize;
    if (this.analyser) {
      this.analyser.fftSize = newFftSize;
    }
  }

  /**
   * Set playback volume
   * @param {number} level - Value in range [0.0, 1.0]
   */
  setVolume(level) {
    const clamped = Math.max(0, Math.min(1, Number(level)));
    if (this.gainNode && this.ctx) {
      this.gainNode.gain.setTargetAtTime(clamped, this.ctx.currentTime, 0.05);
    }
  }

  /**
   * Plays a decoded AudioBuffer.
   * MEMORY INVARIANT: Cleans up any preceding AudioBufferSourceNode completely before connecting.
   * 
   * @param {AudioBuffer} audioBuffer
   * @param {() => void} [onEnded] - Callback when playback finishes naturally
   * @param {number} [offset=0] - Playback start offset in seconds
   */
  playBuffer(audioBuffer, onEnded = null, offset = 0) {
    this.ensureContext();

    // 1. Mandatory Memory Cleanup: Disconnect existing source
    this.stopSource();

    this.currentBuffer = audioBuffer;
    const source = this.ctx.createBufferSource();
    source.buffer = audioBuffer;

    // Connect: Source -> Analyser -> Gain -> Destination
    source.connect(this.analyser);

    this.metrics.sourcesCreated++;
    this.metrics.activeSources = 1;

    // Track finish lifecycle
    source.onended = () => {
      // Guard against stale callback if source was replaced
      if (this.currentSource === source) {
        this.stopSource();
        this.isPlaying = false;
        this.isPaused = false;
        this.pausedAt = 0;
        this._notifyPlayback();
        if (onEnded) onEnded();
      }
    };

    this.currentSource = source;
    this.startTime = this.ctx.currentTime - offset;
    this.pausedAt = 0;
    this.isPlaying = true;
    this.isPaused = false;

    source.start(0, offset);
    this._notifyPlayback();
  }

  /**
   * Explicit cleanup of AudioBufferSourceNode.
   * Guarantees zero memory leaks by severing all audio graph references.
   */
  stopSource() {
    if (this.currentSource) {
      try {
        this.currentSource.stop();
      } catch (e) {
        // Source might have already naturally stopped
      }

      // VITAL: Explicit disconnect enables Garbage Collection
      this.currentSource.disconnect();
      this.currentSource.onended = null;
      this.currentSource = null;

      this.metrics.sourcesCleanedUp++;
      this.metrics.activeSources = 0;
    }
  }

  /**
   * Pause playback (saves current position)
   */
  pause() {
    if (!this.isPlaying || this.isPaused || !this.ctx) return;
    this.pausedAt = this.ctx.currentTime - this.startTime;
    this.stopSource();
    this.isPaused = true;
    this.isPlaying = false;
    this._notifyPlayback();
  }

  /**
   * Resume playback from paused position
   * @param {() => void} [onEnded]
   */
  resume(onEnded = null) {
    if (!this.isPaused || !this.currentBuffer) return;
    this.playBuffer(this.currentBuffer, onEnded, this.pausedAt);
  }

  /**
   * Stop playback completely and reset playback position
   */
  stop() {
    this.stopSource();
    this.isPlaying = false;
    this.isPaused = false;
    this.pausedAt = 0;
    this._notifyPlayback();
  }

  /**
   * Read raw frequency data for Visualizer
   * @param {Uint8Array} targetArray
   */
  getByteFrequencyData(targetArray) {
    if (this.analyser) {
      this.analyser.getByteFrequencyData(targetArray);
    } else {
      targetArray.fill(0);
    }
  }

  /**
   * Read raw time-domain (waveform) data for Visualizer
   * @param {Uint8Array} targetArray
   */
  getByteTimeDomainData(targetArray) {
    if (this.analyser) {
      this.analyser.getByteTimeDomainData(targetArray);
    } else {
      targetArray.fill(128); // 128 is center flatline for 8-bit PCM
    }
  }

  /**
   * Subscribe to playback status updates
   * @param {(state: { isPlaying: boolean, isPaused: boolean, currentTime: number, duration: number }) => void} listener
   */
  onPlaybackChange(listener) {
    this.playbackListeners.add(listener);
    return () => this.playbackListeners.delete(listener);
  }

  _notifyPlayback() {
    const duration = this.currentBuffer ? this.currentBuffer.duration : 0;
    let currentTime = 0;
    if (this.isPaused) {
      currentTime = this.pausedAt;
    } else if (this.isPlaying && this.ctx) {
      currentTime = Math.min(duration, this.ctx.currentTime - this.startTime);
    }

    const state = {
      isPlaying: this.isPlaying,
      isPaused: this.isPaused,
      currentTime,
      duration
    };

    this.playbackListeners.forEach((l) => l(state));
  }

  /**
   * Full teardown of AudioContext
   */
  teardown() {
    this.stopSource();
    if (this.ctx && this.ctx.state !== 'closed') {
      return this.ctx.close();
    }
    return Promise.resolve();
  }
}
