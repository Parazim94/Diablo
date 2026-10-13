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
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t); o.stop(t + dur + 0.05);
  }

  private noise(dur: number, vol: number, freq: number, type: BiquadFilterType = 'bandpass') {
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

  play(name: 'hit' | 'crit' | 'hurt' | 'pickup' | 'levelup' | 'whirl' | 'buff' | 'bash' | 'death' | 'stairs' | 'shoot' | 'equip' | 'win') {
    if (!this.ctx || this.muted) return;
    switch (name) {
      case 'hit': this.noise(0.08, 0.5, 1400); this.tone(200, 0.1, 'sawtooth', 0.15, 80); break;
      case 'crit': this.noise(0.12, 0.6, 1800); this.tone(700, 0.15, 'square', 0.12, 300); this.tone(160, 0.15, 'sawtooth', 0.2, 60); break;
      case 'hurt': this.tone(140, 0.18, 'sawtooth', 0.22, 60); break;
      case 'pickup': this.tone(600, 0.12, 'sine', 0.2, 950); break;
      case 'equip': this.tone(320, 0.06, 'square', 0.1, 220); break;
      case 'levelup': [440, 554, 659, 880].forEach((f, i) => this.tone(f, 0.35, 'triangle', 0.2, undefined, i * 0.1)); break;
      case 'whirl': this.noise(0.3, 0.5, 900); break;
      case 'bash': this.noise(0.1, 0.7, 500); this.tone(110, 0.25, 'sawtooth', 0.3, 40); break;
      case 'buff': this.tone(200, 0.4, 'sawtooth', 0.15, 500); break;
      case 'death': this.tone(220, 1.0, 'sawtooth', 0.3, 35); break;
      case 'stairs': this.tone(320, 0.6, 'triangle', 0.25, 90); break;
      case 'shoot': this.tone(520, 0.1, 'triangle', 0.1, 280); break;
      case 'win': [523, 659, 784, 1047, 784, 1047].forEach((f, i) => this.tone(f, 0.45, 'triangle', 0.22, undefined, i * 0.14)); break;
    }
  }

  /** Quiet dark drone with sparse minor-scale notes. */
  startMusic() {
    const c = this.ctx;
    if (!c || this.musicOn) return;
    this.musicOn = true;
    const g = c.createGain(); g.gain.value = 0.05;
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 320;
    const lfo = c.createOscillator(), lg = c.createGain();
    lfo.frequency.value = 0.07; lg.gain.value = 140;
    lfo.connect(lg).connect(f.frequency); lfo.start();
    for (const [fr, ty] of [[55, 'sine'], [82.7, 'triangle'], [110.4, 'sawtooth']] as [number, OscillatorType][]) {
      const o = c.createOscillator(); o.type = ty; o.frequency.value = fr; o.connect(f); o.start();
    }
    f.connect(g).connect(this.master);

    const scale = [220, 261.6, 293.7, 329.6, 392, 440];
    const next = () => {
      if (!this.muted && this.ctx) this.tone(scale[Math.floor(Math.random() * scale.length)] / 2, 3, 'sine', 0.05);
      setTimeout(next, 3500 + Math.random() * 5000);
    };
    setTimeout(next, 2000);
  }
}

export const sfx = new AudioFx();
