// End-to-end test of server/index.cjs in production mode (run: npm run test:api).
const { spawn } = require('node:child_process');
const crypto = require('node:crypto');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');

const repo = path.join(__dirname, '..');
const SECRET = 'test-secret-for-local-run';
const PORT = 3911;
const dbDir = fs.mkdtempSync(path.join(os.tmpdir(), 'goals-db-'));

const sign = (params) => {
  const query = Object.keys(params).filter((k) => k.startsWith('vk_')).sort()
    .map((k) => `${k}=${encodeURIComponent(params[k])}`).join('&');
  return crypto.createHmac('sha256', SECRET).update(query).digest('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const launch = (userId, extra = {}) => {
  const params = { vk_app_id: '54897335', vk_user_id: String(userId), vk_ts: String(Math.floor(Date.now() / 1000)), vk_platform: 'desktop_web', vk_access_token_settings: '', ...extra };
  return '?' + new URLSearchParams({ ...params, sign: sign(params) }).toString();
};

let failures = 0;
const check = (name, condition, detail = '') => {
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${name}${condition ? '' : `  -> ${detail}`}`);
  if (!condition) failures += 1;
};

const call = async (method, url, { launchParams, name, photo, body, raw } = {}) => {
  const headers = { 'Content-Type': 'application/json' };
  if (launchParams !== undefined) headers['X-VK-Launch-Params'] = launchParams;
  if (name) headers['X-User-Name'] = encodeURIComponent(name);
  if (photo) headers['X-User-Photo'] = encodeURIComponent(photo);
  const response = await fetch(`http://127.0.0.1:${PORT}${url}`, { method, headers, body: raw ?? (body ? JSON.stringify(body) : undefined) });
  const data = await response.json().catch(() => null);
  return { status: response.status, data };
};

(async () => {
  const server = spawn(process.execPath, [path.join(repo, 'server', 'index.cjs')], {
    env: { ...process.env, NODE_ENV: 'production', VK_APP_SECRET: SECRET, PORT: String(PORT), DATABASE_PATH: path.join(dbDir, 'goals.db') },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let serverLog = '';
  server.stdout.on('data', (d) => { serverLog += d; });
  server.stderr.on('data', (d) => { serverLog += d; });
  for (let i = 0; i < 50; i += 1) {
    try { if ((await fetch(`http://127.0.0.1:${PORT}/api/health`)).ok) break; } catch { /* starting */ }
    await new Promise((r) => setTimeout(r, 100));
  }

  try {
    const alice = launch(101);
    const bob = launch(202);

    check('health', (await call('GET', '/api/health')).status === 200);
    check('no sign -> 401', (await call('GET', '/api/goals', { launchParams: '' })).status === 401);
    const forged = alice.replace('vk_user_id=101', 'vk_user_id=999');
    check('forged user id -> 401', (await call('GET', '/api/goals', { launchParams: forged })).status === 401);
    const withScopes = launch(101, { vk_access_token_settings: 'friends,photos' });
    check('sign with comma in token settings -> 200 (encoding fix)', (await call('GET', '/api/goals', { launchParams: withScopes })).status === 200);
    const stale = launch(101, { vk_ts: String(Math.floor(Date.now() / 1000) - 5 * 24 * 3600) });
    check('stale vk_ts (5 days) -> 401', (await call('GET', '/api/goals', { launchParams: stale })).status === 401);

    check('invalid type -> 400', (await call('POST', '/api/goals', { launchParams: alice, body: { title: 'x', type: 'hack' } })).status === 400);
    check('quantity without target -> 400', (await call('POST', '/api/goals', { launchParams: alice, body: { title: 'x', type: 'quantity' } })).status === 400);
    const badJson = await call('POST', '/api/goals', { launchParams: alice, raw: '{oops' });
    check('bad JSON -> 400 Invalid JSON', badJson.status === 400 && badJson.data?.error === 'Некорректный формат запроса', JSON.stringify(badJson));

    // Created before the profile is known: placeholder name, no photo.
    const created = await call('POST', '/api/goals', { launchParams: alice, body: { title: '  Читать  ', type: 'regular', color: 'red;}body{', category: 'Evil', frequency: 'weekly', weeklyTarget: 3, duration: 30 } });
    const goal = created.data;
    check('create -> 201', created.status === 201, JSON.stringify(created));
    check('title trimmed, color/category whitelisted', goal.title === 'Читать' && goal.color === 'violet' && goal.category === 'Развитие', JSON.stringify(goal));
    check('weeklyTarget kept', goal.weeklyTarget === 3);
    check('placeholder name on insert', goal.participants[0].firstName === 'Участник');

    await call('GET', '/api/goals', { launchParams: alice, name: 'Алиса', photo: 'https://sun9-1.userapi.com/a.jpg' });
    let list = (await call('GET', '/api/goals', { launchParams: alice })).data;
    check('name/photo refreshed from real profile', list[0].participants[0].firstName === 'Алиса' && list[0].participants[0].photoUrl === 'https://sun9-1.userapi.com/a.jpg', JSON.stringify(list[0].participants));
    check('request without name keeps stored name (no "Вы")', list[0].participants[0].firstName === 'Алиса');

    await call('GET', '/api/goals', { launchParams: alice, photo: 'https://evil.example.com/pixel.gif' });
    list = (await call('GET', '/api/goals', { launchParams: alice })).data;
    check('foreign photo host rejected', list[0].participants[0].photoUrl === 'https://sun9-1.userapi.com/a.jpg');

    const invite = await call('GET', `/api/invitations/${goal.id}`, { launchParams: bob });
    check('invitation visible to bob', invite.status === 200 && invite.data.participantCount === 1);
    check('bob cannot read goal before joining', (await call('GET', `/api/goals/${goal.id}`, { launchParams: bob })).status === 404);
    const joined = await call('POST', `/api/goals/${goal.id}/join`, { launchParams: bob, name: 'Боб' });
    check('bob joins', joined.status === 200 && joined.data.participants.length === 2);

    const today = new Date().toISOString().slice(0, 10);
    let marked = await call('PUT', `/api/goals/${goal.id}/entries`, { launchParams: bob, body: { date: today, status: 'done' } });
    check('bob marks done', marked.data.entries[today]?.status === 'done');
    marked = await call('PUT', `/api/goals/${goal.id}/entries`, { launchParams: bob, body: { date: today, status: 'done' } });
    check('second tap toggles off', !marked.data.entries[today]);
    const aliceView = (await call('GET', `/api/goals/${goal.id}`, { launchParams: alice })).data;
    check('alice sees bob as participant', aliceView.participants.some((p) => p.userId === '202' && p.firstName === 'Боб'));

    const qty = (await call('POST', '/api/goals', { launchParams: alice, body: { title: 'Бег', type: 'quantity', target: 100, unit: 'км' } })).data;
    await call('POST', `/api/goals/${qty.id}/entries`, { launchParams: alice, body: { date: today, value: 5 } });
    const qty2 = (await call('POST', `/api/goals/${qty.id}/entries`, { launchParams: alice, body: { date: today, value: 2.5 } })).data;
    check('quantity values accumulate', qty2.entries[today]?.value === 7.5, JSON.stringify(qty2.entries));
    check('negative value -> 400', (await call('POST', `/api/goals/${qty.id}/entries`, { launchParams: alice, body: { date: today, value: -1 } })).status === 400);

    const left = await call('DELETE', `/api/goals/${goal.id}`, { launchParams: bob });
    check('bob leaves (not owner)', left.status === 200 && left.data.ownerDeleted === false);
    check('goal still exists for alice', (await call('GET', `/api/goals/${goal.id}`, { launchParams: alice })).status === 200);
    const removed = await call('DELETE', `/api/goals/${goal.id}`, { launchParams: alice });
    check('owner deletes goal', removed.data?.ownerDeleted === true);
    check('deleted goal gone', (await call('GET', `/api/invitations/${goal.id}`, { launchParams: bob })).status === 404);

    // --- private goals on the server, editing, day reset, date window, migration ---
    const priv = (await call('POST', '/api/goals', { launchParams: alice, body: { title: 'Личная', type: 'regular', privacy: 'private' } })).data;
    check('private goal stored with privacy=private', priv.privacy === 'private', JSON.stringify(priv));
    check('private goal listed for owner', (await call('GET', '/api/goals', { launchParams: alice })).data.some((item) => item.id === priv.id));
    check('private goal: invitation 404', (await call('GET', `/api/invitations/${priv.id}`, { launchParams: bob })).status === 404);
    check('private goal: join 404', (await call('POST', `/api/goals/${priv.id}/join`, { launchParams: bob })).status === 404);
    check('private goal: other user cannot read', (await call('GET', `/api/goals/${priv.id}`, { launchParams: bob })).status === 404);

    const shared = (await call('POST', '/api/goals', { launchParams: alice, body: { title: 'Общая', type: 'regular', privacy: 'group' } })).data;
    await call('POST', `/api/goals/${shared.id}/join`, { launchParams: bob, name: 'Боб' });
    const edited = await call('PATCH', `/api/goals/${shared.id}`, { launchParams: alice, body: { title: 'Общая v2', type: 'quantity', frequency: 'weekly', weeklyTarget: 3, duration: 14, color: 'green' } });
    check('owner edits goal', edited.status === 200 && edited.data.title === 'Общая v2' && edited.data.weeklyTarget === 3 && edited.data.color === 'green', JSON.stringify(edited));
    check('edit cannot change type', edited.data.type === 'regular');
    check('participant cannot edit -> 403', (await call('PATCH', `/api/goals/${shared.id}`, { launchParams: bob, body: { title: 'hack' } })).status === 403);
    check('edit validation -> 400', (await call('PATCH', `/api/goals/${shared.id}`, { launchParams: alice, body: { title: '' } })).status === 400);

    const utcToday = new Date().toISOString().slice(0, 10);
    const shift = (days) => new Date(Date.parse(`${utcToday}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10);
    check('mark yesterday allowed', (await call('PUT', `/api/goals/${shared.id}/entries`, { launchParams: alice, body: { date: shift(-1), status: 'done' } })).status === 200);
    const old = await call('PUT', `/api/goals/${shared.id}/entries`, { launchParams: alice, body: { date: shift(-5), status: 'done' } });
    check('mark 5 days ago rejected', old.status === 400 && /вчера/.test(old.data.error), JSON.stringify(old));
    check('mark future rejected', (await call('PUT', `/api/goals/${shared.id}/entries`, { launchParams: alice, body: { date: shift(3), status: 'done' } })).status === 400);

    const qty3 = (await call('POST', '/api/goals', { launchParams: alice, body: { title: 'Км', type: 'quantity', target: 50, unit: 'км', privacy: 'private' } })).data;
    await call('POST', `/api/goals/${qty3.id}/entries`, { launchParams: alice, body: { date: utcToday, value: 4 } });
    const reset = await call('DELETE', `/api/goals/${qty3.id}/entries/${utcToday}`, { launchParams: alice });
    check('reset day clears value', reset.status === 200 && !reset.data.entries[utcToday], JSON.stringify(reset.data?.entries));
    check('reset day outside window rejected', (await call('DELETE', `/api/goals/${qty3.id}/entries/${shift(-9)}`, { launchParams: alice })).status === 400);

    const migrated = (await call('POST', '/api/goals', { launchParams: alice, body: {
      title: 'Старая', type: 'regular', privacy: 'private', createdAt: '2026-09-01',
      entries: { '2026-09-02': { status: 'done' }, '2026-09-03': { status: 'skipped' }, [shift(5)]: { status: 'done' } },
    } })).data;
    check('migration keeps original createdAt', migrated.createdAt === '2026-09-01', migrated.createdAt);
    check('migration keeps history', migrated.entries['2026-09-02']?.status === 'done' && migrated.entries['2026-09-03']?.status === 'skipped');
    check('migration drops future entries', !migrated.entries[shift(5)]);
    const future = (await call('POST', '/api/goals', { launchParams: alice, body: { title: 'F', type: 'regular', createdAt: shift(10) } })).data;
    check('future createdAt ignored', future.createdAt <= shift(1), future.createdAt);

    // --- owner leaves with transfer: the goal passes to the earliest-joined participant ---
    const carol = launch(303);
    const passOn = (await call('POST', '/api/goals', { launchParams: alice, body: { title: 'Передать', type: 'regular', privacy: 'group' } })).data;
    await call('POST', `/api/goals/${passOn.id}/join`, { launchParams: bob, name: 'Боб' });
    await new Promise((resolve) => setTimeout(resolve, 5));
    await call('POST', `/api/goals/${passOn.id}/join`, { launchParams: carol, name: 'Кэрол' });
    await call('PUT', `/api/goals/${passOn.id}/entries`, { launchParams: bob, body: { date: utcToday, status: 'done' } });
    const transferred = await call('DELETE', `/api/goals/${passOn.id}?transfer=1`, { launchParams: alice });
    check('transfer: owner leaves, goal kept', transferred.status === 200 && transferred.data.ownerDeleted === false && transferred.data.newOwner?.userId === '202', JSON.stringify(transferred.data));
    const afterTransfer = (await call('GET', `/api/goals/${passOn.id}`, { launchParams: bob })).data;
    check('transfer: bob is the new owner and keeps progress', afterTransfer.ownerId === '202' && afterTransfer.entries[utcToday]?.status === 'done');
    check('transfer: alice is no longer a participant', !afterTransfer.participants.some((p) => p.userId === '101') && afterTransfer.participants.length === 2);
    check('transfer: new owner can edit', (await call('PATCH', `/api/goals/${passOn.id}`, { launchParams: bob, body: { title: 'Передано' } })).status === 200);
    const solo = (await call('POST', '/api/goals', { launchParams: alice, body: { title: 'Одна', type: 'regular', privacy: 'group' } })).data;
    const soloDelete = await call('DELETE', `/api/goals/${solo.id}?transfer=1`, { launchParams: alice });
    check('transfer with nobody else deletes the goal', soloDelete.data.ownerDeleted === true);

    // --- «Удалить мои данные» ---
    const dave = launch(404);
    const daveShared = (await call('POST', '/api/goals', { launchParams: dave, body: { title: 'Дэйв и Боб', type: 'regular', privacy: 'group' } })).data;
    await call('POST', `/api/goals/${daveShared.id}/join`, { launchParams: bob, name: 'Боб' });
    await call('POST', '/api/goals', { launchParams: dave, body: { title: 'Личная Дэйва', type: 'regular', privacy: 'private' } });
    await call('POST', `/api/goals/${daveShared.id}/cheers`, { launchParams: bob, body: { to: '404' } });
    await call('PUT', '/api/settings', { launchParams: dave, body: { notifications: true, tzOffset: 180 } });
    check('delete my data -> 200', (await call('DELETE', '/api/me', { launchParams: dave })).status === 200);
    check('delete my data: no goals left for the user', (await call('GET', '/api/goals', { launchParams: dave })).data.length === 0);
    const bobKeeps = (await call('GET', `/api/goals/${daveShared.id}`, { launchParams: bob })).data;
    check('delete my data: shared goal passes to the friend', bobKeeps.ownerId === '202' && bobKeeps.participants.length === 1, JSON.stringify(bobKeeps?.participants));
    check('delete my data: settings reset', (await call('GET', '/api/settings', { launchParams: dave })).data.notifications === false);
  } catch (error) {
    failures += 1;
    console.error('ERROR', error);
  } finally {
    server.kill();
    if (serverLog.trim()) console.log('--- server log ---\n' + serverLog.trim());
    console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED');
    process.exit(failures ? 1 : 0);
  }
})();
