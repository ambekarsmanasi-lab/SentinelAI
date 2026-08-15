'use client'

import 'leaflet/dist/leaflet.css'
import { CircleMarker, MapContainer, Polyline, Popup, TileLayer } from 'react-leaflet'
import type { Coordinate, RouteForecast, StateForecast } from '@/lib/forecast'

export function NetworkMap({ coordinates, routes, states, drug }: { coordinates: Coordinate[]; routes: RouteForecast[]; states: StateForecast[]; drug: string }) {
  const locations = new Map(coordinates.map((coordinate) => [coordinate.name, coordinate]))
  const visibleRoutes = routes.filter((route) => drug === 'All' || route.drug_type === drug).slice(0, 12)
  const visibleStates = states.filter((state) => drug === 'All' || state.drug_type === drug)
  return (
    <div className="h-[420px] overflow-hidden rounded-xl border border-border" aria-label="Trafficking corridor map">
      <MapContainer center={[22.7, 80.7]} zoom={4} minZoom={3} scrollWheelZoom className="h-full w-full bg-muted">
        <TileLayer attribution='&copy; OpenStreetMap contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        {visibleRoutes.map((route) => {
          const from = locations.get(route.origin)
          const to = locations.get(route.destination)
          if (!from || !to) return null
          return <Polyline key={`${route.origin}-${route.destination}-${route.drug_type}`} positions={[[from.latitude, from.longitude], [to.latitude, to.longitude]]} pathOptions={{ color: route.trend === 'intensifying' ? '#34d399' : '#8b5cf6', weight: Math.max(2, Math.min(7, 2 + Math.abs(route.pct_change) / 18)), opacity: 0.72 }}><Popup><strong>{route.origin} → {route.destination}</strong><br />{route.drug_type} · {route.pct_change > 0 ? '+' : ''}{route.pct_change}%<br />via {route.via}</Popup></Polyline>
        })}
        {visibleStates.map((state) => {
          const point = locations.get(state.state)
          if (!point) return null
          return <CircleMarker key={`${state.state}-${state.drug_type}`} center={[point.latitude, point.longitude]} radius={state.trend === 'rising' ? 8 : 5} pathOptions={{ color: '#0b1020', fillColor: state.trend === 'rising' ? '#34d399' : '#8b5cf6', fillOpacity: 0.9, weight: 2 }}><Popup><strong>{state.state}</strong><br />{state.drug_type} · {state.latest_actual_kg} kg<br />Projection: {state.trend}</Popup></CircleMarker>
        })}
      </MapContainer>
    </div>
  )
}
