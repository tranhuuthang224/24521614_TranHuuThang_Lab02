/**
 * In-Memory Procedural Synthetic Audio Generator
 * Produces clean, rich 44.1kHz 16-bit PCM WAV audio blobs in browser memory.
 * Eliminates external CORS download issues and provides 100% offline verification.
 */

/**
 * Encodes Float32Array PCM audio channel data into a valid RIFF/WAV Blob
 * @param {Float32Array[]} channels - Array of channel buffers [-1.0 to 1.0]
 * @param {number} sampleRate - Sample rate (e.g. 44100)
 * @returns {Blob}
 */
export function encodeWAV(channels, sampleRate = 44100) {
  const numChannels = channels.length;
  const numSamples = channels[0].length;
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
 * Procedurally generates 4 distinct synthesized test tracks
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
      title: 'Neon Cyberpunk Arpeggio',
      artist: 'Procedural Audio Engine',
      duration: 10,
      blobUrl: URL.createObjectURL(blob)
    };
  })();

  // Track 2: Deep Sub-Bass & Percussion (8 seconds, 100 BPM)
  const track2 = (() => {
    const duration = 8;
    const numSamples = sampleRate * duration;
    const left = new Float32Array(numSamples);
    const right = new Float32Array(numSamples);

    for (let i = 0; i < numSamples; i++) {
      const t = i / sampleRate;
      // 808 Sub Bass (55Hz / A1)
      const sub = Math.sin(2 * Math.PI * 55 * t) * 0.5 * (0.8 + 0.2 * Math.sin(2 * Math.PI * 0.5 * t));

      // Snare on beats 2 & 4 (white noise with decay)
      const snareBeat = (t * (100 / 60)) % 2;
      let snare = 0;
      if (snareBeat >= 1 && snareBeat <= 1.25) {
        const snareEnv = Math.exp(-(snareBeat - 1) * 16);
        snare = (Math.random() * 2 - 1) * 0.35 * snareEnv;
      }

      // Hi-hats 8th notes
      const hatProgress = (t * (200 / 60)) % 1;
      const hatEnv = Math.exp(-hatProgress * 25);
      const hat = (Math.random() * 2 - 1) * 0.15 * hatEnv;

      left[i] = sub + snare + hat;
      right[i] = sub + snare - hat;
    }

    const blob = encodeWAV([left, right], sampleRate);
    return {
      id: 'synth-2',
      title: 'Deep Sub-Bass Resonance',
      artist: 'Procedural Audio Engine',
      duration: 8,
      blobUrl: URL.createObjectURL(blob)
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
      // Exponential frequency sweep from 100Hz to 8000Hz (tests all FFT bins!)
      const sweepFreq = 100 * Math.pow(80, t / duration);
      const sweep = Math.sin(2 * Math.PI * sweepFreq * t) * 0.3;

      // Harmonic chords
      const chord1 = Math.sin(2 * Math.PI * 440 * t) * 0.15;
      const chord2 = Math.sin(2 * Math.PI * 554.37 * t) * 0.15;
      const chord3 = Math.sin(2 * Math.PI * 659.25 * t) * 0.15;

      left[i] = sweep + chord1 + chord3;
      right[i] = sweep + chord2 + chord3;
    }

    const blob = encodeWAV([left, right], sampleRate);
    return {
      id: 'synth-3',
      title: 'Full Spectrum Frequency Sweep',
      artist: 'Procedural Audio Engine',
      duration: 12,
      blobUrl: URL.createObjectURL(blob)
    };
  })();

  // Track 4: 8-Bit Chiptune Retro Hero (6 seconds, 150 BPM)
  const track4 = (() => {
    const duration = 6;
    const numSamples = sampleRate * duration;
    const left = new Float32Array(numSamples);
    const right = new Float32Array(numSamples);
    const chipNotes = [523.25, 659.25, 783.99, 1046.50, 783.99, 659.25]; // C E G C G E

    for (let i = 0; i < numSamples; i++) {
      const t = i / sampleRate;
      const noteIdx = Math.floor(t * 8) % chipNotes.length;
      const freq = chipNotes[noteIdx];

      // Pure square wave
      const square = Math.sin(2 * Math.PI * freq * t) >= 0 ? 0.3 : -0.3;
      // Triangle bass
      const triFreq = freq / 2;
      const tri = (2 * Math.abs(2 * ((t * triFreq) % 1) - 1) - 1) * 0.3;

      left[i] = square + tri;
      right[i] = square + tri;
    }

    const blob = encodeWAV([left, right], sampleRate);
    return {
      id: 'synth-4',
      title: '8-Bit Chiptune Retro Anthem',
      artist: 'Procedural Audio Engine',
      duration: 6,
      blobUrl: URL.createObjectURL(blob)
    };
  })();

  return [track1, track2, track3, track4];
}
