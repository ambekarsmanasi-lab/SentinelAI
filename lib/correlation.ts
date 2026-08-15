import Papa from 'papaparse'
import { query } from '@/lib/db'

export type CorrelationCase = {
  id: number
  case_id: number | null
  incident_date: string | null
  text: string
  location: string | null
  district: string | null
  lat: number
  lon: number
}

export type CaseCluster = {
  clusterId: number
  size: number
  centroid: { lat: number; lon: number }
  districts: { district: string; count: number }[]
  dateRange: { earliest: string | null; latest: string | null }
  offenseTypes: { type: string; count: number }[]
  cases: CorrelationCase[]
}

export type CorrelationResult = {
  clusters: CaseCluster[]
  noise: CorrelationCase[]
  totalCases: number
  clusteredCases: number
  params: { epsMeters: number; minPoints: number }
  updatedAt: string
}

const EARTH_RADIUS_M = 6371000

/** Great-circle distance between two lat/lon points, in meters. */
function haversineMeters(a: CorrelationCase, b: CorrelationCase): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLon = toRad(b.lon - a.lon)
  const lat1 = toRad(a.lat)
  const lat2 = toRad(b.lat)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h))
}

/**
 * Classic DBSCAN over geospatial points. O(n^2) neighbor lookups, which is
 * fine at this dataset's scale (hundreds of records); swap for a spatial
 * index (grid/k-d tree) if the case volume grows into the tens of thousands.
 */
function dbscan(points: CorrelationCase[], epsMeters: number, minPoints: number): number[] {
  const n = points.length
  const labels = new Array<number>(n).fill(0) // 0 = unvisited, -1 = noise, >0 = cluster id
  const neighborsCache: number[][] = []

  const regionQuery = (i: number): number[] => {
    if (neighborsCache[i]) return neighborsCache[i]
    const result: number[] = []
    for (let j = 0; j < n; j++) {
      if (i === j) continue
      if (haversineMeters(points[i], points[j]) <= epsMeters) result.push(j)
    }
    neighborsCache[i] = result
    return result
  }

  let clusterId = 0
  for (let i = 0; i < n; i++) {
    if (labels[i] !== 0) continue
    const neighbors = regionQuery(i)
    if (neighbors.length + 1 < minPoints) {
      labels[i] = -1
      continue
    }
    clusterId++
    labels[i] = clusterId
    const seeds = [...neighbors]
    for (let k = 0; k < seeds.length; k++) {
      const j = seeds[k]
      if (labels[j] === -1) labels[j] = clusterId
      if (labels[j] !== 0) continue
      labels[j] = clusterId
      const jNeighbors = regionQuery(j)
      if (jNeighbors.length + 1 >= minPoints) seeds.push(...jNeighbors)
    }
  }
  return labels
}

function countValues(values: (string | null)[]): [string, number][] {
  const counts = new Map<string, number>()
  for (const value of values) {
    const key = value?.trim() || 'Unspecified'
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])
}

function topDistricts(values: (string | null)[], limit: number): { district: string; count: number }[] {
  return countValues(values).slice(0, limit).map(([district, count]) => ({ district, count }))
}

function topOffenseTypes(values: (string | null)[], limit: number): { type: string; count: number }[] {
  return countValues(values).slice(0, limit).map(([type, count]) => ({ type, count }))
}

/** First clause of the offense text (before the first comma), used as a coarse offense-type label. */
function offenseType(text: string): string {
  return text.split(',')[0]?.trim() || text.trim()
}

export function clusterCases(rows: CorrelationCase[], epsMeters = 200, minPoints = 3): CorrelationResult {
  const labels = dbscan(rows, epsMeters, minPoints)

  const byCluster = new Map<number, CorrelationCase[]>()
  const noise: CorrelationCase[] = []
  rows.forEach((row, idx) => {
    const label = labels[idx]
    if (label === -1) {
      noise.push(row)
      return
    }
    const bucket = byCluster.get(label) ?? []
    bucket.push(row)
    byCluster.set(label, bucket)
  })

  const clusters: CaseCluster[] = [...byCluster.entries()]
    .map(([clusterId, cases]) => {
      const lat = cases.reduce((sum, c) => sum + c.lat, 0) / cases.length
      const lon = cases.reduce((sum, c) => sum + c.lon, 0) / cases.length
      const dates = cases.map((c) => c.incident_date).filter((d): d is string => !!d).sort()
      return {
        clusterId,
        size: cases.length,
        centroid: { lat, lon },
        districts: topDistricts(cases.map((c) => c.district), 5),
        dateRange: { earliest: dates[0] ?? null, latest: dates.at(-1) ?? null },
        offenseTypes: topOffenseTypes(cases.map((c) => offenseType(c.text)), 5),
        cases: cases.slice(0, 25),
      }
    })
    .sort((a, b) => b.size - a.size)

  return {
    clusters,
    noise,
    totalCases: rows.length,
    clusteredCases: rows.length - noise.length,
    params: { epsMeters, minPoints },
    updatedAt: new Date().toISOString(),
  }
}

type CaseCsvRow = { case_id?: string; date?: string; text?: string; location?: string; district?: string; lat?: string; lon?: string }

/**
 * Parses CSV text with columns matching the bundled sample:
 * case_id, date, text, location, district, lat, lon
 * Rows missing a usable text field or valid coordinates are dropped.
 */
export function parseCasesCsv(raw: string): CorrelationCase[] {
  const parsed = Papa.parse<CaseCsvRow>(raw, { header: true, skipEmptyLines: true })
  if (parsed.errors.length) throw new Error(`Invalid CSV: ${parsed.errors[0].message}`)

  return parsed.data
    .map((row, index) => {
      const lat = Number(row.lat)
      const lon = Number(row.lon)
      const text = row.text?.trim() ?? ''
      if (!text || !Number.isFinite(lat) || !Number.isFinite(lon)) return null
      return {
        id: index,
        case_id: row.case_id ? Number(row.case_id) || null : null,
        incident_date: row.date?.trim() || null,
        text,
        location: row.location?.trim() || null,
        district: row.district?.trim() || null,
        lat,
        lon,
      }
    })
    .filter((row): row is CorrelationCase => row !== null)
}

export async function getCaseCorrelation(epsMeters = 200, minPoints = 3): Promise<CorrelationResult> {
  const rows = await query<CorrelationCase>(
    `SELECT id, case_id, incident_date, text, location, district, lat, lon
     FROM case_records
     WHERE lat IS NOT NULL AND lon IS NOT NULL
     ORDER BY id`,
  )
  return clusterCases(rows, epsMeters, minPoints)
}
