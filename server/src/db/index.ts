/**
 * SQLite 连接与迁移
 *
 * 所有 SQL 一律使用参数绑定（better-sqlite3 的 prepare + run/get/all），杜绝注入。
 */
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { env } from '../config/env.js';
import { createLogger } from '../shared/logger.js';
import { MIGRATIONS } from './migrations.js';

const log = createLogger('db');

fs.mkdirSync(path.dirname(env.paths.dbFile), { recursive: true });

export const db = new Database(env.paths.dbFile);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('busy_timeout = 5000');
db.pragma('synchronous = NORMAL');

function runMigrations(): void {
  const current = db.pragma('user_version', { simple: true }) as number;

  if (current >= MIGRATIONS.length) {
    log.info('数据库已是最新', { version: current });
    return;
  }

  for (let version = current; version < MIGRATIONS.length; version += 1) {
    const migration = MIGRATIONS[version]!;
    const apply = db.transaction(() => {
      db.exec(migration.up);
      db.pragma(`user_version = ${version + 1}`);
    });
    apply();
    log.info('已应用迁移', { version: version + 1, name: migration.name });
  }
}

runMigrations();

export function closeDb(): void {
  try {
    db.close();
  } catch {
    // 关闭失败不影响进程退出
  }
}
