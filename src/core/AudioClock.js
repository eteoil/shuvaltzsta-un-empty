// 憲法⑫：ゲーム性に関わる時間は AudioContext.currentTime だけを見る。
// ポーズは AudioContext.suspend() で行う。止まっている間は currentTime も進まないので、
// battleStartTime を書き換えずに Beat がそのまま止まる（設計案 9-2 の解決）
export class AudioClock {
  constructor(config) {
    const AC = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AC({ latencyHint: 'interactive' });
    this.master = this.ctx.createGain();
    this.master.connect(this.ctx.destination);
    this.offsetSec = (config.audioOffsetMs || 0) / 1000;
    this.paused = false;
    // 画面操作の効果音用。ポーズで ctx を止めている間も鳴らせるよう、こちらは止めない。
    // ゲーム性に関わる時間には使わない（憲法⑫）
    this.ui = new AC({ latencyHint: 'interactive' });
    // 裏から戻ったら、止めていない（ポーズ中でない）のに止まっている時計を動かし直す。
    // ここで動かせなくても、次にボタンを押したとき unlock でもう一度試す
    document.addEventListener('visibilitychange', () => { if (!document.hidden) this.unlock(); });
  }

  get now() {
    return this.ctx.currentTime;
  }

  get running() {
    return this.ctx.state === 'running';
  }

  // スケジュールした音が耳に届くまでの遅れ。判定と表示はこのぶん後ろへずらす
  get latency() {
    return (this.ctx.baseLatency || 0) + (this.ctx.outputLatency || 0) + this.offsetSec;
  }

  // ブラウザは操作の中でしか音を鳴らせないので、入力のたびに呼ぶ
  // iOS では resume だけでは足りないことがあるので、操作の中で無音を一瞬鳴らしておく
  unlock() {
    if (!this.paused && this.ctx.state !== 'running') this.ctx.resume();
    if (this.ui.state !== 'running') {
      this.ui.resume();
      const src = this.ui.createBufferSource();
      src.buffer = this.ui.createBuffer(1, 1, this.ui.sampleRate);
      src.connect(this.ui.destination);
      src.start(0);
    }
  }

  suspend() {
    this.paused = true;
    return this.ctx.suspend();
  }

  resume() {
    this.paused = false;
    return this.ctx.resume();
  }
}
