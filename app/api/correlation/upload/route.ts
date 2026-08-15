import { NextResponse } from 'next/server'
import { clusterCases, parseCasesCsv } from '@/lib/correlation'

export const runtime = 'nodejs'
export const maxDuration = 60

const MAX_CSV_BYTES = 5 * 1024 * 1024 // 5 MB

type UploadBody = { casesCsv?: unknown; eps?: unknown; minPts?: unknown }

export async function POST(request: Request) {
  let body: UploadBody
  try {
    body = (await request.json()) as UploadBody
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }

  if (typeof body.casesCsv !== 'string' || !body.casesCsv.trim()) {
    return NextResponse.json({ error: 'Provide a cases CSV file to analyze.' }, { status: 400 })
  }
  if (body.casesCsv.length > MAX_CSV_BYTES) {
    return NextResponse.json({ error: 'Cases CSV is too large (max 5 MB).' }, { status: 413 })
  }

  const eps = Number(body.eps ?? 200)
  const minPts = Number(body.minPts ?? 3)
  if (!Number.isFinite(eps) || eps < 25 || eps > 5000) {
    return NextResponse.json({ error: 'eps must be a number between 25 and 5000 meters.' }, { status: 400 })
  }
  if (!Number.isInteger(minPts) || minPts < 2 || minPts > 20) {
    return NextResponse.json({ error: 'minPts must be an integer from 2 to 20.' }, { status: 400 })
  }

  try {
    const rows = parseCasesCsv(body.casesCsv)
    if (rows.length === 0) {
      return NextResponse.json(
        { error: 'No valid rows found. Expected columns: case_id, date, text, location, district, lat, lon.' },
        { status: 400 },
      )
    }
    return NextResponse.json(clusterCases(rows, eps, minPts))
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Uploaded CSV could not be processed.'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
