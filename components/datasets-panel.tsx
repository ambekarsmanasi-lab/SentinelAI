'use client'

import useSWR from 'swr'
import { AlertTriangle, Database, LoaderCircle, MapPin, Tags } from 'lucide-react'
import type { DatasetOverview } from '@/lib/datasets'
import { DatasetUploader } from './dataset-uploader'

const fetcher = async (url: string) => {
  const response = await fetch(url)
  const data = await response.json()
  if (!response.ok) throw new Error(data.error ?? 'Failed to load datasets.')
  return data as DatasetOverview
}

const sourceLabels: Record<string, string> = {
  conversational: 'Conversational examples',
  synthetic_agora: 'Synthetic (Agora)',
}

function labelBadge(label: number) {
  return label === 1
    ? 'border-destructive/40 bg-destructive/10 text-destructive'
    : 'border-primary/40 bg-primary/10 text-primary'
}

export function DatasetsPanel() {
  const { data, error, isLoading, mutate } = useSWR('/api/datasets', fetcher, {
    revalidateOnFocus: false,
  })

  if (isLoading) {
    return (
      <div className="panel flex items-center justify-center gap-3 py-16 text-sm text-muted-foreground">
        <LoaderCircle className="size-5 animate-spin text-primary" aria-hidden="true" />
        Loading records from database…
      </div>
    )
  }

  if (error || !data) {
    return (
      <div role="alert" className="rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
        <AlertTriangle className="mr-2 inline size-4" aria-hidden="true" />
        {error instanceof Error ? error.message : 'Dataset records could not be loaded.'}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <DatasetUploader onComplete={() => mutate()} />

      <section className="grid gap-4 sm:grid-cols-3">
        <div className="panel">
          <p className="eyebrow">Stored in Neon</p>
          <div className="mt-3 flex items-center gap-3">
            <Database className="size-5 text-primary" aria-hidden="true" />
            <span className="text-3xl font-semibold tabular-nums">{data.training.total + data.cases.total}</span>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">Total records across all tables</p>
        </div>
        <div className="panel">
          <p className="eyebrow">Training examples</p>
          <div className="mt-3 flex items-center gap-3">
            <Tags className="size-5 text-primary" aria-hidden="true" />
            <span className="text-3xl font-semibold tabular-nums">{data.training.total.toLocaleString()}</span>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">{data.training.bySource.length} labeled sources</p>
        </div>
        <div className="panel">
          <p className="eyebrow">Case records</p>
          <div className="mt-3 flex items-center gap-3">
            <MapPin className="size-5 text-primary" aria-hidden="true" />
            <span className="text-3xl font-semibold tabular-nums">{data.cases.total.toLocaleString()}</span>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">Geocoded incident reports</p>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="panel" aria-labelledby="training-heading">
          <p className="eyebrow">training_examples</p>
          <h2 id="training-heading" className="mt-2 text-lg font-semibold">Labeled training data</h2>
          <div className="mt-4 flex flex-col gap-2">
            {data.training.bySource.map((row) => (
              <div key={row.source} className="flex items-center justify-between gap-4 rounded-lg bg-muted p-3 text-sm">
                <span className="font-medium">{sourceLabels[row.source] ?? row.source}</span>
                <span className="font-mono text-xs text-muted-foreground">
                  {row.total} rows · <span className="text-destructive">{row.positives} risky</span> · <span className="text-primary">{row.negatives} normal</span>
                </span>
              </div>
            ))}
          </div>
          <h3 className="mt-6 text-sm font-medium text-muted-foreground">Recent samples</h3>
          <ul className="mt-3 flex flex-col gap-2">
            {data.training.samples.map((row) => (
              <li key={row.id} className="flex items-start gap-3 border-b border-border pb-2 text-sm">
                <span className={`mt-0.5 shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase ${labelBadge(row.label)}`}>
                  {row.label === 1 ? 'Risky' : 'Normal'}
                </span>
                <span className="leading-6 text-foreground/90">{row.text}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="panel" aria-labelledby="cases-heading">
          <p className="eyebrow">case_records</p>
          <h2 id="cases-heading" className="mt-2 text-lg font-semibold">Incident case data</h2>
          <div className="mt-4 flex flex-wrap gap-2">
            {data.cases.byDistrict.map((row) => (
              <span key={row.district} className="rounded-full border border-border px-3 py-1 text-xs">
                {row.district} <span className="font-mono text-muted-foreground">{row.total}</span>
              </span>
            ))}
          </div>
          <h3 className="mt-6 text-sm font-medium text-muted-foreground">Recent samples</h3>
          <ul className="mt-3 flex flex-col gap-3">
            {data.cases.samples.map((row) => (
              <li key={row.id} className="border-b border-border pb-3 text-sm">
                <p className="font-medium leading-6">{row.text}</p>
                <p className="mt-1 font-mono text-xs text-muted-foreground">
                  {row.incident_date ? String(row.incident_date).slice(0, 10) : 'undated'} · {row.district ?? 'Unknown'} · {row.location ?? '—'}
                </p>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  )
}
