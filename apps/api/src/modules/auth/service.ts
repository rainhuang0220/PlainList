import bcrypt from 'bcryptjs';
import type { AuthAccount, AuthSuccessResponse, AuthenticatedUser } from '@plainlist/shared';
import { loginSchema, registerSchema } from '@plainlist/shared';
import { pool } from '../../db/pool';
import { signToken } from '../../middleware/auth';
import { seedDefaultAiSettings } from '../ai-intake/settings';

const SALT_ROUNDS = 10;

function serviceError(status: number, message: string): Error & { status: number } {
  return Object.assign(new Error(message), { status });
}

function toAuthenticatedUser(row: { id: number; username: string; is_admin: number }): AuthenticatedUser {
  return {
    id: row.id,
    username: row.username,
    isAdmin: Boolean(row.is_admin),
  };
}

export async function registerUser(payload: unknown): Promise<AuthSuccessResponse> {
  const input = registerSchema.parse(payload);
  const [existing] = await pool.query('SELECT id FROM users WHERE username = ?', [input.username]);

  if (Array.isArray(existing) && existing.length > 0) {
    throw serviceError(409, 'name already taken');
  }

  const passwordHash = await bcrypt.hash(input.password, SALT_ROUNDS);
  const [result] = await pool.query('INSERT INTO users (username, password) VALUES (?, ?)', [input.username, passwordHash]);
  const user = {
    id: Number((result as { insertId: number }).insertId),
    username: input.username,
    isAdmin: false,
  };

  // 服务端配置了 AI_USER_DEFAULT_API_KEY 时，自动预置到该用户的 user_settings。
  // 失败不影响注册（AI 仍可走服务端 .env 兜底）。
  try {
    await seedDefaultAiSettings(user.id);
  } catch (error) {
    console.warn('[auth] failed to seed default AI settings for new user:', error);
  }

  return {
    token: signToken(user),
    username: user.username,
    isAdmin: user.isAdmin,
  };
}

export async function loginUser(payload: unknown): Promise<AuthSuccessResponse> {
  const input = loginSchema.parse(payload);
  const [rows] = await pool.query('SELECT id, username, password, is_admin FROM users WHERE username = ?', [input.username]);

  if (!Array.isArray(rows) || rows.length === 0) {
    throw serviceError(401, 'account not found');
  }

  const user = rows[0] as { id: number; username: string; password: string; is_admin: number };
  const valid = await bcrypt.compare(input.password, user.password);
  if (!valid) {
    throw serviceError(401, 'incorrect passphrase');
  }

  const authenticatedUser = toAuthenticatedUser(user);
  return {
    token: signToken(authenticatedUser),
    username: authenticatedUser.username,
    isAdmin: authenticatedUser.isAdmin,
  };
}

export async function listAccounts(): Promise<AuthAccount[]> {
  const [rows] = await pool.query('SELECT username, is_admin FROM users ORDER BY created_at');

  if (!Array.isArray(rows)) {
    return [];
  }

  return rows.map((row) => ({
    username: String((row as { username: string }).username),
    isAdmin: Boolean((row as { is_admin: number }).is_admin),
  }));
}
