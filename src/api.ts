import { UserInfo } from '@vkontakte/vk-bridge';
import { Goal, GoalDraft, GoalEntry } from './types';

const API_URL = (import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://127.0.0.1:3001' : 'https://94.228.170.88.sslip.io')).replace(/\/$/, '');

export const getApiUserId = (user?: UserInfo) => {
  if (user) return String(user.id);
  const params = new URLSearchParams(window.location.search);
  const requestedUser = params.get('dev_user');
  if (requestedUser) localStorage.setItem('goals-together-dev-user', requestedUser);
  return localStorage.getItem('goals-together-dev-user') || '1';
};

const getHeaders = (user?: UserInfo) => {
  const userId = getApiUserId(user);
  const firstName = user?.first_name || (userId === '1' ? 'Вы' : 'Друг');
  return {
    'Content-Type': 'application/json',
    'X-User-Id': userId,
    'X-User-Name': encodeURIComponent(firstName),
    'X-User-Photo': encodeURIComponent(user?.photo_200 || ''),
    'X-VK-Launch-Params': window.location.search,
  };
};

const request = async <T>(path: string, user: UserInfo | undefined, options: RequestInit = {}): Promise<T> => {
  if (!API_URL) throw new Error('Адрес API не настроен. Укажите VITE_API_URL.');
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: { ...getHeaders(user), ...options.headers },
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Не удалось связаться с сервером');
  return data as T;
};

export const getSharedGoals = (user?: UserInfo) => request<Goal[]>('/api/goals', user);

export const createSharedGoal = (draft: GoalDraft, user?: UserInfo, entries?: Record<string, GoalEntry>) =>
  request<Goal>('/api/goals', user, { method: 'POST', body: JSON.stringify({ ...draft, entries }) });

export const joinSharedGoal = (groupId: string, user?: UserInfo) =>
  request<Goal>(`/api/goals/${groupId}/join`, user, { method: 'POST' });

export const getInvitation = (groupId: string, user?: UserInfo) =>
  request<GoalDraft & { participantCount: number }>(`/api/invitations/${groupId}`, user);

export const updateSharedEntry = (groupId: string, date: string, status: 'done' | 'skipped', user?: UserInfo) =>
  request<Goal>(`/api/goals/${groupId}/entries`, user, { method: 'PUT', body: JSON.stringify({ date, status }) });

export const addSharedValue = (groupId: string, date: string, value: number, user?: UserInfo) =>
  request<Goal>(`/api/goals/${groupId}/entries`, user, { method: 'POST', body: JSON.stringify({ date, value }) });

export const deleteSharedGoal = (groupId: string, user?: UserInfo) =>
  request<{ ok: boolean; ownerDeleted: boolean }>(`/api/goals/${groupId}`, user, { method: 'DELETE' });
