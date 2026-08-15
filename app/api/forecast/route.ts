import { NextRequest, NextResponse } from 'next/server'
import { getDashboardData } from '@/lib/forecast'

export async function GET(request: NextRequest) {
  const raw = request.nextUrl.searchParams.get('periods') ?? '6'
  const periods = Number(raw)
  if (!Number.isInteger(periods) || periods < 1 || periods > 12) {
    return NextResponse.json({ error: 'Periods must be an integer from 1 to 12.' }, { status: 400 })
  }
  try {
    return NextResponse.json(getDashboardData(periods), { headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400' } })
  } catch {
    return NextResponse.json({ error: 'Forecast data could not be processed.' }, { status: 500 })
  }
}
