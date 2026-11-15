import { Goal, GoalEntry } from '../types';

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

export const formatToday = () =>
  new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', weekday: 'long' }).format(new Date());

export const isDone = (entry?: GoalEntry) => entry?.status === 'done';

export const getDoneDays = (goal: Goal) => Object.values(goal.entries).filter(isDone).length;

export const getCurrentValue = (goal: Goal) =>
  Object.values(goal.entries).reduce((sum, entry) => sum + (entry.status === 'done' ? entry.value || 0 : 0), 0);

export const getStreak = (goal: Goal) => {
  let streak = 0;
  let offset = isDone(goal.entries[toDateKey()]) ? 0 : -1;

  while (isDone(goal.entries[toDateKey(shiftDate(offset))])) {
    streak += 1;
    offset -= 1;
  }

  return streak;
};

export const getProgress = (goal: Goal) => {
  if (goal.type === 'quantity') {
    return goal.target ? Math.min(100, Math.round((getCurrentValue(goal) / goal.target) * 100)) : 0;
  }

  return goal.duration ? Math.min(100, Math.round((getDoneDays(goal) / goal.duration) * 100)) : 0;
};

export const formatNumber = (value: number) =>
  new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 }).format(value);
