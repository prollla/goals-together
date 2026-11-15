import { Goal } from '../types';
import { getBestStreak, getDoneDays, getProgress, isCompleted } from './goals';

export interface Achievement {
  id: string;
  emoji: string;
  title: string;
  description: string;
  unlocked: boolean;
  /** Progress towards a locked achievement, e.g. 4 of 7 days. */
  current: number;
  target: number;
}

const dayStreakGoals = (goals: Goal[]) => goals.filter((goal) => goal.frequency !== 'weekly' || goal.type === 'quantity');

/**
 * Achievements are derived from the goals the user already has, so nothing extra is stored on the server.
 * The order is the display order: from the first step to long-term ones.
 */
export const getAchievements = (goals: Goal[], currentUserId: string): Achievement[] => {
  const totalDone = goals.reduce((sum, goal) => sum + getDoneDays(goal), 0);
  const bestDayStreak = Math.max(0, ...dayStreakGoals(goals).map(getBestStreak));
  const bestWeekStreak = Math.max(0, ...goals.filter((goal) => goal.frequency === 'weekly' && goal.type !== 'quantity').map(getBestStreak));
  const reachedGoals = goals.filter((goal) => isCompleted(goal) && (getProgress(goal) ?? 0) >= 100).length;
  const teamGoals = goals.filter((goal) => goal.privacy === 'group' && (goal.participants?.length || 0) >= 2).length;
  const cheersReceived = goals.reduce(
    (sum, goal) => sum + (goal.participants?.find((participant) => participant.userId === currentUserId)?.cheers?.total || 0),
    0,
  );

  const make = (id: string, emoji: string, title: string, description: string, current: number, target: number): Achievement => ({
    id, emoji, title, description, current: Math.min(current, target), target, unlocked: current >= target,
  });

  return [
    make('first-step', '👣', 'Первый шаг', 'Отметьте выполнение любой цели', totalDone, 1),
    make('week-streak', '🔥', 'Неделя подряд', 'Серия 7 дней в одной цели', bestDayStreak, 7),
    make('weekly-rhythm', '📅', 'В ритме', 'Норма недели 4 недели подряд', bestWeekStreak, 4),
    make('team', '🤝', 'Вместе веселее', 'Цель, в которой есть хотя бы один друг', teamGoals, 1),
    make('supported', '👏', 'Вас поддержали', 'Получите поддержку от участника', cheersReceived, 1),
    make('goal-reached', '🏆', 'Цель достигнута', 'Доведите цель до 100%', reachedGoals, 1),
    make('month-streak', '💎', '30 дней подряд', 'Серия 30 дней в одной цели', bestDayStreak, 30),
    make('fifty', '⭐', 'Полсотни отметок', '50 успешных отметок во всех целях', totalDone, 50),
  ];
};

const SEEN_KEY = 'goals-together-achievements-seen';

/**
 * Newly unlocked achievements since the last call (for a "new achievement" notice).
 * The very first run only remembers the current state, so existing users are not flooded with notices.
 */
export const takeNewAchievements = (achievements: Achievement[]) => {
  const unlocked = achievements.filter((achievement) => achievement.unlocked).map((achievement) => achievement.id);
  const stored = localStorage.getItem(SEEN_KEY);
  localStorage.setItem(SEEN_KEY, JSON.stringify(unlocked));
  if (stored === null) return [];
  let seen: string[] = [];
  try { seen = JSON.parse(stored); } catch { /* corrupted value: treat as empty */ }
  return achievements.filter((achievement) => achievement.unlocked && !seen.includes(achievement.id));
};
