// 積み重ねはできるが、update されるのは常に一番上の1つだけ（憲法①）。
// 下の State は止まったまま描画だけされる
export class StateMachine {
  constructor() {
    this.stack = [];
  }

  get top() {
    return this.stack[this.stack.length - 1] || null;
  }

  change(state) {
    while (this.stack.length) this.stack.pop().exit?.();
    this.push(state);
  }

  push(state) {
    this.stack.push(state);
    state.enter?.();
  }

  pop() {
    const state = this.stack.pop();
    state?.exit?.();
    return state;
  }

  update(dt, presses) {
    this.top?.update(dt, presses);
  }

  render(g, ms) {
    for (const state of this.stack) state.render(g, ms);
  }
}
