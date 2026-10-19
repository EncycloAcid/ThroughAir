import { useEffect, useRef, useState, type PointerEvent, type WheelEvent } from 'react'
import type { FocusId, Level, Mode, Tab } from './chrome-types'
import { MapChrome, type StopId } from './MapChrome'
import { FOOT } from '../map/footprints'
import { FLOW, FLOW_B, FLOW_C, samples } from '../map/route'
import {
  FIRE_PATH,
  INITIAL_UNITS,
  MEDIC_PATH,
  isUnitId,
  planeOffset,
  poseOnPath,
  sendUnit,
  stepUnits,
  type Unit,
  type UnitId,
} from '../map/traffic'

const VB_W = 390
const VB_H = 836
const COLORS = ['#8eb6ff', '#d7b0ff', '#ffc14d', '#ff7b9c', '#ffffff', '#7dffe1', '#9aa8ff']

const HOME = { x: 0, y: 0, scale: 1 }

const FOCI: Record<Exclude<FocusId, 'all'>, { x: number; y: number }> = {
  A: { x: 186, y: 176 },
  B: { x: 142, y: 216 },
  C: { x: 165, y: 269 },
}

function jitter(index: number): [number, number] {
  return [((index * 47) % 13) - 6, ((index * 29) % 11) - 5]
}

function dots(points: Array<[number, number]>, count: number, seed: number) {
  return samples(points, count).map((point, index) => {
    const [jx, jy] = jitter(index + seed)
    return {
      x: point[0] + jx,
      y: point[1] + jy,
      color: COLORS[(index + seed) % COLORS.length],
      r: (index + seed) % 6 === 0 ? 5 : 3.4,
    }
  })
}

const CROWD = [...dots(FLOW, 34, 0), ...dots(FLOW_B, 10, 3), ...dots(FLOW_C, 9, 5)]

