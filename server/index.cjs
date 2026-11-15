const http = require('node:http');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');
const { createVk } = require('./vk.cjs');
const { startBackups } = require('./backup.cjs');

const port = Number(process.env.PORT || 3001);
const isProduction = process.env.NODE_ENV === 'production';
const appSecret = process.env.VK_APP_SECRET;

if (isProduction && !appSecret) {
  throw new Error('VK_APP_SECRET is required in production');
}

const databasePath = process.env.DATABASE_PATH || path.join(__dirname, 'data', 'goals.db');
fs.mkdirSync(path.dirname(databasePath), { recursive: true });
const database = new Database(databasePath);
database.pragma('journal_mode = WAL');
database.pragma('foreign_keys = ON');
database.exec(`
  CREATE TABLE IF NOT EXISTS goals (
    id TEXT PRIMARY KEY,
    owner_id TEXT NOT NULL,
    title TEXT NOT NULL,
    rule TEXT NOT NULL,
    category TEXT NOT NULL,
    type TEXT NOT NULL,
    color TEXT NOT NULL,
    created_at TEXT NOT NULL,
    duration INTEGER NOT NULL,
    frequency TEXT NOT NULL,
    weekly_target REAL,
    target REAL,
    unit TEXT
  );
  CREATE TABLE IF NOT EXISTS participants (
    goal_id TEXT NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL,
    first_name TEXT NOT NULL,
    photo_url TEXT,
    joined_at TEXT NOT NULL,
    PRIMARY KEY (goal_id, user_id)
  );
  CREATE TABLE IF NOT EXISTS entries (
    goal_id TEXT NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL,
    date TEXT NOT NULL,
    status TEXT NOT NULL,
    value REAL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (goal_id, user_id, date)
  );
  CREATE TABLE IF NOT EXISTS cheers (
    goal_id TEXT NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
    from_user TEXT NOT NULL,
    to_user TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS cheers_by_goal ON cheers (goal_id, to_user, created_at);
  -- Names and avatars fetched from the VK API (only with VK_SERVICE_KEY).
  CREATE TABLE IF NOT EXISTS profiles (
    user_id TEXT PRIMARY KEY,
    first_name TEXT NOT NULL,
    photo_url TEXT,
    fetched_at TEXT NOT NULL
  );
  -- Reminder preferences: tz_offset is minutes east of UTC (Moscow = 180).
  CREATE TABLE IF NOT EXISTS user_settings (
    user_id TEXT PRIMARY KEY,
    notifications INTEGER NOT NULL DEFAULT 0,
    tz_offset INTEGER NOT NULL DEFAULT 180,
    last_reminded TEXT
  );
`);

