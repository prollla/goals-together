import { UserInfo } from '@vkontakte/vk-bridge';
import { Goal, GoalDraft, GoalEntry } from './types';

const DEFAULT_API_URL = import.meta.env.DEV ? 'http://127.0.0.1:3001' : 'https://94.228.170.88.sslip.io';

// An empty, whitespace-only or "/" VITE_API_URL must never leave the app without an API address.
const resolveApiUrl = () => {
  const configured = (import.meta.env.VITE_API_URL || '').trim().replace(/\/+$/, '');
  return /^https?:\/\//.test(configured) ? configured : DEFAULT_API_URL;
};

const API_URL = resolveApiUrl();

export const isVkLaunch = () => new URLSearchParams(window.location.search).has('vk_app_id');

export const getApiUserId = (user?: UserInfo) => {
  if (user) return String(user.id);
  const params = new URLSearchParams(window.location.search);
  const vkUserId = params.get('vk_user_id');
  if (vkUserId) return vkUserId;
  const requestedUser = params.get('dev_user');
  if (requestedUser) localStorage.setItem('goals-together-dev-user', requestedUser);
  return localStorage.getItem('goals-together-dev-user') || '1';
};

const getHeaders = (user?: UserInfo): Record<string, string> => {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-User-Id': getApiUserId(user),
    'X-VK-Launch-Params': window.location.search,
  };
  // Profile headers are sent only when the real profile is known, so the server never stores placeholders.
  if (user?.first_name) headers['X-User-Name'] = encodeURIComponent(user.first_name);
  if (user?.photo_200) headers['X-User-Photo'] = encodeURIComponent(user.photo_200);
  return headers;
};

const request = async <T>(path: string, user: UserInfo | undefined, options: RequestInit = {}): Promise<T> => {
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      ...options,
      headers: { ...getHeaders(user), ...options.headers },
    });
  } catch {
    throw new Error('Сервер недоступен. Проверьте подключение к интернету.');
  }
  const data = await response.json().catch(() => ({}));
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
