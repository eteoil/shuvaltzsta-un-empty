const KEYMAP = {
  ArrowUp: 'up', KeyW: 'up',
  ArrowDown: 'down', KeyS: 'down',
  ArrowLeft: 'left', KeyA: 'left',
  ArrowRight: 'right', KeyD: 'right',
  KeyX: 'a', KeyK: 'a', Space: 'a',
  KeyZ: 'b', KeyJ: 'b',
  Enter: 'start',
  KeyP: 'pause', Escape: 'pause',
};

const DPAD = new Set(['up', 'down', 'left', 'right']);

// 押した瞬間の AudioContext 時刻を添えてキューに積む。判定は各 State がこの時刻で行う
export class Input {
  constructor(clock, root) {
    this.clock = clock;
    this.held = new Map();      // btn → 押している入力元の数
    this.queue = [];
    this.pointers = new Map();  // pointerId → btn
    this.buttons = new Map();   // btn → 画面上のボタン要素
    for (const el of root.querySelectorAll('[data-btn]')) this.buttons.set(el.dataset.btn, el);
    this.led = document.getElementById('led');

    // iOS Safari は viewport の user-scalable=no を無視し、連打をダブルタップとみなして拡大する。
    // ボタンは pointer イベントで受けているので、タッチの既定動作（拡大・スクロール・選択）はすべて止める
    const stop = (e) => { if (e.cancelable) e.preventDefault(); };
    for (const type of ['touchstart', 'touchmove', 'touchend']) document.addEventListener(type, stop, { passive: false });
    for (const type of ['gesturestart', 'gesturechange', 'gestureend', 'dblclick']) document.addEventListener(type, stop);

    window.addEventListener('keydown', (e) => {
      const btn = KEYMAP[e.code];
      if (!btn) return;
      e.preventDefault();
      if (!e.repeat) this.press(btn);
    });
    window.addEventListener('keyup', (e) => {
      const btn = KEYMAP[e.code];
      if (btn) this.release(btn);
    });
    window.addEventListener('blur', () => this.releaseAll());

    root.addEventListener('pointerdown', (e) => {
      const btn = e.target.closest?.('[data-btn]')?.dataset.btn;
      if (!btn) return;
      e.preventDefault();
      e.target.setPointerCapture?.(e.pointerId);
      this.pointers.set(e.pointerId, btn);
      this.press(btn);
    });
    // 指を十字ボタンの上で滑らせたら、押している方向を切り替える
    root.addEventListener('pointermove', (e) => {
      const cur = this.pointers.get(e.pointerId);
      if (!cur || !DPAD.has(cur)) return;
      const over = document.elementFromPoint(e.clientX, e.clientY)?.closest?.('[data-btn]')?.dataset.btn;
      if (over && over !== cur && DPAD.has(over)) {
        this.release(cur);
        this.pointers.set(e.pointerId, over);
        this.press(over);
      }
    });
    const end = (e) => {
      const btn = this.pointers.get(e.pointerId);
      if (!btn) return;
      this.pointers.delete(e.pointerId);
      this.release(btn);
    };
    root.addEventListener('pointerup', end);
    root.addEventListener('pointercancel', end);
    root.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  press(btn) {
    this.clock.unlock();
    const n = this.held.get(btn) || 0;
    this.held.set(btn, n + 1);
    if (n > 0) return;
    this.queue.push({ btn, t: this.clock.now });
    this.buttons.get(btn)?.classList.add('on');
    this.led?.classList.add('on');
  }

  release(btn) {
    const n = (this.held.get(btn) || 0) - 1;
    if (n > 0) { this.held.set(btn, n); return; }
    this.held.delete(btn);
    this.buttons.get(btn)?.classList.remove('on');
    if (!this.held.size) this.led?.classList.remove('on');
  }

  releaseAll() {
    for (const btn of [...this.held.keys()]) {
      this.held.set(btn, 1);
      this.release(btn);
    }
    this.pointers.clear();
  }

  isDown(btn) {
    return this.held.has(btn);
  }

  drain() {
    const q = this.queue;
    this.queue = [];
    return q;
  }
}