const vk = createVk(process.env.VK_SERVICE_KEY);
startBackups(database, {
  dir: process.env.BACKUP_DIR,
  keep: Number(process.env.BACKUP_KEEP || 14),
  intervalMs: Number(process.env.BACKUP_INTERVAL_MS || 24 * 60 * 60 * 1000),
});
// Migration: private goals now live on the server too (before, only shared goals did).
if (!database.prepare('PRAGMA table_info(goals)').all().some((column) => column.name === 'privacy')) {
  database.exec("ALTER TABLE goals ADD COLUMN privacy TEXT NOT NULL DEFAULT 'group'");
}

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;
// Difference in days between a YYYY-MM-DD key and today's UTC date.
const daysFromToday = (key) =>
  (Date.parse(`${key}T00:00:00Z`) - Date.parse(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`)) / 86_400_000;

const json = (response, status, body) => {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, X-User-Id, X-User-Name, X-User-Photo, X-VK-Launch-Params',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Cache-Control': 'no-store',
  });
  response.end(JSON.stringify(body));
};

const httpError = (status, message) => Object.assign(new Error(message), { status });

const readBody = async (request) => {
  let body = '';
  for await (const chunk of request) {
    body += chunk;
    if (body.length > 100_000) throw httpError(413, 'Слишком большой запрос');
  }
  if (!body) return {};
  try {
    const parsed = JSON.parse(body);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error();
    return parsed;
  } catch {
    throw httpError(400, 'Некорректный формат запроса');
  }
};

const decodeHeader = (value, fallback = '') => {
  if (!value) return fallback;
  try {
    return decodeURIComponent(value);
  } catch {
    return fallback;
  }
};

// Signed launch params older than this are rejected (vk_ts is the launch time, in seconds).
const maxLaunchAgeSeconds = Number(process.env.MAX_LAUNCH_AGE_SECONDS || 3 * 24 * 60 * 60);

// Algorithm from the VK docs: vk_* params sorted by key, values URL-encoded, HMAC-SHA256, base64url.
const verifyLaunchParams = (search) => {
  const params = new URLSearchParams(search);
  const sign = params.get('sign');
  if (!sign || !appSecret) return null;
  const query = [...params.entries()]
    .filter(([key]) => key.startsWith('vk_'))
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
    .join('&');
  const expected = crypto.createHmac('sha256', appSecret).update(query).digest('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  const left = Buffer.from(sign);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !crypto.timingSafeEqual(left, right)) return null;
  const launchedAt = Number(params.get('vk_ts'));
  if (maxLaunchAgeSeconds > 0 && (!Number.isFinite(launchedAt) || Date.now() / 1000 - launchedAt > maxLaunchAgeSeconds)) return null;
  return params.get('vk_user_id');
};

// Only VK CDN avatars are stored, so a participant cannot make others' browsers load an arbitrary URL.
const PHOTO_HOSTS = ['userapi.com', 'vk.com', 'vk.ru', 'vkuserphoto.ru', 'vkuser.net', 'mycdn.me'];
const sanitizePhotoUrl = (value) => {
  if (!value || value.length > 500) return null;
  try {
    const url = new URL(value);
    const allowed = PHOTO_HOSTS.some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`));
    return url.protocol === 'https:' && allowed ? url.toString() : null;
  } catch {
    return null;
  }
};

// --- Verified profiles (VK_SERVICE_KEY): names and avatars come from VK, never from request headers. ---
const PROFILE_TTL_MS = 24 * 60 * 60 * 1000;
const profileRefreshAttempts = new Map(); // user_id -> last attempt time; at most one VK call per user per 10 min

const refreshVerifiedProfile = async (userId) => {
  const last = profileRefreshAttempts.get(userId) || 0;
  if (Date.now() - last < 10 * 60 * 1000) return;
  profileRefreshAttempts.set(userId, Date.now());
  try {
    const [vkUser] = await vk.getUsers([userId]);
    if (!vkUser) return;
    const firstName = String(vkUser.first_name || 'Участник').slice(0, 80);
    const photoUrl = sanitizePhotoUrl(vkUser.photo_200);
    database.prepare(`
      INSERT INTO profiles (user_id, first_name, photo_url, fetched_at) VALUES (?, ?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET first_name = excluded.first_name, photo_url = excluded.photo_url, fetched_at = excluded.fetched_at
    `).run(userId, firstName, photoUrl, new Date().toISOString());
    database.prepare('UPDATE participants SET first_name = ?, photo_url = ? WHERE user_id = ?').run(firstName, photoUrl, userId);
  } catch (error) {
    console.error('VK profile refresh failed', error.message);
  }
};

const getVerifiedProfile = (userId) => {
  const profile = database.prepare('SELECT first_name, photo_url, fetched_at FROM profiles WHERE user_id = ?').get(userId);
  if (!profile || Date.now() - Date.parse(profile.fetched_at) > PROFILE_TTL_MS) void refreshVerifiedProfile(userId);
  return { firstName: profile?.first_name ?? null, photoUrl: profile?.photo_url ?? null };
};

const getUser = (request) => {
  let userId = decodeHeader(request.headers['x-user-id'], '1');
  if (isProduction) {
    userId = verifyLaunchParams(request.headers['x-vk-launch-params'] || '');
    if (!userId) throw httpError(401, 'Сессия VK устарела или недействительна. Перезапустите приложение.');
  }
  userId = String(userId);
  if (vk.enabled) return { id: userId, ...getVerifiedProfile(userId) };
  // Without a service key the client-reported profile is used.
  // null means "unknown": the stored profile is kept instead of being overwritten with a placeholder.
  const firstName = decodeHeader(request.headers['x-user-name']).trim().slice(0, 80);
  return {
    id: userId,
    firstName: firstName || null,
    photoUrl: sanitizePhotoUrl(decodeHeader(request.headers['x-user-photo'])),
  };
};

