'use client'

import { useState } from 'react'
import { AlertTriangle, BrainCircuit, CheckCircle2, LoaderCircle, RefreshCw, ScanText } from 'lucide-react'
import { Button } from '@/components/ui/button'

type Prediction = { label: 'RISKY' | 'NORMAL'; confidence: string; raw_prediction: number }
type Contribution = { feature: string; score: number; impact: 'RISKY' | 'NORMAL' }

async function post<T>(url: string, body: object = {}) {
  const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const data = await response.json()
  if (!response.ok) throw new Error(data.error ?? data.stderr_tail ?? 'Request failed.')
  return data as T
}

export function AnalyzerPanel() {
  const [text, setText] = useState('')
  const [prediction, setPrediction] = useState<Prediction | null>(null)
  const [contributions, setContributions] = useState<Contribution[]>([])
  const [busy, setBusy] = useState(false)
  const [retraining, setRetraining] = useState(false)
  const [error, setError] = useState('')
  const [log, setLog] = useState('')

  async function analyze() {
    if (!text.trim() || busy) return
    setBusy(true); setError(''); setPrediction(null); setContributions([])
    try {
      const [predictionData, explanationData] = await Promise.all([
        post<{ prediction: Prediction }>('/api/analyzer/predict', { text }),
        post<{ explanation: { contributions: Contribution[] | string } }>('/api/analyzer/explain', { text }),
      ])
      setPrediction(predictionData.prediction)
      setContributions(Array.isArray(explanationData.explanation.contributions) ? explanationData.explanation.contributions : [])
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Analysis failed.') } finally { setBusy(false) }
  }

  async function retrain() {
    if (!window.confirm('Start model retraining? This is an operational action and may take several minutes.')) return
    setRetraining(true); setError(''); setLog('')
    try { const result = await post<{ status: string; log_tail?: string }>('/api/analyzer/retrain'); setLog(result.log_tail ?? `Training status: ${result.status}`) }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Retraining failed.') } finally { setRetraining(false) }
  }

  return <div className="grid gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(320px,.65fr)]">
    <section className="panel flex flex-col gap-5" aria-labelledby="analyzer-heading">
      <div className="flex items-start justify-between gap-4"><div><h2 id="analyzer-heading" className="text-2xl font-semibold tracking-tight">Text risk analyzer</h2></div><ScanText className="size-6 text-primary" aria-hidden="true" /></div>
      <label htmlFor="risk-text" className="text-sm font-medium">Message to inspect</label>
      <textarea id="risk-text" value={text} maxLength={5000} onChange={(event) => setText(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && (event.metaKey || event.ctrlKey) && !event.nativeEvent.isComposing && event.keyCode !== 229) analyze() }} placeholder="Paste a conversation excerpt or intelligence note…" className="min-h-44 resize-y rounded-xl border border-input bg-background p-4 text-sm leading-6 outline-none transition focus:border-primary focus:ring-2 focus:ring-ring/30" />
      <div className="flex flex-wrap items-center justify-between gap-3"><span className="text-xs text-muted-foreground">{text.length.toLocaleString()} / 5,000 · Ctrl/⌘ + Enter to run</span><Button onClick={analyze} disabled={!text.trim() || busy}>{busy ? <LoaderCircle className="animate-spin" data-icon="inline-start" /> : <BrainCircuit data-icon="inline-start" />}Analyze text</Button></div>
      {error && <div role="alert" className="rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive"><AlertTriangle className="mr-2 inline size-4" aria-hidden="true" />{error}</div>}
      {prediction && <div className="grid gap-4 border-t border-border pt-5 sm:grid-cols-2"><div className="rounded-xl bg-muted p-5"><p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">Classification</p><div className="mt-3 flex items-center gap-3">{prediction.label === 'RISKY' ? <AlertTriangle className="size-6 text-destructive" /> : <CheckCircle2 className="size-6 text-primary" />}<span className="text-2xl font-semibold">{prediction.label}</span></div><p className="mt-2 text-sm text-muted-foreground">Model confidence {prediction.confidence}</p></div><div className="rounded-xl bg-muted p-5"><p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">Signal strength</p><div className="mt-4 h-2 overflow-hidden rounded-full bg-background"><div className="h-full rounded-full bg-primary" style={{ width: prediction.confidence }} /></div></div></div>}
    </section>
    <aside className="flex flex-col gap-6"><section className="panel"><h3 className="text-lg font-semibold">Top contributions</h3>{contributions.length ? <div className="mt-5 flex flex-col gap-3">{contributions.map((item) => <div key={`${item.feature}-${item.score}`} className="flex items-center justify-between gap-4 border-b border-border pb-3"><div><p className="font-mono text-sm">{item.feature}</p><p className="text-xs text-muted-foreground">toward {item.impact.toLowerCase()}</p></div><span className={item.score > 0 ? 'text-destructive' : 'text-primary'}>{item.score > 0 ? '+' : ''}{item.score.toFixed(4)}</span></div>)}</div> : <p className="mt-5 text-sm leading-6 text-muted-foreground">Run an analysis to see the model&apos;s strongest recognized features.</p>}</section>
      <section className="panel"><h3 className="text-lg font-semibold">Retraining control</h3><Button variant="outline" className="mt-5 w-full" onClick={retrain} disabled={retraining}>{retraining ? <LoaderCircle className="animate-spin" data-icon="inline-start" /> : <RefreshCw data-icon="inline-start" />}Retrain model</Button>{log && <pre className="mt-4 max-h-36 overflow-auto whitespace-pre-wrap rounded-lg bg-muted p-3 font-mono text-xs leading-5">{log}</pre>}</section>
    </aside>
  </div>
}
