import { Goal } from '../types';

export const APP_URL = 'https://vk.com/app54897335';

export const createGoalInviteLink = (goal: Goal) => {
  const base = ['127.0.0.1', 'localhost'].includes(window.location.hostname)
    ? `${window.location.origin}${window.location.pathname}`
    : APP_URL;
  return `${base}#/join?group=${goal.groupId || goal.id}`;
};

/** Request key for VKWebAppShowRequestBox; VK hands it back in the launch parameters when the friend opens the request. */
export const goalRequestKey = (goalId: string) => `goal-${goalId}`;

const goalIdFromRequestKey = (value: string | null) => (value?.startsWith('goal-') ? value.slice(5) : null);

/**
 * The goal a friend was invited to: from a shared link (?group= or #/join?group=) or from a VK app request.
 * VK's exact parameter name for the request key is not in the bridge types, so the common variants are accepted.
 */
export const parseGoalInvite = (search: string) => {
  const hash = window.location.hash.replace(/^#/, '');
  const hashQuery = new URLSearchParams(hash.split('?')[1] || hash);
  const query = new URLSearchParams(search);
  return query.get('group')
    || hashQuery.get('group')
    || goalIdFromRequestKey(query.get('request_key') || query.get('vk_request_key') || hashQuery.get('request_key'))
    || goalIdFromRequestKey(hash.startsWith('goal-') ? hash : null);
};

export const clearGoalInvite = () => {
  const url = new URL(window.location.href);
  url.searchParams.delete('group');
  url.hash = url.hash.split('?')[0];
  window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
};
