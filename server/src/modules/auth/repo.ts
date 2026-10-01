import { db } from '../../db/index.js';
import { newId } from '../../shared/ids.js';

export interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  display_name: string;
  plan: string;
  status: string;
  created_at: number;
}

export interface PublicUser {
  id: string;
  email: string;
  displayName: string;
  plan: string;
}

export function toPublicUser(row: UserRow): PublicUser {
  return { id: row.id, email: row.email, displayName: row.display_name, plan: row.plan };
}

export function createUser(input: { email: string; passwordHash: string; displayName: string }): UserRow {
  const id = newId();
  db.prepare(
    `INSERT INTO users (id, email, password_hash, display_name, created_at) VALUES (?, ?, ?, ?, ?)`,
  ).run(id, input.email, input.passwordHash, input.displayName, Date.now());
  return findById(id)!;
}

export function findByEmail(email: string): UserRow | undefined {
  return db.prepare(`SELECT * FROM users WHERE email = ?`).get(email) as UserRow | undefined;
}

export function findById(id: string): UserRow | undefined {
  return db.prepare(`SELECT * FROM users WHERE id = ?`).get(id) as UserRow | undefined;
}
