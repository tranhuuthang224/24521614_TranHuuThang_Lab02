/**
 * High-Performance 60fps Canvas Audio Visualizer
 * Driven by requestAnimationFrame, decoupled from DOM state to eliminate state thrashing.
 * Lab 02 - HW 2: Web Audio Frequency Analysis
 */

export class AudioVisualizer {
  /**
   * @param {HTMLCanvasElement} canvas - Target Canvas DOM element
   * @param {import('./audio-engine.js').AudioEngine} audioEngine - Audio engine instance
   */
  constructor(canvas, audioEngine) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.audioEngine = audioEngine;

    // Visualizer Modes: 'bars' | 'waveform' | 'radial'
    this.mode = 'bars';
    this.isRunning = false;
    this.rafId = null;

    // Performance & FPS telemetry
    this.fps = 60;
    this.lastFrameTime = performance.now();
    this.frameCount = 0;
    this.droppedFrames = 0;

    // Pre-allocated typed arrays (Reused across all 60fps frames to avoid GC churn)
    this.bufferLength = 256;
    this.freqData = new Uint8Array(this.bufferLength);
    this.timeData = new Uint8Array(this.bufferLength);
    this.peakLevels = new Float32Array(this.bufferLength); // Peak level drop physics

    // Resize handling
    this.handleResize = this.handleResize.bind(this);
    window.addEventListener('resize', this.handleResize);
    this.handleResize();
  }

  /**
   * Adapts canvas resolution to device pixel ratio for ultra-crisp HiDPI rendering
   */
  handleResize() {
    const dpr = window.devicePixelRatio || 1;
    const rect = this.canvas.getBoundingClientRect();
    const width = rect.width || 800;
    const height = rect.height || 320;

    this.canvas.width = Math.floor(width * dpr);
    this.canvas.height = Math.floor(height * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.displayWidth = width;
    this.displayHeight = height;
  }

  /**
   * Switch visualizer rendering style
   * @param {'bars' | 'waveform' | 'radial'} newMode
   */
  setMode(newMode) {
    this.mode = newMode;
  }

  /**
   * Starts the 60fps requestAnimationFrame loop
   */
  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    this.lastFrameTime = performance.now();
    this.frameCount = 0;
    this.loop = this.loop.bind(this);
    this.rafId = requestAnimationFrame(this.loop);
  }

  /**
   * Stops the render loop
   */
  stop() {
    this.isRunning = false;
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  /**
   * Primary 60fps render loop
   * @param {number} now
   */
  loop(now) {
    if (!this.isRunning) return;

    // Calculate FPS and frame delta
    const delta = now - this.lastFrameTime;
    this.lastFrameTime = now;
    this.frameCount++;

    if (delta > 24) {
      this.droppedFrames++;
    }
    // Exponential smoothing for FPS
    if (delta > 0) {
      const instantFps = 1000 / delta;
      this.fps = this.fps * 0.9 + instantFps * 0.1;
    }

    // Ensure typed arrays match current analyser bin count
    if (this.audioEngine.analyser) {
      const binCount = this.audioEngine.analyser.frequencyBinCount;
      if (this.bufferLength !== binCount) {
        this.bufferLength = binCount;
        this.freqData = new Uint8Array(binCount);
        this.timeData = new Uint8Array(binCount);
        this.peakLevels = new Float32Array(binCount);
      }
    }

    // Direct memory read from Web Audio Analyser (ZERO state thrashing!)
    this.audioEngine.getByteFrequencyData(this.freqData);
    this.audioEngine.getByteTimeDomainData(this.timeData);

    // Clear canvas
    const w = this.displayWidth;
    const h = this.displayHeight;
    this.ctx.clearRect(0, 0, w, h);

    // Draw active visualization
    if (this.mode === 'bars') {
      this.renderBars(w, h);
    } else if (this.mode === 'waveform') {
      this.renderWaveform(w, h);
    } else if (this.mode === 'radial') {
      this.renderRadial(w, h);
    }

    this.rafId = requestAnimationFrame(this.loop);
  }

  /**
   * Mode 1: Cyberpunk Neon Frequency Spectrum with Gravity Peaks
   */
  renderBars(w, h) {
    const ctx = this.ctx;
    const numBars = Math.min(this.bufferLength, 96); // Keep bars crisp and readable
    const barSpacing = 3;
    const totalSpacing = barSpacing * (numBars - 1);
    const barWidth = Math.max(2, (w - totalSpacing) / numBars);

    // Background gradient glow
    const bgGradient = ctx.createLinearGradient(0, 0, 0, h);
    bgGradient.addColorStop(0, 'rgba(15, 23, 42, 0.4)');
    bgGradient.addColorStop(1, 'rgba(2, 6, 23, 0.9)');
    ctx.fillStyle = bgGradient;
    ctx.fillRect(0, 0, w, h);

    // Frequency Bar Gradient
    const barGradient = ctx.createLinearGradient(0, h, 0, 0);
    barGradient.addColorStop(0, '#06b6d4');   // Neon Cyan
    barGradient.addColorStop(0.5, '#8b5cf6'); // Purple
    barGradient.addColorStop(1, '#ec4899');   // Hot Pink

    for (let i = 0; i < numBars; i++) {
      // Map index into lower/mid frequencies for better musical spread
      const sampleIdx = Math.floor(Math.pow(i / numBars, 1.25) * (this.bufferLength * 0.85));
      const val = this.freqData[sampleIdx] || 0;
      const barHeight = Math.max(3, (val / 255) * (h - 20));
      const x = i * (barWidth + barSpacing);
      const y = h - barHeight;

      // Draw Main Bar
      ctx.fillStyle = barGradient;
      ctx.shadowBlur = val > 160 ? 12 : 0;
      ctx.shadowColor = '#ec4899';
      ctx.fillRect(x, y, barWidth, barHeight);

      // Physics-based Peak Meter (Peak level drops with gravity)
      if (barHeight > this.peakLevels[i]) {
        this.peakLevels[i] = barHeight;
      } else {
        this.peakLevels[i] = Math.max(0, this.peakLevels[i] - 1.8);
      }

      // Draw Floating Peak Dot
      const peakY = h - this.peakLevels[i] - 3;
      ctx.fillStyle = '#f8fafc';
      ctx.shadowBlur = 6;
      ctx.shadowColor = '#38bdf8';
      ctx.fillRect(x, Math.max(0, peakY), barWidth, 2);
    }

    ctx.shadowBlur = 0; // Reset shadow for next frame
  }

  /**
   * Mode 2: Real-time Oscilloscope Waveform Line
   */
  renderWaveform(w, h) {
    const ctx = this.ctx;
    ctx.fillStyle = 'rgba(2, 6, 23, 0.85)';
    ctx.fillRect(0, 0, w, h);

    ctx.lineWidth = 2.5;
    ctx.strokeStyle = '#38bdf8';
    ctx.shadowBlur = 14;
    ctx.shadowColor = '#0284c7';

    ctx.beginPath();
    const sliceWidth = w / this.bufferLength;
    let x = 0;

    for (let i = 0; i < this.bufferLength; i++) {
      const v = this.timeData[i] / 128.0; // 128 is center
      const y = (v * h) / 2;

      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
      x += sliceWidth;
    }

    ctx.stroke();
    ctx.shadowBlur = 0;
  }

  /**
   * Mode 3: Circular Radial Pulsing Visualizer
   */
  renderRadial(w, h) {
    const ctx = this.ctx;
    const centerX = w / 2;
    const centerY = h / 2;
    const baseRadius = Math.min(w, h) * 0.22;
    const numPoints = Math.min(this.bufferLength, 80);

    ctx.fillStyle = 'rgba(2, 6, 23, 0.85)';
    ctx.fillRect(0, 0, w, h);

    ctx.save();
    ctx.translate(centerX, centerY);

    // Inner glowing ring
    ctx.beginPath();
    ctx.arc(0, 0, baseRadius, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.4)';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Radiating frequency spikes
    for (let i = 0; i < numPoints; i++) {
      const angle = (i / numPoints) * Math.PI * 2;
      const val = this.freqData[i % this.bufferLength] || 0;
      const spikeLength = (val / 255) * (Math.min(w, h) * 0.25);

      const x1 = Math.cos(angle) * baseRadius;
      const y1 = Math.sin(angle) * baseRadius;
      const x2 = Math.cos(angle) * (baseRadius + spikeLength);
      const y2 = Math.sin(angle) * (baseRadius + spikeLength);

      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.strokeStyle = `hsl(${(i / numPoints) * 280 + 160}, 100%, 65%)`;
      ctx.lineWidth = 3;
      ctx.stroke();
    }

    ctx.restore();
  }

  /**
   * Teardown visualizer and unbind listeners
   */
  destroy() {
    this.stop();
    window.removeEventListener('resize', this.handleResize);
  }
}
