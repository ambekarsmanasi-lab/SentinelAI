'use client'

import dynamic from 'next/dynamic'
import useSWR from 'swr'
import { useMemo, useState } from 'react'
import { GitBranch, LoaderCircle, MapPin, ShieldAlert, Users } from 'lucide-react'
import type { CaseCluster, CorrelationResult } from '@/lib/correlation'
import { CorrelationUploader } from './correlation-uploader'

const CorrelationMap = dynamic(() => import('./correlation-map').then((m) => m.CorrelationMap), {
  ssr: false,
  loading: () => <div className="flex h-[420px] items-center justify-center rounded-xl border border-border bg-muted"><LoaderCircle className="size-6 animate-spin text-primary" /></div>,
})

const PALETTE = ['#8b5cf6', '#34d399', '#f59e0b', '#f472b6', '#38bdf8', '#fb7185', '#a3e635', '#c084fc']

async function correlationFetcher([eps, minPts, casesCsv]: [number, number, string | null]): Promise<CorrelationResult> {
  const response = casesCsv
    ? await fetch('/api/correlation/upload', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ casesCsv, eps, minPts }) })
    : await fetch(`/api/correlation?eps=${eps}&minPts=${minPts}`)
  const data = await response.json()
  if (!response.ok) throw new Error(data.error)
  return data as CorrelationResult
}

