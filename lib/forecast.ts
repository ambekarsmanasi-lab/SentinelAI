import fs from 'node:fs'
import path from 'node:path'
import Papa from 'papaparse'

export type ForecastPoint = { ds: string; yhat: number; yhat_lower: number; yhat_upper: number }
export type StateForecast = { state: string; drug_type: string; latest_actual_kg: number; forecast: ForecastPoint[]; trend: 'rising' | 'falling' | 'stable' }
export type RouteForecast = { origin: string; destination: string; via: string; drug_type: string; latest_actual_kg: number; forecast_6mo_kg: number; pct_change: number; trend: 'intensifying' | 'weakening' | 'stable' }
export type Coordinate = { name: string; latitude: number; longitude: number; capital?: string }

type SeizureRow = { date: string; state: string; drug_type: string; seizure_kg: string }
type RouteRow = { date: string; origin: string; destination: string; via: string; drug_type: string; volume_kg: string }
type StateCoordinateRow = { state: string; latitude: string; longitude: string; capital: string }
type RouteCoordinateRow = { location: string; latitude: string; longitude: string }

function csv<T>(name: string) {
  const raw = fs.readFileSync(path.join(process.cwd(), 'data', name), 'utf8')
  return parseCsv<T>(raw, name)
}

function parseCsv<T>(raw: string, name: string) {
  const parsed = Papa.parse<T>(raw, { header: true, skipEmptyLines: true })
  if (parsed.errors.length) throw new Error(`Invalid ${name}: ${parsed.errors[0].message}`)
  return parsed.data
}

const round = (value: number, digits = 2) => Number(value.toFixed(digits))

function nextMonth(dateString: string, offset: number) {
  const date = new Date(`${dateString}T00:00:00Z`)
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + offset, 1)).toISOString().slice(0, 10)
}

function predict(values: number[], periods: number) {
  const n = values.length
  if (!n) return []
  if (n === 1) return Array(periods).fill(values[0]) as number[]
  const xMean = (n - 1) / 2
  const yMean = values.reduce((sum, value) => sum + value, 0) / n
  let numerator = 0
  let denominator = 0
  values.forEach((value, index) => {
    numerator += (index - xMean) * (value - yMean)
    denominator += (index - xMean) ** 2
  })
  const slope = denominator ? numerator / denominator : 0
  const intercept = yMean - slope * xMean
  return Array.from({ length: periods }, (_, index) => intercept + slope * (n + index))
}

function groupBy<T>(rows: T[], key: (row: T) => string) {
  return rows.reduce<Record<string, T[]>>((groups, row) => {
    const value = key(row)
    groups[value] ??= []
    groups[value].push(row)
    return groups
  }, {})
}

export type ForecastInput = {
  /** Raw CSV text with `date,state,drug_type,seizure_kg` columns. */
  seizuresCsv?: string
  /** Raw CSV text with `date,origin,destination,via,drug_type,volume_kg` columns. */
  routesCsv?: string
}

export function getDashboardData(periods = 6, input: ForecastInput = {}) {
  const safePeriods = Math.min(12, Math.max(1, Math.trunc(periods)))

  const rawSeizures = input.seizuresCsv
    ? parseCsv<SeizureRow>(input.seizuresCsv, 'uploaded seizures CSV')
    : csv<SeizureRow>('ncrb-seizures.csv')
  const rawRoutes = input.routesCsv
    ? parseCsv<RouteRow>(input.routesCsv, 'uploaded routes CSV')
    : csv<RouteRow>('trafficking-routes.csv')

  const seizureRows = rawSeizures.filter((row) => row.date && row.state && row.drug_type && Number.isFinite(Number(row.seizure_kg)))
  const routeRows = rawRoutes.filter((row) => row.date && row.origin && row.destination && row.drug_type && Number.isFinite(Number(row.volume_kg)))

  if (input.seizuresCsv && seizureRows.length === 0) {
    throw new Error('Uploaded seizures CSV has no valid rows. Expected columns: date, state, drug_type, seizure_kg.')
  }

  const states: StateForecast[] = Object.values(groupBy(seizureRows, (row) => `${row.state}::${row.drug_type}`)).map((rows) => {
    const ordered = [...rows].sort((a, b) => a.date.localeCompare(b.date))
    const values = ordered.map((row) => Number(row.seizure_kg))
    const predictions = predict(values, safePeriods)
    const latest = values.at(-1) ?? 0
    const lastDate = ordered.at(-1)?.date ?? new Date().toISOString().slice(0, 10)
    const forecast = predictions.map((value, index) => ({ ds: nextMonth(lastDate, index + 1), yhat: round(value), yhat_lower: round(value * 0.85), yhat_upper: round(value * 1.15) }))
    const final = forecast.at(-1)?.yhat ?? latest
    return { state: ordered[0].state, drug_type: ordered[0].drug_type, latest_actual_kg: round(latest), forecast, trend: final > latest ? 'rising' : final < latest ? 'falling' : 'stable' }
  })

  const routes: RouteForecast[] = Object.values(groupBy(routeRows, (row) => `${row.origin}::${row.destination}::${row.drug_type}`)).map<RouteForecast>((rows) => {
    const ordered = [...rows].sort((a, b) => a.date.localeCompare(b.date))
    const values = ordered.map((row) => Number(row.volume_kg))
    const latest = values.at(-1) ?? 0
    const final = round(predict(values, safePeriods).at(-1) ?? latest)
    const pct = latest === 0 ? 0 : round(((final - latest) / latest) * 100, 1)
    return { origin: ordered[0].origin, destination: ordered[0].destination, via: ordered.at(-1)?.via ?? '', drug_type: ordered[0].drug_type, latest_actual_kg: round(latest), forecast_6mo_kg: final, pct_change: pct, trend: pct > 5 ? 'intensifying' : pct < -5 ? 'weakening' : 'stable' }
  }).sort((a, b) => b.pct_change - a.pct_change)

  const stateCoordinates: Coordinate[] = csv<StateCoordinateRow>('state-coordinates.csv').map((row) => ({ name: row.state, latitude: Number(row.latitude), longitude: Number(row.longitude), capital: row.capital })).filter((row) => Number.isFinite(row.latitude) && Number.isFinite(row.longitude))
  const routeCoordinates: Coordinate[] = csv<RouteCoordinateRow>('route-point-coordinates.csv').map((row) => ({ name: row.location, latitude: Number(row.latitude), longitude: Number(row.longitude) })).filter((row) => Number.isFinite(row.latitude) && Number.isFinite(row.longitude))

  return { periods: safePeriods, states, routes, coordinates: [...routeCoordinates, ...stateCoordinates], updatedAt: new Date().toISOString() }
}
