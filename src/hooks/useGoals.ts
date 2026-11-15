import { useEffect, useRef, useState } from 'react';
import { UserInfo } from '@vkontakte/vk-bridge';
import { Goal, GoalDraft } from '../types';
import { toDateKey } from '../utils/goals';
import {
  addSharedValue,
  createSharedGoal,
  deleteSharedGoal,
  getSharedGoals,
  joinSharedGoal,
  updateSharedEntry,
} from '../api';

const STORAGE_KEY = 'goals-together-goals-v1';
const DEMO_GOAL_IDS = new Set(['no-sugar', 'reading', 'running']);

const loadGoals = () => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return [];
    const parsed = JSON.parse(stored) as Goal[];
    return Array.isArray(parsed) ? parsed.filter((goal) => !DEMO_GOAL_IDS.has(goal.id)) : [];
  } catch {
    return [];
  }
};

/**
 * @param ready false while the VK profile is still loading: no requests are sent until then,
 * otherwise the server would receive requests without the real name and photo.
 */
export const useGoals = (user?: UserInfo, ready = true) => {
  const [localGoals, setLocalGoals] = useState<Goal[]>(loadGoals);
  const [sharedGoals, setSharedGoals] = useState<Goal[]>([]);
  const [sharedLoaded, setSharedLoaded] = useState(false);
  const [serverError, setServerError] = useState('');
  const localGoalsRef = useRef(localGoals);
  localGoalsRef.current = localGoals;
  // Shared between effect runs so a restarted effect never runs a second sync (and migration) in parallel.
  const syncingRef = useRef(false);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(localGoals));
  }, [localGoals]);

  useEffect(() => {
    if (!ready) return undefined;
    let active = true;

    const synchronize = async () => {
      if (syncingRef.current) return;
      syncingRef.current = true;
      try {
        const legacyGoals = localGoalsRef.current.filter((goal) => goal.privacy === 'group');
        for (const goal of legacyGoals) {
          const draft: GoalDraft = {
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
            privacy: 'group',
            groupId: goal.groupId,
          };
          await createSharedGoal(draft, user, goal.entries);
          // Remove each migrated goal right away so a failure later in the loop cannot duplicate it.
          localGoalsRef.current = localGoalsRef.current.filter((item) => item.id !== goal.id);
          setLocalGoals((current) => current.filter((item) => item.id !== goal.id));
        }
        const remoteGoals = await getSharedGoals(user);
        if (active) {
          setSharedGoals(remoteGoals);
          setServerError('');
        }
      } catch (error) {
        if (active) setServerError(error instanceof Error ? error.message : 'Сервер недоступен');
      } finally {
        syncingRef.current = false;
        if (active) setSharedLoaded(true);
      }
    };

    void synchronize();
    const interval = window.setInterval(() => void synchronize(), 10000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [user, ready]);

  const createGoal = (draft: GoalDraft) => {
    const goal: Goal = {
      ...draft,
      id: crypto.randomUUID(),
      createdAt: toDateKey(),
      entries: {},
    };
    setLocalGoals((current) => [goal, ...current]);
    return goal;
  };

  const createShared = async (draft: GoalDraft) => {
    const goal = await createSharedGoal(draft, user);
    setSharedGoals((current) => [goal, ...current.filter((item) => item.id !== goal.id)]);
    return goal;
  };

  const joinShared = async (groupId: string) => {
    const goal = await joinSharedGoal(groupId, user);
    setSharedGoals((current) => [goal, ...current.filter((item) => item.id !== goal.id)]);
    return goal;
  };

  const replaceShared = (goal: Goal) => {
    setSharedGoals((current) => current.map((item) => item.id === goal.id ? goal : item));
  };

  const deleteGoal = async (id: string) => {
    if (sharedGoals.some((goal) => goal.id === id)) {
      await deleteSharedGoal(id, user);
      setSharedGoals((current) => current.filter((goal) => goal.id !== id));
      return;
    }
    setLocalGoals((current) => current.filter((goal) => goal.id !== id));
  };

  const markGoal = (id: string, status: 'done' | 'skipped') => {
    if (sharedGoals.some((goal) => goal.id === id)) {
      void updateSharedEntry(id, toDateKey(), status, user).then(replaceShared).catch((error) => setServerError(error.message));
      return;
    }
    const today = toDateKey();
    setLocalGoals((current) =>
      current.map((goal) => {
        if (goal.id !== id) return goal;
        const entries = { ...goal.entries };
        if (entries[today]?.status === status && !entries[today]?.value) {
          delete entries[today];
        } else {
          entries[today] = { status };
        }
        return { ...goal, entries };
      }),
    );
  };

  const addValue = (id: string, value: number) => {
    if (!Number.isFinite(value) || value <= 0) return;
    if (sharedGoals.some((goal) => goal.id === id)) {
      void addSharedValue(id, toDateKey(), value, user).then(replaceShared).catch((error) => setServerError(error.message));
      return;
    }
    const today = toDateKey();
    setLocalGoals((current) =>
      current.map((goal) => {
        if (goal.id !== id) return goal;
        const previous = goal.entries[today]?.value || 0;
        return {
          ...goal,
          entries: {
            ...goal.entries,
            [today]: { status: 'done', value: previous + value },
          },
        };
      }),
    );
  };

  return {
    goals: [...sharedGoals, ...localGoals.filter((goal) => goal.privacy === 'private')],
    createGoal,
    createShared,
    joinShared,
    deleteGoal,
    markGoal,
    addValue,
    serverError,
    sharedLoaded,
  };
};
