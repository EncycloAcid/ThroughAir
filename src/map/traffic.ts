export type UnitId = 'plane-1' | 'plane-2' | 'fire' | 'medic'
export type UnitMode = 'parked' | 'go' | 'return' | 'away'

export interface Unit {
  id: UnitId
  mode: UnitMode
  t: number
}

export const INITIAL_UNITS: Unit[] = [
  { id: 'plane-1', mode: 'parked', t: 0 },
  { id: 'plane-2', mode: 'parked', t: 0 },
  { id: 'fire', mode: 'parked', t: 0 },
  { id: 'medic', mode: 'parked', t: 0 },
]

export const FIRE_PATH: Array<[number, number]> = [
  [46, 612],
  [58, 500],
  [52, 390],
  [46, 290],
  [50, 248],
]

export const MEDIC_PATH: Array<[number, number]> = [
  [72, 620],
  [86, 510],
  [78, 400],
  [70, 300],
  [74, 256],
]

const PLANE_SPEED = 0.62
const VEHICLE_SPEED = 0.42
const AWAY_FOR = 0.55

export function isUnitId(value: string | null): value is UnitId {
  return value === 'plane-1' || value === 'plane-2' || value === 'fire' || value === 'medic'
}

export function sendUnit(units: Unit[], id: UnitId): Unit[] {
  return units.map((unit) => (unit.id === id && unit.mode === 'parked' ? { ...unit, mode: 'go', t: 0 } : unit))
}

export function stepUnits(units: Unit[], dt: number): Unit[] {
  if (units.every((unit) => unit.mode === 'parked')) return units
  return units.map((unit) => {
    if (unit.mode === 'parked') return unit
    const plane = unit.id.startsWith('plane')
    const speed = plane ? PLANE_SPEED : VEHICLE_SPEED
    if (unit.mode === 'away') {
      const t = unit.t - dt
      return t <= 0 ? { ...unit, mode: 'parked', t: 0 } : { ...unit, t }
    }
    if (unit.mode === 'go') {
      const t = unit.t + dt * speed
      if (t < 1) return { ...unit, t }
      return plane ? { ...unit, mode: 'away', t: AWAY_FOR } : { ...unit, mode: 'return', t: 1 }
    }
    const t = unit.t - dt * speed
    return t <= 0 ? { ...unit, mode: 'parked', t: 0 } : { ...unit, t }
  })
}

export function planeOffset(id: UnitId, t: number): { x: number; y: number } {
  if (id === 'plane-2') return { x: 246 + t * 230, y: 437 }
  return { x: 30 + t * 320, y: 238 }
}

export function poseOnPath(points: Array<[number, number]>, t: number): { x: number; y: number; rot: number } {
  const clamped = Math.min(1, Math.max(0, t))
  let total = 0
  const lengths: number[] = []
  for (let i = 0; i < points.length - 1; i += 1) {
    const len = Math.hypot(points[i + 1][0] - points[i][0], points[i + 1][1] - points[i][1])
    lengths.push(len)
    total += len
  }
  let dist = clamped * total
  for (let i = 0; i < lengths.length; i += 1) {
    const len = lengths[i]
    if (dist <= len || i === lengths.length - 1) {
      const local = len === 0 ? 0 : Math.min(1, dist / len)
      const a = points[i]
      const b = points[i + 1]
      const x = a[0] + (b[0] - a[0]) * local
      const y = a[1] + (b[1] - a[1]) * local
      const rot = (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI
      return { x, y, rot }
    }
    dist -= len
  }
  const last = points[points.length - 1]
  return { x: last[0], y: last[1], rot: 0 }
}
