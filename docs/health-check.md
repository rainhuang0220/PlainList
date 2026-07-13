# Health Check

## Endpoint

```
GET /api/health
```

**Response (200):**

```json
{ "ok": true }
```

Implemented in `apps/api/src/app.ts`.

## What It Is For

A **liveness probe** — answers: "Is the Node/Express process up and accepting HTTP?"

Common uses:

| Consumer | Purpose |
|----------|---------|
| Human / script | `curl http://localhost:3000/api/health` after `npm run dev:api` |
| Docker | `HEALTHCHECK CMD curl -f http://localhost:3000/api/health` |
| Kubernetes | `livenessProbe.httpGet.path: /api/health` |
| Reverse proxy | Upstream health before routing traffic |

## What It Does NOT Check

- MySQL connectivity
- AI provider reachability
- Widget subprocess status

Those would be **readiness** checks (`/api/health/ready`) — not implemented yet but easy to add:

```typescript
app.get('/api/health/ready', async (_req, res) => {
  await pool.query('SELECT 1');
  res.json({ ok: true, db: true });
});
```

## vs PlainList-original

The original project had no dedicated health route. You had to hit `/api/auth/me` or another authenticated endpoint to guess if the server was alive.
