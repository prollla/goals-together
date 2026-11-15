const http = require('node:http');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');

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
`);

const json = (response, status, body) => {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, X-User-Id, X-User-Name, X-User-Photo, X-VK-Launch-Params',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Cache-Control': 'no-store',
  });
  response.end(JSON.stringify(body));
};

const readBody = async (request) => {
  let body = '';
  for await (const chunk of request) {
    body += chunk;
    if (body.length > 1_000_000) throw new Error('Request body is too large');
  }
  return body ? JSON.parse(body) : {};
};

const decodeHeader = (value, fallback = '') => {
  if (!value) return fallback;
  try {
    return decodeURIComponent(value);
  } catch {
    return fallback;
  }
};

const verifyLaunchParams = (search) => {
  const params = new URLSearchParams(search);
  const sign = params.get('sign');
  if (!sign || !appSecret) return null;
  const query = [...params.entries()]
    .filter(([key]) => key.startsWith('vk_'))
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join('&');
  const expected = crypto.createHmac('sha256', appSecret).update(query).digest('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  const left = Buffer.from(sign);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !crypto.timingSafeEqual(left, right)) return null;
  return params.get('vk_user_id');
};

const getUser = (request) => {
  let userId = decodeHeader(request.headers['x-user-id'], '1');
  if (isProduction) {
    userId = verifyLaunchParams(request.headers['x-vk-launch-params'] || '');
    if (!userId) throw Object.assign(new Error('Invalid VK launch parameters'), { status: 401 });
  }
  return {
    id: String(userId),
    firstName: decodeHeader(request.headers['x-user-name'], 'Пользователь').slice(0, 80),
    photoUrl: decodeHeader(request.headers['x-user-photo']).slice(0, 500),
  };
};

const getGoalRow = (groupId) => database.prepare('SELECT * FROM goals WHERE id = ?').get(groupId);
const getParticipant = (groupId, userId) => database.prepare('SELECT * FROM participants WHERE goal_id = ? AND user_id = ?').get(groupId, userId);
const requireParticipant = (groupId, userId) => {
  const participant = getParticipant(groupId, userId);
  if (!participant) throw Object.assign(new Error('Goal not found'), { status: 404 });
  return participant;
};

const getEntries = (groupId, userId) => Object.fromEntries(
  database.prepare('SELECT date, status, value FROM entries WHERE goal_id = ? AND user_id = ?').all(groupId, userId)
    .map((entry) => [entry.date, { status: entry.status, value: entry.value ?? undefined }]),
);

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
    privacy: 'group',
    entries: getEntries(row.id, user.id),
    participants: participants.map((participant) => ({
      userId: participant.user_id,
      firstName: participant.first_name,
      photoUrl: participant.photo_url ?? undefined,
      joinedAt: participant.joined_at,
      entries: getEntries(row.id, participant.user_id),
    })),
  };
};

const addParticipant = (groupId, user) => {
  database.prepare(`
    INSERT INTO participants (goal_id, user_id, first_name, photo_url, joined_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(goal_id, user_id) DO UPDATE SET first_name = excluded.first_name, photo_url = excluded.photo_url
  `).run(groupId, user.id, user.firstName, user.photoUrl, new Date().toISOString());
};

const validateDraft = (draft) => {
  if (!draft.title || !['quit', 'regular', 'quantity'].includes(draft.type)) {
    throw Object.assign(new Error('Invalid goal'), { status: 400 });
  }
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

    if (request.method === 'GET' && url.pathname === '/api/goals') {
      const rows = database.prepare('SELECT g.* FROM goals g JOIN participants p ON p.goal_id = g.id WHERE p.user_id = ? ORDER BY g.created_at DESC').all(user.id);
      json(response, 200, rows.map((row) => {
        addParticipant(row.id, user);
        return serializeGoal(row, user);
      }));
      return;
    }

    if (request.method === 'POST' && url.pathname === '/api/goals') {
      const { entries, ...draft } = await readBody(request);
      validateDraft(draft);
      const groupId = crypto.randomUUID();
      const createdAt = new Date().toISOString();
      database.transaction(() => {
        database.prepare(`
          INSERT INTO goals (id, owner_id, title, rule, category, type, color, created_at, duration, frequency, weekly_target, target, unit)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          groupId, user.id, draft.title.trim().slice(0, 80), (draft.rule || '').trim().slice(0, 180),
          draft.category || 'Развитие', draft.type, draft.color || 'violet', createdAt,
          Number(draft.duration || 0), draft.frequency || 'daily', draft.weeklyTarget ?? null,
          draft.target ?? null, draft.unit ?? null,
        );
        addParticipant(groupId, user);
        if (entries && typeof entries === 'object') {
          const insertEntry = database.prepare('INSERT OR REPLACE INTO entries (goal_id, user_id, date, status, value, updated_at) VALUES (?, ?, ?, ?, ?, ?)');
          Object.entries(entries).forEach(([date, entry]) => {
            if (/^\d{4}-\d{2}-\d{2}$/.test(date) && ['done', 'skipped'].includes(entry.status)) {
              insertEntry.run(groupId, user.id, date, entry.status, Number.isFinite(entry.value) ? entry.value : null, createdAt);
            }
          });
        }
      })();
      json(response, 201, serializeGoal(getGoalRow(groupId), user));
      return;
    }

    if (parts[0] === 'api' && parts[1] === 'invitations' && parts[2] && request.method === 'GET') {
      const row = getGoalRow(parts[2]);
      if (!row) throw Object.assign(new Error('Invitation not found'), { status: 404 });
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
      if (!row) throw Object.assign(new Error('Goal not found'), { status: 404 });

      if (request.method === 'GET' && parts.length === 3) {
        requireParticipant(groupId, user.id);
        addParticipant(groupId, user);
        json(response, 200, serializeGoal(row, user));
        return;
      }

      if (request.method === 'POST' && parts[3] === 'join') {
        addParticipant(groupId, user);
        json(response, 200, serializeGoal(row, user));
        return;
      }

      if (request.method === 'PUT' && parts[3] === 'entries') {
        requireParticipant(groupId, user.id);
        const { date, status } = await readBody(request);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !['done', 'skipped'].includes(status)) {
          throw Object.assign(new Error('Invalid entry'), { status: 400 });
        }
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
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(value) || value <= 0) {
          throw Object.assign(new Error('Invalid entry'), { status: 400 });
        }
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
            database.prepare('DELETE FROM participants WHERE goal_id = ? AND user_id = ?').run(groupId, user.id);
          })();
        }
        json(response, 200, { ok: true, ownerDeleted: row.owner_id === user.id });
        return;
      }
    }

    json(response, 404, { error: 'Not found' });
  } catch (error) {
    json(response, error.status || 400, { error: error.message || 'Request failed' });
  }
});

server.listen(port, '0.0.0.0', () => {
  console.log(`Goals API listening on http://127.0.0.1:${port}`);
});
