import { describe, expect, it } from 'vitest'
import { FIRE_PATH, INITIAL_UNITS, planeOffset, poseOnPath, sendUnit, stepUnits } from './traffic'

describe('runway and rescue traffic', () => {
  it('sends a parked plane and ignores a second tap while it is rolling', () => {
    const sent = sendUnit(INITIAL_UNITS, 'plane-1')
    expect(sent.find((unit) => unit.id === 'plane-1')?.mode).toBe('go')
    const again = sendUnit(sent, 'plane-1')
    expect(again.filter((unit) => unit.id === 'plane-1' && unit.mode === 'go')).toHaveLength(1)
  })

  it('rolls a plane off the runway, holds it away, then parks another', () => {
    let units = sendUnit(INITIAL_UNITS, 'plane-1')
    units = stepUnits(units, 2)
    expect(units.find((unit) => unit.id === 'plane-1')?.mode).toBe('away')
    units = stepUnits(units, 1)
    const plane = units.find((unit) => unit.id === 'plane-1')
    expect(plane).toEqual({ id: 'plane-1', mode: 'parked', t: 0 })
    expect(planeOffset('plane-1', 0).x).toBeLessThan(planeOffset('plane-1', 1).x)
  })

  it('sends a truck out and brings it back', () => {
    let units = sendUnit(INITIAL_UNITS, 'fire')
    units = stepUnits(units, 3)
    expect(units.find((unit) => unit.id === 'fire')?.mode).toBe('return')
    units = stepUnits(units, 3)
    expect(units.find((unit) => unit.id === 'fire')).toEqual({ id: 'fire', mode: 'parked', t: 0 })
  })

  it('places a vehicle at the ends of its path, aimed along the road', () => {
    const start = poseOnPath(FIRE_PATH, 0)
    const end = poseOnPath(FIRE_PATH, 1)
    expect(start.x).toBe(FIRE_PATH[0][0])
    expect(start.y).toBe(FIRE_PATH[0][1])
    expect(end.x).toBe(FIRE_PATH[FIRE_PATH.length - 1][0])
    expect(end.y).toBe(FIRE_PATH[FIRE_PATH.length - 1][1])
    expect(start.rot).toBeLessThan(0)
  })
})
