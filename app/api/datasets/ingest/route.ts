import { NextResponse } from 'next/server'
import { insertTrainingExamples, type IngestRow } from '@/lib/datasets'

export const runtime = 'nodejs'
export const maxDuration = 60

const MAX_BATCH = 2000
const MAX_TEXT_LEN = 10000
// Only allow a safe, bounded source identifier.
const SOURCE_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/

type IngestBody = {
  source?: unknown
  rows?: unknown
}

function normalizeLabel(value: unknown): number | null {
  if (value === 1 || value === 0) return value
  if (value === '1' || value === 'true') return 1
  if (value === '0' || value === 'false') return 0
  const n = Number(value)
  if (n === 1) return 1
  if (n === 0) return 0
  return null
}

export async function POST(request: Request) {
  let body: IngestBody
  try {
    body = (await request.json()) as IngestBody
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }

  const source = typeof body.source === 'string' ? body.source.trim() : ''
  if (!SOURCE_RE.test(source)) {
    return NextResponse.json(
      { error: 'Invalid source name. Use lowercase letters, numbers, hyphens, or underscores.' },
      { status: 400 },
    )
  }

  if (!Array.isArray(body.rows)) {
    return NextResponse.json({ error: 'rows must be an array.' }, { status: 400 })
  }
  if (body.rows.length > MAX_BATCH) {
    return NextResponse.json(
      { error: `Batch too large. Send at most ${MAX_BATCH} rows per request.` },
      { status: 413 },
    )
  }

  const clean: IngestRow[] = []
  let skipped = 0
  for (const raw of body.rows) {
    if (!raw || typeof raw !== 'object') {
      skipped++
      continue
    }
    const record = raw as Record<string, unknown>
    const text = typeof record.text === 'string' ? record.text.trim() : ''
    const label = normalizeLabel(record.label)
    if (!text || text.length > MAX_TEXT_LEN || label === null) {
      skipped++
      continue
    }
    clean.push({ text, label })
  }

  try {
    const inserted = await insertTrainingExamples(source, clean)
    return NextResponse.json({ inserted, skipped })
  } catch (error) {
    console.error('[ingest] failed:', error)
    return NextResponse.json({ error: 'Failed to insert rows.' }, { status: 500 })
  }
}
