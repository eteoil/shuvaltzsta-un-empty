// ゲーム画面（canvas 480×320）を、端末の実ピクセルでちょうど整数倍の大きさに映す。
// 1.96 倍や 2.95 倍のような半端な倍率だと、ところどころのドットが1つ細く（太く）なり、
// 線の太さがバラついて見えるため。
// 近い整数倍に合わせる。大きくする方は、画面のまわりの枠（bezel の余白）を keepRate まで削って収まるときだけ。
// 小さくする方は、空いている幅の minRate 以上に収まるときだけ（縮みすぎるなら、今までどおり幅いっぱい）
export function fitScreen(canvas, { keepRate = 0.4, minRate = 0.9 } = {}) {
  const box = canvas.parentElement;
  const fit = () => {
    canvas.style.width = '';
    canvas.style.marginInline = '';
    const style = getComputedStyle(box);
    const pad = Math.min(parseFloat(style.paddingLeft), parseFloat(style.paddingRight));
    const avail = box.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
    const dpr = window.devicePixelRatio || 1;
    const rate = (avail * dpr) / canvas.width;
    const widthOf = (k) => (k * canvas.width) / dpr;
    let width = null;
    if (Math.ceil(rate) >= 1 && widthOf(Math.ceil(rate)) <= avail + 2 * pad * (1 - keepRate)) width = widthOf(Math.ceil(rate));
    else if (Math.floor(rate) >= 1 && widthOf(Math.floor(rate)) >= avail * minRate) width = widthOf(Math.floor(rate));
    if (width === null) return;
    canvas.style.width = `${width}px`;
    canvas.style.marginInline = `${(avail - width) / 2}px`;
  };
  new ResizeObserver(fit).observe(box);
  window.addEventListener('resize', fit);
  fit();
}
