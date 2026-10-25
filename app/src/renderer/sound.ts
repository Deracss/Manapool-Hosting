// Small synthesized sounds for the table animations (no audio files: everything is built with Web Audio).

export type SoundKind =
  | 'draw'
  | 'drawOpp'
  | 'discard'
  | 'destroy'
  | 'charge'
  | 'negate'
  | 'resolve'
  | 'token'
  | 'tap'
  | 'untap'
  | 'lifeLoss'
  | 'lifeGain'
  | 'counter'
  | 'bounce'
  | 'fadeOut'
  | 'orbBreak'
  | 'soul'
  | 'out'
  | 'cardHover'
  | 'deckAdd'
  | 'deckRemove'
  | 'deckComplete'
  | 'confirm'
  | 'deal'
  | 'playCreature'
  | 'playSpell'
  | 'playIncantation'
  | 'playArtifact'
  | 'playAnthem'
  | 'clash'
  | 'clashBig'
  | 'manaFlow'
  | 'flare-demon-field'
  | 'flare-forest'
  | 'flare-graveyard'
  | 'flare-city-night'
  | 'flare-neural-nexus'
  | 'flare-celestial-citadel'
  | 'coin'
  | 'coinLand'
  | 'diceShake'
  | 'diceRoll'
  | 'diceLand'
  | 'diceTie'
  | 'reveal'
  | 'priority'
  | 'etbArtifact'
  | 'etbAnthem'
  | 'resolveSpell'
  | 'resolveIncantation'
  | 'etbCreature'
  | 'etb-goblin'
  | 'etb-vampire'
  | 'etb-demon'
  | 'etb-zombie'
  | 'etb-human'
  | 'etb-construct'
  | 'etb-god'
  | 'etb-demigod'
  | 'etb-druid'
  | 'etb-dragon'
  | 'etb-dragon-rider'
  | 'etb-shapeshifter'
  | 'etb-illusion'
  | 'etb-human-soldier'
  | 'etb-human-herald'
  | 'etb-human-villager'
  | 'etb-human-knight';

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let enabled = true;
let volume = 0.5;
const lastPlayed = new Map<SoundKind, number>();

/** The effects volume (0 when sound is off), for audio played outside the synth. */
export function getSoundVolume(): number {
  return enabled ? volume : 0;
}

export function configureSound(on: boolean, vol: number): void {
  enabled = on;
  volume = Math.max(0, Math.min(1, vol));
  if (master) master.gain.value = volume * 0.6;
}

