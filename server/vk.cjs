// Minimal VK API client for server-side calls made with the app's service key.
// Without VK_SERVICE_KEY every call is a no-op, so the app works the same as before.
const VK_API_URL = (process.env.VK_API_URL || 'https://api.vk.com/method').replace(/\/$/, '');
const VK_API_VERSION = '5.199';

const createVk = (serviceKey) => {
  const enabled = Boolean(serviceKey);

  const call = async (method, params) => {
    const body = new URLSearchParams({ ...params, access_token: serviceKey, v: VK_API_VERSION });
    const response = await fetch(`${VK_API_URL}/${method}`, { method: 'POST', body, signal: AbortSignal.timeout(10_000) });
    const data = await response.json();
    if (data.error) throw new Error(`VK ${method}: ${data.error.error_code} ${data.error.error_msg}`);
    return data.response;
  };

  return {
    enabled,

    /** Real names and avatars: [{ id, first_name, photo_200 }]. */
    getUsers: async (userIds) => (enabled && userIds.length
      ? call('users.get', { user_ids: userIds.join(','), fields: 'photo_200' })
      : []),

    /**
     * Mini app notification. Delivered only to users who allowed notifications (VKWebAppAllowNotifications).
     * fragment is the hash route the notification opens, e.g. "/goal/123".
     */
    sendNotification: async (userIds, message, fragment = '') => (enabled && userIds.length
      ? call('notifications.sendMessage', {
        user_ids: userIds.join(','),
        message: message.slice(0, 254),
        fragment,
        random_id: String(Math.floor(Math.random() * 2 ** 31)),
      })
      : null),
  };
};

module.exports = { createVk };
