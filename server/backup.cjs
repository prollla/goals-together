// Periodic online backups of the SQLite database (safe while the server is running).
const fs = require('node:fs');
const path = require('node:path');

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Writes goals-YYYY-MM-DD-HH-MM-SS.db into `dir` on start and then every `intervalMs`, keeping the newest `keep` files.
 * Does nothing when `dir` is empty, so backups are opt-in via BACKUP_DIR.
 */
const startBackups = (database, { dir, keep = 14, intervalMs = DAY_MS } = {}) => {
  if (!dir) return null;
  fs.mkdirSync(dir, { recursive: true });

  const run = async () => {
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    const target = path.join(dir, `goals-${stamp}.db`);
    await database.backup(target);
    const files = fs.readdirSync(dir).filter((name) => /^goals-.*\.db$/.test(name)).sort();
    files.slice(0, Math.max(0, files.length - keep)).forEach((name) => fs.unlinkSync(path.join(dir, name)));
    console.log(`Backup written: ${target}`);
  };

  const safeRun = () => run().catch((error) => console.error('Backup failed', error));
  safeRun();
  const timer = setInterval(safeRun, intervalMs);
  timer.unref();
  return timer;
};

module.exports = { startBackups };
