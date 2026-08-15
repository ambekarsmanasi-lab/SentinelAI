import { query } from '@/lib/db'

/**
 * Idempotently create the tables the Datasets panel reads from.
 * Safe to call repeatedly — uses IF NOT EXISTS everywhere.
 */
export async function ensureSchema(): Promise<void> {
  await query(`
    CREATE TABLE IF NOT EXISTS training_examples (
      id     bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      text   text NOT NULL,
      label  smallint NOT NULL CHECK (label IN (0, 1)),
      source text NOT NULL DEFAULT 'user_upload',
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `)

  await query(`
    CREATE TABLE IF NOT EXISTS case_records (
      id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      case_id       integer,
      incident_date date,
      text          text NOT NULL,
      location      text,
      district      text,
      lat           double precision,
      lon           double precision,
      created_at    timestamptz NOT NULL DEFAULT now()
    )
  `)

  await query(`CREATE INDEX IF NOT EXISTS idx_training_examples_source ON training_examples (source)`)
  await query(`CREATE INDEX IF NOT EXISTS idx_case_records_district ON case_records (district)`)
}
