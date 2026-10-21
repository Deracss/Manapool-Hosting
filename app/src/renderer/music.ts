// Quiet background music for each Field, generated live with Web Audio (no audio files).
// A tiny step sequencer: every Field has a tempo, a chord loop and a few voices.

type Voice = (ac: AudioContext, out: AudioNode, t: number, step: number, chord: number[]) => void;
interface Track {
  bpm: number;
  chords: number[][]; // MIDI notes, one chord per bar (8 steps of eighth notes)
  voices: Voice[];
}

const hz = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12);

function note(ac: AudioContext, out: AudioNode, t: number, midi: number, dur: number, o: { type?: OscillatorType; gain?: number; attack?: number; detune?: number; filter?: number }) {
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.type = o.type ?? 'sine';
  osc.frequency.value = hz(midi);
  if (o.detune) osc.detune.value = o.detune;
  const peak = o.gain ?? 0.1;
  const a = o.attack ?? 0.02;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  let node: AudioNode = osc.connect(g);
  if (o.filter) {
    const f = ac.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = o.filter;
    node = g.connect(f);
  }
  node.connect(out);
  osc.start(t);
  osc.stop(t + dur + 0.05);
}

function hit(ac: AudioContext, out: AudioNode, t: number, o: { f: number; f2: number; dur: number; gain: number; noise?: boolean }) {
  if (o.noise) {
    const len = Math.ceil(ac.sampleRate * o.dur);
    const buf = ac.createBuffer(1, len, ac.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ac.createBufferSource();
    src.buffer = buf;
    const f = ac.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = o.f;
    const g = ac.createGain();
    g.gain.value = o.gain;
    src.connect(f).connect(g).connect(out);
    src.start(t);
    return;
  }
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.frequency.setValueAtTime(o.f, t);
  osc.frequency.exponentialRampToValueAtTime(o.f2, t + o.dur);
  g.gain.setValueAtTime(o.gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
  osc.connect(g).connect(out);
  osc.start(t);
  osc.stop(t + o.dur + 0.05);
}

const pad = (gain: number, type: OscillatorType = 'sine', filter?: number): Voice => (ac, out, t, step, chord) => {
  if (step % 8 !== 0) return;
  for (const n of chord) {
    note(ac, out, t, n, 4.2, { type, gain, attack: 1.2, detune: -6, filter });
    note(ac, out, t, n, 4.2, { type, gain: gain * 0.7, attack: 1.4, detune: 7, filter });
  }
};
const arp = (gain: number, pattern: number[], type: OscillatorType = 'triangle', octave = 12, filter?: number): Voice => (ac, out, t, step, chord) => {
  const i = pattern[step % pattern.length];
  if (i < 0) return;
  note(ac, out, t, chord[i % chord.length] + octave + (i >= chord.length ? 12 : 0), 0.5, { type, gain, filter });
};
const bass = (gain: number, every = 4): Voice => (ac, out, t, step, chord) => {
  if (step % every === 0) note(ac, out, t, chord[0] - 12, 0.9, { type: 'sine', gain });
};

const TRACKS: Record<string, Track> = {
  // Calm, warm, pentatonic.
  forest: { bpm: 76, chords: [[62, 66, 69], [59, 62, 66], [55, 59, 62], [57, 61, 64]], voices: [pad(0.035), arp(0.03, [0, -1, 1, -1, 2, -1, 1, -1]), bass(0.05, 8)] },
  // Slow pulse, minor sevenths.
  'city-night': { bpm: 68, chords: [[57, 60, 64, 67], [53, 57, 60, 64], [50, 53, 57, 60], [52, 56, 59, 62]], voices: [pad(0.028, 'triangle', 1400), bass(0.06, 2), arp(0.018, [-1, -1, 3, -1, -1, 2, -1, -1], 'sine', 12)] },
  // Soft running arpeggio.
  'neural-nexus': { bpm: 96, chords: [[57, 60, 64], [53, 57, 60], [55, 59, 62], [52, 55, 59]], voices: [arp(0.022, [0, 1, 2, 3, 2, 1, 0, 1], 'square', 12, 1600), pad(0.02, 'sine'), bass(0.045, 4)] },
  // Low drums and a drone.
  'demon-field': {
    bpm: 84,
    chords: [[45, 48, 52], [45, 48, 51], [43, 46, 50], [44, 47, 51]],
    voices: [
      pad(0.03, 'sawtooth', 500),
      (ac, out, t, step) => {
        if (step % 8 === 0 || step % 8 === 3) hit(ac, out, t, { f: 110, f2: 40, dur: 0.35, gain: 0.22 });
        if (step % 8 === 6) hit(ac, out, t, { f: 900, f2: 900, dur: 0.12, gain: 0.05, noise: true });
      },
    ],
  },
  // Choir-like pad.
  'celestial-citadel': { bpm: 60, chords: [[60, 64, 67, 72], [57, 60, 64, 69], [53, 57, 60, 65], [55, 59, 62, 67]], voices: [pad(0.03), arp(0.014, [-1, -1, -1, -1, 3, -1, -1, -1], 'sine', 12)] },
  // Eerie drone with a distant bell.
  graveyard: {
    bpm: 58,
    chords: [[50, 56, 60], [49, 55, 59], [48, 54, 58], [49, 55, 59]],
    voices: [
      pad(0.026, 'triangle', 900),
      (ac, out, t, step, chord) => {
        if (step % 16 === 5) {
          note(ac, out, t, chord[2] + 24, 3.2, { type: 'sine', gain: 0.03 });
          note(ac, out, t, chord[2] + 31, 2.4, { type: 'sine', gain: 0.012 });
        }
      },
    ],
  },
};

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let timer: ReturnType<typeof setInterval> | null = null;
let current: string | null = null;
let volume = 0.35;

export function setMusicVolume(v: number): void {
  volume = Math.max(0, Math.min(1, v));
  if (master && ctx) master.gain.setTargetAtTime(volume * 0.5, ctx.currentTime, 0.3);
  if (volume <= 0) stopMusic();
}

export function stopMusic(): void {
  if (timer) clearInterval(timer);
  timer = null;
  current = null;
  if (master && ctx) {
    const m = master;
    m.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.4);
    setTimeout(() => m.disconnect(), 2000);
    master = null;
  }
}

/** Starts (or switches to) the music for a Field. */
export function playMusic(field: string | null | undefined): void {
  const track = field ? TRACKS[field] : undefined;
  if (!track || volume <= 0) return stopMusic();
  if (current === field && timer) return;
  stopMusic();
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
  } catch {
    return;
  }
  const ac = ctx;
  master = ac.createGain();
  master.gain.setValueAtTime(0.0001, ac.currentTime);
  master.gain.setTargetAtTime(volume * 0.5, ac.currentTime, 1.5);
  master.connect(ac.destination);
  const out = master;
  current = field!;
  const stepDur = 60 / track.bpm / 2;
  let step = 0;
  let next = ac.currentTime + 0.1;
  timer = setInterval(() => {
    while (next < ac.currentTime + 0.3) {
      const chord = track.chords[Math.floor(step / 8) % track.chords.length];
      for (const v of track.voices) v(ac, out, next, step, chord);
      step++;
      next += stepDur;
    }
  }, 100);
}
