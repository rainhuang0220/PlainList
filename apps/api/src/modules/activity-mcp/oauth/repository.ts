import type { PoolConnection, RowDataPacket } from 'mysql2/promise';
import { pool } from '../../../db/pool';
import type { AuthorizationCodeRecord, OAuthGrantRepository } from './service';

interface GrantRow extends RowDataPacket {
  user_id: number;
  username: string;
  is_admin: number;
  client_id: string;
  redirect_uri: string;
  scopes: string;
  resource: string;
  authorization_code_hash: string;
  code_challenge: string;
  code_challenge_method: 'S256';
  code_expires_at: Date | string;
  code_used_at: Date | string | null;
  access_token_hash: string | null;
  access_token_expires_at: Date | string | null;
  revoked_at: Date | string | null;
}

function asDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value.endsWith('Z') ? value : `${value.replace(' ', 'T')}Z`);
}

function mapGrant(row: GrantRow): AuthorizationCodeRecord {
  return {
    userId: row.user_id,
    username: row.username,
    isAdmin: Boolean(row.is_admin),
    clientId: row.client_id,
    redirectUri: row.redirect_uri,
    scopes: row.scopes.split(/\s+/).filter(Boolean),
    resource: row.resource,
    authorizationCodeHash: row.authorization_code_hash,
    codeChallenge: row.code_challenge,
    codeChallengeMethod: row.code_challenge_method,
    codeExpiresAt: asDate(row.code_expires_at),
    codeUsedAt: row.code_used_at ? asDate(row.code_used_at) : null,
    accessTokenHash: row.access_token_hash,
    accessTokenExpiresAt: row.access_token_expires_at ? asDate(row.access_token_expires_at) : null,
    revokedAt: row.revoked_at ? asDate(row.revoked_at) : null,
  };
}

const selectGrant = `SELECT g.user_id, u.username, u.is_admin, g.client_id, g.redirect_uri, g.scopes, g.resource,
  g.authorization_code_hash, g.code_challenge, g.code_challenge_method, g.code_expires_at, g.code_used_at,
  g.access_token_hash, g.access_token_expires_at, g.revoked_at
  FROM activity_mcp_oauth_grants g JOIN users u ON u.id = g.user_id`;

async function rollbackQuietly(connection: PoolConnection): Promise<void> {
  try { await connection.rollback(); } catch { /* preserve the original error */ }
}

export class MysqlOAuthGrantRepository implements OAuthGrantRepository {
  async createAuthorizationCode(record: AuthorizationCodeRecord): Promise<void> {
    await pool.query(
      `INSERT INTO activity_mcp_oauth_grants
       (user_id, client_id, redirect_uri, scopes, resource, authorization_code_hash, code_challenge,
        code_challenge_method, code_expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'S256', ?)`,
      [record.userId, record.clientId, record.redirectUri, record.scopes.join(' '), record.resource,
        record.authorizationCodeHash, record.codeChallenge, record.codeExpiresAt],
    );
  }

  async consumeAuthorizationCode(
    codeHash: string,
    consume: (record: AuthorizationCodeRecord) => { accessTokenHash: string; accessTokenExpiresAt: Date },
  ): Promise<AuthorizationCodeRecord | null> {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      const [rows] = await connection.query<GrantRow[]>(`${selectGrant} WHERE g.authorization_code_hash = ? FOR UPDATE`, [codeHash]);
      if (!rows.length) {
        await connection.rollback();
        return null;
      }
      const record = mapGrant(rows[0]);
      const token = consume(record);
      await connection.query(
        `UPDATE activity_mcp_oauth_grants SET code_used_at = CURRENT_TIMESTAMP(3), access_token_hash = ?,
         access_token_expires_at = ? WHERE authorization_code_hash = ? AND code_used_at IS NULL`,
        [token.accessTokenHash, token.accessTokenExpiresAt, codeHash],
      );
      await connection.commit();
      return record;
    } catch (error) {
      await rollbackQuietly(connection);
      throw error;
    } finally {
      connection.release();
    }
  }

  async findAccessToken(tokenHash: string): Promise<AuthorizationCodeRecord | null> {
    const [rows] = await pool.query<GrantRow[]>(`${selectGrant} WHERE g.access_token_hash = ? LIMIT 1`, [tokenHash]);
    return rows.length ? mapGrant(rows[0]) : null;
  }

  async revokeAccessToken(tokenHash: string): Promise<boolean> {
    const [result] = await pool.query(
      `UPDATE activity_mcp_oauth_grants SET revoked_at = CURRENT_TIMESTAMP(3)
       WHERE access_token_hash = ? AND revoked_at IS NULL`, [tokenHash],
    );
    return Number((result as { affectedRows: number }).affectedRows) > 0;
  }
}
