import { Pool } from 'pg'

// Reuse a single pool across hot reloads in development to avoid exhausting
// Neon connections. In production a single module-scoped pool is used.
const globalForDb = globalThis as unknown as { __sentinelPool?: Pool }

export const pool =
  globalForDb.__sentinelPool ??
  new Pool({
    connectionString: process.env.DATABASE_URL,
    // Neon (and most hosted Postgres) require TLS.
    ssl: { rejectUnauthorized: false },
  })

if (process.env.NODE_ENV !== 'production') globalForDb.__sentinelPool = pool

export async function query<T = Record<string, unknown>>(
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  const result = await pool.query(text, params)
  return result.rows as T[]
}
