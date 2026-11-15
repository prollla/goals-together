import { useEffect, useRef, useState } from 'react';
import { UserInfo } from '@vkontakte/vk-bridge';
import { Goal, GoalDraft, GoalEntry } from '../types';
import { toDateKey } from '../utils/goals';
import {
  addSharedValue,
  cheerParticipant,
  clearEntry,
  createGoalOnServer,
  deleteSharedGoal,
  getGoals,
  joinSharedGoal,
  updateGoalOnServer,
  updateSharedEntry,
} from '../api';

// Goals created before server sync existed for private goals. They are uploaded once and then removed.
const STORAGE_KEY = 'goals-together-goals-v1';
const DEMO_GOAL_IDS = new Set(['no-sugar', 'reading', 'running']);

const loadLocalGoals = () => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return [];
    const parsed = JSON.parse(stored) as Goal[];
    return Array.isArray(parsed) ? parsed.filter((goal) => !DEMO_GOAL_IDS.has(goal.id)) : [];
  } catch {
    return [];
  }
};

const toDraft = (goal: Goal): GoalDraft => ({
  title: goal.title,
  rule: goal.rule,
  category: goal.category,
  type: goal.type,
  color: goal.color,
  duration: goal.duration,
  frequency: goal.frequency,
  weeklyTarget: goal.weeklyTarget,
  target: goal.target,
  unit: goal.unit,
  privacy: goal.privacy,
});

// Same toggle rule as the server: tapping the current status again clears the day.
const applyMark = (entries: Record<string, GoalEntry>, date: string, status: 'done' | 'skipped') => {
  const next = { ...entries };
  if (next[date]?.status === status && !next[date]?.value) delete next[date];
  else next[date] = { status };
  return next;
};

/**
 * All goals (private and shared) are stored on the server, so they are the same on every device.
 * @param ready false while the VK profile is still loading: no requests are sent until then.
 */
export const useGoals = (user?: UserInfo, ready = true) => {
  const [serverGoals, setServerGoals] = useState<Goal[]>([]);
  const [localGoals, setLocalGoals] = useState<Goal[]>(loadLocalGoals);
  const [loaded, setLoaded] = useState(false);
  const [serverError, setServerError] = useState('');
  const localGoalsRef = useRef(localGoals);
  localGoalsRef.current = localGoals;
  // Shared between effect runs so a restarted effect never runs a second sync (and migration) in parallel.
  const syncingRef = useRef(false);

  useEffect(() => {
    if (localGoals.length) localStorage.setItem(STORAGE_KEY, JSON.stringify(localGoals));
    else localStorage.removeItem(STORAGE_KEY);
  }, [localGoals]);

  useEffect(() => {
    if (!ready) return undefined;
    let active = true;

    const synchronize = async () => {
      if (syncingRef.current) return;
      syncingRef.current = true;
      try {
        for (const goal of localGoalsRef.current) {
          await createGoalOnServer(toDraft(goal), user, { createdAt: goal.createdAt, entries: goal.entries });
          // Remove each uploaded goal right away so a failure later in the loop cannot duplicate it.
          localGoalsRef.current = localGoalsRef.current.filter((item) => item.id !== goal.id);
          setLocalGoals((current) => current.filter((item) => item.id !== goal.id));
        }
        const remoteGoals = await getGoals(user);
        if (active) {
          setServerGoals(remoteGoals);
          setServerError('');
        }
      } catch (error) {
        if (active) setServerError(error instanceof Error ? error.message : 'Сервер недоступен');
      } finally {
        syncingRef.current = false;
        if (active) setLoaded(true);
      }
    };

    void synchronize();
    const interval = window.setInterval(() => void synchronize(), 10000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [user, ready]);

  const isLocal = (id: string) => localGoals.some((goal) => goal.id === id);
  const replace = (goal: Goal) => setServerGoals((current) => current.map((item) => (item.id === goal.id ? goal : item)));
  const updateLocal = (id: string, change: (goal: Goal) => Goal) =>
    setLocalGoals((current) => current.map((goal) => (goal.id === id ? change(goal) : goal)));
  const reportError = (error: unknown) => setServerError(error instanceof Error ? error.message : 'Сервер недоступен');

  const createGoal = async (draft: GoalDraft) => {
    // Local calendar date: the server only knows UTC, which is "yesterday" here after midnight in Moscow.
    const goal = await createGoalOnServer(draft, user, { createdAt: toDateKey(), entries: {} });
    setServerGoals((current) => [goal, ...current.filter((item) => item.id !== goal.id)]);
    return goal;
  };

  const updateGoal = async (id: string, draft: GoalDraft) => {
    if (isLocal(id)) {
      updateLocal(id, (goal) => ({ ...goal, ...draft, type: goal.type, privacy: goal.privacy }));
      return;
    }
    replace(await updateGoalOnServer(id, draft, user));
  };

  const joinShared = async (groupId: string) => {
    const goal = await joinSharedGoal(groupId, user);
    setServerGoals((current) => [goal, ...current.filter((item) => item.id !== goal.id)]);
    return goal;
  };

  const deleteGoal = async (id: string) => {
    if (isLocal(id)) {
      setLocalGoals((current) => current.filter((goal) => goal.id !== id));
      return;
    }
    await deleteSharedGoal(id, user);
    setServerGoals((current) => current.filter((goal) => goal.id !== id));
  };

  const markGoal = (id: string, status: 'done' | 'skipped', date = toDateKey()) => {
    if (isLocal(id)) {
      updateLocal(id, (goal) => ({ ...goal, entries: applyMark(goal.entries, date, status) }));
      return;
    }
    void updateSharedEntry(id, date, status, user).then(replace).catch(reportError);
  };

  const addValue = (id: string, value: number, date = toDateKey()) => {
    if (!Number.isFinite(value) || value <= 0) return;
    if (isLocal(id)) {
      updateLocal(id, (goal) => ({
        ...goal,
        entries: { ...goal.entries, [date]: { status: 'done', value: (goal.entries[date]?.value || 0) + value } },
      }));
      return;
    }
    void addSharedValue(id, date, value, user).then(replace).catch(reportError);
  };

  /** «Поддержать» another participant of a shared goal. */
  const cheer = (id: string, to: string) => {
    void cheerParticipant(id, to, user).then(replace).catch(reportError);
  };

  /** Clears the user's mark or accumulated value for one day. */
  const resetDay = (id: string, date = toDateKey()) => {
    if (isLocal(id)) {
      updateLocal(id, (goal) => {
        const entries = { ...goal.entries };
        delete entries[date];
        return { ...goal, entries };
      });
      return;
    }
    void clearEntry(id, date, user).then(replace).catch(reportError);
  };

  return {
    goals: [...serverGoals, ...localGoals],
    createGoal,
    updateGoal,
    joinShared,
    deleteGoal,
    markGoal,
    addValue,
    resetDay,
    cheer,
    serverError,
    loaded,
  };
};
