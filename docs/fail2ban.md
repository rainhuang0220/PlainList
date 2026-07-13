# Fail2ban (optional, for production)

PlainList does not embed fail2ban — it writes a **structured auth audit log** that fail2ban on the host can watch and ban abusive IPs.

## What gets logged?

File: `logs/auth-audit.log` (repo root by default)

```text
2026-07-03T12:00:00.000Z plainlist-auth login-fail ip=203.0.113.5 user=admin reason=incorrect_passphrase
2026-07-03T12:00:05.000Z plainlist-auth login-ok ip=203.0.113.5 user=admin
```

Only **`login-fail`** lines trigger bans. Successful logins are recorded for audit only.

Disable logging locally:

```bash
AUDIT_LOG_ENABLED=false
```

Custom path:

```bash
AUDIT_LOG_PATH=/var/log/plainlist/auth-audit.log
```

## Behind Nginx?

Set in `apps/api/.env`:

```bash
TRUST_PROXY=true
```

So `ip=` reflects the real client (`X-Forwarded-For`), not the reverse proxy.

## Install fail2ban (Linux server)

```bash
# Debian/Ubuntu
sudo apt install fail2ban

# Copy filter
sudo cp deploy/fail2ban/filter.d/plainlist-auth.conf /etc/fail2ban/filter.d/

# Copy and edit jail (set absolute logpath!)
sudo cp deploy/fail2ban/jail.d/plainlist-auth.local.example /etc/fail2ban/jail.d/plainlist-auth.local
sudo nano /etc/fail2ban/jail.d/plainlist-auth.local

sudo fail2ban-client reload
sudo fail2ban-client status plainlist-auth
```

### Suggested thresholds

| Setting | Default | Meaning |
|---------|---------|---------|
| `maxretry` | 5 | failures before ban |
| `findtime` | 10m | window for counting failures |
| `bantime` | 1h | how long IP stays banned |

Tune for your threat model. Stricter: `maxretry=3`, `bantime=24h`.

## macOS / local dev

fail2ban is optional and usually not installed on macOS. The audit log still works — you can `tail -f logs/auth-audit.log` while testing.

## How it fits the stack

```text
Client → Nginx → PlainList API
                      ↓
              logs/auth-audit.log
                      ↓
                 fail2ban (host)
                      ↓
              iptables / nftables ban
```

This is **defense in depth** alongside strong passwords and HTTPS — not a substitute for rate limiting at the edge if you expect heavy traffic.

## Verify filter

```bash
sudo fail2ban-regex logs/auth-audit.log deploy/fail2ban/filter.d/plainlist-auth.conf
```

You should see matched `login-fail` lines with captured IPs.
