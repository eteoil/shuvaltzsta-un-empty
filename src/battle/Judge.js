// 判定ウィンドウは ms で持つ。人の知覚は拍ではなく実時間に依存するため（設計案 6）
export class Judge {
  constructor(config) {
    this.window = config.judgeWindowMs;
  }

  get goodSec() {
    return this.window.good / 1000;
  }

  grade(deltaMs) {
    const a = Math.abs(deltaMs);
    if (a <= this.window.perfect) return 'perfect';
    if (a <= this.window.good) return 'good';
    return null;
  }
}
