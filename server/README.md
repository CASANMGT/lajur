# Lajur shared backend (reference)

`server/server.mjs` is a small Node-only API for shared authentication, RBAC and
revisioned transactions. It is **not** wired into the static Vercel demo; the
browser demo keeps its local PIN/session by design. Run it where a persistent
process and disk are available (VM, Render, Railway, Fly, on-prem).

```bash
npm install
npm run server
# http://127.0.0.1:8790
```

Default accounts: `u-mgr` / `2468`, `u-op` / `1357`, `u-sales` / `8642`, plus driver
accounts `u-drv1` / `1212`, `u-drv2` / `2323`, `u-drv3` / `3434`.
Change these before any real use.

## PostgreSQL (optional)

```bash
psql "$DATABASE_URL" -f db/schema.sql
DATABASE_URL=postgres://user:pass@host:5432/lajur npm run server
```

With `DATABASE_URL` set, the server uses `server/pg-store.mjs`: the versioned
domain document lives in `lajur_state.data` (JSONB), writes run in an ACID
transaction with an optimistic revision guard, and audit/users/sessions/
idempotency live in dedicated tables. Without it, the server keeps
`server/data/state.json`. `GET /api/health` reports `storage: "postgres"` or
`storage: "json"`.

## What is enforced

- PIN hashes with scrypt + per-user salt, stored in `server/data/auth.json`.
- HttpOnly `SameSite=Lax` session cookie, 8 hours.
- RBAC per action (`manager`, `operator`, `sales`, `driver`).
- Shared dataset in PostgreSQL JSONB when `DATABASE_URL` is set, otherwise in
  `server/data/state.json` with atomic writes (`tmp` + rename).
- Optimistic revision: every action returns a new revision; full-state writes
  require `baseRevision` and manager role. PostgreSQL rejects a stale
  `revision` inside the transaction (`REVISION_CONFLICT`).
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
| GET | `/api/health` | — | revision/health + active storage |

## Production gaps

- The PostgreSQL path stores the whole domain document in JSONB. Move rolls,
  reservations, ledger and posted documents to row-level tables with row locks
  or serializable transactions before multi-instance production use.
- Auth users/sessions are still JSON-backed even when `DATABASE_URL` is set;
  the `lajur_users`/`lajur_sessions` tables exist but the auth path is not yet
  migrated.
- Add CSRF protection, rate limiting, TLS termination, secrets management,
  audit export, backups, and per-warehouse query scoping.
- Object storage is still not implemented; uploads need S3/R2 plus virus scan.
- The browser UI is not yet switched to this API. A production client should
  call `/api/actions/*` instead of mutating local state.