function audio(): { ac: AudioContext; out: GainNode } | null {
  if (!enabled || volume <= 0) return null;
  try {
    if (!ctx) {
      ctx = new AudioContext();
      master = ctx.createGain();
      master.gain.value = volume * 0.6;
      master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') void ctx.resume();
    return { ac: ctx, out: master! };
  } catch {
    return null;
  }
}

/** A tone with a pitch slide and a quick attack / exponential release. */
export function tone(a: { ac: AudioContext; out: GainNode }, o: { f: number; f2?: number; t?: number; dur: number; type?: OscillatorType; gain?: number; vib?: number }) {
  const t0 = a.ac.currentTime + (o.t ?? 0);
  const osc = a.ac.createOscillator();
  const g = a.ac.createGain();
  osc.type = o.type ?? 'sine';
  osc.frequency.setValueAtTime(o.f, t0);
  if (o.f2) osc.frequency.exponentialRampToValueAtTime(o.f2, t0 + o.dur);
  if (o.vib) {
    const lfo = a.ac.createOscillator();
    const lg = a.ac.createGain();
    lfo.frequency.value = 6;
    lg.gain.value = o.vib;
    lfo.connect(lg).connect(osc.frequency);
    lfo.start(t0);
    lfo.stop(t0 + o.dur);
  }
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(o.gain ?? 0.2, t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur);
  osc.connect(g).connect(a.out);
  osc.start(t0);
  osc.stop(t0 + o.dur + 0.02);
}

/** Filtered noise: swishes, cracks and thumps. */
export function noise(a: { ac: AudioContext; out: GainNode }, o: { t?: number; dur: number; type?: BiquadFilterType; f: number; f2?: number; q?: number; gain?: number; rise?: boolean }) {
  const t0 = a.ac.currentTime + (o.t ?? 0);
  const len = Math.ceil(a.ac.sampleRate * o.dur);
  const buf = a.ac.createBuffer(1, len, a.ac.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  const src = a.ac.createBufferSource();
  src.buffer = buf;
  const fl = a.ac.createBiquadFilter();
  fl.type = o.type ?? 'bandpass';
  fl.Q.value = o.q ?? 1;
  fl.frequency.setValueAtTime(o.f, t0);
  if (o.f2) fl.frequency.exponentialRampToValueAtTime(o.f2, t0 + o.dur);
  const g = a.ac.createGain();
  const peak = o.gain ?? 0.2;
  g.gain.setValueAtTime(0.0001, t0);
  if (o.rise) {
    g.gain.exponentialRampToValueAtTime(peak, t0 + o.dur * 0.8);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur);
  } else {
    g.gain.exponentialRampToValueAtTime(peak, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur);
  }
  src.connect(fl).connect(g).connect(a.out);
  src.start(t0);
  src.stop(t0 + o.dur + 0.02);
}


export type Out = { ac: AudioContext; out: GainNode };
type Vowel = 'a' | 'e' | 'i' | 'o' | 'u' | 'uh';
/** Formant frequencies (F1, F2, F3) that make a buzz sound like a vowel. */
const VOWEL: Record<Vowel, [number, number, number]> = {
  a: [800, 1200, 2600],
  e: [500, 1800, 2600],
  i: [300, 2200, 3000],
  o: [500, 900, 2400],
  u: [330, 800, 2300],
  uh: [640, 1190, 2400],
};

let shaperCurve: Float32Array<ArrayBuffer> | null = null;
function grit(ac: AudioContext, amount: number): WaveShaperNode {
  const ws = ac.createWaveShaper();
  if (!shaperCurve) {
    shaperCurve = new Float32Array(new ArrayBuffer(1024 * 4));
    for (let i = 0; i < 1024; i++) {
      const x = (i / 1023) * 2 - 1;
      shaperCurve[i] = Math.tanh(x * 3);
    }
  }
  ws.curve = shaperCurve;
  ws.oversample = '2x';
  void amount;
  return ws;
}

/**
 * A creature's voice: a buzzing source shaped by vowel formants, with a pitch contour, vibrato,
 * optional growl (distortion and a fast tremble) and breath noise. Vowels can morph (a → u).
 */
export function voice(
  a: Out,
  o: { t?: number; dur: number; f: number; f2?: number; vowel: Vowel; vowel2?: Vowel; gain?: number; vib?: number; vibRate?: number; growl?: number; breath?: number; attack?: number; q?: number; formantShift?: number },
) {
  const t0 = a.ac.currentTime + (o.t ?? 0);
  const end = t0 + o.dur;
  const osc = a.ac.createOscillator();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(o.f, t0);
  if (o.f2) osc.frequency.exponentialRampToValueAtTime(o.f2, end);
  if (o.vib) {
    const lfo = a.ac.createOscillator();
    const lg = a.ac.createGain();
    lfo.frequency.value = o.vibRate ?? 5.5;
    lg.gain.value = o.vib;
    lfo.connect(lg).connect(osc.frequency);
    lfo.start(t0);
    lfo.stop(end);
  }
  // Source → (growl) → formant filters → envelope
  let src: AudioNode = osc;
  const pre = a.ac.createGain();
  pre.gain.value = o.growl ? 1 + o.growl * 4 : 1;
  osc.connect(pre);
  src = pre;
  if (o.growl) {
    const ws = grit(a.ac, o.growl);
    pre.connect(ws);
    src = ws;
  }
  const env = a.ac.createGain();
  const peak = o.gain ?? 0.12;
  env.gain.setValueAtTime(0.0001, t0);
  env.gain.exponentialRampToValueAtTime(peak, t0 + (o.attack ?? 0.04));
  env.gain.setValueAtTime(peak, Math.max(t0 + (o.attack ?? 0.04), end - o.dur * 0.35));
  env.gain.exponentialRampToValueAtTime(0.0001, end);
  // Growl: a fast amplitude tremble.
  let last: AudioNode = env;
  if (o.growl) {
    const trem = a.ac.createGain();
    trem.gain.value = 0.65;
    const lfo = a.ac.createOscillator();
    const lg = a.ac.createGain();
    lfo.frequency.value = 28 + o.growl * 10;
    lg.gain.value = 0.35;
    lfo.connect(lg).connect(trem.gain);
    lfo.start(t0);
    lfo.stop(end);
    env.connect(trem);
    last = trem;
  }
  last.connect(a.out);
  const v1 = VOWEL[o.vowel];
  const v2 = VOWEL[o.vowel2 ?? o.vowel];
  const sh = o.formantShift ?? 1;
  const formantGains = [1, 0.6, 0.25];
  for (let i = 0; i < 3; i++) {
    const bp = a.ac.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = o.q ?? 9;
    bp.frequency.setValueAtTime(v1[i] * sh, t0);
    bp.frequency.linearRampToValueAtTime(v2[i] * sh, end);
    const g = a.ac.createGain();
    g.gain.value = formantGains[i] * 3;
    src.connect(bp).connect(g).connect(env);
  }
  osc.start(t0);
  osc.stop(end + 0.02);
  // Breath: noise through the same vowel.
  if (o.breath) {
    for (let i = 0; i < 2; i++) noise(a, { t: o.t, dur: o.dur, f: v1[i] * sh, f2: v2[i] * sh, q: 6, gain: o.breath * (i ? 0.5 : 1) });
  }
}

/** Footfalls: short low thumps with a little grit. */
export function steps(a: Out, n: number, o: { t?: number; gap: number; f?: number; gain?: number; heavy?: boolean }) {
  for (let i = 0; i < n; i++) {
    const t = (o.t ?? 0) + i * o.gap;
    tone(a, { t, f: (o.f ?? 160) * (1 + (i % 2) * 0.08), f2: (o.f ?? 160) * 0.55, dur: o.heavy ? 0.22 : 0.09, gain: o.gain ?? 0.16 });
    noise(a, { t, dur: o.heavy ? 0.1 : 0.04, type: 'lowpass', f: o.heavy ? 500 : 1200, gain: (o.gain ?? 0.16) * 0.5 });
  }
}

/** Wingbeats: whooshes of air. */
export function wings(a: Out, n: number, o: { t?: number; gap: number; f: number; gain: number }) {
  for (let i = 0; i < n; i++) noise(a, { t: (o.t ?? 0) + i * o.gap, dur: o.gap * 0.8, f: o.f, f2: o.f * 0.5, q: 0.7, gain: o.gain, rise: true });
}

/** A bird chirp: a quick sine glide. */
export function chirp(a: Out, t: number, f: number) {
  tone(a, { t, f, f2: f * 1.6, dur: 0.06, gain: 0.05 });
  tone(a, { t: t + 0.07, f: f * 1.3, f2: f * 0.9, dur: 0.07, gain: 0.04 });
}

const SOUNDS: Record<SoundKind, (a: { ac: AudioContext; out: GainNode }) => void> = {
  // Paper swish as a card slides off the deck.
  draw: (a) => noise(a, { dur: 0.16, f: 2400, f2: 4200, q: 0.9, gain: 0.22 }),
  drawOpp: (a) => noise(a, { dur: 0.12, f: 1600, f2: 2600, q: 0.9, gain: 0.1 }),
  // Swish, then a soft landing on the pile.
  discard: (a) => {
    noise(a, { dur: 0.16, f: 3000, f2: 1800, gain: 0.18 });
    tone(a, { t: 0.14, f: 150, f2: 90, dur: 0.12, gain: 0.25 });
  },
  // Crack, a low thump, then glassy shards.
  destroy: (a) => {
    noise(a, { dur: 0.08, type: 'highpass', f: 1800, gain: 0.35 });
    tone(a, { f: 110, f2: 55, dur: 0.22, gain: 0.35 });
    for (let i = 0; i < 4; i++) tone(a, { t: 0.06 + i * 0.045, f: 1800 + Math.random() * 1400, dur: 0.09, type: 'triangle', gain: 0.07 });
  },
  // Rising shimmer that settles into a bell.
  charge: (a) => {
    tone(a, { f: 380, f2: 880, dur: 0.3, gain: 0.12 });
    tone(a, { t: 0.26, f: 1320, dur: 0.45, gain: 0.1 });
    tone(a, { t: 0.26, f: 1980, dur: 0.3, gain: 0.04 });
  },
  // A slash and a falling buzz.
  negate: (a) => {
    noise(a, { dur: 0.12, type: 'highpass', f: 2500, f2: 900, gain: 0.25 });
    tone(a, { t: 0.06, f: 320, f2: 110, dur: 0.32, type: 'sawtooth', gain: 0.07 });
    tone(a, { t: 0.06, f: 160, f2: 60, dur: 0.3, gain: 0.2 });
  },
  // Quick rising sparkle.
  resolve: (a) => {
    [880, 1100, 1320, 1660].forEach((f, i) => tone(a, { t: i * 0.05, f, dur: 0.16, gain: 0.08 }));
  },
  // Soft two-note chime.
  token: (a) => {
    tone(a, { f: 660, dur: 0.5, gain: 0.1 });
    tone(a, { t: 0.08, f: 990, dur: 0.5, gain: 0.08 });
  },
  tap: (a) => noise(a, { dur: 0.04, type: 'highpass', f: 3500, gain: 0.08 }),
  untap: (a) => noise(a, { dur: 0.22, f: 900, f2: 2400, gain: 0.08, rise: true }),
  // A soft, muted thump.
  lifeLoss: (a) => {
    tone(a, { f: 130, f2: 85, dur: 0.2, gain: 0.28 });
    noise(a, { dur: 0.06, type: 'lowpass', f: 600, gain: 0.08 });
  },
  // A player is out: one low, slow bell toll.
  // ---------- playing cards, by type ----------
  // A creature lands: a soft thump.
  playCreature: (a) => {
    tone(a, { f: 140, f2: 70, dur: 0.22, gain: 0.3 });
    noise(a, { dur: 0.08, type: 'lowpass', f: 800, gain: 0.12 });
  },
  // A bright whoosh.
  playSpell: (a) => noise(a, { dur: 0.32, f: 900, f2: 4200, q: 0.8, gain: 0.16, rise: true }),
  // A crackle of energy.
  playIncantation: (a) => {
    for (let i = 0; i < 6; i++) noise(a, { t: i * 0.035, dur: 0.03, type: 'highpass', f: 2500 + Math.random() * 2500, gain: 0.12 });
    tone(a, { f: 220, f2: 440, dur: 0.25, type: 'sawtooth', gain: 0.03 });
  },
  // A small metallic clank.
  playArtifact: (a) => {
    tone(a, { f: 820, dur: 0.18, type: 'triangle', gain: 0.1 });
    tone(a, { f: 1230, dur: 0.12, type: 'square', gain: 0.03 });
    noise(a, { dur: 0.04, type: 'highpass', f: 3000, gain: 0.1 });
  },
  // A short horn note.
  playAnthem: (a) => {
    tone(a, { f: 392, dur: 0.5, type: 'sawtooth', gain: 0.04 });
    tone(a, { f: 392, dur: 0.5, type: 'sine', gain: 0.09 });
    tone(a, { t: 0.02, f: 588, dur: 0.45, type: 'sine', gain: 0.04 });
  },
  // ---------- combat ----------
  // A heavy thud with a short metallic ring.
  clash: (a) => {
    tone(a, { f: 120, f2: 50, dur: 0.28, gain: 0.4 });
    noise(a, { dur: 0.06, type: 'highpass', f: 2200, gain: 0.18 });
    tone(a, { t: 0.02, f: 1560, dur: 0.3, type: 'triangle', gain: 0.05 });
  },
  clashBig: (a) => {
    tone(a, { f: 110, f2: 38, dur: 0.45, gain: 0.5 });
    noise(a, { dur: 0.12, type: 'lowpass', f: 900, gain: 0.25 });
    tone(a, { t: 0.02, f: 1400, dur: 0.4, type: 'triangle', gain: 0.06 });
  },
  // Mana flowing into a card: a rising shimmer, then a soft chime.
  manaFlow: (a) => {
    tone(a, { f: 520, f2: 1040, dur: 0.38, gain: 0.05 });
    tone(a, { t: 0.36, f: 1320, dur: 0.4, gain: 0.06 });
  },
  // ---------- the Field reacts ----------
  'flare-demon-field': (a) => {
    noise(a, { dur: 0.7, type: 'lowpass', f: 400, f2: 1600, gain: 0.18, rise: true });
    tone(a, { f: 70, f2: 50, dur: 0.7, gain: 0.15 });
  },
  'flare-forest': (a) => {
    for (let i = 0; i < 5; i++) noise(a, { t: i * 0.09, dur: 0.12, f: 3000 + i * 300, q: 2, gain: 0.07 });
  },
  'flare-graveyard': (a) => {
    noise(a, { dur: 1.0, f: 500, f2: 300, q: 3, gain: 0.12, rise: true });
    tone(a, { f: 196, f2: 185, dur: 1.0, gain: 0.03, vib: 4 });
  },
  'flare-city-night': (a) => {
    tone(a, { f: 120, dur: 0.4, type: 'sawtooth', gain: 0.04 });
    tone(a, { f: 240, dur: 0.4, type: 'square', gain: 0.015 });
  },
  'flare-neural-nexus': (a) => {
    [1760, 2093, 2637].forEach((f, i) => tone(a, { t: i * 0.06, f, dur: 0.07, type: 'square', gain: 0.025 }));
  },
  'flare-celestial-citadel': (a) => {
    [523, 659, 784, 1046].forEach((f) => tone(a, { f, dur: 1.1, gain: 0.03, vib: 3 }));
  },
  // ---------- start of the game ----------
  coin: (a) => {
    for (let i = 0; i < 10; i++) tone(a, { t: i * 0.08, f: 2400 + (i % 2) * 300, dur: 0.04, type: 'triangle', gain: 0.03 });
  },
  coinLand: (a) => {
    tone(a, { f: 1760, dur: 0.6, gain: 0.07 });
    tone(a, { f: 2637, dur: 0.4, gain: 0.03 });
  },
  // ---------- D20 for who goes first ----------
  // Picking the die up: a short rattle in the hand.
  diceShake: (a) => {
    for (let i = 0; i < 5; i++) noise(a, { t: i * 0.045, dur: 0.03, f: 2600 + (i % 2) * 700, q: 3, gain: 0.07 });
  },
  // Tumbling across the table: knocks that slow down.
  diceRoll: (a) => {
    let t = 0;
    for (let i = 0; i < 9; i++) {
      noise(a, { t, dur: 0.035, f: 1500 + Math.random() * 900, q: 2.5, gain: 0.13 - i * 0.011 });
      tone(a, { t, f: 180 + Math.random() * 60, dur: 0.05, gain: 0.05 - i * 0.004 });
      t += 0.06 + i * 0.022;
    }
  },
  // Coming to rest, and the number shows.
  diceLand: (a) => {
    noise(a, { dur: 0.05, f: 1200, q: 2, gain: 0.14 });
    tone(a, { f: 160, dur: 0.12, gain: 0.08 });
    tone(a, { t: 0.08, f: 1318, dur: 0.35, gain: 0.05 });
    tone(a, { t: 0.08, f: 1975, dur: 0.3, gain: 0.025 });
  },
  // A tie for first: two low notes.
  diceTie: (a) => {
    tone(a, { f: 392, dur: 0.18, type: 'triangle', gain: 0.08 });
    tone(a, { t: 0.2, f: 392, dur: 0.3, type: 'triangle', gain: 0.08 });
  },
  // ---------- deck builder ----------
  // A soft paper tick.
  cardHover: (a) => noise(a, { dur: 0.035, f: 3200, q: 1.4, gain: 0.05 }),
  // Two quick rising notes: the card snaps into the deck.
  deckAdd: (a) => {
    noise(a, { dur: 0.05, type: 'highpass', f: 2500, gain: 0.08 });
    tone(a, { f: 660, dur: 0.09, type: 'triangle', gain: 0.1 });
    tone(a, { t: 0.06, f: 990, dur: 0.12, type: 'triangle', gain: 0.09 });
  },
  // A short soft swish downward.
  deckRemove: (a) => noise(a, { dur: 0.14, f: 2600, f2: 900, gain: 0.1 }),
  // A small three-note fanfare.
  deckComplete: (a) => {
    tone(a, { f: 523, dur: 0.16, gain: 0.1 });
    tone(a, { t: 0.12, f: 659, dur: 0.16, gain: 0.1 });
    tone(a, { t: 0.24, f: 784, dur: 0.45, gain: 0.11 });
    tone(a, { t: 0.24, f: 1046, dur: 0.4, gain: 0.04 });
  },
  confirm: (a) => {
    tone(a, { f: 880, dur: 0.12, gain: 0.07 });
    tone(a, { t: 0.07, f: 1320, dur: 0.25, gain: 0.06 });
  },
  // A card dealt onto the table.
  deal: (a) => noise(a, { dur: 0.07, f: 2000, f2: 3400, q: 1.1, gain: 0.12 }),
  out: (a) => {
    tone(a, { f: 98, dur: 1.6, gain: 0.22 });
    tone(a, { f: 147, dur: 1.3, gain: 0.1 });
    tone(a, { f: 196, dur: 0.9, gain: 0.05 });
  },
  lifeGain: (a) => {
    tone(a, { f: 523, dur: 0.18, gain: 0.1 });
    tone(a, { t: 0.1, f: 784, dur: 0.3, gain: 0.1 });
  },
  counter: (a) => tone(a, { f: 700, f2: 1050, dur: 0.08, type: 'triangle', gain: 0.12 }),
  // Reverse swish back to the hand.
  bounce: (a) => noise(a, { dur: 0.3, f: 1200, f2: 3600, gain: 0.16, rise: true }),
  // Airy mist with a fading low tone.
  fadeOut: (a) => {
    noise(a, { dur: 0.55, f: 1800, f2: 600, q: 0.6, gain: 0.1 });
    tone(a, { f: 330, f2: 220, dur: 0.55, gain: 0.05 });
  },
  // Glassy crack, then a falling ring.
  orbBreak: (a) => {
    noise(a, { dur: 0.06, type: 'highpass', f: 3000, gain: 0.3 });
    tone(a, { f: 1250, f2: 420, dur: 0.35, type: 'triangle', gain: 0.1 });
  },
  // Ethereal wavering tone.
  // A card turned face up for everyone: a soft rising shimmer.
  reveal: (a) => {
    tone(a, { f: 520, f2: 780, dur: 0.28, type: 'triangle', gain: 0.07 });
    tone(a, { t: 0.12, f: 1040, dur: 0.4, gain: 0.05, vib: 8 });
  },
  // Your priority / your decision: two gentle bell notes.
  priority: (a) => {
    tone(a, { f: 988, dur: 0.22, type: 'sine', gain: 0.09 });
    tone(a, { t: 0.13, f: 1319, dur: 0.38, type: 'sine', gain: 0.08 });
  },
  // ---------- entering the field (one per type; creatures by kindred) ----------
  // Artifact: metal set down, then a short mechanical settle.
  etbArtifact: (a) => {
    tone(a, { f: 1500, f2: 1380, dur: 0.18, type: 'triangle', gain: 0.06 });
    noise(a, { dur: 0.05, type: 'highpass', f: 3000, gain: 0.08 });
    tone(a, { t: 0.09, f: 210, f2: 160, dur: 0.12, type: 'square', gain: 0.04 });
  },
  // Anthem: a banner unfurls (cloth swish) and a bright two-note chord.
  etbAnthem: (a) => {
    noise(a, { dur: 0.25, f: 600, f2: 1800, q: 0.7, gain: 0.08, rise: true });
    tone(a, { t: 0.18, f: 523, dur: 0.5, type: 'triangle', gain: 0.07 });
    tone(a, { t: 0.18, f: 784, dur: 0.5, type: 'triangle', gain: 0.05 });
  },
  // Spell takes effect: a soft burst of light.
  resolveSpell: (a) => {
    tone(a, { f: 660, f2: 1320, dur: 0.22, type: 'sine', gain: 0.07 });
    noise(a, { t: 0.05, dur: 0.18, type: 'highpass', f: 4000, gain: 0.05 });
  },
  // Incantation takes effect: a sharp magical snap.
  resolveIncantation: (a) => {
    noise(a, { dur: 0.06, type: 'bandpass', f: 2600, q: 3, gain: 0.14 });
    tone(a, { t: 0.02, f: 880, f2: 440, dur: 0.2, type: 'sawtooth', gain: 0.035 });
  },
  // Any other creature: footsteps and a short grunt.
  etbCreature: (a) => {
    steps(a, 2, { gap: 0.13, f: 140, gain: 0.16 });
    voice(a, { t: 0.2, dur: 0.22, f: 150, f2: 120, vowel: 'uh', gain: 0.09, breath: 0.03 });
  },
  // Goblin: scampering little feet, then a nasty high "heh-heh-heh" cackle.
  'etb-goblin': (a) => {
    steps(a, 4, { gap: 0.055, f: 420, gain: 0.07 });
    [0, 1, 2, 3].forEach((i) => voice(a, { t: 0.26 + i * 0.095, dur: 0.085, f: 620 - i * 40, f2: 520 - i * 40, vowel: 'e', gain: 0.1, breath: 0.03, attack: 0.01, formantShift: 1.25, q: 7 }));
  },
  // Vampire: a sharp hiss through fangs, then a flurry of bat wings.
  'etb-vampire': (a) => {
    noise(a, { dur: 0.5, type: 'highpass', f: 4500, f2: 6500, gain: 0.12 });
    noise(a, { dur: 0.5, f: 2800, q: 4, gain: 0.05 });
    voice(a, { t: 0.05, dur: 0.45, f: 110, f2: 95, vowel: 'a', vowel2: 'o', gain: 0.035, growl: 0.4, breath: 0.03 });
    for (let i = 0; i < 9; i++) noise(a, { t: 0.42 + i * 0.045, dur: 0.035, f: 700 + (i % 3) * 120, q: 1.2, gain: 0.07 });
  },
  // Demon: a match strikes and catches, under a dark organ chord with a tritone (an infernal pact).
  'etb-demon': (a) => {
    noise(a, { dur: 0.08, type: 'highpass', f: 3000, f2: 1500, gain: 0.15 });
    noise(a, { t: 0.06, dur: 0.4, f: 900, f2: 1600, q: 0.8, gain: 0.07, rise: true });
    for (const [f, g] of [[65, 0.05], [78, 0.035], [92, 0.035], [131, 0.025]] as const) {
      tone(a, { t: 0.12, f, dur: 1.1, type: 'sawtooth', gain: g * 0.45, vib: 1.5 });
      tone(a, { t: 0.12, f, dur: 1.1, type: 'sine', gain: g });
    }
  },
  // Zombie: a hand punches up through the soil; earth and pebbles scatter.
  'etb-zombie': (a) => {
    noise(a, { dur: 0.35, type: 'lowpass', f: 300, f2: 800, gain: 0.12, rise: true });
    tone(a, { t: 0.33, f: 80, f2: 40, dur: 0.25, gain: 0.25 });
    noise(a, { t: 0.33, dur: 0.15, f: 600, q: 0.8, gain: 0.2 });
    noise(a, { t: 0.4, dur: 0.2, type: 'lowpass', f: 500, gain: 0.1 });
    for (let i = 0; i < 12; i++) noise(a, { t: 0.43 + i * (0.025 + Math.random() * 0.03), dur: 0.025, f: 700 + Math.random() * 900, q: 2, gain: 0.08 * (1 - i / 14) });
  },
  // Human: armored footsteps and a short battle shout ("hah!").
  'etb-human': (a) => {
    steps(a, 2, { gap: 0.14, f: 150, gain: 0.14 });
    for (let i = 0; i < 2; i++) tone(a, { t: i * 0.14 + 0.01, f: 2400 + i * 300, dur: 0.06, type: 'triangle', gain: 0.025 });
    voice(a, { t: 0.3, dur: 0.24, f: 210, f2: 170, vowel: 'a', gain: 0.12, breath: 0.04, attack: 0.015 });
  },
  // Construct: a heavy clunk, a servo whirring up, and a two-tone robot chirp.
  'etb-construct': (a) => {
    tone(a, { f: 120, f2: 70, dur: 0.16, type: 'square', gain: 0.06 });
    noise(a, { dur: 0.05, type: 'highpass', f: 2600, gain: 0.1 });
    tone(a, { t: 0.12, f: 220, f2: 880, dur: 0.38, type: 'sawtooth', gain: 0.025, vib: 25, });
    tone(a, { t: 0.55, f: 1320, dur: 0.07, type: 'square', gain: 0.03 });
    tone(a, { t: 0.64, f: 990, dur: 0.1, type: 'square', gain: 0.03 });
  },
  // God: a radiant choir singing "aah" on a major chord.
  'etb-god': (a) => {
    for (const [f, g] of [[262, 0.07], [330, 0.06], [392, 0.06], [523, 0.045]] as const) voice(a, { dur: 1.3, f, vowel: 'a', vowel2: 'o', gain: g, vib: 4, vibRate: 5, breath: 0.012, attack: 0.25, q: 6 });
    tone(a, { t: 0.2, f: 2093, dur: 1.0, gain: 0.015, vib: 6 });
  },
  // Demigod: one young voice singing "ooh", and a bright bell.
  'etb-demigod': (a) => {
    voice(a, { dur: 0.9, f: 523, vowel: 'u', vowel2: 'o', gain: 0.07, vib: 5, attack: 0.15, q: 6 });
    tone(a, { f: 1568, dur: 0.6, gain: 0.04, vib: 3 });
  },
  // Druid: leaves rustle, birds answer, and a hollow wooden knock.
  'etb-druid': (a) => {
    noise(a, { dur: 0.45, f: 2600, f2: 1400, q: 0.6, gain: 0.07 });
    chirp(a, 0.12, 2400);
    chirp(a, 0.3, 2800);
    tone(a, { t: 0.5, f: 520, f2: 480, dur: 0.12, type: 'triangle', gain: 0.07 });
  },
  // Dragon: wings beat the air, then a huge rumbling roar.
  'etb-dragon': (a) => {
    wings(a, 2, { gap: 0.22, f: 350, gain: 0.16 });
    voice(a, { t: 0.4, dur: 1.1, f: 95, f2: 55, vowel: 'a', vowel2: 'o', gain: 0.2, growl: 1.2, breath: 0.12, attack: 0.08, formantShift: 0.75 });
    noise(a, { t: 0.4, dur: 1.1, type: 'lowpass', f: 900, f2: 300, gain: 0.08 });
  },
  // Dragon Rider: a wingbeat, a rider's horn call, and a small dragon snort.
  'etb-dragon-rider': (a) => {
    wings(a, 1, { gap: 0.25, f: 420, gain: 0.14 });
    tone(a, { t: 0.2, f: 294, dur: 0.18, type: 'sawtooth', gain: 0.03 });
    tone(a, { t: 0.36, f: 440, dur: 0.4, type: 'sawtooth', gain: 0.035, vib: 4 });
    tone(a, { t: 0.36, f: 440, dur: 0.4, type: 'triangle', gain: 0.04 });
    voice(a, { t: 0.7, dur: 0.3, f: 120, f2: 80, vowel: 'o', gain: 0.07, growl: 0.6, breath: 0.08 });
  },
  // Shapeshifter: a voice that melts from vowel to vowel and pitch to pitch.
  'etb-shapeshifter': (a) => {
    voice(a, { dur: 0.5, f: 180, f2: 360, vowel: 'a', vowel2: 'i', gain: 0.08, vib: 30, vibRate: 7 });
    voice(a, { t: 0.45, dur: 0.45, f: 360, f2: 150, vowel: 'i', vowel2: 'u', gain: 0.08, vib: 30, vibRate: 7 });
  },
  // Illusion: a ghostly whisper and a glassy shimmer.
  'etb-illusion': (a) => {
    for (let i = 0; i < 2; i++) noise(a, { t: i * 0.05, dur: 0.6, f: VOWEL.i[i], f2: VOWEL.a[i], q: 8, gain: 0.05 });
    tone(a, { t: 0.1, f: 1760, dur: 0.5, gain: 0.035, vib: 22 });
    tone(a, { t: 0.18, f: 2637, dur: 0.4, gain: 0.025, vib: 18 });
  },
  // Human, Soldier: a sword drawn from its sheath with a ring, then a sharp "hup!".
  'etb-human-soldier': (a) => {
    noise(a, { dur: 0.35, type: 'highpass', f: 2500, f2: 6000, gain: 0.1, rise: true });
    tone(a, { t: 0.33, f: 2637, dur: 0.6, type: 'sine', gain: 0.05, vib: 3 });
    tone(a, { t: 0.33, f: 3951, dur: 0.4, type: 'sine', gain: 0.02 });
    voice(a, { t: 0.5, dur: 0.16, f: 230, f2: 200, vowel: 'u', vowel2: 'uh', gain: 0.12, breath: 0.05, attack: 0.01 });
  },
  // Human, Herald: a three-note brass fanfare (a voiced horn), and a cheer from the crowd.
  'etb-human-herald': (a) => {
    [[392, 0, 0.15], [392, 0.16, 0.1], [523, 0.28, 0.5]].forEach(([f, t, d]) => voice(a, { t, dur: d, f, vowel: 'a', gain: 0.09, attack: 0.02, q: 5, vib: t > 0.2 ? 4 : 0 }));
    for (let i = 0; i < 3; i++) noise(a, { t: 0.55 + i * 0.03, dur: 0.5, f: 900 + i * 400, q: 3, gain: 0.025, rise: true });
  },
  // Human, Villager: footsteps on wood and a friendly rising "hey!".
  'etb-human-villager': (a) => {
    for (let i = 0; i < 2; i++) tone(a, { t: i * 0.15, f: 260, f2: 180, dur: 0.07, type: 'triangle', gain: 0.1 });
    voice(a, { t: 0.32, dur: 0.3, f: 210, f2: 290, vowel: 'e', vowel2: 'i', gain: 0.12, breath: 0.04, attack: 0.02 });
  },
  // Human, Knight: heavy armored steps with jingling mail, a visor clang, and a low "hrm".
  'etb-human-knight': (a) => {
    steps(a, 2, { gap: 0.2, f: 120, gain: 0.18, heavy: true });
    for (let i = 0; i < 2; i++) for (let k = 0; k < 3; k++) tone(a, { t: i * 0.2 + 0.02 + k * 0.02, f: 3200 + Math.random() * 1500, dur: 0.05, type: 'triangle', gain: 0.02 });
    tone(a, { t: 0.45, f: 1100, dur: 0.35, type: 'triangle', gain: 0.06 });
    tone(a, { t: 0.45, f: 1650, dur: 0.25, type: 'square', gain: 0.015 });
    voice(a, { t: 0.62, dur: 0.32, f: 120, f2: 105, vowel: 'u', gain: 0.1, breath: 0.03, attack: 0.03 });
  },
  soul: (a) => {
    tone(a, { f: 880, dur: 0.55, gain: 0.08, vib: 14 });
    tone(a, { t: 0.05, f: 1320, dur: 0.5, gain: 0.04, vib: 10 });
  },
};

/** Loudness trims so every creature sound sits at about the same level. */
const LEVEL: Partial<Record<SoundKind, number>> = {
  'etb-illusion': 2.6,
  'etb-demigod': 1.8,
  'etb-druid': 1.8,
  'etb-dragon-rider': 1.8,
  'etb-construct': 1.6,
  'etb-dragon': 1.5,
  'etb-vampire': 1.3,
  etbArtifact: 1.3,
};

/** Play a sound. The same sound within 60 ms is skipped (several cards at once stagger instead). */
export function playSound(kind: SoundKind, delayMs = 0): void {
  const run = () => {
    const now = performance.now();
    if (now - (lastPlayed.get(kind) ?? 0) < 60) return;
    lastPlayed.set(kind, now);
    const a = audio();
    if (!a) return;
    const lvl = LEVEL[kind];
    if (lvl) {
      const g = a.ac.createGain();
      g.gain.value = lvl;
      g.connect(a.out);
      SOUNDS[kind]({ ac: a.ac, out: g });
    } else SOUNDS[kind](a);
  };
  if (delayMs > 0) setTimeout(run, delayMs);
  else run();
}

/** Plays a sound described by a function (used to audition new sounds). */
export function playWith(fn: (a: Out) => void): void {
  const a = audio();
  if (a) fn(a);
}
