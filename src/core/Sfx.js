// 8ビット風の効果音。素材を使わずオシレーターで鳴らす
export class Sfx {
  constructor(clock, config) {
    this.clock = clock;
    this.volume = config.volume?.sfx ?? 0.3;
    this.outs = new Map();       // AudioContext → 出口の GainNode
    this.noiseBuffers = new Map();
  }

  // when（拍に合わせた時刻）があれば本体の AudioContext で鳴らし、止まっていれば鳴らさない。
  // 無ければ今すぐ鳴らす音なので、本体が止まっている間（ポーズ中・音の許可待ち）は画面操作用の AudioContext で鳴らす
  pick(when) {
    const { ctx, ui } = this.clock;
    if (when !== undefined || ctx.state === 'running') return ctx;
    return ui;
  }

  out(ctx) {
    if (!this.outs.has(ctx)) {
      const gain = ctx.createGain();
      gain.gain.value = this.volume;
      gain.connect(ctx === this.clock.ctx ? this.clock.master : ctx.destination);
      this.outs.set(ctx, gain);
    }
    return this.outs.get(ctx);
  }

  // 鳴らせる AudioContext を返す。音の許可がまだ下りていなければ、下りてから retry を呼ぶ
  ready(when, retry) {
    const ctx = this.pick(when);
    if (ctx.state === 'running') return ctx;
    if (ctx === this.clock.ui) ctx.resume().then(retry, () => {});
    return null;
  }

  // delay は when（無ければ今）からの遅れ（秒）
  tone(freq, dur, { type = 'square', vol = 0.5, when, delay = 0, slide } = {}) {
    const ctx = this.ready(when, () => this.tone(freq, dur, { type, vol, when, delay, slide }));
    if (!ctx) return;
    const t = Math.max(when ?? ctx.currentTime, ctx.currentTime) + delay;
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slide) osc.frequency.exponentialRampToValueAtTime(slide, t + dur);
    env.gain.setValueAtTime(vol, t);
    env.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(env).connect(this.out(ctx));
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  noise(dur, { vol = 0.5, when, delay = 0 } = {}) {
    const ctx = this.ready(when, () => this.noise(dur, { vol, when, delay }));
    if (!ctx) return;
    if (!this.noiseBuffers.has(ctx)) {
      const buf = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      this.noiseBuffers.set(ctx, buf);
    }
    const t = Math.max(when ?? ctx.currentTime, ctx.currentTime) + delay;
    const src = ctx.createBufferSource();
    const env = ctx.createGain();
    src.buffer = this.noiseBuffers.get(ctx);
    env.gain.setValueAtTime(vol, t);
    env.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(env).connect(this.out(ctx));
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  play(name, when) {
    switch (name) {
      case 'select': return this.tone(660, 0.05, { vol: 0.3, when });
      case 'confirm':
        this.tone(660, 0.06, { vol: 0.35, when });
        return this.tone(990, 0.08, { vol: 0.35, when, delay: 0.06 });
      // アイテム：回復は上がる和音、毒やダメージは下がるうねり
      case 'heal':
        [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.09, { type: 'triangle', vol: 0.4, when, delay: i * 0.06 }));
        return undefined;
      // ベッドで休んだとき。ゆっくりした子守歌のような短いメロディ（ソ・シ・ミ・ソ・ファ・レ・ド）
      case 'rest': {
        const notes = [[392, 0.3], [494, 0.3], [659, 0.3], [784, 0.3], [698, 0.3], [587, 0.3], [523, 0.9]];
        let at = 0;
        for (const [f, d] of notes) {
          this.tone(f, d + 0.1, { type: 'triangle', vol: 0.35, when, delay: at });
          this.tone(f / 2, d + 0.1, { type: 'sine', vol: 0.2, when, delay: at });
          at += d;
        }
        return undefined;
      }
      // 出口を通るときの足音（ザッザッザッ）
      case 'steps':
        for (let k = 0; k < 3; k++) {
          this.noise(0.08, { vol: 0.35, when, delay: k * 0.17 });
          this.tone(110, 0.06, { type: 'triangle', vol: 0.25, when, delay: k * 0.17, slide: 70 });
        }
        return undefined;
      case 'levelup':
        [523, 659, 784, 1047, 784, 1047].forEach((f, i) => this.tone(f, i === 5 ? 0.3 : 0.08, { vol: 0.35, when, delay: i * 0.08 }));
        return undefined;
      case 'poison':
        this.tone(330, 0.3, { type: 'sawtooth', vol: 0.25, when, slide: 110 });
        return this.tone(349, 0.3, { type: 'square', vol: 0.15, when, delay: 0.08, slide: 98 });
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
