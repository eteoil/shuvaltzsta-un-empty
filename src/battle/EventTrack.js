let nextId = 1;

// 「何拍目に何が起きるか」の唯一の台帳（設計案 1・憲法⑭）。
// lockedUntil より手前は確定済みで、追加も削除もできない（憲法⑮）
export class EventTrack {
  constructor(name) {
    this.name = name;
    this.events = [];
    this.lockedUntil = -Infinity;
    this.endBeat = 0;
    this.fireIndex = 0;
    this.prepareIndex = 0;
  }

  lockUntil(beat) {
    if (beat > this.lockedUntil) this.lockedUntil = beat;
  }

  assertWritable(beat) {
    if (beat < this.lockedUntil) {
      throw new Error(`EventTrack(${this.name}): ${beat} 拍目は確定済み（${this.lockedUntil.toFixed(2)} 拍目まで）`);
    }
  }

  add({ beat, type, payload = {}, pattern = null }) {
    this.assertWritable(beat);
    const ev = { id: nextId++, beat, type, payload, pattern };
    let i = this.events.length;
    while (i > 0 && this.events[i - 1].beat > beat) i--;
    this.events.splice(i, 0, ev);
    this.endBeat = Math.max(this.endBeat, beat);
    return ev;
  }

  // Pattern の相対 offset を絶対 Beat に直して載せる（設計案 3）
  addPattern(pattern, startBeat) {
    this.assertWritable(startBeat);
    for (const e of pattern.events) {
      this.add({ beat: startBeat + e.offset, type: e.type, payload: e.payload, pattern: pattern.id });
    }
    this.endBeat = Math.max(this.endBeat, startBeat + pattern.length);
  }

  between(from, to) {
    return this.events.filter((e) => e.beat >= from && e.beat < to);
  }
}
