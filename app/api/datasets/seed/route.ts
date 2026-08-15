import fs from 'node:fs'
import path from 'node:path'
import Papa from 'papaparse'
import { NextResponse } from 'next/server'
import { pool, query } from '@/lib/db'
import { ensureSchema } from '@/lib/schema'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const dataDir = path.join(process.cwd(), 'data')

function readCsv<T = Record<string, string>>(name: string): T[] {
  const raw = fs.readFileSync(path.join(dataDir, name), 'utf8')
  const parsed = Papa.parse<T>(raw, { header: true, skipEmptyLines: true })
  if (parsed.errors.length) throw new Error(`Invalid ${name}: ${parsed.errors[0].message}`)
  return parsed.data
}

async function bulkInsert(
  table: string,
  columns: string[],
  rows: unknown[][],
  chunkSize = 500,
) {
  let inserted = 0
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize)
    const values: unknown[] = []
    const placeholders = chunk.map((row, r) => {
      const base = r * columns.length
      values.push(...row)
      return `(${columns.map((_, c) => `$${base + c + 1}`).join(', ')})`
    })
    await query(
      `INSERT INTO ${table} (${columns.join(', ')}) VALUES ${placeholders.join(', ')}`,
      values,
    )
    inserted += chunk.length
  }
  return inserted
}

export async function POST() {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ error: 'DATABASE_URL is not set.' }, { status: 500 })
  }

  try {
    await ensureSchema()

    // training_examples — idempotent per source (clear then reload).
    const trainingSources = [
      { file: 'conversational_examples_large.csv', source: 'conversational' },
      { file: 'synthetic_from_agora.csv', source: 'synthetic_agora' },
    ]
    let trainingInserted = 0
    for (const { file, source } of trainingSources) {
      const rows = readCsv<{ text: string; label: string }>(file)
        .filter((r) => typeof r.text === 'string' && r.text.trim() && (r.label === '0' || r.label === '1'))
        .map((r) => [r.text.trim(), Number(r.label), source])
      await query('DELETE FROM training_examples WHERE source = $1', [source])
      trainingInserted += await bulkInsert('training_examples', ['text', 'label', 'source'], rows)
    }

    // case_records — full reload.
    const caseRows = readCsv<Record<string, string>>('india-case-records.csv')
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
    await query('DELETE FROM case_records')
    const casesInserted = await bulkInsert(
      'case_records',
      ['case_id', 'incident_date', 'text', 'location', 'district', 'lat', 'lon'],
      caseRows,
    )

    return NextResponse.json({ ok: true, trainingInserted, casesInserted })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Seeding failed.'
    return NextResponse.json({ error: message }, { status: 500 })
  } finally {
    // Note: keep the shared pool open for reuse across requests.
    void pool
  }
}
