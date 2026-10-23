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
  | 'etb-illusion';

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let enabled = true;
let volume = 0.5;
const lastPlayed = new Map<SoundKind, number>();

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
function tone(a: { ac: AudioContext; out: GainNode }, o: { f: number; f2?: number; t?: number; dur: number; type?: OscillatorType; gain?: number; vib?: number }) {
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
function noise(a: { ac: AudioContext; out: GainNode }, o: { t?: number; dur: number; type?: BiquadFilterType; f: number; f2?: number; q?: number; gain?: number; rise?: boolean }) {
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
  // Any other creature: a firm step onto the table.
  etbCreature: (a) => {
    tone(a, { f: 120, f2: 70, dur: 0.18, gain: 0.22 });
    noise(a, { dur: 0.06, type: 'lowpass', f: 700, gain: 0.1 });
  },
  // Goblin: quick scampering steps and a cheeky high snicker.
  'etb-goblin': (a) => {
    for (let i = 0; i < 3; i++) noise(a, { t: i * 0.05, dur: 0.03, type: 'bandpass', f: 1400, q: 2, gain: 0.08 });
    tone(a, { t: 0.15, f: 1100, f2: 1500, dur: 0.06, type: 'square', gain: 0.025 });
    tone(a, { t: 0.23, f: 1250, f2: 1700, dur: 0.06, type: 'square', gain: 0.025 });
  },
  // Vampire: a low minor swell and a flutter of bat wings.
  'etb-vampire': (a) => {
    tone(a, { f: 220, dur: 0.6, type: 'sawtooth', gain: 0.025, vib: 3 });
    tone(a, { f: 262, dur: 0.6, type: 'sawtooth', gain: 0.02, vib: 3 });
    for (let i = 0; i < 4; i++) noise(a, { t: 0.12 + i * 0.06, dur: 0.04, type: 'bandpass', f: 900, q: 1.5, gain: 0.06 });
  },
  // Demon: a low growl over crackling embers.
  'etb-demon': (a) => {
    tone(a, { f: 70, f2: 55, dur: 0.5, type: 'sawtooth', gain: 0.07, vib: 9 });
    for (let i = 0; i < 5; i++) noise(a, { t: 0.05 + i * 0.07, dur: 0.03, type: 'highpass', f: 2200 + Math.random() * 1800, gain: 0.06 });
  },
  // Zombie: earth breaks, then a hollow moan.
  'etb-zombie': (a) => {
    noise(a, { dur: 0.12, type: 'lowpass', f: 500, gain: 0.14 });
    tone(a, { t: 0.08, f: 190, f2: 140, dur: 0.55, type: 'triangle', gain: 0.06, vib: 5 });
  },
  // Human: two bright brass-like notes, a small fanfare.
  'etb-human': (a) => {
    tone(a, { f: 392, dur: 0.14, type: 'sawtooth', gain: 0.035 });
    tone(a, { t: 0.13, f: 523, dur: 0.28, type: 'sawtooth', gain: 0.035 });
    tone(a, { t: 0.13, f: 523, dur: 0.28, type: 'triangle', gain: 0.05 });
  },
  // Construct: a heavy clank and a servo whir powering up.
  'etb-construct': (a) => {
    tone(a, { f: 180, f2: 140, dur: 0.1, type: 'square', gain: 0.05 });
    noise(a, { dur: 0.05, type: 'highpass', f: 2500, gain: 0.08 });
    tone(a, { t: 0.1, f: 300, f2: 900, dur: 0.3, type: 'square', gain: 0.02 });
  },
  // God: a radiant choir swell.
  'etb-god': (a) => {
    for (const [f, g] of [[523, 0.05], [659, 0.04], [784, 0.04], [1046, 0.025]] as const) tone(a, { f, dur: 0.85, type: 'sine', gain: g, vib: 5 });
  },
  // Demigod: a single bright bell, the promise of more.
  'etb-demigod': (a) => {
    tone(a, { f: 1046, dur: 0.6, type: 'sine', gain: 0.07, vib: 4 });
    tone(a, { t: 0.04, f: 1568, dur: 0.4, type: 'sine', gain: 0.03 });
  },
  // Druid: rustling leaves and a wooden chime.
  'etb-druid': (a) => {
    noise(a, { dur: 0.3, f: 2400, f2: 1200, q: 0.6, gain: 0.06 });
    tone(a, { t: 0.08, f: 660, dur: 0.3, type: 'triangle', gain: 0.05 });
    tone(a, { t: 0.16, f: 990, dur: 0.3, type: 'triangle', gain: 0.04 });
  },
  // Dragon: a deep roar with a gust of wind.
  'etb-dragon': (a) => {
    noise(a, { dur: 0.6, type: 'lowpass', f: 300, f2: 1400, gain: 0.12, rise: true });
    tone(a, { f: 90, f2: 60, dur: 0.6, type: 'sawtooth', gain: 0.06, vib: 12 });
  },
  // Dragon Rider: a wingbeat and a short horn call.
  'etb-dragon-rider': (a) => {
    noise(a, { dur: 0.12, f: 400, q: 0.8, gain: 0.1 });
    noise(a, { t: 0.16, dur: 0.12, f: 400, q: 0.8, gain: 0.08 });
    tone(a, { t: 0.1, f: 330, f2: 349, dur: 0.35, type: 'sawtooth', gain: 0.03 });
  },
  // Shapeshifter: a warbling, shifting tone.
  'etb-shapeshifter': (a) => tone(a, { f: 400, f2: 900, dur: 0.4, type: 'triangle', gain: 0.06, vib: 40 }),
  // Illusion: a glassy shimmer.
  'etb-illusion': (a) => {
    tone(a, { f: 1760, dur: 0.35, type: 'sine', gain: 0.04, vib: 20 });
    tone(a, { t: 0.06, f: 2349, dur: 0.3, type: 'sine', gain: 0.03 });
  },
  soul: (a) => {
    tone(a, { f: 880, dur: 0.55, gain: 0.08, vib: 14 });
    tone(a, { t: 0.05, f: 1320, dur: 0.5, gain: 0.04, vib: 10 });
  },
};

/** Play a sound. The same sound within 60 ms is skipped (several cards at once stagger instead). */
export function playSound(kind: SoundKind, delayMs = 0): void {
  const run = () => {
    const now = performance.now();
    if (now - (lastPlayed.get(kind) ?? 0) < 60) return;
    lastPlayed.set(kind, now);
    const a = audio();
    if (a) SOUNDS[kind](a);
  };
  if (delayMs > 0) setTimeout(run, delayMs);
  else run();
}