const getGoalRow = (groupId) => database.prepare('SELECT * FROM goals WHERE id = ?').get(groupId);
const getParticipant = (groupId, userId) => database.prepare('SELECT * FROM participants WHERE goal_id = ? AND user_id = ?').get(groupId, userId);
const requireParticipant = (groupId, userId) => {
  const participant = getParticipant(groupId, userId);
  if (!participant) throw Object.assign(new Error('Цель не найдена или вы в ней не участвуете'), { status: 404 });
  return participant;
};

const getEntries = (groupId, userId) => Object.fromEntries(
  database.prepare('SELECT date, status, value FROM entries WHERE goal_id = ? AND user_id = ?').all(groupId, userId)
    .map((entry) => [entry.date, { status: entry.status, value: entry.value ?? undefined }]),
);

// «Поддержать»: one cheer per person per participant per goal within this window.
const CHEER_COOLDOWN_MS = 20 * 60 * 60 * 1000;
const cheerSince = () => new Date(Date.now() - CHEER_COOLDOWN_MS).toISOString();

const getCheers = (goalId, toUser, currentUserId) => {
  const since = cheerSince();
  const stats = database.prepare(`
    SELECT COUNT(*) AS total,
           SUM(CASE WHEN created_at >= ? THEN 1 ELSE 0 END) AS recent,
           SUM(CASE WHEN created_at >= ? AND from_user = ? THEN 1 ELSE 0 END) AS mine
    FROM cheers WHERE goal_id = ? AND to_user = ?
  `).get(since, since, currentUserId, goalId, toUser);
  return { total: stats.total, recent: stats.recent || 0, byMe: Boolean(stats.mine) };
};

const serializeGoal = (row, user) => {
  const participants = database.prepare('SELECT user_id, first_name, photo_url, joined_at FROM participants WHERE goal_id = ? ORDER BY joined_at').all(row.id);
  return {
    id: row.id,
    groupId: row.id,
    ownerId: row.owner_id,
    title: row.title,
    rule: row.rule,
    category: row.category,
    type: row.type,
    color: row.color,
    createdAt: row.created_at.slice(0, 10),
    duration: row.duration,
    frequency: row.frequency,
    weeklyTarget: row.weekly_target ?? undefined,
    target: row.target ?? undefined,
    unit: row.unit ?? undefined,
    privacy: row.privacy === 'private' ? 'private' : 'group',
    entries: getEntries(row.id, user.id),
    participants: participants.map((participant) => ({
      userId: participant.user_id,
      firstName: participant.first_name,
      photoUrl: participant.photo_url ?? undefined,
      joinedAt: participant.joined_at,
      entries: getEntries(row.id, participant.user_id),
      cheers: getCheers(row.id, participant.user_id, user.id),
    })),
  };
};

const addParticipant = (groupId, user) => {
  database.prepare(`
    INSERT INTO participants (goal_id, user_id, first_name, photo_url, joined_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(goal_id, user_id) DO UPDATE SET
      first_name = COALESCE(?, participants.first_name),
      photo_url = COALESCE(?, participants.photo_url)
  `).run(groupId, user.id, user.firstName || 'Участник', user.photoUrl, new Date().toISOString(), user.firstName, user.photoUrl);
};

// One cheap UPDATE per poll instead of an upsert per goal; writes only when something actually changed.
const refreshProfile = (user) => {
  if (user.firstName) {
    database.prepare('UPDATE participants SET first_name = ? WHERE user_id = ? AND first_name IS NOT ?').run(user.firstName, user.id, user.firstName);
  }
  if (user.photoUrl) {
    database.prepare('UPDATE participants SET photo_url = ? WHERE user_id = ? AND photo_url IS NOT ?').run(user.photoUrl, user.id, user.photoUrl);
  }
};

const GOAL_TYPES = ['quit', 'regular', 'quantity'];
const GOAL_CATEGORIES = ['Здоровье', 'Отказ', 'Развитие', 'Финансы и порядок'];
const GOAL_COLORS = ['violet', 'green', 'orange', 'blue'];
const GOAL_FREQUENCIES = ['daily', 'weekdays', 'weekly'];

