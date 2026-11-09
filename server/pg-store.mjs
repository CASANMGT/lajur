/**
 * PostgreSQL-backed state store for the reference API.
 *
 * `DATABASE_URL` makes the server use this store. The whole versioned domain
 * document is stored in JSONB with an optimistic revision guard and ACID
 * updates; audit rows, users, sessions and idempotency live in dedicated tables
 * (see db/schema.sql). The JSON-file store remains the zero-setup demo fallback.
 */

export async function createPgStateStore(connectionString, { ssl = false } = {}) {
  let pg;
  try {
    pg = await import('pg');
  } catch {
    throw new Error('PostgreSQL driver "pg" is not installed. Run: npm install pg');
  }
  const Pool = pg.Pool ?? pg.default?.Pool;
  if (!Pool) throw new Error('PostgreSQL Pool tidak tersedia.');
  const pool = new Pool({
    connectionString,
    max: Number(process.env.PG_POOL_MAX ?? 10),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    ssl: ssl ? { rejectUnauthorized: false } : undefined,
  });
  await pool.query('SELECT 1');

  return {
    kind: 'postgres',
    async load(seedFactory) {
      const result = await pool.query('SELECT revision, data FROM lajur_state WHERE id = 1');
      const row = result.rows[0];
      if (!row || !row.data || Object.keys(row.data).length === 0) {
        const data = seedFactory();
        const state = { revision: 1, data };
        await this.save(state, { action: 'seed', payload: { dataset: data.meta?.dataset ?? 'main' } });
        return state;
      }
      return { revision: Number(row.revision), data: row.data };
    },
    async save(state, meta = {}) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const result = await client.query(
          'UPDATE lajur_state SET revision = $1, data = $2 WHERE id = 1 AND revision = $3',
          [state.revision, state.data, state.revision - 1],
        );
        if (!result.rowCount) {
          const current = await client.query('SELECT revision FROM lajur_state WHERE id = 1 FOR UPDATE');
          throw Object.assign(new Error('Revisi berubah. Muat ulang state sebelum menyimpan.'), {
            code: 'REVISION_CONFLICT',
            revision: Number(current.rows[0]?.revision ?? 0),
          });
        }
        if (meta.action) {
          await client.query(
            `INSERT INTO lajur_audit (revision, actor_id, actor_name, actor_role, action, payload)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [
              state.revision,
              meta.actorId ?? null,
              meta.actorName ?? 'Sistem',
              meta.actorRole ?? 'system',
              meta.action,
              meta.payload ?? {},
            ],
          );
        }
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    },
    async close() {
      await pool.end();
    },
  };
}
