// ゲーム内の日付の表し方。session.day（1日目が 1）だけを持ち、表示はここで作る（憲法⑧）。
// 本番の暦（○○節○○区）は作者の記事の数え方に合わせる。決まるまでは「n日目」と出す（TODO.md）
export function dateText(day) {
  return `${day}日目`;
}
