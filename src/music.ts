/**
 * Generative dark-fantasy score: D minor, 72 bpm, i – VI – iv – V.
 * Layers: warm pad, bass, taiko drums, plucked arpeggio and sparse bell melody.
 * Drums and arpeggio density rise with `intensity` (combat). Everything is tonal – no noise.
 */
const BPM = 72;
const BEAT = 60 / BPM;
const BAR = BEAT * 4;

const hz = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12);

// root (bass) and chord tones (midi) per bar of the progression
const PROGRESSION = [
  { root: 38, tones: [62, 65, 69, 74] },  // Dm
  { root: 34, tones: [58, 62, 65, 70] },  // Bb
  { root: 31, tones: [58, 62, 67, 70] },  // Gm
  { root: 33, tones: [61, 64, 69, 73] },  // A (major, harmonic-minor tension)
];
const BELL_NOTES = [69, 72, 74, 77, 79, 81]; // A C D F G A – D natural-minor pentatonic-ish

export class Music {
  private bus: GainNode;
  private delayIn: GainNode;
  private padFilter: BiquadFilterNode;
  private timer: number | null = null;
  private nextBar = 0;
  private bar = 0;
  intensity = 0;
  private smoothed = 0;

  constructor(private ctx: BaseAudioContext, out: AudioNode) {
    this.bus = ctx.createGain();
    this.bus.gain.value = 1.3;
    this.bus.connect(out);

    // Dotted-eighth echo gives plucks and bells their space.
    this.delayIn = ctx.createGain();
    const delay = ctx.createDelay(2);
    delay.delayTime.value = BEAT * 0.75;
    const fb = ctx.createGain(); fb.gain.value = 0.42;
    const damp = ctx.createBiquadFilter(); damp.type = 'lowpass'; damp.frequency.value = 1600;
    const wet = ctx.createGain(); wet.gain.value = 0.5;
    this.delayIn.connect(delay); delay.connect(damp); damp.connect(fb); fb.connect(delay); damp.connect(wet); wet.connect(this.bus);

    this.padFilter = ctx.createBiquadFilter();
    this.padFilter.type = 'lowpass'; this.padFilter.frequency.value = 900;
    this.padFilter.connect(this.bus);
  }

  start() {
    if (this.timer !== null) return;
    this.nextBar = this.ctx.currentTime + 0.2;
    this.timer = window.setInterval(() => this.pump(), 250);
    this.pump();
  }

  private pump() {
    const now = this.ctx.currentTime;
    if (this.nextBar < now) this.nextBar = now + 0.1; // tab was throttled – skip instead of bursting
    this.smoothed += (this.intensity - this.smoothed) * 0.5;
    while (this.nextBar < now + 1.2) {
      this.scheduleBar(this.bar++, this.nextBar, this.smoothed);
      this.nextBar += BAR;
    }
  }

  private env(g: GainNode, t: number, peak: number, attack: number, hold: number, release: number) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + attack);
    g.gain.setValueAtTime(peak, t + attack + hold);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + hold + release);
  }

  private osc(type: OscillatorType, freq: number, t: number, dur: number, dest: AudioNode, peak: number,
    attack: number, hold: number, release: number, slideTo?: number, detune = 0) {
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t); o.detune.value = detune;
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    this.env(g, t, peak, attack, hold, release);
    o.connect(g).connect(dest);
    o.start(t); o.stop(t + attack + hold + release + 0.05);
  }

  /** Schedules one bar of music starting at time `t`. Public so it can be rendered offline in tests. */
  scheduleBar(index: number, t: number, intensity: number) {
    const chord = PROGRESSION[index % PROGRESSION.length];

    // Pad: two detuned triangles per chord tone, slow swell across the bar
    for (const m of chord.tones) {
      this.osc('triangle', hz(m), t, BAR, this.padFilter, 0.028, 1.2, BAR - 2.2, 1.4, undefined, -7);
      this.osc('triangle', hz(m), t, BAR, this.padFilter, 0.028, 1.2, BAR - 2.2, 1.4, undefined, 7);
    }

    // Bass: root on 1 and the "and" of 3
    // Upper octaves carry the bass line on small phone speakers, which can't reproduce the fundamental.
    this.osc('sine', hz(chord.root), t, BEAT * 1.6, this.bus, 0.2, 0.02, BEAT * 1.0, 0.7);
    this.osc('triangle', hz(chord.root + 12), t, BEAT * 1.6, this.bus, 0.12, 0.02, BEAT * 0.9, 0.6);
    this.osc('triangle', hz(chord.root + 24), t, BEAT, this.bus, 0.05, 0.02, BEAT * 0.5, 0.4);
    this.osc('sine', hz(chord.root), t + BEAT * 2.5, BEAT, this.bus, 0.14, 0.02, BEAT * 0.5, 0.5);
    this.osc('triangle', hz(chord.root + 12), t + BEAT * 2.5, BEAT, this.bus, 0.09, 0.02, BEAT * 0.4, 0.4);

    // Taiko: always on beat 1; more hits when the fight heats up
    const taiko = (at: number, vol: number) => {
      this.osc('sine', 120, at, 0.4, this.bus, vol, 0.004, 0.02, 0.4, 42);
      this.osc('triangle', 240, at, 0.25, this.bus, vol * 0.7, 0.004, 0.01, 0.22, 90); // mid "skin" tone audible on phones
      this.osc('triangle', 420, at, 0.08, this.bus, vol * 0.3, 0.002, 0.005, 0.07, 200);
    };
    taiko(t, 0.36);
    if (intensity > 0.25) taiko(t + BEAT * 2, 0.26);
    if (intensity > 0.5) { taiko(t + BEAT * 1, 0.16); taiko(t + BEAT * 3, 0.16); }
    if (intensity > 0.75) { taiko(t + BEAT * 3.5, 0.2); taiko(t + BEAT * 1.5, 0.12); }

    // Arpeggio plucks on eighth notes, denser with intensity
    const prob = 0.5 + intensity * 0.4;
    const arpFilter = this.ctx.createBiquadFilter();
    arpFilter.type = 'lowpass'; arpFilter.frequency.value = 2400;
    arpFilter.connect(this.bus); arpFilter.connect(this.delayIn);
    for (let i = 0; i < 8; i++) {
      if (i !== 0 && Math.random() > prob) continue;
      const m = chord.tones[(i * 3 + Math.floor(Math.random() * 2)) % chord.tones.length] + (i % 4 === 3 ? 12 : 0);
      this.osc('triangle', hz(m), t + i * BEAT / 2, 0.4, arpFilter, 0.055, 0.004, 0.02, 0.35);
    }

    // Sparse bell melody every other bar
    if (index % 2 === 0 || Math.random() < 0.25) {
      const note = BELL_NOTES[Math.floor(Math.random() * BELL_NOTES.length)];
      const at = t + BEAT * (1 + Math.floor(Math.random() * 6) * 0.5);
      const bellFilter = this.ctx.createBiquadFilter(); bellFilter.type = 'lowpass'; bellFilter.frequency.value = 3000;
      bellFilter.connect(this.bus); bellFilter.connect(this.delayIn);
      this.osc('sine', hz(note), at, 2.5, bellFilter, 0.07, 0.01, 0.05, 2.4);
      this.osc('sine', hz(note) * 2.01, at, 1.5, bellFilter, 0.02, 0.01, 0.02, 1.4);
    }
  }
}