const optionalNumber = (value, isValid) => {
  if (value === undefined || value === null || value === '') return null;
  const number = Number(value);
  if (!Number.isFinite(number) || !isValid(number)) throw httpError(400, 'Проверьте параметры цели');
  return number;
};

// Returns a normalized draft or throws 400; nothing from the client reaches the database unchecked.
const validateDraft = (draft) => {
  const title = typeof draft.title === 'string' ? draft.title.trim().slice(0, 80) : '';
  if (!title || !GOAL_TYPES.includes(draft.type)) throw httpError(400, 'Проверьте параметры цели');
  const duration = optionalNumber(draft.duration, (n) => Number.isInteger(n) && n >= 0 && n <= 3650) ?? 0;
  const frequency = GOAL_FREQUENCIES.includes(draft.frequency) ? draft.frequency : 'daily';
  const target = draft.type === 'quantity' ? optionalNumber(draft.target, (n) => n > 0 && n <= 1e9) : null;
  if (draft.type === 'quantity' && target === null) throw httpError(400, 'Проверьте параметры цели');
  return {
    title,
    rule: typeof draft.rule === 'string' ? draft.rule.trim().slice(0, 180) : '',
    category: GOAL_CATEGORIES.includes(draft.category) ? draft.category : 'Развитие',
    type: draft.type,
    color: GOAL_COLORS.includes(draft.color) ? draft.color : 'violet',
    duration,
    frequency,
    weeklyTarget: frequency === 'weekly' ? optionalNumber(draft.weeklyTarget, (n) => Number.isInteger(n) && n >= 1 && n <= 7) : null,
    target,
    unit: draft.type === 'quantity' && typeof draft.unit === 'string' ? draft.unit.trim().slice(0, 16) || null : null,
  };
};

// Marks are allowed for "today" and "yesterday" in the user's time zone. The server only knows UTC,
// so the window is UTC today -2 .. +1, which covers every time zone from UTC-12 to UTC+14.
const assertMarkableDate = (date) => {
  if (typeof date !== 'string' || !DATE_KEY.test(date)) throw httpError(400, 'Некорректная отметка');
  const diff = daysFromToday(date);
  if (diff > 1 || diff < -2) throw httpError(400, 'Отметить можно только сегодня или вчера');
};

// Creation date in the user's local calendar. Migrated goals keep their original date; never in the future.
const normalizeCreatedAt = (value) => {
  if (typeof value === 'string' && DATE_KEY.test(value) && value >= '2020-01-01' && daysFromToday(value) <= 1) {
    return `${value}T12:00:00.000Z`;
  }
  return new Date().toISOString();
};

// --- Notifications (VK_SERVICE_KEY + the user's permission in VK) ---
const getSettings = (userId) => database.prepare('SELECT notifications, tz_offset, last_reminded FROM user_settings WHERE user_id = ?').get(userId)
  || { notifications: 0, tz_offset: 180, last_reminded: null };

