// ゲーム内の暦。月を「節」、日を「区」と呼ぶ（例：火竜節5区）。
// 1年は16節（4つの季に4節ずつ）。1節は23区で、16節（水亀節）だけ20区。中身は data/calendar.json（憲法⑨）。
// ゲームが持つのは session.day（1日目が 1）だけで、何節何区かは start から数えてここで出す（憲法⑧）
import { loadJSON } from './Data.js';

export const loadCalendar = () => loadJSON('data/calendar.json');

// n日目が何節何区か。month・day は 1 から数える
export function dateOf(calendar, n) {
  const { months, start } = calendar;
  const year = months.reduce((sum, m) => sum + m.days, 0);
  let left = months.slice(0, start.month - 1).reduce((sum, m) => sum + m.days, 0) + (start.day - 1) + (n - 1);
  left = ((left % year) + year) % year;
  let month = 0;
  while (left >= months[month].days) {
    left -= months[month].days;
    month++;
  }
  return { month: month + 1, day: left + 1, name: months[month].name };
}

export function dateText(calendar, n) {
  const d = dateOf(calendar, n);
  return `${d.name}節${d.day}区`;
}

// その日の行事。labels は画面に出す短い名前、wake はベッドで起きたときの一言。
// 祭り（festivals）の日、天赦日（区が restDays.fromDay 以降。23区ある節の最後の3区）、忌み月（一言は月の初日だけ）
export function eventsOf(calendar, n) {
  const d = dateOf(calendar, n);
  const labels = [];
  const wake = [];
  for (const f of calendar.festivals ?? []) {
    if (f.month === d.month && f.day === d.day) { labels.push(f.name); wake.push(f.wake); }
  }
  const rest = calendar.restDays;
  if (rest && d.day >= rest.fromDay) { labels.push(rest.name); wake.push(rest.wake); }
  const taboo = calendar.tabooMonth;
  if (taboo && d.month === taboo.month) {
    labels.push(taboo.name);
    if (d.day === 1) wake.push(taboo.wake);
  }
  return { labels, wake };
}
