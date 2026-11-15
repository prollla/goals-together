import { Goal, GoalEntry } from '../types';

/** Three skipped scheduled days in a row break a streak; one or two skips are passed over. */
export const MAX_SKIPS_IN_ROW = 3;

export const toDateKey = (date = new Date()) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const shiftDate = (days: number) => {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + days);
  return date;
};

export const dateFromKey = (key: string) => new Date(`${key}T12:00:00`);

/** Calendar arithmetic on YYYY-MM-DD keys (noon avoids DST edge cases). */
export const addDays = (key: string, days: number) => {
  const date = dateFromKey(key);
  date.setDate(date.getDate() + days);
  return toDateKey(date);
};

export const todayKey = () => toDateKey();
export const yesterdayKey = () => addDays(toDateKey(), -1);

/** Monday of the week that contains the given day. */
export const weekStartKey = (key: string) => {
  const weekday = (dateFromKey(key).getDay() + 6) % 7; // Monday = 0
  return addDays(key, -weekday);
};

export const formatToday = () =>
  new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', weekday: 'long' }).format(new Date());

export const isDone = (entry?: GoalEntry) => entry?.status === 'done';

/** «По будням» goals have no plan on Saturday and Sunday: those days neither count nor break anything. */
export const isScheduledDay = (goal: Goal, key: string) => {
  if (goal.frequency !== 'weekdays') return true;
  const weekday = dateFromKey(key).getDay();
  return weekday !== 0 && weekday !== 6;
};

export const getDoneDays = (goal: Goal) => Object.values(goal.entries).filter(isDone).length;

export const getCurrentValue = (goal: Goal) =>
  Object.values(goal.entries).reduce((sum, entry) => sum + (entry.status === 'done' ? entry.value || 0 : 0), 0);

const doneInWeek = (goal: Goal, weekStart: string) =>
  Array.from({ length: 7 }, (_, index) => addDays(weekStart, index)).filter((key) => isDone(goal.entries[key])).length;

/** Weekly goals: marks this week and the weekly norm. */
export const getWeekProgress = (goal: Goal) => ({
  done: doneInWeek(goal, weekStartKey(todayKey())),
  target: goal.weeklyTarget || 1,
});

const getDayStreak = (goal: Goal) => {
  const today = todayKey();
  let streak = 0;
  let skipsInRow = 0;
  let key = today;
  // Hard stop at the creation date (and a safety cap) so the loop always ends.
  for (let guard = 0; guard < 4000 && key >= goal.createdAt; guard += 1, key = addDays(key, -1)) {
    if (!isScheduledDay(goal, key)) continue;
    const entry = goal.entries[key];
    if (entry?.status === 'done') {
      streak += 1;
      skipsInRow = 0;
    } else if (entry?.status === 'skipped') {
      skipsInRow += 1;
      if (skipsInRow >= MAX_SKIPS_IN_ROW) break;
    } else if (key !== today) {
      break; // A past scheduled day without any mark ends the streak; today is still open.
    }
  }
  return streak;
};

const getWeekStreak = (goal: Goal) => {
  const target = goal.weeklyTarget || 1;
  let week = weekStartKey(todayKey());
  let streak = 0;
  // The current week counts once the norm is met, but an unfinished current week does not break the streak.
  if (doneInWeek(goal, week) >= target) streak += 1;
  week = addDays(week, -7);
  for (let guard = 0; guard < 600 && addDays(week, 6) >= goal.createdAt; guard += 1, week = addDays(week, -7)) {
    if (doneInWeek(goal, week) < target) break;
    streak += 1;
  }
  return streak;
};

export const getStreak = (goal: Goal) => (goal.frequency === 'weekly' && goal.type !== 'quantity' ? getWeekStreak(goal) : getDayStreak(goal));

export const plural = (count: number, [one, few, many]: [string, string, string]) => {
  const mod10 = Math.abs(count) % 10;
  const mod100 = Math.abs(count) % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
};

/** «3 дня» or «2 недели», depending on how the goal's streak is measured. */
export const formatStreakUnit = (goal: Goal, streak: number) =>
  goal.frequency === 'weekly' && goal.type !== 'quantity'
    ? plural(streak, ['неделя', 'недели', 'недель'])
    : plural(streak, ['день', 'дня', 'дней']);

/** Last day of a goal with a deadline, or null for «Без ограничения». */
export const getEndDate = (goal: Goal) => (goal.duration > 0 ? addDays(goal.createdAt, goal.duration - 1) : null);

/** How many marks the whole period requires (weekends excluded for «По будням»). */
export const getTargetCount = (goal: Goal) => {
  if (goal.duration <= 0) return 0;
  if (goal.frequency === 'weekly') return (goal.weeklyTarget || 1) * Math.ceil(goal.duration / 7);
  if (goal.frequency === 'weekdays') {
    return Array.from({ length: goal.duration }, (_, index) => addDays(goal.createdAt, index)).filter((key) => isScheduledDay(goal, key)).length;
  }
  return goal.duration;
};

/** Percent of the whole goal, or null when there is nothing to measure against (unlimited duration). */
export const getProgress = (goal: Goal): number | null => {
  if (goal.type === 'quantity') {
    return goal.target ? Math.min(100, Math.round((getCurrentValue(goal) / goal.target) * 100)) : 0;
  }
  const target = getTargetCount(goal);
  return target ? Math.min(100, Math.round((getDoneDays(goal) / target) * 100)) : null;
};

/** Finished: the target is reached or the deadline has passed. */
export const isCompleted = (goal: Goal) => {
  const progress = getProgress(goal);
  const endDate = getEndDate(goal);
  return (progress !== null && progress >= 100) || (endDate !== null && todayKey() > endDate);
};

/** Should the goal ask for a mark today? Not when finished, and not on a weekend for «По будням». */
export const isPlannedToday = (goal: Goal) => !isCompleted(goal) && isScheduledDay(goal, todayKey());

/** Counts as handled today: marked done, or the weekly norm is already met. */
export const isHandledToday = (goal: Goal) => {
  if (isDone(goal.entries[todayKey()])) return true;
  if (goal.frequency === 'weekly' && goal.type !== 'quantity') {
    const week = getWeekProgress(goal);
    return week.done >= week.target;
  }
  return false;
};

/** Offer «Отметить вчера» when yesterday was a planned day of this goal and has no mark yet. */
export const canMarkYesterday = (goal: Goal) => {
  const yesterday = yesterdayKey();
  return goal.type !== 'quantity' && !isCompleted(goal) && yesterday >= goal.createdAt
    && isScheduledDay(goal, yesterday) && !goal.entries[yesterday];
};

export const formatNumber = (value: number) =>
  new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 }).format(value);
