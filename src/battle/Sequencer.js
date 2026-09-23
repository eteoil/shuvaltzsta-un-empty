// 現在 Beat を超えたイベントを発火するだけ。判断はしない（設計案 1）。
// 確定済み区間に入ったイベントは prepare で先に知らせる。音を拍ぴったりに予約するため
export class Sequencer {
  constructor(tracks, config) {
    this.tracks = tracks;
    this.lookahead = config.lookaheadBeats;
    this.refillMargin = config.refillMarginBeats;
  }

  update(beat, handler) {
    const horizon = beat + this.lookahead;
    for (const track of Object.values(this.tracks)) {
      track.lockUntil(horizon);
      const evs = track.events;
      while (track.prepareIndex < evs.length && evs[track.prepareIndex].beat < horizon) {
        handler.prepare(evs[track.prepareIndex++]);
      }
      while (track.fireIndex < evs.length && evs[track.fireIndex].beat <= beat) {
        handler.fire(evs[track.fireIndex++]);
      }
    }
  }

  // 補充の起動点はこの条件式ひとつだけ（設計案 4）
  needsRefill(track, beat) {
    return track.endBeat < beat + this.lookahead + this.refillMargin;
  }
}
