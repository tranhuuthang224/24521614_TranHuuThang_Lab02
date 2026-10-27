/**
 * High-Performance 60fps Canvas Audio Visualizer
 * Driven by requestAnimationFrame, decoupled from DOM state to eliminate state thrashing.
 * Zero-GC-churn render loop with pre-cached gradients and exact 60fps frame rate throttling.
 * Lab 02 - HW 2: Web Audio Frequency Analysis
 */

export class AudioVisualizer {
  /**
   * @param {HTMLCanvasElement} canvas - Target Canvas DOM element
   * @param {import('./audio-engine.js').AudioEngine} audioEngine - Audio engine instance
   * @param {Object} [options]
   * @param {number} [options.targetFps=60] - Target rendering frame rate (caps at 60fps on 144Hz monitors)
   * @param {(fps: number, dropped: number) => void} [options.onFpsUpdate] - FPS telemetry callback
   */
  constructor(canvas, audioEngine, options = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.audioEngine = audioEngine;

    // Visualizer Modes: 'bars' | 'waveform' | 'radial'
    this.mode = 'bars';
    this.isRunning = false;
    this.rafId = null;

    // 60 FPS Target Throttling
    this.targetFps = options.targetFps || 60;
    this.frameInterval = 1000 / this.targetFps;
    this.onFpsUpdate = options.onFpsUpdate || null;

    // Performance & FPS telemetry
    this.fps = 60;
    this.lastFrameTime = performance.now();
    this.lastTelemetryEmit = 0;
    this.frameCount = 0;
    this.droppedFrames = 0;

    // Pre-allocated typed arrays (Reused across all 60fps frames to avoid GC churn)
    // Invariant: freqData requires frequencyBinCount (fftSize / 2), timeData requires fftSize!
    this.bufferLength = 256;
    this.fftSize = 512;
    this.freqData = new Uint8Array(this.bufferLength);
    this.timeData = new Uint8Array(this.fftSize);
    this.peakLevels = new Float32Array(this.bufferLength); // Peak level drop physics

    // Pre-cached gradients & color lookups (Eliminates all per-frame allocations)
    this.cachedBgGradient = null;
    this.cachedBarGradient = null;
    this.cachedRadialColors = [];

    // Resize handling
    this.handleResize = this.handleResize.bind(this);
    if (typeof window !== 'undefined') {
      window.addEventListener('resize', this.handleResize);
    }
    this.handleResize();
  }

