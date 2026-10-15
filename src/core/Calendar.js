// ゲーム内の暦。月を「節」、日を「区」と呼ぶ（例：火竜節5区）。
// 1年は16節（4つの季に4節ずつ）。1節は23区で、16節（水亀節）だけ20区。中身は data/calendar.json（憲法⑨）。
// ゲームが持つのは session.day（1日目が 1）と session.minute（その日の0時から何分）だけで、
// 何節何区か・何刻かはここで出す（憲法⑧）。時間の進み方の数値は gameConfig の time
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

// 数字だけの日付（何節／何区。書き文字では1〜16月で書くことも多い）
export function dateNumber(calendar, n) {
  const d = dateOf(calendar, n);
  return `${d.month}/${d.day}`;
}

// 24時間の時刻（14:05）
export function clockText(minute) {
  const m = Math.floor(minute);
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
}

// その日の行事。labels は画面に出す短い名前、wake はベッドで起きたときの一言。
// festival（祭りの日）・rest（天赦日。restDays.phases の月相（新月・上弦・満月）の末日。21〜23区の無い忌み月（水亀節）には無い）・taboo（忌み月）は、その日の効果に使う。
// tabooWeek（忌み週。tabooWeek.phase の月相＝天赦日の無い下弦の間）は、効果は忌み月と同じ。ひと月まるごと忌み月の水亀節では出さない
export function eventsOf(calendar, n) {
  const d = dateOf(calendar, n);
  const labels = [];
  const wake = [];
  const festival = (calendar.festivals ?? []).find((f) => f.month === d.month && f.day === d.day) ?? null;
  if (festival) { labels.push(festival.name); wake.push(festival.wake); }
  const moon = moonDayOf(calendar, n);
  const tabooMonth = calendar.tabooMonth;
  const taboo = !!tabooMonth && d.month === tabooMonth.month;
  const restDays = calendar.restDays;
  const rest = !!restDays && !taboo && !!moon && moon.last && restDays.phases.includes(moon.phase);
  if (rest) { labels.push(restDays.name); wake.push(restDays.wake); }
  const tabooWeekDef = calendar.tabooWeek;
  const tabooWeek = !!tabooWeekDef && !taboo && !!moon && moon.phase === tabooWeekDef.phase;
  if (tabooWeek) {
    labels.push(tabooWeekDef.name);
    if (moon.first) wake.push(tabooWeekDef.wake);   // 忌み週の一言は初日だけ
  }
  if (taboo) {
    labels.push(tabooMonth.name);
    if (d.day === 1) wake.push(tabooMonth.wake);   // 忌み月の一言は月の初日だけ
  }
  return { labels, wake, festival: !!festival, rest, taboo, tabooWeek };
}

// その日の月相（calendar の moon.phases：新月・上弦・満月・下弦）。1節を4つに分けて、節の初めから順に回る（23区の節は6・6・6・5区）
export function moonOf(calendar, n) {
  return moonDayOf(calendar, n)?.phase ?? null;
}

// その日の月相と、その月相の初日（first）・末日（last）か
export function moonDayOf(calendar, n) {
  const phases = calendar.moon?.phases;
  if (!phases?.length) return null;
  const d = dateOf(calendar, n);
  const days = calendar.months[d.month - 1].days;
  const at = (day) => Math.floor(((day - 1) * phases.length) / days);
  const k = at(d.day);
  return { phase: phases[k], first: d.day === 1 || at(d.day - 1) !== k, last: d.day === days || at(d.day + 1) !== k };
}

// 時刻。天（午前）／地（午後）と、2時間ごとの名前（陽・雷・炎・氷・泥・星）で表す。
// 奇数の時は「半」（1時間）を足し、分は「片」。例：3:00 は天の雷刻半、18:25 は地の氷刻25片
export function timeText(calendar, minute) {
  const h = calendar.hours;
  const hour = Math.floor(minute / 60) % 24;
  const m = Math.floor(minute % 60);
  const in12 = hour % 12;
  const base = in12 - (in12 % 2);
  return `${hour < 12 ? h.am : h.pm}の${h.names[base]}刻${in12 % 2 ? h.half : ''}${m ? `${m}${h.minute}` : ''}`;
}

const DAY = 24 * 60;

// [from, to) の中か。to が from より小さければ0時をまたぐ
const within = (minute, [from, to]) => (from <= to ? minute >= from && minute < to : minute >= from || minute < to);

export function isNight(config, minute) {
  return within(minute, [config.time.nightFrom, config.time.nightTo]);
}

// 営業中か。hours（[開店, 閉店] の分）が無い場所はいつでも開いている
export function isOpen(hours, minute) {
  return !hours || within(minute, hours);
}

// その場所が開いているか。営業時間（hours）の外と、closedOnRestDay の場所（万屋）の天赦日は閉まっている
export function isMapOpen(calendar, map, day, minute) {
  return isOpen(map?.hours, minute) && !(map?.closedOnRestDay && eventsOf(calendar, day).rest);
}

// 時間を進める。session.minute は時計の時刻（0時から何分）で、0時を過ぎたら日付も進む
export function passTime(session, minutes) {
  session.minute += minutes;
  while (session.minute >= DAY) {
    session.minute -= DAY;
    session.day += 1;
  }
}

// ベッドで眠る。起きるのは wakeMinute（朝8時）。0時より前に寝たら次の日の朝、0時を過ぎてから寝たらその日の朝
export function sleep(session, config) {
  const wake = config.time.wakeMinute;
  if (session.minute >= wake) session.day += 1;
  session.minute = wake;
}
