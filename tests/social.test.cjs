// Cheers, verified VK profiles, reminders and backups — against a fake VK API (run: npm run test:social).
const http = require('node:http');
const { spawn } = require('node:child_process');
const crypto = require('node:crypto');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');

const repo = path.join(__dirname, '..');
const SECRET = 'test-secret-for-local-run';
const PORT = 3912;
const VK_PORT = 3913;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'goals-social-'));
const backupDir = path.join(tmp, 'backups');

// --- Fake VK API: records every call and answers users.get / notifications.sendMessage. ---
const vkCalls = [];
const vkNames = { 101: 'Алиса', 202: 'Борис', 303: 'Вера' };
const fakeVk = http.createServer(async (request, response) => {
  let body = '';
  for await (const chunk of request) body += chunk;
  const params = Object.fromEntries(new URLSearchParams(body));
  const method = request.url.split('/').pop();
  vkCalls.push({ method, params });
  let result = 1;
  if (method === 'users.get') {
    result = params.user_ids.split(',').map((id) => ({ id: Number(id), first_name: vkNames[id] || 'Гость', photo_200: `https://sun1-1.userapi.com/${id}.jpg` }));
  }
  response.writeHead(200, { 'Content-Type': 'application/json' });
  response.end(JSON.stringify({ response: result }));
});

