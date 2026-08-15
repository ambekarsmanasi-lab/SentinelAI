'use client'

import 'leaflet/dist/leaflet.css'
import { CircleMarker, MapContainer, Popup, TileLayer } from 'react-leaflet'
import type { CaseCluster, CorrelationCase } from '@/lib/correlation'

// Distinct, colorblind-friendlier palette; cycles for cluster counts beyond its length.
const PALETTE = ['#8b5cf6', '#34d399', '#f59e0b', '#f472b6', '#38bdf8', '#fb7185', '#a3e635', '#c084fc']

export function CorrelationMap({ clusters, noise, focusedId }: { clusters: CaseCluster[]; noise: CorrelationCase[]; focusedId: number | null }) {
  const center = clusters[0]?.centroid ?? { lat: 37.775, lon: -122.4194 }
  return (
    <div className="h-[420px] overflow-hidden rounded-xl border border-border" aria-label="Case correlation map">
      <MapContainer center={[center.lat, center.lon]} zoom={14} minZoom={11} scrollWheelZoom className="h-full w-full bg-muted">
        <TileLayer attribution="&copy; OpenStreetMap contributors" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        {clusters.map((cluster) => {
          const color = PALETTE[cluster.clusterId % PALETTE.length]
          const focused = focusedId === null || focusedId === cluster.clusterId
          return cluster.cases.map((c) => (
            <CircleMarker
              key={c.id}
              center={[c.lat, c.lon]}
              radius={focused ? 6 : 4}
              pathOptions={{ color: '#0b1020', fillColor: color, fillOpacity: focused ? 0.9 : 0.25, weight: 1.5 }}
            >
              <Popup>
                <strong>Cluster {cluster.clusterId}</strong> · {cluster.size} cases<br />
                {c.text}<br />
                {c.location ?? c.district}{c.incident_date ? ` · ${c.incident_date}` : ''}
              </Popup>
            </CircleMarker>
          ))
        })}
        {noise.map((c) => (
          <CircleMarker key={c.id} center={[c.lat, c.lon]} radius={3} pathOptions={{ color: '#0b1020', fillColor: '#475569', fillOpacity: 0.5, weight: 1 }}>
            <Popup>
              <strong>Unclustered</strong><br />
              {c.text}<br />
              {c.location ?? c.district}{c.incident_date ? ` · ${c.incident_date}` : ''}
            </Popup>
          </CircleMarker>
        ))}
      </MapContainer>
    </div>
  )
}