export function AirportMap() {
  const svgRef = useRef<SVGSVGElement>(null)
  const drag = useRef<{
    px: number
    py: number
    x: number
    y: number
    moved: number
    badge: FocusId | null
    dispatch: UnitId | null
  } | null>(null)
  const lastTap = useRef(0)
  const [view, setView] = useState(HOME)
  const [focus, setFocus] = useState<FocusId>('all')
  const [level, setLevel] = useState<Level>('U')
  const [mode, setMode] = useState<Mode>('depart')
  const [tab, setTab] = useState<Tab>('directions')
  const [query, setQuery] = useState('')
  const [stops, setStops] = useState<StopId[]>([])
  const [sheetOpen, setSheetOpen] = useState(true)
  const [layersOpen, setLayersOpen] = useState(false)
  const [cardOpen, setCardOpen] = useState(true)
  const [walk, setWalk] = useState<number | null>(null)
  const [animate, setAnimate] = useState(false)
  const [units, setUnits] = useState<Unit[]>(INITIAL_UNITS)

  useEffect(() => {
    if (walk === null) return
    const started = performance.now()
    let frame = 0
    const tick = (now: number) => {
      const next = Math.min(1, (now - started) / 4600)
      setWalk(next >= 1 ? null : next)
      if (next < 1) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [walk === null])

  useEffect(() => {
    let frame = 0
    let last = performance.now()
    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      setUnits((prev) => stepUnits(prev, dt))
      frame = requestAnimationFrame(loop)
    }
    frame = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(frame)
  }, [])

  function clampView(next: { x: number; y: number; scale: number }) {
    const scale = Math.min(2.6, Math.max(1, next.scale))
    const limitX = 48 + (scale - 1) * VB_W * 0.55
    const limitY = 140 + (scale - 1) * VB_H * 0.55
    return {
      scale,
      x: Math.min(limitX, Math.max(-limitX, next.x)),
      y: Math.min(limitY, Math.max(-limitY, next.y)),
    }
  }

  function pointerToVb(clientX: number, clientY: number) {
    const rect = svgRef.current!.getBoundingClientRect()
    return {
      x: ((clientX - rect.left) / rect.width) * VB_W,
      y: ((clientY - rect.top) / rect.height) * VB_H,
    }
  }

  function badgeAt(target: EventTarget | null): FocusId | null {
    if (!(target instanceof Element)) return null
    const badge = target.closest('[data-focus]')
    const id = badge?.getAttribute('data-focus')
    if (id === 'A' || id === 'B' || id === 'C') return id
    return null
  }

  function dispatchAt(target: EventTarget | null): UnitId | null {
    if (!(target instanceof Element)) return null
    const id = target.closest('[data-dispatch]')?.getAttribute('data-dispatch') ?? null
    return isUnitId(id) ? id : null
  }

  function onPointerDown(event: PointerEvent<SVGSVGElement>) {
    if (event.button !== 0) return
    svgRef.current?.setPointerCapture(event.pointerId)
    setAnimate(false)
    drag.current = {
      px: event.clientX,
      py: event.clientY,
      x: view.x,
      y: view.y,
      moved: 0,
      badge: badgeAt(event.target),
      dispatch: dispatchAt(event.target),
    }
  }

  function onPointerMove(event: PointerEvent<SVGSVGElement>) {
    const active = drag.current
    if (!active || !svgRef.current) return
    const rect = svgRef.current.getBoundingClientRect()
    const dx = ((event.clientX - active.px) / rect.width) * VB_W
    const dy = ((event.clientY - active.py) / rect.height) * VB_H
    active.moved += Math.abs(dx) + Math.abs(dy)
    setView(clampView({ x: active.x + dx, y: active.y + dy, scale: view.scale }))
  }

  function resetView() {
    setAnimate(true)
    setFocus('all')
    setView(HOME)
  }

  function onPointerUp() {
    const active = drag.current
    drag.current = null
    if (!active || active.moved > 8) return
    if (active.dispatch) {
      lastTap.current = 0
      setUnits((prev) => sendUnit(prev, active.dispatch as UnitId))
      return
    }
    if (active.badge && active.badge !== 'all') {
      lastTap.current = 0
      centerOn(active.badge)
      return
    }
    const now = performance.now()
    if (now - lastTap.current < 350) {
      lastTap.current = 0
      resetView()
      return
    }
    lastTap.current = now
  }

  function onWheel(event: WheelEvent<SVGSVGElement>) {
    event.preventDefault()
    const cursor = pointerToVb(event.clientX, event.clientY)
    const nextScale = view.scale * (event.deltaY < 0 ? 1.08 : 0.92)
    const scale = Math.min(2.6, Math.max(1, nextScale))
    const x = cursor.x - ((cursor.x - view.x) * scale) / view.scale
    const y = cursor.y - ((cursor.y - view.y) * scale) / view.scale
    setAnimate(false)
    setFocus('all')
    setView(clampView({ x, y, scale }))
  }

  function centerOn(id: Exclude<FocusId, 'all'>) {
    if (focus === id) {
      resetView()
      return
    }
    const point = FOCI[id]
    const scale = 1.85
    setAnimate(true)
    setFocus(id)
    setView(clampView({ scale, x: VB_W / 2 - point.x * scale, y: VB_H / 2 - point.y * scale }))
  }

  return (
    <div className="map-screen">
      <svg
        ref={svgRef}
        className="airport-map"
        viewBox={`0 0 ${VB_W} ${VB_H}`}
        preserveAspectRatio="none"
        role="img"
        aria-label="Cleveland Hopkins map. Directions from TSA North to Concourse A. Tap a plane to send it off the runway, or a rescue truck to send it out."
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onWheel={onWheel}
        onDoubleClick={resetView}
      >
        <g
          style={{ transition: animate ? 'transform 280ms ease' : 'none' }}
          transform={`translate(${view.x} ${view.y}) scale(${view.scale})`}
        >
          <MapArt focus={focus} level={level} units={units} walk={walk} />
        </g>
      </svg>
      <MapChrome
        level={level}
        focus={focus}
        mode={mode}
        tab={tab}
        query={query}
        stops={stops}
        sheetOpen={sheetOpen}
        layersOpen={layersOpen}
        cardOpen={cardOpen}
        walking={walk !== null}
        onQuery={(value) => {
          setQuery(value)
          const q = value.trim().toLowerCase()
          const next = q.includes('concourse a') || q.includes('gate a') ? 'A' : q.includes('concourse b') || q.includes('gate b') ? 'B' : q.includes('concourse c') || q.includes('gate c') ? 'C' : null
          if (next && next !== focus) centerOn(next)
        }}
        onLevel={setLevel}
        onFocus={(next) => {
          if (next === 'all' || next === focus) resetView()
          else centerOn(next)
        }}
        onLocate={resetView}
        onMode={(next) => {
          setMode(next)
          setCardOpen(true)
          setTab('directions')
        }}
        onTab={setTab}
        onToggleStop={(id) => setStops((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]))}
        onToggleSheet={() => setSheetOpen((open) => !open)}
        onToggleLayers={() => setLayersOpen((open) => !open)}
        onCloseCard={() => setCardOpen(false)}
        onGo={() => {
          if (walk !== null) return
          setLevel('U')
          setWalk(0)
        }}
      />
      <p className="imagery-credit">Imagery © Esri</p>
    </div>
  )
}

