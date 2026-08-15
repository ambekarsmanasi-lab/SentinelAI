import { query } from '@/lib/db'

export type TrainingSourceStat = {
  source: string
  total: number
  positives: number
  negatives: number
}

export type TrainingExample = {
  id: number
  text: string
  label: number
  source: string
}

export type CaseRecord = {
  id: number
  case_id: number | null
  incident_date: string | null
  text: string
  location: string | null
  district: string | null
  lat: number | null
  lon: number | null
}

export type DistrictStat = { district: string; total: number }

export type DatasetOverview = {
  training: {
    total: number
    bySource: TrainingSourceStat[]
    samples: TrainingExample[]
  }
  cases: {
    total: number
    byDistrict: DistrictStat[]
    samples: CaseRecord[]
  }
}

export type IngestRow = { text: string; label: number }

/**
 * Batch-insert labeled rows into training_examples for a given source.
 * Uses a single multi-row parameterized INSERT to stay fast and injection-safe.
 * Returns the number of rows inserted.
 */
export async function insertTrainingExamples(
  source: string,
  rows: IngestRow[],
): Promise<number> {
  if (rows.length === 0) return 0

  const values: unknown[] = []
  const placeholders = rows.map((row, i) => {
    const base = i * 3
    values.push(row.text, row.label, source)
    return `($${base + 1}, $${base + 2}, $${base + 3})`
  })

  await query(
    `INSERT INTO training_examples (text, label, source)
     VALUES ${placeholders.join(', ')}`,
    values,
  )

  return rows.length
}

export async function getDatasetOverview(): Promise<DatasetOverview> {
  const [bySource, trainingSamples, caseTotalRow, byDistrict, caseSamples] =
    await Promise.all([
      query<{ source: string; total: string; positives: string; negatives: string }>(
        `SELECT source,
                count(*)::int AS total,
                sum(label)::int AS positives,
                (count(*) - sum(label))::int AS negatives
         FROM training_examples
         GROUP BY source
         ORDER BY source`,
      ),
      query<TrainingExample>(
        `SELECT id, text, label, source
         FROM training_examples
         ORDER BY id DESC
         LIMIT 20`,
      ),
      query<{ total: string }>(`SELECT count(*)::int AS total FROM case_records`),
      query<{ district: string; total: string }>(
        `SELECT COALESCE(district, 'Unknown') AS district, count(*)::int AS total
         FROM case_records
         GROUP BY district
         ORDER BY total DESC
         LIMIT 12`,
      ),
      query<CaseRecord>(
        `SELECT id, case_id, incident_date, text, location, district, lat, lon
         FROM case_records
         ORDER BY incident_date DESC NULLS LAST, id DESC
         LIMIT 20`,
      ),
    ])

  const training = bySource.map((row) => ({
    source: row.source,
    total: Number(row.total),
    positives: Number(row.positives),
    negatives: Number(row.negatives),
  }))

  return {
    training: {
      total: training.reduce((sum, row) => sum + row.total, 0),
      bySource: training,
      samples: trainingSamples,
    },
    cases: {
      total: Number(caseTotalRow[0]?.total ?? 0),
      byDistrict: byDistrict.map((row) => ({
        district: row.district,
        total: Number(row.total),
      })),
      samples: caseSamples,
    },
  }
}
