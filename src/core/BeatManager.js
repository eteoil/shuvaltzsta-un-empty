// 憲法②⑫：Beat は AudioContext.currentTime から計算する。Beat↔時刻の変換はここだけ
export class BeatManager {
  constructor(clock, config) {
    this.clock = clock;
    this.spb = 60 / config.bpm;
    this.battleStartTime = 0;
    this.latency = 0;
  }

  // beatZeroTime：Beat 0 の音が出力される AudioContext 上の時刻
  start(beatZeroTime) {
    this.battleStartTime = beatZeroTime;
    // outputLatency は毎フレーム揺れるので、戦闘中は開始時の値で固定する
    this.latency = this.clock.latency;
  }

  beatToTime(beat) {
    return this.battleStartTime + beat * this.spb;
  }

  timeToBeat(time) {
    return (time - this.battleStartTime) / this.spb;
  }

  // 「いま耳に届いている」時刻と Beat
  get perceivedNow() {
    return this.clock.now - this.latency;
  }

  get currentBeat() {
    return this.timeToBeat(this.perceivedNow);
  }

  perceivedBeatAt(rawTime) {
    return this.timeToBeat(rawTime - this.latency);
  }

  // 入力時刻（生の currentTime）が beat からどれだけずれているか
  deltaMs(rawTime, beat) {
    return (rawTime - this.latency - this.beatToTime(beat)) * 1000;
  }
}