const keyAddDays = (key, days) => new Date(Date.parse(`${key}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
const keyWeekday = (key) => new Date(`${key}T00:00:00Z`).getUTCDay(); // 0 = Sunday

/** Goals of the user that still expect a mark on `today` (the user's local date). Mirrors src/utils/goals.ts. */
const countGoalsNeedingMark = (userId, today) => {
  const rows = database.prepare("SELECT g.* FROM goals g JOIN participants p ON p.goal_id = g.id WHERE p.user_id = ? AND g.type != 'quantity'").all(userId);
  return rows.filter((row) => {
    const createdAt = row.created_at.slice(0, 10);
    if (createdAt > today) return false;
    if (row.duration > 0 && today > keyAddDays(createdAt, row.duration - 1)) return false; // finished
    if (row.frequency === 'weekdays' && [0, 6].includes(keyWeekday(today))) return false; // day off
    const entries = getEntries(row.id, userId);
    if (entries[today]) return false; // already marked (done or skipped)
    if (row.frequency === 'weekly') {
      const weekStart = keyAddDays(today, -((keyWeekday(today) + 6) % 7));
      const doneThisWeek = Array.from({ length: 7 }, (_, i) => keyAddDays(weekStart, i)).filter((key) => entries[key]?.status === 'done').length;
      if (doneThisWeek >= (row.weekly_target || 1)) return false; // weekly norm met
    }
    return true;
  }).length;
};

const pluralRu = (count, [one, few, many]) => {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
};

const REMINDER_HOUR = 20; // local time
/** Sends at most one evening reminder per user per local day, between 20:00 and 23:00 their time. */
const runReminders = async () => {
  if (!vk.enabled) return;
  const users = database.prepare('SELECT user_id, tz_offset, last_reminded FROM user_settings WHERE notifications = 1').all();
  for (const settings of users) {
    const local = new Date(Date.now() + settings.tz_offset * 60_000);
    const today = local.toISOString().slice(0, 10);
    const hour = local.getUTCHours();
    if (hour < REMINDER_HOUR || hour >= 23 || settings.last_reminded === today) continue;
    database.prepare('UPDATE user_settings SET last_reminded = ? WHERE user_id = ?').run(today, settings.user_id);
    const pending = countGoalsNeedingMark(settings.user_id, today);
    if (!pending) continue;
    try {
      const words = pluralRu(pending, ['цель ждёт', 'цели ждут', 'целей ждут']);
      await vk.sendNotification([settings.user_id], `Сегодня ${pending} ${words} отметки. Маленький шаг — тоже шаг!`, '/');
    } catch (error) {
      console.error('Reminder failed', error.message);
    }
  }
};
if (vk.enabled) setInterval(() => void runReminders(), Number(process.env.REMINDER_INTERVAL_MS || 5 * 60 * 1000)).unref();

/** «Поддержать»: tell the recipient, if they allowed notifications. */
const onCheer = (goalRow, fromUser, toUserId) => {
  if (!vk.enabled || !getSettings(toUserId).notifications) return;
  const name = getParticipant(goalRow.id, fromUser.id)?.first_name || 'Друг';
  vk.sendNotification([toUserId], `${name} поддерживает вас в цели «${goalRow.title}» 👏`, `/goal/${goalRow.id}`)
    .catch((error) => console.error('Cheer notification failed', error.message));
};

const server = http.createServer(async (request, response) => {
  if (request.method === 'OPTIONS') {
    json(response, 204, {});
    return;
  }

  try {
    const url = new URL(request.url, 'http://localhost');

    if (request.method === 'GET' && url.pathname === '/api/health') {
      json(response, 200, { ok: true });
      return;
    }

    const parts = url.pathname.split('/').filter(Boolean);
    const user = getUser(request);

    // Reminder settings. `available` tells the client whether the server can send notifications at all.
    if (url.pathname === '/api/settings' && (request.method === 'GET' || request.method === 'PUT')) {
      if (request.method === 'PUT') {
        const { notifications, tzOffset } = await readBody(request);
        const offset = Number(tzOffset);
        if (typeof notifications !== 'boolean' || !Number.isInteger(offset) || offset < -720 || offset > 840) {
          throw httpError(400, 'Некорректные настройки');
        }
        database.prepare(`
          INSERT INTO user_settings (user_id, notifications, tz_offset) VALUES (?, ?, ?)
          ON CONFLICT(user_id) DO UPDATE SET notifications = excluded.notifications, tz_offset = excluded.tz_offset
        `).run(user.id, notifications ? 1 : 0, offset);
      }
      const settings = getSettings(user.id);
      json(response, 200, { available: vk.enabled, notifications: Boolean(settings.notifications), tzOffset: settings.tz_offset });
      return;
    }

    if (request.method === 'GET' && url.pathname === '/api/goals') {
      const rows = database.prepare('SELECT g.* FROM goals g JOIN participants p ON p.goal_id = g.id WHERE p.user_id = ? ORDER BY g.created_at DESC').all(user.id);
      refreshProfile(user);
      json(response, 200, rows.map((row) => serializeGoal(row, user)));
      return;
    }

    if (request.method === 'POST' && url.pathname === '/api/goals') {
      const { entries, createdAt: requestedCreatedAt, ...body } = await readBody(request);
      const draft = validateDraft(body);
      const privacy = body.privacy === 'private' ? 'private' : 'group';
      const groupId = crypto.randomUUID();
      const createdAt = normalizeCreatedAt(requestedCreatedAt);
      database.transaction(() => {
        database.prepare(`
          INSERT INTO goals (id, owner_id, title, rule, category, type, color, created_at, duration, frequency, weekly_target, target, unit, privacy)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          groupId, user.id, draft.title, draft.rule, draft.category, draft.type, draft.color, createdAt,
          draft.duration, draft.frequency, draft.weeklyTarget, draft.target, draft.unit, privacy,
        );
        addParticipant(groupId, user);
        if (entries && typeof entries === 'object') {
          const insertEntry = database.prepare('INSERT OR REPLACE INTO entries (goal_id, user_id, date, status, value, updated_at) VALUES (?, ?, ?, ?, ?, ?)');
          Object.entries(entries).forEach(([date, entry]) => {
            if (DATE_KEY.test(date) && daysFromToday(date) <= 1 && entry && ['done', 'skipped'].includes(entry.status)) {
              insertEntry.run(groupId, user.id, date, entry.status, Number.isFinite(entry.value) && entry.value > 0 ? entry.value : null, new Date().toISOString());
            }
          });
        }
      })();
      json(response, 201, serializeGoal(getGoalRow(groupId), user));
      return;
    }

    if (parts[0] === 'api' && parts[1] === 'invitations' && parts[2] && request.method === 'GET') {
      const row = getGoalRow(parts[2]);
      if (!row || row.privacy === 'private') throw httpError(404, 'Приглашение не найдено: возможно, цель удалена');
      const participantCount = database.prepare('SELECT COUNT(*) AS count FROM participants WHERE goal_id = ?').get(row.id).count;
      json(response, 200, {
        title: row.title,
        rule: row.rule,
        category: row.category,
        type: row.type,
        color: row.color,
        duration: row.duration,
        frequency: row.frequency,
        weeklyTarget: row.weekly_target ?? undefined,
        target: row.target ?? undefined,
        unit: row.unit ?? undefined,
        privacy: 'group',
        groupId: row.id,
        participantCount,
      });
      return;
    }

    if (parts[0] === 'api' && parts[1] === 'goals' && parts[2]) {
      const groupId = parts[2];
      const row = getGoalRow(groupId);
      if (!row) throw Object.assign(new Error('Цель не найдена или вы в ней не участвуете'), { status: 404 });

      if (request.method === 'GET' && parts.length === 3) {
        requireParticipant(groupId, user.id);
        json(response, 200, serializeGoal(row, user));
        return;
      }

      if (request.method === 'POST' && parts[3] === 'join') {
        if (row.privacy === 'private') throw httpError(404, 'Приглашение не найдено: возможно, цель удалена');
        addParticipant(groupId, user);
        json(response, 200, serializeGoal(row, user));
        return;
      }

      // Edit a goal: only its author; the type cannot change (it would break the history).
      if (request.method === 'PATCH' && parts.length === 3) {
        requireParticipant(groupId, user.id);
        if (row.owner_id !== user.id) throw httpError(403, 'Изменять цель может только её автор');
        const draft = validateDraft({ ...(await readBody(request)), type: row.type });
        database.prepare(`
          UPDATE goals SET title = ?, rule = ?, category = ?, color = ?, duration = ?, frequency = ?, weekly_target = ?, target = ?, unit = ?
          WHERE id = ?
        `).run(draft.title, draft.rule, draft.category, draft.color, draft.duration, draft.frequency, draft.weeklyTarget, draft.target, draft.unit, groupId);
        json(response, 200, serializeGoal(getGoalRow(groupId), user));
        return;
      }

      // «Поддержать» another participant. Repeating within the cooldown is a no-op (no spam, no double count).
      if (request.method === 'POST' && parts[3] === 'cheers') {
        requireParticipant(groupId, user.id);
        const { to } = await readBody(request);
        if (typeof to !== 'string' || to === user.id) throw httpError(400, 'Поддержать можно только другого участника');
        if (!getParticipant(groupId, to)) throw httpError(404, 'Участник не найден');
        const already = database.prepare('SELECT 1 FROM cheers WHERE goal_id = ? AND from_user = ? AND to_user = ? AND created_at >= ?')
          .get(groupId, user.id, to, cheerSince());
        if (!already) {
          database.prepare('INSERT INTO cheers (goal_id, from_user, to_user, created_at) VALUES (?, ?, ?, ?)')
            .run(groupId, user.id, to, new Date().toISOString());
          onCheer(row, user, to);
        }
        json(response, 200, serializeGoal(row, user));
        return;
      }

      // Clear the user's mark (or the accumulated value) for one day.
      if (request.method === 'DELETE' && parts[3] === 'entries' && parts[4]) {
        requireParticipant(groupId, user.id);
        assertMarkableDate(parts[4]);
        database.prepare('DELETE FROM entries WHERE goal_id = ? AND user_id = ? AND date = ?').run(groupId, user.id, parts[4]);
        json(response, 200, serializeGoal(row, user));
        return;
      }

      if (request.method === 'PUT' && parts[3] === 'entries') {
        requireParticipant(groupId, user.id);
        const { date, status } = await readBody(request);
        assertMarkableDate(date);
        if (!['done', 'skipped'].includes(status)) throw httpError(400, 'Некорректная отметка');
        const current = database.prepare('SELECT status, value FROM entries WHERE goal_id = ? AND user_id = ? AND date = ?').get(groupId, user.id, date);
        if (current?.status === status && current.value === null) {
          database.prepare('DELETE FROM entries WHERE goal_id = ? AND user_id = ? AND date = ?').run(groupId, user.id, date);
        } else {
          database.prepare(`
            INSERT INTO entries (goal_id, user_id, date, status, value, updated_at) VALUES (?, ?, ?, ?, NULL, ?)
            ON CONFLICT(goal_id, user_id, date) DO UPDATE SET status = excluded.status, value = NULL, updated_at = excluded.updated_at
          `).run(groupId, user.id, date, status, new Date().toISOString());
        }
        json(response, 200, serializeGoal(row, user));
        return;
      }

      if (request.method === 'POST' && parts[3] === 'entries') {
        requireParticipant(groupId, user.id);
        const { date, value } = await readBody(request);
        assertMarkableDate(date);
        if (!Number.isFinite(value) || value <= 0 || value > 1e9) throw httpError(400, 'Некорректная отметка');
        database.prepare(`
          INSERT INTO entries (goal_id, user_id, date, status, value, updated_at) VALUES (?, ?, ?, 'done', ?, ?)
          ON CONFLICT(goal_id, user_id, date) DO UPDATE SET status = 'done', value = COALESCE(entries.value, 0) + excluded.value, updated_at = excluded.updated_at
        `).run(groupId, user.id, date, value, new Date().toISOString());
        json(response, 200, serializeGoal(row, user));
        return;
      }

      if (request.method === 'DELETE' && parts.length === 3) {
        requireParticipant(groupId, user.id);
        if (row.owner_id === user.id) {
          database.prepare('DELETE FROM goals WHERE id = ?').run(groupId);
        } else {
          database.transaction(() => {
            database.prepare('DELETE FROM entries WHERE goal_id = ? AND user_id = ?').run(groupId, user.id);
            database.prepare('DELETE FROM cheers WHERE goal_id = ? AND (from_user = ? OR to_user = ?)').run(groupId, user.id, user.id);
            database.prepare('DELETE FROM participants WHERE goal_id = ? AND user_id = ?').run(groupId, user.id);
          })();
        }
        json(response, 200, { ok: true, ownerDeleted: row.owner_id === user.id });
        return;
      }
    }

    json(response, 404, { error: 'Не найдено' });
  } catch (error) {
    if (error.status) {
      json(response, error.status, { error: error.message });
      return;
    }
    // Unexpected errors (SQL etc.) are logged, never sent to the client.
    console.error(`${request.method} ${request.url}`, error);
    json(response, 500, { error: 'Ошибка сервера. Попробуйте позже.' });
  }
});

server.listen(port, '0.0.0.0', () => {
  console.log(`Goals API listening on http://127.0.0.1:${port}`);
});
