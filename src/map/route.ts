export interface MapPoint {
  id: string
  name: string
  x: number
  y: number
}

/** Walking line from the north checkpoint up through the terminal to Concourse A. */
export const ROUTE: MapPoint[] = [
  { id: 'tsa', name: 'TSA North checkpoint', x: 198, y: 608 },
  { id: 'main', name: 'Main terminal', x: 190, y: 458 },
  { id: 'food', name: 'Food court', x: 206, y: 292 },
  { id: 'a', name: 'Concourse A', x: 196, y: 148 },
]

export const LEGS = [
  { from: 'tsa', to: 'main', meters: 280 },
  { from: 'main', to: 'food', meters: 180 },
  { from: 'food', to: 'a', meters: 190 },
] as const

export const WALK_METERS_PER_MIN = 72

export const FLOW: Array<[number, number]> = ROUTE.map((point) => [point.x, point.y])

export const FLOW_B: Array<[number, number]> = [
  [190, 430],
  [140, 360],
  [86, 312],
]

export const FLOW_C: Array<[number, number]> = [
  [200, 400],
  [250, 390],
  [314, 402],
]

export function routeMeters(): number {
  return LEGS.reduce((sum, leg) => sum + leg.meters, 0)
}

export function routeMinutes(meters = routeMeters()): number {
  if (meters <= 0) return 0
  return Math.max(1, Math.round(meters / WALK_METERS_PER_MIN))
}

export function samples(points: Array<[number, number]>, count: number): Array<[number, number]> {
  if (points.length === 0 || count <= 0) return []
  if (points.length === 1 || count === 1) return [points[0]]
  const segs: { len: number; a: [number, number]; b: [number, number] }[] = []
  let total = 0
  for (let i = 0; i < points.length - 1; i += 1) {
    const a = points[i]
    const b = points[i + 1]
    const len = Math.hypot(b[0] - a[0], b[1] - a[1])
    segs.push({ len, a, b })
    total += len
  }
  const out: Array<[number, number]> = []
  for (let i = 0; i < count; i += 1) {
    if (i === count - 1) {
      out.push(points[points.length - 1])
      continue
    }
    let dist = (i / (count - 1)) * total
    for (let s = 0; s < segs.length; s += 1) {
      const seg = segs[s]
      const last = s === segs.length - 1
      if (dist <= seg.len || last) {
        const t = seg.len === 0 ? 0 : Math.min(1, dist / seg.len)
        out.push([seg.a[0] + (seg.b[0] - seg.a[0]) * t, seg.a[1] + (seg.b[1] - seg.a[1]) * t])
        break
      }
      dist -= seg.len
    }
  }
  return out
}
