/** Tiny synthesised sound engine – no audio files needed. */
class AudioFx {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private musicOn = false;
  muted = false;

  /** Must be called from a user gesture (click/key) before anything is audible. */
  init() {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.5;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.5;
    return this.muted;
  }

  private tone(freq: number, dur: number, type: OscillatorType, vol: number, slideTo?: number, delay = 0) {
    const c = this.ctx; if (!c) return;
    const t = c.currentTime + delay;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.008); // short attack avoids clicks
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t); o.stop(t + dur + 0.05);
  }

  private noise(dur: number, vol: number, freq: number, type: BiquadFilterType = 'lowpass') {
    const c = this.ctx; if (!c) return;
    const len = Math.floor(c.sampleRate * dur);
    const buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = c.createBufferSource(); src.buffer = buf;
    const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq;
    const g = c.createGain(); const t = c.currentTime;
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(t);
  }

  play(name: 'hit' | 'crit' | 'hurt' | 'pickup' | 'levelup' | 'whirl' | 'buff' | 'bash' | 'death' | 'stairs' | 'shoot' | 'equip' | 'win' | 'potion') {
    if (!this.ctx || this.muted) return;
    switch (name) {
      // Mostly tonal "thuds" instead of broadband noise, which sounded like hissing.
      case 'hit': this.tone(170, 0.12, 'triangle', 0.4, 55); this.noise(0.04, 0.12, 700); break;
      case 'crit':
        this.tone(190, 0.16, 'triangle', 0.5, 50); this.noise(0.05, 0.15, 900);
        this.tone(1320, 0.25, 'sine', 0.12); this.tone(1980, 0.2, 'sine', 0.06); break;
      case 'hurt': this.tone(120, 0.2, 'sawtooth', 0.12, 55); this.tone(90, 0.2, 'sine', 0.3, 45); break;
      case 'pickup': this.tone(660, 0.1, 'sine', 0.18); this.tone(990, 0.18, 'sine', 0.16, undefined, 0.07); break;
      case 'equip': this.tone(260, 0.08, 'triangle', 0.25, 160); break;
      case 'potion': [380, 460, 560].forEach((f, i) => this.tone(f, 0.09, 'sine', 0.18, f * 1.4, i * 0.07)); break;
      case 'levelup': [440, 554, 659, 880].forEach((f, i) => this.tone(f, 0.4, 'triangle', 0.2, undefined, i * 0.1)); break;
      case 'whirl': this.tone(220, 0.3, 'triangle', 0.22, 760); this.tone(440, 0.3, 'sine', 0.1, 1100); this.noise(0.15, 0.06, 600); break;
      case 'bash': this.tone(130, 0.3, 'sine', 0.55, 32); this.tone(260, 0.1, 'triangle', 0.25, 90); this.noise(0.05, 0.15, 400); break;
      case 'buff': this.tone(196, 0.45, 'triangle', 0.2, 392); this.tone(294, 0.45, 'sine', 0.12, 588); break;
      case 'death': this.tone(196, 1.0, 'triangle', 0.35, 33); this.tone(98, 1.0, 'sine', 0.3, 30); break;
      case 'stairs': this.tone(330, 0.6, 'triangle', 0.22, 90); break;
      case 'shoot': this.tone(480, 0.09, 'triangle', 0.14, 260); break;
      case 'win': [523, 659, 784, 1047, 784, 1047].forEach((f, i) => this.tone(f, 0.45, 'triangle', 0.22, undefined, i * 0.14)); break;
    }
  }

  /** Quiet dark drone with sparse minor-scale notes. */
  startMusic() {
    const c = this.ctx;
    if (!c || this.musicOn) return;
    this.musicOn = true;
    const g = c.createGain(); g.gain.value = 0.07;
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 240;
    const lfo = c.createOscillator(), lg = c.createGain();
    lfo.frequency.value = 0.07; lg.gain.value = 60;
    lfo.connect(lg).connect(f.frequency); lfo.start();
    for (const [fr, ty] of [[55, 'sine'], [82.7, 'sine'], [110, 'triangle']] as [number, OscillatorType][]) {
      const o = c.createOscillator(); o.type = ty; o.frequency.value = fr; o.connect(f); o.start();
    }
    f.connect(g).connect(this.master);

    const scale = [220, 261.6, 293.7, 329.6, 392, 440];
    const next = () => {
      if (!this.muted && this.ctx) this.tone(scale[Math.floor(Math.random() * scale.length)] / 2, 3.5, 'sine', 0.07);
      setTimeout(next, 3500 + Math.random() * 5000);
    };
    setTimeout(next, 2000);
  }
}

export const sfx = new AudioFx();