export function CorrelationPanel() {
  const [eps, setEps] = useState(200)
  const [minPts, setMinPts] = useState(3)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [uploadedCsv, setUploadedCsv] = useState<string | null>(null)
  const [uploadedLabel, setUploadedLabel] = useState('')
  const { data, error, isLoading } = useSWR<CorrelationResult>([eps, minPts, uploadedCsv], correlationFetcher)

  const selected = useMemo(() => data?.clusters.find((c) => c.clusterId === selectedId) ?? data?.clusters[0], [data, selectedId])
  const clusterRate = data ? Math.round((data.clusteredCases / Math.max(data.totalCases, 1)) * 100) : 0

  if (isLoading) return <div className="panel flex min-h-96 items-center justify-center gap-3 text-sm text-muted-foreground"><LoaderCircle className="size-5 animate-spin text-primary" />Running DBSCAN over case records…</div>
  if (!data) return <div role="alert" className="panel flex items-center gap-3 text-destructive"><ShieldAlert className="size-5" />{error?.message ?? 'Case correlation is unavailable.'}</div>

  return <div className="flex flex-col gap-6">
    <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
      <div>
        <p className="eyebrow">Density-based clustering · DBSCAN</p>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight">Case correlation</h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">Groups incident reports that sit close together in space, surfacing recurring hotspots without assuming a fixed number of clusters up front.{uploadedCsv ? ` Currently clustering ${uploadedLabel}.` : ''}</p>
      </div>
      <div className="flex gap-4">
        <label className="flex min-w-32 flex-col gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Radius (m)
          <input type="number" min={25} max={5000} step={25} value={eps} onChange={(e) => setEps(Number(e.target.value))} className="rounded-lg border border-input bg-card px-3 py-2 text-sm normal-case tracking-normal text-foreground outline-none focus:border-primary" />
        </label>
        <label className="flex min-w-32 flex-col gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Min points
          <input type="number" min={2} max={20} value={minPts} onChange={(e) => setMinPts(Number(e.target.value))} className="rounded-lg border border-input bg-card px-3 py-2 text-sm normal-case tracking-normal text-foreground outline-none focus:border-primary" />
        </label>
      </div>
    </div>

    <CorrelationUploader
      active={!!uploadedCsv}
      onSelected={(csvText, label) => { setUploadedCsv(csvText); setUploadedLabel(label); setSelectedId(null) }}
      onReset={() => { setUploadedCsv(null); setUploadedLabel(''); setSelectedId(null) }}
    />

    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Correlation summary">
      <Metric icon={GitBranch} label="Clusters found" value={data.clusters.length.toString()} note={`eps ${data.params.epsMeters}m · minPts ${data.params.minPoints}`} />
      <Metric icon={Users} label="Clustered cases" value={data.clusteredCases.toString()} note={`${clusterRate}% of ${data.totalCases} total`} />
      <Metric icon={MapPin} label="Largest cluster" value={(data.clusters[0]?.size ?? 0).toString()} note={data.clusters[0]?.districts[0]?.district ?? 'No cluster'} />
      <Metric icon={ShieldAlert} label="Unclustered" value={data.noise.length.toString()} note="isolated reports" />
    </section>

    <div className="grid gap-6 xl:grid-cols-[minmax(0,1.55fr)_minmax(340px,.75fr)]">
      <section className="panel">
        <div className="mb-5 flex items-center justify-between gap-4">
          <div><p className="eyebrow">Geospatial view</p><h3 className="mt-2 text-lg font-semibold">Cluster map</h3></div>
          <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
            {data.clusters.slice(0, 6).map((c) => <span key={c.clusterId} className="flex items-center gap-2"><i className="size-2 rounded-full" style={{ background: PALETTE[c.clusterId % PALETTE.length] }} />Cluster {c.clusterId}</span>)}
            <span className="flex items-center gap-2"><i className="size-2 rounded-full bg-slate-500" />Unclustered</span>
          </div>
        </div>
        <CorrelationMap clusters={data.clusters} noise={data.noise} focusedId={selectedId} />
      </section>

      <section className="panel min-w-0">
        <div className="flex items-start justify-between gap-3">
          <div><p className="eyebrow">Selected cluster</p><h3 className="mt-2 text-lg font-semibold">{selected ? `Cluster ${selected.clusterId}` : 'No cluster'}</h3><p className="text-sm text-muted-foreground">{selected?.size ?? 0} correlated cases</p></div>
        </div>
        <label className="mt-5 flex flex-col gap-2 text-xs text-muted-foreground">Cluster
          <select value={selected?.clusterId ?? ''} onChange={(e) => setSelectedId(Number(e.target.value))} className="rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground">
            {data.clusters.map((c) => <option key={c.clusterId} value={c.clusterId}>Cluster {c.clusterId} · {c.size} cases</option>)}
          </select>
        </label>
        {selected && <div className="mt-5 flex flex-col gap-4 text-sm">
          <div><p className="text-xs uppercase tracking-wider text-muted-foreground">Top districts</p><ul className="mt-2 flex flex-wrap gap-2">{selected.districts.map((d) => <li key={d.district} className="rounded-full border border-border px-3 py-1 text-xs">{d.district} · {d.count}</li>)}</ul></div>
          <div><p className="text-xs uppercase tracking-wider text-muted-foreground">Offense types</p><ul className="mt-2 flex flex-wrap gap-2">{selected.offenseTypes.map((o) => <li key={o.type} className="rounded-full border border-border px-3 py-1 text-xs">{o.type} · {o.count}</li>)}</ul></div>
          <div className="flex items-end justify-between border-t border-border pt-4"><div><p className="text-xs text-muted-foreground">Earliest</p><p className="mt-1 text-lg font-semibold">{selected.dateRange.earliest ?? '—'}</p></div><div className="text-right"><p className="text-xs text-muted-foreground">Latest</p><p className="mt-1 text-lg font-semibold">{selected.dateRange.latest ?? '—'}</p></div></div>
        </div>}
      </section>
    </div>

    <section className="panel overflow-hidden">
      <div className="mb-5"><p className="eyebrow">Priority queue</p><h3 className="mt-2 text-lg font-semibold">Clusters by size</h3></div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-3xl text-left text-sm">
          <thead className="border-b border-border text-xs uppercase tracking-wider text-muted-foreground">
            <tr><th className="pb-3 font-medium">Cluster</th><th className="pb-3 font-medium">Size</th><th className="pb-3 font-medium">Top district</th><th className="pb-3 font-medium">Leading offense</th><th className="pb-3 text-right font-medium">Earliest</th><th className="pb-3 text-right font-medium">Latest</th></tr>
          </thead>
          <tbody>
            {data.clusters.map((c: CaseCluster) => (
              <tr key={c.clusterId} className={`cursor-pointer border-b border-border/70 last:border-0 hover:bg-muted/40 ${selected?.clusterId === c.clusterId ? 'bg-muted/30' : ''}`} onClick={() => setSelectedId(c.clusterId)}>
                <td className="py-4 font-medium">Cluster {c.clusterId}</td>
                <td className="py-4">{c.size}</td>
                <td className="py-4 text-muted-foreground">{c.districts[0]?.district ?? '—'}</td>
                <td className="py-4 text-muted-foreground">{c.offenseTypes[0]?.type ?? '—'}</td>
                <td className="py-4 text-right">{c.dateRange.earliest ?? '—'}</td>
                <td className="py-4 text-right">{c.dateRange.latest ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  </div>
}

function Metric({ icon: Icon, label, value, note }: { icon: typeof GitBranch; label: string; value: string; note: string }) {
  return <div className="panel"><div className="flex items-center justify-between gap-4"><p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</p><Icon className="size-4 text-primary" /></div><p className="mt-4 text-3xl font-semibold tracking-tight">{value}</p><p className="mt-2 truncate text-xs text-muted-foreground">{note}</p></div>
}
