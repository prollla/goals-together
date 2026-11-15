import { Goal } from '../types';

const APP_URL = 'https://vk.com/app54897335';

export const createGoalInviteLink = (goal: Goal) => {
  const base = ['127.0.0.1', 'localhost'].includes(window.location.hostname)
    ? `${window.location.origin}${window.location.pathname}`
    : APP_URL;
  return `${base}#/join?group=${goal.groupId || goal.id}`;
};

export const parseGoalInvite = (search: string) => {
  const hashQuery = window.location.hash.split('?')[1] || '';
  return new URLSearchParams(search).get('group') || new URLSearchParams(hashQuery).get('group');
};

export const clearGoalInvite = () => {
  const url = new URL(window.location.href);
  url.searchParams.delete('group');
  url.hash = url.hash.split('?')[0];
  window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
};
