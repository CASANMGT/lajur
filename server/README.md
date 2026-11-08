# Lajur shared backend (reference)

`server/server.mjs` is a small Node-only API for shared authentication, RBAC and
revisioned transactions. It is **not** wired into the static Vercel demo; the
browser demo keeps its local PIN/session by design. Run it where a persistent
process and disk are available (VM, Render, Railway, Fly, on-prem).

```bash
npm run server
# http://127.0.0.1:8790
```

Default accounts: `u-mgr` / `2468`, `u-op` / `1357`, `u-sales` / `8642`.
Change these before any real use.

## What is enforced

- PIN hashes with scrypt + per-user salt, stored in `server/data/auth.json`.
- HttpOnly `SameSite=Lax` session cookie, 8 hours.
- RBAC per action (`manager`, `operator`, `sales`).
- Shared dataset in `server/data/state.json`, atomic writes (`tmp` + rename).
- Optimistic revision: every action returns a new revision; full-state writes
  require `baseRevision` and manager role.
- Domain invariants run server-side through the same `src/domain` modules.
- Actions: task create/start/complete, production cut/sew/QC, transfer receive,
  sales order create/confirm/convert, invoice post.

## API

| Method | Path | Role | Purpose |
|---|---|---|---|
| POST | `/api/login` | — | `{ userId, pin }` → session cookie |
| POST | `/api/logout` | auth | clear cookie |
| GET | `/api/me` | auth | current user |
| GET | `/api/state` | auth | `{ revision, data }` |
| PUT | `/api/state` | manager | `{ baseRevision, data }` full replacement |
| POST | `/api/actions/:action` | per RBAC | transactional domain action |
| GET | `/api/health` | — | revision/health |

## Production gaps

- Single process / single writer. For multi-instance use, replace the JSON file
  with PostgreSQL and row locks or serializable transactions.
- Add CSRF protection, rate limiting, TLS termination, secrets management,
  audit export, backups, and per-warehouse query scoping.
- Object storage is still not implemented; uploads need S3/R2 plus virus scan.
- The browser UI is not yet switched to this API. A production client should
  call `/api/actions/*` instead of mutating local state.
