/**
 * In-Memory Procedural Synthetic Audio Generator
 * Produces clean, rich 44.1kHz 16-bit PCM WAV audio blobs in browser memory.
 * Eliminates external CORS download issues and provides 100% offline verification.
 * 
 * Features:
 * - Anti-click De-popping: 50ms smooth Hann/Cosine fade-in and fade-out envelope.
 * - Exact BPM tempo synchronization across musical patterns.
 * - Genuine rhythmic sub-bass bassline with envelope shaping.
 * - Memory Safety: Automatic tracking and revocation of Blob URLs (revokeSyntheticTrackCatalog).
 */

// Active Blob URL registry for memory leak prevention
const activeBlobUrls = new Set();

/**
 * Encodes Float32Array PCM audio channel data into a valid RIFF/WAV Blob
 * with automatic de-clicking fade-in/fade-out envelopes.
 * 
 * @param {Float32Array[]} channels - Array of channel buffers [-1.0 to 1.0]
 * @param {number} sampleRate - Sample rate (e.g. 44100)
 * @returns {Blob}
 */
export function encodeWAV(channels, sampleRate = 44100) {
  const numChannels = channels.length;
  const numSamples = channels[0].length;

  // Lỗi 4 Fix: Apply smooth 50ms de-clicking Hann fade-in and fade-out to eliminate edge pops/clicks
  const fadeSamples = Math.min(Math.floor(sampleRate * 0.05), Math.floor(numSamples / 4));
  for (let i = 0; i < fadeSamples; i++) {
    const fadeIn = 0.5 * (1 - Math.cos((Math.PI * i) / fadeSamples));
    for (let ch = 0; ch < numChannels; ch++) {
      channels[ch][i] *= fadeIn;
    }
  }
  for (let i = 0; i < fadeSamples; i++) {
    const idx = numSamples - 1 - i;
    const fadeOut = 0.5 * (1 - Math.cos((Math.PI * i) / fadeSamples));
    for (let ch = 0; ch < numChannels; ch++) {
      channels[ch][idx] *= fadeOut;
    }
  }

  const bytesPerSample = 2; // 16-bit PCM
  const blockAlign = numChannels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = numSamples * blockAlign;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  // Helper to write ASCII strings
  const writeString = (offset, str) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  // RIFF Header
  writeString(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, 'WAVE');

  // fmt subchunk
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);          // Subchunk1Size (16 for PCM)
  view.setUint16(20, 1, true);           // AudioFormat (1 for PCM)
  view.setUint16(22, numChannels, true); // NumChannels
  view.setUint32(24, sampleRate, true);  // SampleRate
  view.setUint32(28, byteRate, true);    // ByteRate
  view.setUint16(32, blockAlign, true);  // BlockAlign
  view.setUint16(34, 16, true);          // BitsPerSample

  // data subchunk
  writeString(36, 'data');
  view.setUint32(40, dataSize, true);

  // Interleave and quantize Float32 to 16-bit signed integer
  let offset = 44;
  for (let i = 0; i < numSamples; i++) {
    for (let ch = 0; ch < numChannels; ch++) {
      let sample = channels[ch][i];
      // Hard clipping guard [-1.0, 1.0]
      sample = Math.max(-1, Math.min(1, sample));
      // Convert to 16-bit PCM (-32768 to 32767)
      const intSample = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
      view.setInt16(offset, intSample, true);
      offset += 2;
    }
  }

  return new Blob([buffer], { type: 'audio/wav' });
}

/**
 * Creates and registers a tracked Blob URL for automatic lifecycle cleanup
 * @param {Blob} blob
 * @returns {string}
 */
function createTrackedBlobUrl(blob) {
  const url = URL.createObjectURL(blob);
  activeBlobUrls.add(url);
  return url;
}

/**
 * Lỗi 5 Fix: Revokes and releases Blob URLs for a given track catalog
 * @param {Array<{ blobUrl: string }>} catalog
 */
export function revokeSyntheticTrackCatalog(catalog) {
  if (Array.isArray(catalog)) {
    catalog.forEach((track) => {
      if (track.blobUrl && activeBlobUrls.has(track.blobUrl)) {
        URL.revokeObjectURL(track.blobUrl);
        activeBlobUrls.delete(track.blobUrl);
      }
    });
  }
}

/**
 * Lỗi 5 Fix: Revokes all globally tracked synthetic Blob URLs
 */
export function revokeAllSyntheticUrls() {
  activeBlobUrls.forEach((url) => {
    URL.revokeObjectURL(url);
  });
  activeBlobUrls.clear();
}