function MapArt({ focus, level, units, walk }: { focus: FocusId; level: Level; units: Unit[]; walk: number | null }) {
  const routeOpacity = level === 'U' ? 0.92 : 0.28
  return (
    <>
      <defs>
        <pattern id="hatch" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(32)">
          <line x1="0" y1="0" x2="0" y2="7" stroke="#e6c27a" strokeWidth="2" />
        </pattern>
        <filter id="soft" x="-40%" y="-40%" width="180%" height="180%">
          <feDropShadow dx="0" dy="1" stdDeviation="1.4" floodColor="#000" floodOpacity="0.7" />
        </filter>
      </defs>

      <image href="/cle-aerial.jpg?v=3" width={VB_W} height={VB_H} preserveAspectRatio="none" style={{ pointerEvents: 'none' }} />

      {level === 'L' && (
        <g>
          <rect width={VB_W} height={VB_H} fill="#071018" opacity="0.38" />
          <path d={FOOT.M} fill="#1b2836" stroke="#9ec3e4" strokeWidth="1.4" />
          <ellipse cx="190" cy="242" rx="22" ry="8" fill="none" stroke="#e7f2fb" strokeWidth="1.6" />
          <ellipse cx="198" cy="220" rx="14" ry="5" fill="none" stroke="#e7f2fb" strokeWidth="1.3" />
          <text x="214" y="258" textAnchor="middle" className="place-label">
            Baggage
          </text>
          <text x="214" y="292" textAnchor="middle" className="place-quiet">
            Arrivals curb
          </text>
        </g>
      )}

      <path d={FOOT.D} fill="#1a140c" opacity="0.45" />
      <path d={FOOT.D} fill="url(#hatch)" opacity="0.55" />

      <g fill="none" stroke="#f0d48a" strokeLinecap="round" strokeLinejoin="round" opacity={routeOpacity}>
        <polyline points={FLOW.map((point) => point.join(',')).join(' ')} strokeWidth="7" />
        <polyline points={FLOW_B.map((point) => point.join(',')).join(' ')} strokeWidth="4" opacity="0.7" />
        <polyline points={FLOW_C.map((point) => point.join(',')).join(' ')} strokeWidth="4" opacity="0.7" />
      </g>

      {level === 'U' && (
        <g>
          {CROWD.map((dot, index) => (
            <circle key={index} cx={dot.x} cy={dot.y} r={dot.r} fill={dot.color} />
          ))}
        </g>
      )}

      <g className="closed-label">
        <text x="188" y="338" textAnchor="middle">
          CONCOURSE D
        </text>
        <text x="188" y="352" textAnchor="middle">
          CLOSED
        </text>
      </g>
      <text x="214" y="268" textAnchor="middle" className="place-label">
        TSA North
      </text>

      <g transform="translate(40 75.2) rotate(3.36)">
        <RunwayPlane unit={units.find((item) => item.id === 'plane-1')} />
      </g>
      <g transform="translate(31 180) rotate(-40.15)">
        <RunwayPlane unit={units.find((item) => item.id === 'plane-2')} />
      </g>

      {level === 'U' && (
        <>
          <Rescue unit={units.find((item) => item.id === 'fire')} path={FIRE_PATH} kind="fire" label="Send the fire truck" />
          <Rescue unit={units.find((item) => item.id === 'medic')} path={MEDIC_PATH} kind="medic" label="Send the ambulance" />
        </>
      )}
      {walk !== null && <Walker progress={walk} />}

      <Badge x={186} y={176} letter="A" fill="#3c7dff" active={focus === 'A'} label="Center concourse A" />
      <Badge x={142} y={216} letter="B" fill="#8e99a8" active={focus === 'B'} label="Center concourse B" />
      <Badge x={165} y={269} letter="C" fill="#c084fc" active={focus === 'C'} label="Center concourse C" />
      {focus !== 'all' && <path d={FOOT[focus]} fill="none" stroke="#ffffff" strokeWidth="2.2" style={{ pointerEvents: 'none' }} />}
    </>
  )
}

