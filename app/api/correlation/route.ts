import { NextRequest, NextResponse } from 'next/server'
import { getCaseCorrelation } from '@/lib/correlation'

export async function GET(request: NextRequest) {
  const epsRaw = request.nextUrl.searchParams.get('eps') ?? '200'
  const minPtsRaw = request.nextUrl.searchParams.get('minPts') ?? '3'
  const eps = Number(epsRaw)
  const minPts = Number(minPtsRaw)

  if (!Number.isFinite(eps) || eps < 25 || eps > 5000) {
    return NextResponse.json({ error: 'eps must be a number between 25 and 5000 meters.' }, { status: 400 })
  }
  if (!Number.isInteger(minPts) || minPts < 2 || minPts > 20) {
    return NextResponse.json({ error: 'minPts must be an integer from 2 to 20.' }, { status: 400 })
  }

  try {
    const result = await getCaseCorrelation(eps, minPts)
    return NextResponse.json(result, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error) {
    console.error('[correlation] failed:', error)
    return NextResponse.json({ error: 'Case correlation could not be computed.' }, { status: 500 })
  }
}
