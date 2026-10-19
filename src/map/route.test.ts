import { describe, expect, it } from 'vitest'
import { routeMeters, routeMinutes, samples, ROUTE } from './route'

describe('terminal walk', () => {
  it('runs 650 meters, about 9 minutes, from TSA North to Concourse A', () => {
    expect(ROUTE.map((point) => point.id)).toEqual(['tsa', 'main', 'food', 'a'])
    expect(routeMeters()).toBe(650)
    expect(routeMinutes()).toBe(9)
  })

  it('spaces the crowd along the whole walk', () => {
    const dots = samples(
      ROUTE.map((point) => [point.x, point.y]),
      5,
    )
    expect(dots).toHaveLength(5)
    expect(dots[0]).toEqual([ROUTE[0].x, ROUTE[0].y])
    expect(dots[4]).toEqual([ROUTE[3].x, ROUTE[3].y])
    expect(dots[2][1]).toBeLessThan(dots[0][1])
    expect(dots[2][1]).toBeGreaterThan(dots[4][1])
  })
})
