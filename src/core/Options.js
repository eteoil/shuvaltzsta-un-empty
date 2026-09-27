// オプション（いまはチートモードだけ）。セーブデータとは別に、このブラウザに覚えておく。
// localStorage が使えない環境（プライベートブラウズなど）では、その回かぎりの設定になる
const KEY = 'shuvaltzsta-un-empty.options';
const DEFAULTS = { cheat: false };

export function loadOptions() {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveOptions(options) {
  try {
    localStorage.setItem(KEY, JSON.stringify(options));
  } catch {
    // 覚えておけなくても遊べるので、何もしない
  }
}
