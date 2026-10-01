import { dateOf } from './Calendar.js';

// 銀行の預金。session.bank = { balance, day }（day は最後に利息を付けた日）。
// 利息は月（節）に1回、節の1区に、残高 × bank.interestPerMonth（端数は切り捨て）を足す。預金を見るのは銀行の中だけなので、
// 出納機や窓口に話しかけたときに、前に付けた日から今日までにあった節の1区のぶんをまとめて付ける
export function settle(session, config, calendar) {
  const b = (session.bank ??= { balance: 0, day: session.day });
  const rate = config.bank.interestPerMonth;
  for (let d = b.day + 1; d <= session.day; d++) {
    if (dateOf(calendar, d).day === 1) b.balance += Math.floor(b.balance * rate);
  }
  b.day = session.day;
  return b;
}

// 倒れたとき（HP 0）。持っているお金が faint.moneyKeepRate（半分）になる。預金は減らない。なくした額を返す
export function faint(session, config) {
  const lost = session.money - Math.ceil(session.money * config.faint.moneyKeepRate);
  session.money -= lost;
  return lost;
}
