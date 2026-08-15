'use client'

import { useState } from 'react'
import { BrainCircuit, Database, GitBranch, Network, Radio, Shield } from 'lucide-react'
import { ForecastPanel } from './forecast-panel'
import { AnalyzerPanel } from './analyzer-panel'
import { DatasetsPanel } from './datasets-panel'
import { CorrelationPanel } from './correlation-panel'

type View = 'forecast' | 'analyzer' | 'correlation' | 'datasets'

export function SentinelWorkspace() {
  const [view, setView] = useState<View>('forecast')
  return <main className="min-h-screen bg-background text-foreground">
    <header className="border-b border-border bg-card/80 backdrop-blur"><div className="mx-auto flex max-w-screen-2xl items-center justify-between gap-4 px-4 py-4 md:px-8"><div className="flex items-center gap-3"><span className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground"><Shield className="size-5" aria-hidden="true" /></span><div><p className="font-mono text-sm font-semibold tracking-[0.18em]">SENTINEL AI</p><p className="text-xs text-muted-foreground">Network intelligence workspace</p></div></div><div className="hidden items-center gap-2 text-xs text-muted-foreground sm:flex"><Radio className="size-4 text-primary" aria-hidden="true" /><span>Source data online</span><span className="ml-2 rounded-full border border-border px-2 py-1 font-mono">OLS · 6M</span></div></div></header>
    <div className="mx-auto max-w-screen-2xl px-4 py-6 md:px-8 md:py-8"><nav className="mb-8 flex w-full max-w-2xl rounded-xl border border-border bg-card p-1" aria-label="Workspace modules"><button type="button" aria-current={view === 'forecast' ? 'page' : undefined} onClick={() => setView('forecast')} className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition ${view === 'forecast' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}><Network className="size-4" />Network forecasts</button><button type="button" aria-current={view === 'analyzer' ? 'page' : undefined} onClick={() => setView('analyzer')} className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition ${view === 'analyzer' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}><BrainCircuit className="size-4" />Text analyzer</button><button type="button" aria-current={view === 'correlation' ? 'page' : undefined} onClick={() => setView('correlation')} className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition ${view === 'correlation' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}><GitBranch className="size-4" />Case correlation</button><button type="button" aria-current={view === 'datasets' ? 'page' : undefined} onClick={() => setView('datasets')} className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition ${view === 'datasets' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}><Database className="size-4" />Datasets</button></nav>{view === 'forecast' ? <ForecastPanel /> : view === 'analyzer' ? <AnalyzerPanel /> : view === 'correlation' ? <CorrelationPanel /> : <DatasetsPanel />}</div>
    <footer className="mx-auto flex max-w-screen-2xl flex-col justify-between gap-2 border-t border-border px-4 py-6 text-xs text-muted-foreground md:flex-row md:px-8"><p>Decision support only. Validate model outputs against primary intelligence.</p><p className="font-mono">SENTINEL / INDIA NETWORK / 2026</p></footer>
  </main>
}
