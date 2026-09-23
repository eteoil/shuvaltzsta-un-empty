// 曲の区間は小節番号でデータに持ち、秒への換算はここだけで行う（憲法⑯）。
// 曲ファイルが読めない時は、同じテンポのクリック音をプレースホルダーとして鳴らす（憲法⑩）
export class Bgm {
  constructor(clock, config) {
    this.clock = clock;
    this.config = config;
    this.buffers = {};
    this.bus = clock.ctx.createGain();
    this.bus.gain.value = config.volume?.bgm ?? 0.8;
    this.bus.connect(clock.master);
    this.voices = [];
    this.click = null;
    this.current = null;
  }

  get spb() {
    return 60 / this.config.bpm;
  }

  // 「n 小節目の頭」が曲の先頭から何秒か
  barTime(bar) {
    return (bar - 1) * this.config.beatsPerBar * this.spb;
  }

  async load(key) {
    const def = this.config.bgm[key];
    try {
      const res = await fetch(def.src);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.arrayBuffer();
      this.buffers[key] = await new Promise((ok, ng) => this.clock.ctx.decodeAudioData(data, ok, ng));
    } catch (e) {
      this.buffers[key] = null;
      console.info(`[bgm] ${def.src} を読めないので、クリック音で代用します（${e.message ?? e}）`);
    }
  }

  isPlaceholder(key) {
    return !this.buffers[key];
  }

  get playing() {
    return this.voices.length > 0 || !!this.click;
  }

  // at に startBar から鳴らし始め、loopBars の区間を繰り返す。
  // 戻り値は「1小節目の頭」が鳴る AudioContext 時刻。Beat 0 はここになる
  play(key, at) {
    this.stop(0);
    const def = this.config.bgm[key];
    const offset = (def.offsetMs || 0) / 1000;
    const startSec = this.barTime(def.startBar ?? 1);
    const buffer = this.buffers[key];
    if (buffer) {
      this.voice(buffer, at, startSec + offset, {
        start: this.barTime(def.loopBars[0]) + offset,
        end: this.barTime(def.loopBars[1] + 1) + offset,
      });
    } else {
      this.click = { zero: at - startSec, next: Math.round(startSec / this.spb), until: Infinity };
    }
    this.current = { key, def, offset };
    return at - startSec;
  }

  // 決着後：at（Beat の格子に乗った時刻）から outroBar 以降を最後まで流す
  outro(at) {
    const cur = this.current;
    if (!cur) return;
    for (const v of this.voices) this.fade(v, at, 0.004);
    const buffer = this.buffers[cur.key];
    if (buffer) {
      this.voice(buffer, at, this.barTime(cur.def.outroBar) + cur.offset, null);
    } else if (this.click) {
      this.click.until = at;
      [523, 659, 784, 1047].forEach((f, i) => this.blip(f, 0.16, 0.35, at + i * this.spb / 2));
    }
    this.current = null;
  }

  stop(fadeSec = 0.3) {
    const now = this.clock.now;
    for (const v of this.voices) this.fade(v, now, fadeSec);
    this.click = null;
    this.current = null;
  }

  voice(buffer, when, offset, loop) {
    const ctx = this.clock.ctx;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    if (loop) {
      src.loop = true;
      src.loopStart = loop.start;
      src.loopEnd = loop.end;
    }
    const gain = ctx.createGain();
    // 継ぎ目のプチッという音を消すため、4ms だけ立ち上げる
    gain.gain.setValueAtTime(0, when);
    gain.gain.linearRampToValueAtTime(1, when + 0.004);
    src.connect(gain).connect(this.bus);
    src.start(when, offset);
    const v = { src, gain, stopped: false };
    src.onended = () => { this.voices = this.voices.filter((x) => x !== v); };
    this.voices.push(v);
    return v;
  }

  fade(v, at, dur) {
    if (v.stopped) return;
    v.stopped = true;
    const t = Math.max(at, this.clock.now);
    v.gain.gain.cancelScheduledValues(t);
    v.gain.gain.setValueAtTime(v.gain.gain.value, t);
    v.gain.gain.linearRampToValueAtTime(0, t + dur);
    v.src.stop(t + dur + 0.01);
  }

  blip(freq, dur, vol, when) {
    const ctx = this.clock.ctx;
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(freq, when);
    env.gain.setValueAtTime(vol, when);
    env.gain.exponentialRampToValueAtTime(0.001, when + dur);
    osc.connect(env).connect(this.bus);
    osc.start(when);
    osc.stop(when + dur + 0.02);
  }

  // プレースホルダーのクリック音を少し先まで予約する。描画ループから毎フレーム呼ぶ
  tick() {
    const c = this.click;
    const ctx = this.clock.ctx;
    if (!c || ctx.state !== 'running') return;
    const now = ctx.currentTime;
    for (;;) {
      const t = c.zero + c.next * this.spb;
      if (t >= c.until || t > now + 0.15) break;
      if (t >= now - 0.01) {
        const head = c.next % this.config.beatsPerBar === 0;
        this.blip(head ? 1046 : 523, 0.05, head ? 0.3 : 0.15, t);
        if (c.next % 2 === 0) this.blip(65, 0.12, 0.45, t);
      }
      c.next++;
    }
  }
}