/**
 * Procedurally generates 4 distinct synthesized test tracks with exact musical BPMs
 * @returns {Array<{ id: string, title: string, artist: string, duration: number, blobUrl: string }>}
 */
export function generateSyntheticTrackCatalog() {
  const sampleRate = 44100;

  // Track 1: Cyberpunk Synthwave Arpeggio (10 seconds, 128 BPM)
  const track1 = (() => {
    const duration = 10;
    const numSamples = sampleRate * duration;
    const left = new Float32Array(numSamples);
    const right = new Float32Array(numSamples);
    const notes = [220, 261.63, 329.63, 440, 392, 329.63, 261.63, 196]; // A minor arpeggio
    const bpm = 128;
    const noteDuration = 60 / (bpm * 4); // 16th notes
    const samplesPerNote = Math.floor(sampleRate * noteDuration);

    for (let i = 0; i < numSamples; i++) {
      const t = i / sampleRate;
      const noteIdx = Math.floor(i / samplesPerNote) % notes.length;
      const freq = notes[noteIdx];
      const noteProgress = (i % samplesPerNote) / samplesPerNote;

      // Synth Lead: Sawtooth + square with decay envelope
      const env = Math.exp(-noteProgress * 4.5);
      const saw = (2 * ((t * freq) % 1) - 1) * 0.35 * env;
      const sub = Math.sin(2 * Math.PI * (freq / 2) * t) * 0.25;

      // Kick on quarter notes
      const beatProgress = (t * (bpm / 60)) % 1;
      const kickEnv = Math.exp(-beatProgress * 12);
      const kickFreq = 140 * Math.exp(-beatProgress * 20) + 45;
      const kick = Math.sin(2 * Math.PI * kickFreq * t) * 0.5 * kickEnv;

      const mono = saw + sub + kick;
      left[i] = mono * 0.8;
      right[i] = mono * 0.8;
    }

    const blob = encodeWAV([left, right], sampleRate);
    return {
      id: 'synth-1',
      title: 'Neon Cyberpunk Arpeggio (128 BPM)',
      artist: 'Procedural Audio Engine',
      duration: 10,
      blobUrl: createTrackedBlobUrl(blob)
    };
  })();

  // Track 2: Rhythmic Sub-Bass Funk Groove (8 seconds, 100 BPM)
  // Lỗi 2 Fix: Genuine rhythmic syncopated bassline with envelope shaping and note progression!
  const track2 = (() => {
    const duration = 8;
    const numSamples = sampleRate * duration;
    const left = new Float32Array(numSamples);
    const right = new Float32Array(numSamples);
    const bpm = 100;
    const stepDuration = 60 / (bpm * 4); // 16th note steps (0.15s)
    const samplesPerStep = Math.floor(sampleRate * stepDuration);

    // 16-step bassline pattern: E1, E1, G1, -, A1, A1, D2, - (in Hz: 41.2, 49.0, 55.0, 73.4)
    const basslineFreqs = [41.2, 41.2, 49.0, 0, 55.0, 55.0, 73.4, 0, 41.2, 55.0, 49.0, 0, 73.4, 65.4, 55.0, 41.2];

    for (let i = 0; i < numSamples; i++) {
      const t = i / sampleRate;
      const stepIdx = Math.floor(i / samplesPerStep) % basslineFreqs.length;
      const freq = basslineFreqs[stepIdx];
      const stepProgress = (i % samplesPerStep) / samplesPerStep;

      // Rhythmic Bass Synth (Triangle + Sub Sine with punchy attack & decay)
      let bass = 0;
      if (freq > 0) {
        const bassEnv = Math.exp(-stepProgress * 6.5);
        const subSine = Math.sin(2 * Math.PI * freq * t) * 0.6;
        const triHarmonic = (2 * Math.abs(2 * ((t * freq * 2) % 1) - 1) - 1) * 0.3;
        bass = (subSine + triHarmonic) * bassEnv;
      }

      // Punchy Kick on steps 0, 8 (Beats 1 & 3)
      let kick = 0;
      if (stepIdx === 0 || stepIdx === 8) {
        const kickProgress = stepProgress;
        const kickEnv = Math.exp(-kickProgress * 14);
        const kickPitch = 120 * Math.exp(-kickProgress * 25) + 42;
        kick = Math.sin(2 * Math.PI * kickPitch * t) * 0.55 * kickEnv;
      }

      // Crisp Snare on steps 4, 12 (Beats 2 & 4)
      let snare = 0;
      if (stepIdx === 4 || stepIdx === 12) {
        const snareProgress = stepProgress;
        const snareEnv = Math.exp(-snareProgress * 12);
        const noise = (Math.random() * 2 - 1) * 0.35 * snareEnv;
        const tone = Math.sin(2 * Math.PI * 185 * t) * 0.25 * snareEnv;
        snare = noise + tone;
      }

      // Hi-Hats on every even step
      let hat = 0;
      if (stepIdx % 2 === 0) {
        const hatEnv = Math.exp(-stepProgress * 28);
        hat = (Math.random() * 2 - 1) * 0.12 * hatEnv;
      }

      left[i] = (bass + kick + snare) * 0.85 + hat;
      right[i] = (bass + kick + snare) * 0.85 - hat;
    }

    const blob = encodeWAV([left, right], sampleRate);
    return {
      id: 'synth-2',
      title: 'Deep Sub-Bass Funk Groove (100 BPM)',
      artist: 'Procedural Audio Engine',
      duration: 8,
      blobUrl: createTrackedBlobUrl(blob)
    };
  })();

  // Track 3: Ambient Frequency Spectrum Sweep (12 seconds)
  const track3 = (() => {
    const duration = 12;
    const numSamples = sampleRate * duration;
    const left = new Float32Array(numSamples);
    const right = new Float32Array(numSamples);

    for (let i = 0; i < numSamples; i++) {
      const t = i / sampleRate;
      // Exponential frequency sweep from 80Hz to 7500Hz (exercises all FFT bins!)
      const sweepFreq = 80 * Math.pow(90, t / duration);
      const sweep = Math.sin(2 * Math.PI * sweepFreq * t) * 0.25;

      // Harmonic chords
      const chord1 = Math.sin(2 * Math.PI * 440 * t) * 0.12;
      const chord2 = Math.sin(2 * Math.PI * 554.37 * t) * 0.12;
      const chord3 = Math.sin(2 * Math.PI * 659.25 * t) * 0.12;

      left[i] = sweep + chord1 + chord3;
      right[i] = sweep + chord2 + chord3;
    }

    const blob = encodeWAV([left, right], sampleRate);
    return {
      id: 'synth-3',
      title: 'Full Spectrum Frequency Sweep (12s)',
      artist: 'Procedural Audio Engine',
      duration: 12,
      blobUrl: createTrackedBlobUrl(blob)
    };
  })();

  // Track 4: 8-Bit Chiptune Retro Anthem (6 seconds, 150 BPM)
  // Lỗi 3 Fix: Tempo formula precisely matches 150 BPM eighth-notes (5 notes/second)!
  const track4 = (() => {
    const duration = 6;
    const numSamples = sampleRate * duration;
    const left = new Float32Array(numSamples);
    const right = new Float32Array(numSamples);
    const chipNotes = [523.25, 659.25, 783.99, 1046.50, 783.99, 659.25, 880.00, 987.77]; // C E G C G E A B
    const bpm = 150;
    // Exactly 150 BPM eighth notes = (150 / 60) * 2 = 5 notes per second
    const notesPerSec = (bpm / 60) * 2;
    const samplesPerNote = Math.floor(sampleRate / notesPerSec);

    for (let i = 0; i < numSamples; i++) {
      const t = i / sampleRate;
      const noteIdx = Math.floor(i / samplesPerNote) % chipNotes.length;
      const freq = chipNotes[noteIdx];
      const noteProgress = (i % samplesPerNote) / samplesPerNote;

      // Chiptune Square Wave with duty cycle modulation and fast decay
      const env = Math.exp(-noteProgress * 3.5);
      const duty = 0.5 + 0.2 * Math.sin(2 * Math.PI * 2 * t);
      const square = ((t * freq) % 1) < duty ? 0.25 : -0.25;

      // Triangle Bass on half speed
      const triFreq = freq / 2;
      const tri = (2 * Math.abs(2 * ((t * triFreq) % 1) - 1) - 1) * 0.25;

      left[i] = (square * env + tri) * 0.8;
      right[i] = (square * env + tri) * 0.8;
    }

    const blob = encodeWAV([left, right], sampleRate);
    return {
      id: 'synth-4',
      title: '8-Bit Chiptune Retro Anthem (150 BPM)',
      artist: 'Procedural Audio Engine',
      duration: 6,
      blobUrl: createTrackedBlobUrl(blob)
    };
  })();

  return [track1, track2, track3, track4];
}
