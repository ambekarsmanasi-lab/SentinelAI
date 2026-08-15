import { NextResponse } from 'next/server'
import { getDatasetOverview } from '@/lib/datasets'

export async function GET() {
  try {
    const data = await getDatasetOverview()
    return NextResponse.json(data, {
      headers: { 'Cache-Control': 'private, no-store' },
    })
  } catch (error) {
    console.error('[datasets] failed:', error)
    return NextResponse.json(
      { error: 'Dataset records could not be loaded.' },
      { status: 500 },
    )
  }
}
