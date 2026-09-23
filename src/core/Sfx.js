// 8ビット風の効果音。素材を使わずオシレーターで鳴らす
export class Sfx {
  constructor(clock, config) {
    this.clock = clock;
    this.out = clock.ctx.createGain();
    this.out.gain.value = config.volume?.sfx ?? 0.3;
    this.out.connect(clock.master);
    this.noiseBuffer = null;
  }

  tone(freq, dur, { type = 'square', vol = 0.5, when, slide } = {}) {
    const ctx = this.clock.ctx;
    if (ctx.state !== 'running') return;
    const t = Math.max(when ?? ctx.currentTime, ctx.currentTime);
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slide) osc.frequency.exponentialRampToValueAtTime(slide, t + dur);
    env.gain.setValueAtTime(vol, t);
    env.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(env).connect(this.out);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  noise(dur, { vol = 0.5, when } = {}) {
    const ctx = this.clock.ctx;
    if (ctx.state !== 'running') return;
    if (!this.noiseBuffer) {
      this.noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
      const d = this.noiseBuffer.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    const t = Math.max(when ?? ctx.currentTime, ctx.currentTime);
    const src = ctx.createBufferSource();
    const env = ctx.createGain();
    src.buffer = this.noiseBuffer;
    env.gain.setValueAtTime(vol, t);
    env.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(env).connect(this.out);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  play(name, when) {
    switch (name) {
      case 'select': return this.tone(660, 0.05, { vol: 0.3, when });
      case 'confirm':
        this.tone(660, 0.06, { vol: 0.35, when });
        return this.tone(990, 0.08, { vol: 0.35, when: (when ?? this.clock.now) + 0.06 });
      case 'step': return this.tone(180, 0.03, { type: 'triangle', vol: 0.25, when });
      case 'perfect': return this.tone(1320, 0.08, { vol: 0.35, when });
      case 'good': return this.tone(880, 0.07, { vol: 0.3, when });
      case 'miss': return this.tone(140, 0.12, { type: 'sawtooth', vol: 0.3, when, slide: 90 });
      case 'hit':
        this.noise(0.18, { vol: 0.6, when });
        return this.tone(220, 0.15, { vol: 0.35, when, slide: 60 });
      case 'guard': return this.tone(520, 0.06, { type: 'triangle', vol: 0.5, when, slide: 780 });
      case 'dodge': return this.tone(400, 0.09, { vol: 0.25, when, slide: 1200 });
      case 'block': return this.tone(300, 0.06, { vol: 0.35, when, slide: 250 });
      case 'telegraph': return this.tone(1760, 0.03, { vol: 0.2, when });
      case 'ko':
        this.noise(0.35, { vol: 0.5, when });
        return this.tone(440, 0.4, { vol: 0.35, when, slide: 55 });
      default: return undefined;
    }
  }
}
