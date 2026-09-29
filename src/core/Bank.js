// 銀行の預金。session.bank = { balance, day }（day は最後に利息を付けた日）。
// 利息は1日ごとに残高 × bank.interestPerDay（端数は切り捨て）を足す。預金を見るのは銀行の中だけなので、
// 出納機やプレストに話しかけたときに、前に付けた日から今日までのぶんをまとめて付ける
export function settle(session, config) {
  const b = (session.bank ??= { balance: 0, day: session.day });
  const rate = config.bank.interestPerDay;
  for (let d = b.day; d < session.day; d++) b.balance += Math.floor(b.balance * rate);
  b.day = session.day;
  return b;
}

// 倒れたとき（HP 0）。持っているお金が faint.moneyKeepRate（半分）になる。預金は減らない。なくした額を返す
export function faint(session, config) {
  const lost = session.money - Math.ceil(session.money * config.faint.moneyKeepRate);
  session.money -= lost;
  return lost;
}
