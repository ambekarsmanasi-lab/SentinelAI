import { NextResponse } from 'next/server'
import { getDashboardData, type ForecastInput } from '@/lib/forecast'

export const runtime = 'nodejs'
export const maxDuration = 60

const MAX_CSV_BYTES = 5 * 1024 * 1024 // 5 MB per file

type UploadBody = {
  periods?: unknown
  seizuresCsv?: unknown
  routesCsv?: unknown
}

export async function POST(request: Request) {
  let body: UploadBody
  try {
    body = (await request.json()) as UploadBody
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }

  const input: ForecastInput = {}
  if (typeof body.seizuresCsv === 'string' && body.seizuresCsv.trim()) {
    if (body.seizuresCsv.length > MAX_CSV_BYTES) {
      return NextResponse.json({ error: 'Seizures CSV is too large (max 5 MB).' }, { status: 413 })
    }
    input.seizuresCsv = body.seizuresCsv
  }
  if (typeof body.routesCsv === 'string' && body.routesCsv.trim()) {
    if (body.routesCsv.length > MAX_CSV_BYTES) {
      return NextResponse.json({ error: 'Routes CSV is too large (max 5 MB).' }, { status: 413 })
    }
    input.routesCsv = body.routesCsv
  }

  if (!input.seizuresCsv && !input.routesCsv) {
    return NextResponse.json({ error: 'Provide at least one CSV file to analyze.' }, { status: 400 })
  }

  const periods = Number(body.periods ?? 6)
  if (!Number.isInteger(periods) || periods < 1 || periods > 12) {
    return NextResponse.json({ error: 'Periods must be an integer from 1 to 12.' }, { status: 400 })
  }

  try {
    return NextResponse.json(getDashboardData(periods, input))
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Uploaded data could not be processed.'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
