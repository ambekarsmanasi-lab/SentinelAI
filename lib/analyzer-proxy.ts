import { NextRequest, NextResponse } from 'next/server'

const MAX_TEXT = 5000

export async function proxyAnalyzer(request: NextRequest, endpoint: 'predict' | 'explain' | 'retrain') {
  const baseUrl = process.env.ANALYZER_API_URL?.replace(/\/$/, '')
  if (!baseUrl) return NextResponse.json({ error: 'Analyzer backend is not configured.' }, { status: 503 })

  let body: unknown = {}
  if (endpoint !== 'retrain') {
    try { body = await request.json() } catch { return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 }) }
    const text = typeof (body as { text?: unknown }).text === 'string' ? (body as { text: string }).text.trim() : ''
    if (!text) return NextResponse.json({ error: 'Text is required.' }, { status: 400 })
    if (text.length > MAX_TEXT) return NextResponse.json({ error: `Text must be ${MAX_TEXT} characters or fewer.` }, { status: 400 })
    body = { text }
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), endpoint === 'retrain' ? 120_000 : 20_000)
  try {
    const response = await fetch(`${baseUrl}/${endpoint}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: controller.signal, cache: 'no-store' })
    const payload = await response.json().catch(() => ({ error: 'Analyzer returned an invalid response.' }))
    return NextResponse.json(payload, { status: response.status })
  } catch (error) {
    const message = error instanceof Error && error.name === 'AbortError' ? 'Analyzer request timed out.' : 'Analyzer service is unavailable.'
    return NextResponse.json({ error: message }, { status: 502 })
  } finally { clearTimeout(timeout) }
}
