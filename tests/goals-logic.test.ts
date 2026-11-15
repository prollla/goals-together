// Unit checks for src/utils/goals.ts (run: npm run test:logic) with "now" frozen at Monday 2026-11-16 10:00 local time.
const RealDate = Date;
const FIXED = new RealDate('2026-11-16T10:00:00').getTime();
class FixedDate extends RealDate {
  constructor(...args: ConstructorParameters<typeof Date> | []) {
    if (args.length === 0) super(FIXED);
    else super(...(args as [string]));
  }
  static now() { return FIXED; }
}
(globalThis as { Date: DateConstructor }).Date = FixedDate as unknown as DateConstructor;

import type { Goal } from '../src/types';
import * as g from '../src/utils/goals';

let failures = 0;
const check = (name: string, actual: unknown, expected: unknown) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  -> got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`}`);
  if (!ok) failures += 1;
};

const goal = (patch: Partial<Goal>): Goal => ({
  id: 'x', title: 't', rule: 'r', category: 'Развитие', type: 'regular', color: 'violet', createdAt: '2026-10-01',
  duration: 0, frequency: 'daily', privacy: 'private', entries: {}, ...patch,
});
const done = { status: 'done' as const };
const skip = { status: 'skipped' as const };

check('today key is frozen Monday', g.todayKey(), '2026-11-16');
check('daily: 3 done days, today open', g.getStreak(goal({ entries: { '2026-11-13': done, '2026-11-14': done, '2026-11-15': done } })), 3);
check('daily: today done counts', g.getStreak(goal({ entries: { '2026-11-15': done, '2026-11-16': done } })), 2);
check('daily: 2 skips passed over', g.getStreak(goal({ entries: { '2026-11-12': done, '2026-11-13': skip, '2026-11-14': skip, '2026-11-15': done } })), 2);
check('daily: 3 skips in a row break', g.getStreak(goal({ entries: { '2026-11-12': done, '2026-11-13': skip, '2026-11-14': skip, '2026-11-15': skip } })), 0);
check('daily: skip counter resets after a done day', g.getStreak(goal({ entries: {
  '2026-11-09': done, '2026-11-10': skip, '2026-11-11': skip, '2026-11-12': done, '2026-11-13': skip, '2026-11-14': skip, '2026-11-15': done,
} })), 3);
check('daily: empty past day breaks', g.getStreak(goal({ entries: { '2026-11-13': done, '2026-11-15': done } })), 1);
check('daily: today skipped counts as a skip', g.getStreak(goal({ entries: { '2026-11-15': done, '2026-11-16': skip } })), 1);
check('daily: stops at creation date', g.getStreak(goal({ createdAt: '2026-11-15', entries: { '2026-11-14': done, '2026-11-15': done } })), 1);

const weekdays = { frequency: 'weekdays' as const };
check('weekdays: weekend ignored (Thu, Fri done; Sat/Sun empty)', g.getStreak(goal({ ...weekdays, entries: { '2026-11-12': done, '2026-11-13': done } })), 2);
check('weekdays: Sunday is not scheduled', g.isScheduledDay(goal(weekdays), '2026-11-15'), false);
check('weekdays: Monday is scheduled', g.isScheduledDay(goal(weekdays), '2026-11-16'), true);
check('weekdays: 14 days from Mon 2026-11-02 = 10 planned days', g.getTargetCount(goal({ ...weekdays, createdAt: '2026-11-02', duration: 14 })), 10);
check('weekdays: no "mark yesterday" on Monday (yesterday = Sunday)', g.canMarkYesterday(goal(weekdays)), false);
check('daily: "mark yesterday" offered when yesterday is empty', g.canMarkYesterday(goal({})), true);
check('daily: no "mark yesterday" when yesterday is marked', g.canMarkYesterday(goal({ entries: { '2026-11-15': skip } })), false);

const weekly = { frequency: 'weekly' as const, weeklyTarget: 2 };
check('weekly: week starts Monday', g.weekStartKey('2026-11-15'), '2026-11-09');
check('weekly: 2 full weeks then a short one', g.getStreak(goal({ ...weekly, entries: {
  '2026-11-10': done, '2026-11-13': done, // week of Nov 9: 2
  '2026-11-03': done, '2026-11-05': done, // week of Nov 2: 2
  '2026-10-28': done, // week of Oct 26: 1 -> stop
} })), 2);
check('weekly: unfinished current week does not break', g.getStreak(goal({ ...weekly, entries: {
  '2026-11-16': done, '2026-11-10': done, '2026-11-13': done,
} })), 1);
check('weekly: current week counts once the norm is met', g.getStreak(goal({ ...weekly, entries: {
  '2026-11-16': done, '2026-11-17': done, '2026-11-10': done, '2026-11-13': done,
} })), 2);
check('weekly: week progress', g.getWeekProgress(goal({ ...weekly, entries: { '2026-11-16': done } })), { done: 1, target: 2 });
check('weekly: handled today when norm met', g.isHandledToday(goal({ ...weekly, entries: { '2026-11-16': done, '2026-11-17': done } })), true);
check('weekly: target count for 30 days, 2/week', g.getTargetCount(goal({ ...weekly, duration: 30 })), 10);
check('weekly: streak unit', g.formatStreakUnit(goal(weekly), 3), 'недели');

check('unlimited: no percent', g.getProgress(goal({ duration: 0 })), null);
check('30 days: 15 done = 50%', g.getProgress(goal({ duration: 30, createdAt: '2026-11-01', entries: Object.fromEntries(
  Array.from({ length: 15 }, (_, i) => [`2026-11-${String(i + 1).padStart(2, '0')}`, done]),
) })), 50);
check('completed: deadline passed', g.isCompleted(goal({ duration: 7, createdAt: '2026-11-01' })), true);
check('not completed: deadline ahead', g.isCompleted(goal({ duration: 30, createdAt: '2026-11-01' })), false);
check('completed: quantity target reached', g.isCompleted(goal({ type: 'quantity', target: 10, entries: { '2026-11-16': { status: 'done', value: 12 } } })), true);
check('planned today: weekdays goal on Monday', g.isPlannedToday(goal(weekdays)), true);
check('end date of 7-day goal', g.getEndDate(goal({ duration: 7, createdAt: '2026-11-01' })), '2026-11-07');

console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED');
process.exit(failures ? 1 : 0);