const sign = (params) => {
  const query = Object.keys(params).filter((k) => k.startsWith('vk_')).sort()
    .map((k) => `${k}=${encodeURIComponent(params[k])}`).join('&');
  return crypto.createHmac('sha256', SECRET).update(query).digest('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const launch = (userId) => {
  const params = { vk_app_id: '54897335', vk_user_id: String(userId), vk_ts: String(Math.floor(Date.now() / 1000)), vk_platform: 'mobile_web' };
  return `?${new URLSearchParams({ ...params, sign: sign(params) })}`;
};

let failures = 0;
const check = (name, condition, detail = '') => {
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${name}${condition ? '' : `  -> ${detail}`}`);
  if (!condition) failures += 1;
};
const call = async (method, url, launchParams, body, headers = {}) => {
  const response = await fetch(`http://127.0.0.1:${PORT}${url}`, {
    method,
    headers: { 'Content-Type': 'application/json', 'X-VK-Launch-Params': launchParams, ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: response.status, data: await response.json().catch(() => null) };
};
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const waitFor = async (predicate, timeoutMs = 3000) => {
  for (let elapsed = 0; elapsed < timeoutMs; elapsed += 100) {
    if (predicate()) return true;
    await wait(100);
  }
  return predicate();
};
// UTC offset (minutes) at which the local time is currently 21:xx, within the allowed −12h…+14h range.
const offsetForLocalHour = (hour) => {
  let hours = (hour - new Date().getUTCHours() + 24) % 24;
  if (hours > 14) hours -= 24;
  return hours * 60;
};

(async () => {
  await new Promise((resolve) => fakeVk.listen(VK_PORT, '127.0.0.1', resolve));
  const server = spawn(process.execPath, [path.join(repo, 'server', 'index.cjs')], {
    env: {
      ...process.env, NODE_ENV: 'production', VK_APP_SECRET: SECRET, PORT: String(PORT), DATABASE_PATH: path.join(tmp, 'goals.db'),
      VK_SERVICE_KEY: 'test-service-key', VK_API_URL: `http://127.0.0.1:${VK_PORT}/method`, REMINDER_INTERVAL_MS: '300',
      BACKUP_DIR: backupDir, BACKUP_KEEP: '3',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = '';
  server.stdout.on('data', (d) => { log += d; });
  server.stderr.on('data', (d) => { log += d; });
  for (let i = 0; i < 50; i += 1) {
    try { if ((await fetch(`http://127.0.0.1:${PORT}/api/health`)).ok) break; } catch { /* starting */ }
    await wait(100);
  }

  try {
    const alice = launch(101);
    const bob = launch(202);
    const vera = launch(303);

    // Backups
    check('backup written on start', await waitFor(() => fs.existsSync(backupDir) && fs.readdirSync(backupDir).some((f) => f.endsWith('.db'))));

    // Verified profiles: header names are ignored, VK names are used
    const goal = (await call('POST', '/api/goals', alice, { title: 'Бегать', type: 'regular', privacy: 'group', createdAt: '2026-01-01' }, { 'X-User-Name': encodeURIComponent('Поддельное имя') })).data;
    check('users.get called for the creator', await waitFor(() => vkCalls.some((c) => c.method === 'users.get' && c.params.user_ids === '101')));
    check('service key sent to VK', vkCalls.some((c) => c.params.access_token === 'test-service-key'));
    await call('POST', `/api/goals/${goal.id}/join`, bob, null, { 'X-User-Name': encodeURIComponent('Хакер') });
    await waitFor(() => vkCalls.some((c) => c.method === 'users.get' && c.params.user_ids === '202'));
    await wait(200);
    const view = (await call('GET', `/api/goals/${goal.id}`, alice)).data;
    const names = view.participants.map((p) => p.firstName).sort();
    check('participant names come from VK, not headers', JSON.stringify(names) === JSON.stringify(['Алиса', 'Борис']), JSON.stringify(names));
    check('avatar comes from VK', view.participants.find((p) => p.userId === '101').photoUrl === 'https://sun1-1.userapi.com/101.jpg');

    // Settings
    const settings0 = (await call('GET', '/api/settings', alice)).data;
    check('settings: reminders available with service key', settings0.available === true && settings0.notifications === false, JSON.stringify(settings0));
    check('settings: invalid offset rejected', (await call('PUT', '/api/settings', alice, { notifications: true, tzOffset: 5000 })).status === 400);
    const offset = offsetForLocalHour(21);

    // Cheers (alice turns notifications on first, so the cheer notifies her)
    await call('PUT', '/api/settings', alice, { notifications: true, tzOffset: offset });
    const cheered = await call('POST', `/api/goals/${goal.id}/cheers`, bob, { to: '101' });
    const aliceForBob = cheered.data.participants.find((p) => p.userId === '101');
    check('cheer recorded', cheered.status === 200 && aliceForBob.cheers.recent === 1 && aliceForBob.cheers.byMe === true, JSON.stringify(aliceForBob?.cheers));
    const again = await call('POST', `/api/goals/${goal.id}/cheers`, bob, { to: '101' });
    check('repeat cheer within cooldown is not counted', again.data.participants.find((p) => p.userId === '101').cheers.total === 1);
    check('cannot cheer yourself', (await call('POST', `/api/goals/${goal.id}/cheers`, bob, { to: '202' })).status === 400);
    check('non-participant cannot cheer', (await call('POST', `/api/goals/${goal.id}/cheers`, vera, { to: '101' })).status === 404);
    check('cheer target must be a participant', (await call('POST', `/api/goals/${goal.id}/cheers`, bob, { to: '999' })).status === 404);
    const aliceView = (await call('GET', `/api/goals/${goal.id}`, alice)).data.participants.find((p) => p.userId === '101');
    check('alice sees she was cheered (not by herself)', aliceView.cheers.recent === 1 && aliceView.cheers.byMe === false);
    check('cheer notification sent to alice', await waitFor(() => vkCalls.some((c) => c.method === 'notifications.sendMessage'
      && c.params.user_ids === '101' && /Борис поддерживает вас/.test(c.params.message) && c.params.fragment === `/goal/${goal.id}`)));
    const bobCheersAlice = vkCalls.filter((c) => c.method === 'notifications.sendMessage' && /поддерживает/.test(c.params.message)).length;
    check('no second notification for the repeated cheer', bobCheersAlice === 1, String(bobCheersAlice));

    // Reminders: alice (21:00 local, goal unmarked) gets one; bob (marked today) gets none
    await call('PUT', '/api/settings', bob, { notifications: true, tzOffset: offset });
    const bobToday = new Date(Date.now() + offset * 60000).toISOString().slice(0, 10);
    await call('PUT', `/api/goals/${goal.id}/entries`, bob, { date: bobToday, status: 'done' });
    check('reminder sent to alice', await waitFor(() => vkCalls.some((c) => c.method === 'notifications.sendMessage'
      && c.params.user_ids === '101' && /1 цель ждёт отметки/.test(c.params.message)), 4000));
    await wait(1000);
    const reminders = vkCalls.filter((c) => c.method === 'notifications.sendMessage' && /ждёт|ждут/.test(c.params.message));
    check('only one reminder per day', reminders.filter((c) => c.params.user_ids === '101').length === 1, String(reminders.length));
    check('no reminder when everything is marked', !reminders.some((c) => c.params.user_ids === '202'));

    // Leaving removes the leaver's cheers
    await call('DELETE', `/api/goals/${goal.id}`, bob);
    const afterLeave = (await call('GET', `/api/goals/${goal.id}`, alice)).data.participants.find((p) => p.userId === '101');
    check("leaving removes the leaver's cheers", afterLeave.cheers.total === 0);
  } catch (error) {
    failures += 1;
    console.error('ERROR', error);
  } finally {
    server.kill();
    fakeVk.close();
    if (failures && log.trim()) console.log(`--- server log ---\n${log.trim()}`);
    console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED');
    process.exit(failures ? 1 : 0);
  }
})();
