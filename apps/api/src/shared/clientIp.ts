import type { Request } from 'express';

/** Best-effort client IP for audit logs and fail2ban (honors X-Forwarded-For when trust proxy is on). */
export function getClientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim()) {
    return forwarded.split(',')[0]?.trim() || req.ip || 'unknown';
  }

  if (Array.isArray(forwarded) && forwarded[0]) {
    return forwarded[0].split(',')[0]?.trim() || req.ip || 'unknown';
  }

  return req.ip || req.socket.remoteAddress || 'unknown';
}