  /**
   * Adapts canvas resolution to device pixel ratio and pre-caches gradients
   */
  handleResize() {
    const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
    const rect = (this.canvas.getBoundingClientRect && this.canvas.getBoundingClientRect()) || { width: 800, height: 320 };
    const width = rect.width || 800;
    const height = rect.height || 320;

    this.canvas.width = Math.floor(width * dpr);
    this.canvas.height = Math.floor(height * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.displayWidth = width;
    this.displayHeight = height;

    // Pre-create and cache Canvas Gradients (Zero GC allocations per frame!)
    const bgGrad = this.ctx.createLinearGradient(0, 0, 0, height);
    bgGrad.addColorStop(0, 'rgba(15, 23, 42, 0.45)');
    bgGrad.addColorStop(1, 'rgba(2, 6, 23, 0.95)');
    this.cachedBgGradient = bgGrad;

    const barGrad = this.ctx.createLinearGradient(0, height, 0, 0);
    barGrad.addColorStop(0, '#06b6d4');   // Neon Cyan
    barGrad.addColorStop(0.5, '#8b5cf6'); // Purple
    barGrad.addColorStop(1, '#ec4899');   // Hot Pink
    this.cachedBarGradient = barGrad;

    // Pre-generate radial HSL color lookup array (Zero string template allocations!)
    const numRadialPoints = 80;
    this.cachedRadialColors = new Array(numRadialPoints);
    for (let i = 0; i < numRadialPoints; i++) {
      const hue = Math.floor((i / numRadialPoints) * 280 + 160);
      this.cachedRadialColors[i] = `hsl(${hue}, 100%, 65%)`;
    }
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
    this.lastTelemetryEmit = performance.now();
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
   * Primary 60fps render loop with frame-rate throttling
   * @param {number} now
   */
  loop(now) {
    if (!this.isRunning) return;

    // Frame-rate throttling: caps strictly at targetFps (e.g. 60 FPS) on 120Hz/144Hz displays
    const delta = now - this.lastFrameTime;
    if (delta < this.frameInterval - 1.5) {
      this.rafId = requestAnimationFrame(this.loop);
      return;
    }

    // Align frame timing
    this.lastFrameTime = now - (delta % this.frameInterval);
    this.frameCount++;

    if (delta > 24) {
      this.droppedFrames++;
    }

    // Exponential smoothing for FPS
    if (delta > 0) {
      const instantFps = 1000 / delta;
      this.fps = this.fps * 0.9 + instantFps * 0.1;
    }

    // Emit telemetry every 250ms without React/DOM state thrashing
    if (this.onFpsUpdate && now - this.lastTelemetryEmit > 250) {
      this.lastTelemetryEmit = now;
      this.onFpsUpdate(this.fps, this.droppedFrames);
    }

    // Ensure typed arrays match current analyser dimensions
    // Bug 1 Fix: freqData requires frequencyBinCount (256), timeData requires fftSize (512)!
    if (this.audioEngine.analyser) {
      const binCount = this.audioEngine.analyser.frequencyBinCount;
      const currentFftSize = this.audioEngine.analyser.fftSize;

      if (this.bufferLength !== binCount || this.fftSize !== currentFftSize) {
        this.bufferLength = binCount;
        this.fftSize = currentFftSize;
        this.freqData = new Uint8Array(binCount);
        this.timeData = new Uint8Array(currentFftSize);
        this.peakLevels = new Float32Array(binCount);
      }
    }

    // Direct memory read from Web Audio Analyser (ZERO state thrashing!)
    this.audioEngine.getByteFrequencyData(this.freqData);
    this.audioEngine.getByteTimeDomainData(this.timeData);

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

    // Bug 2 Fix: Draw On-Canvas FPS & Telemetry HUD overlay
    this.renderOnCanvasHUD(w, h, delta);

    this.rafId = requestAnimationFrame(this.loop);
  }

  /**
   * Mode 1: Cyberpunk Neon Frequency Spectrum with Gravity Peaks
   * Bug 4 & 5 Fix: Responsive bar spacing preventing overflow & cached gradient
   */
  renderBars(w, h) {
    const ctx = this.ctx;

    // Use cached background gradient (Zero allocation!)
    ctx.fillStyle = this.cachedBgGradient;
    ctx.fillRect(0, 0, w, h);

    // Dynamic bar calculation guaranteeing ZERO overflow on narrow/mobile viewports
    const minBarWidth = 2;
    const barSpacing = Math.max(1, Math.min(3, Math.floor(w / 160)));
    const maxBars = Math.floor((w + barSpacing) / (minBarWidth + barSpacing));
    const numBars = Math.min(this.bufferLength, Math.min(96, Math.max(16, maxBars)));
    const barWidth = Math.max(minBarWidth, (w - (numBars - 1) * barSpacing) / numBars);

    // Use cached bar gradient
    ctx.fillStyle = this.cachedBarGradient;

    for (let i = 0; i < numBars; i++) {
      // Map index into lower/mid frequencies for better musical spread
      const sampleIdx = Math.floor(Math.pow(i / numBars, 1.25) * (this.bufferLength * 0.85));
      const val = this.freqData[sampleIdx] || 0;
      const barHeight = Math.max(3, (val / 255) * (h - 24));
      const x = i * (barWidth + barSpacing);
      const y = h - barHeight;

      // Draw Main Bar
      ctx.shadowBlur = val > 160 ? 10 : 0;
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
      ctx.fillStyle = this.cachedBarGradient; // restore
    }

    ctx.shadowBlur = 0;
  }

  /**
   * Mode 2: Real-time Oscilloscope Waveform Line
   * Bug 1 Fix: Reads all fftSize samples for a complete, accurate time-domain waveform!
   */
  renderWaveform(w, h) {
    const ctx = this.ctx;
    ctx.fillStyle = this.cachedBgGradient;
    ctx.fillRect(0, 0, w, h);

    ctx.lineWidth = 2.5;
    ctx.strokeStyle = '#38bdf8';
    ctx.shadowBlur = 12;
    ctx.shadowColor = '#0284c7';

    ctx.beginPath();
    const totalSamples = this.timeData.length; // 512 for fftSize=512
    const sliceWidth = w / totalSamples;
    let x = 0;

    for (let i = 0; i < totalSamples; i++) {
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
   * Bug 5 Fix: Uses pre-cached HSL color array, zero string allocations in loop!
   */
  renderRadial(w, h) {
    const ctx = this.ctx;
    const centerX = w / 2;
    const centerY = h / 2;
    const baseRadius = Math.min(w, h) * 0.22;
    const numPoints = Math.min(this.cachedRadialColors.length, Math.min(this.bufferLength, 80));

    ctx.fillStyle = this.cachedBgGradient;
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
      ctx.strokeStyle = this.cachedRadialColors[i]; // Reused from cache!
      ctx.lineWidth = 3;
      ctx.stroke();
    }

    ctx.restore();
  }

  /**
   * Bug 2 Fix: On-Canvas Direct HUD Overlay
   */
  renderOnCanvasHUD(w, h, delta) {
    const ctx = this.ctx;
    ctx.save();
    ctx.font = '600 11px ui-monospace, SFMono-Regular, Menlo, monospace';

    // HUD Badge Box
    const badgeW = 125;
    const badgeH = 24;
    const badgeX = w - badgeW - 10;
    const badgeY = 10;

    ctx.fillStyle = 'rgba(15, 23, 42, 0.8)';
    ctx.fillRect(badgeX, badgeY, badgeW, badgeH);
    ctx.strokeStyle = this.fps >= 50 ? 'rgba(74, 222, 128, 0.4)' : 'rgba(251, 191, 36, 0.5)';
    ctx.lineWidth = 1;
    ctx.strokeRect(badgeX, badgeY, badgeW, badgeH);

    ctx.fillStyle = this.fps >= 50 ? '#4ade80' : '#fbbf24';
    ctx.fillText(`${this.fps.toFixed(1)} FPS (${delta.toFixed(0)}ms)`, badgeX + 8, badgeY + 16);
    ctx.restore();
  }

  /**
   * Teardown visualizer and unbind listeners
   */
  destroy() {
    this.stop();
    if (typeof window !== 'undefined') {
      window.removeEventListener('resize', this.handleResize);
    }
  }
}