function Walker({ progress }: { progress: number }) {
  const pose = poseOnPath(FLOW, progress)
  return (
    <g transform={`translate(${pose.x} ${pose.y})`} style={{ pointerEvents: 'none' }}>
      <circle r="12" fill="#2f6bff" opacity="0.35" />
      <circle r="6.5" fill="#2f6bff" stroke="#ffffff" strokeWidth="2" />
    </g>
  )
}

function Badge({
  x,
  y,
  letter,
  fill,
  active,
  label,
}: {
  x: number
  y: number
  letter: string
  fill: string
  active: boolean
  label: string
}) {
  return (
    <g filter="url(#soft)" data-focus={letter} style={{ cursor: 'pointer' }} role="button" aria-label={label}>
      <circle cx={x} cy={y} r={active ? 18 : 15} fill={fill} stroke="#f7fbff" strokeWidth={active ? 3 : 2} />
      <text x={x} y={y + 5} textAnchor="middle" className="badge-letter">
        {letter}
      </text>
    </g>
  )
}

function RunwayPlane({ unit }: { unit: Unit | undefined }) {
  if (!unit || unit.mode === 'away') return null
  const at = planeOffset(unit.id, unit.t)
  return (
    <g
      data-dispatch={unit.id}
      data-mode={unit.mode}
      data-progress={unit.t.toFixed(3)}
      transform={`translate(${at.x} ${at.y})`}
      style={{ cursor: 'pointer' }}
      role="button"
      aria-label="Send this plane off the runway"
    >
      <circle r="14" fill="transparent" />
      <path
        transform="rotate(90)"
        d="M0 -16 L2.4 -4 L18 -1 L2.4 2 L0 15 L-2.4 2 L-18 -1 L-2.4 -4 Z"
        fill="#f5f8fc"
        stroke="#8ea0b4"
        strokeWidth="0.7"
      />
    </g>
  )
}

function Rescue({
  unit,
  path,
  kind,
  label,
}: {
  unit: Unit | undefined
  path: Array<[number, number]>
  kind: 'fire' | 'medic'
  label: string
}) {
  if (!unit) return null
  const pose = poseOnPath(path, unit.t)
  return (
    <g
      data-dispatch={unit.id}
      data-mode={unit.mode}
      data-progress={unit.t.toFixed(3)}
      transform={`translate(${pose.x} ${pose.y}) rotate(${pose.rot})`}
      style={{ cursor: 'pointer' }}
      role="button"
      aria-label={label}
    >
      <circle r="13" fill="transparent" />
      {kind === 'fire' ? <FireTruck /> : <Ambulance />}
    </g>
  )
}

function FireTruck() {
  return (
    <g>
      <rect x="-12" y="-5" width="16" height="10" rx="1.4" fill="#e23d3d" />
      <rect x="3" y="-4.2" width="7" height="8.4" rx="1" fill="#f4f4f4" />
      <circle cx="-6" cy="5" r="1.8" fill="#161616" />
      <circle cx="5" cy="5" r="1.8" fill="#161616" />
    </g>
  )
}

function Ambulance() {
  return (
    <g>
      <rect x="-12" y="-5" width="20" height="10" rx="1.4" fill="#f7f7f7" stroke="#d0d5dc" strokeWidth="0.4" />
      <rect x="-12" y="-1.1" width="20" height="2.2" fill="#e23d3d" />
      <path d="M-2 -3.2 h2.2 v-1.6 h1.6 v1.6 h2.2 v1.6 h-2.2 v1.6 h-1.6 v-1.6 h-2.2 z" fill="#1f9d57" />
      <circle cx="-6" cy="5" r="1.8" fill="#161616" />
      <circle cx="6" cy="5" r="1.8" fill="#161616" />
    </g>
  )
}

