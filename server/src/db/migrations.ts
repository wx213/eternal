/**
 * 版本化迁移
 *
 * 用 PRAGMA user_version 追踪，只能往数组末尾追加，不要修改已发布的条目。
 * 兼容旧库：第一条迁移全部使用 IF NOT EXISTS，旧数据可原地升级。
 */
export interface Migration {
  name: string;
  up: string;
}

export const MIGRATIONS: Migration[] = [
  {
    name: 'init',
    up: `
      CREATE TABLE IF NOT EXISTS users (
        id            TEXT PRIMARY KEY,
        email         TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        display_name  TEXT NOT NULL,
        plan          TEXT NOT NULL DEFAULT 'free',
        status        TEXT NOT NULL DEFAULT 'active',
        created_at    INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS agents (
        id               TEXT PRIMARY KEY,
        owner_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name             TEXT NOT NULL,
        avatar_url       TEXT,
        description      TEXT NOT NULL DEFAULT '',
        type             TEXT NOT NULL DEFAULT 'functional',
        model            TEXT,
        temperature      REAL NOT NULL DEFAULT 0.7,
        context_strategy TEXT NOT NULL DEFAULT 'trim',
        system_prompt    TEXT NOT NULL DEFAULT '',
        persona_profile  TEXT,
        tools            TEXT NOT NULL DEFAULT '[]',
        skills           TEXT NOT NULL DEFAULT '[]',
        status           TEXT NOT NULL DEFAULT 'active',
        created_at       INTEGER NOT NULL,
        updated_at       INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_agents_owner ON agents(owner_id, status);

      CREATE TABLE IF NOT EXISTS corpora (
        id          TEXT PRIMARY KEY,
        agent_id    TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
        source_type TEXT NOT NULL,
        filename    TEXT,
        content     TEXT NOT NULL,
        created_at  INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_corpora_agent ON corpora(agent_id);

      CREATE TABLE IF NOT EXISTS conversations (
        id              TEXT PRIMARY KEY,
        owner_id        TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        agent_id        TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
        title           TEXT NOT NULL DEFAULT '',
        pinned          INTEGER NOT NULL DEFAULT 0,
        last_message    TEXT NOT NULL DEFAULT '',
        last_message_at INTEGER,
        created_at      INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_conv_owner ON conversations(owner_id);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_conv_owner_agent ON conversations(owner_id, agent_id);

      CREATE TABLE IF NOT EXISTS messages (
        id              TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
        role            TEXT NOT NULL,
        content         TEXT NOT NULL,
        trace           TEXT NOT NULL DEFAULT '[]',
        created_at      INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_msg_conv ON messages(conversation_id, created_at);
    `,
  },
  {
    name: 'knowledge_tables',
    up: `
      CREATE TABLE IF NOT EXISTS kb_documents (
        id          TEXT PRIMARY KEY,
        agent_id    TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
        owner_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        filename    TEXT NOT NULL,
        status      TEXT NOT NULL DEFAULT 'ready',
        error       TEXT,
        chunk_count INTEGER NOT NULL DEFAULT 0,
        created_at  INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_kbdoc_agent ON kb_documents(agent_id);

      CREATE TABLE IF NOT EXISTS kb_chunks (
        id         TEXT PRIMARY KEY,
        doc_id     TEXT NOT NULL REFERENCES kb_documents(id) ON DELETE CASCADE,
        agent_id   TEXT NOT NULL,
        seq        INTEGER NOT NULL,
        content    TEXT NOT NULL,
        source     TEXT NOT NULL,
        dim        INTEGER NOT NULL,
        embedding  BLOB NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_kbchunk_agent ON kb_chunks(agent_id);
    `,
  },
];
