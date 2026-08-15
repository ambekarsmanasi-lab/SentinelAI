import fs from 'node:fs'
import path from 'node:path'
import Papa from 'papaparse'
import { Pool } from 'pg'

const connectionString = process.env.DATABASE_URL
if (!connectionString) {
  console.error('[seed] DATABASE_URL is not set')
  process.exit(1)
}

const pool = new Pool({ connectionString, ssl: { rejectUnauthorized: false } })
const dataDir = path.join(process.cwd(), 'data')

function readCsv(name) {
  const raw = fs.readFileSync(path.join(dataDir, name), 'utf8')
  const parsed = Papa.parse(raw, { header: true, skipEmptyLines: true })
  if (parsed.errors.length) throw new Error(`Invalid ${name}: ${parsed.errors[0].message}`)
  return parsed.data
}

// Create the tables the Datasets panel reads from. Idempotent.
async function ensureSchema(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS training_examples (
      id     bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      text   text NOT NULL,
      label  smallint NOT NULL CHECK (label IN (0, 1)),
      source text NOT NULL DEFAULT 'user_upload',
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `)
  await client.query(`
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
  await client.query(`CREATE INDEX IF NOT EXISTS idx_training_examples_source ON training_examples (source)`)
  await client.query(`CREATE INDEX IF NOT EXISTS idx_case_records_district ON case_records (district)`)
  console.log('[seed] schema ready')
}

// Insert rows in chunks using parameterized multi-row VALUES.
async function bulkInsert(client, { table, columns, rows, chunkSize = 500 }) {
  let inserted = 0
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize)
    const values = []
    const placeholders = chunk.map((row, r) => {
      const base = r * columns.length
      values.push(...row)
      return `(${columns.map((_, c) => `$${base + c + 1}`).join(', ')})`
    })
    await client.query(
      `INSERT INTO ${table} (${columns.join(', ')}) VALUES ${placeholders.join(', ')}`,
      values,
    )
    inserted += chunk.length
  }
  return inserted
}

async function seedTrainingExamples(client) {
  const sources = [
    { file: 'conversational_examples_large.csv', source: 'conversational' },
    { file: 'synthetic_from_agora.csv', source: 'synthetic_agora' },
  ]
  for (const { file, source } of sources) {
    const rows = readCsv(file)
      .filter((r) => typeof r.text === 'string' && r.text.trim() && (r.label === '0' || r.label === '1'))
      .map((r) => [r.text.trim(), Number(r.label), source])
    // Idempotent per source: clear then reload.
    await client.query('DELETE FROM training_examples WHERE source = $1', [source])
    const n = await bulkInsert(client, {
      table: 'training_examples',
      columns: ['text', 'label', 'source'],
      rows,
    })
    console.log(`[seed] training_examples <- ${file} (${source}): ${n} rows`)
  }
}

async function seedCaseRecords(client) {
  const rows = readCsv('india-case-records.csv')
    .filter((r) => typeof r.text === 'string' && r.text.trim())
    .map((r) => [
      r.case_id ? Number(r.case_id) : null,
      r.date || null,
      r.text.trim(),
      r.location || null,
      r.district || null,
      Number.isFinite(Number(r.lat)) ? Number(r.lat) : null,
      Number.isFinite(Number(r.lon)) ? Number(r.lon) : null,
    ])
  await client.query('DELETE FROM case_records')
  const n = await bulkInsert(client, {
    table: 'case_records',
    columns: ['case_id', 'incident_date', 'text', 'location', 'district', 'lat', 'lon'],
    rows,
  })
  console.log(`[seed] case_records: ${n} rows`)
}

async function main() {
  const client = await pool.connect()
  try {
    await ensureSchema(client)
    await client.query('BEGIN')
    await seedTrainingExamples(client)
    await seedCaseRecords(client)
    await client.query('COMMIT')
    console.log('[seed] done')
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
    await pool.end()
  }
}

main().catch((err) => {
  console.error('[seed] failed:', err)
  process.exit(1)
})
