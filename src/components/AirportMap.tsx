import { useEffect, useRef, useState, type PointerEvent, type WheelEvent } from 'react'
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
const VB_H = 700
const COLORS = ['#8eb6ff', '#d7b0ff', '#ffc14d', '#ff7b9c', '#ffffff', '#7dffe1', '#9aa8ff']

type FocusId = 'all' | 'A' | 'B' | 'C'

const FOCI: Record<Exclude<FocusId, 'all'>, { x: number; y: number }> = {
  A: { x: 196, y: 150 },
  B: { x: 86, y: 312 },
  C: { x: 314, y: 402 },
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
  const [view, setView] = useState({ x: 0, y: 0, scale: 1 })
  const [focus, setFocus] = useState<FocusId>('all')
  const [animate, setAnimate] = useState(false)
  const [units, setUnits] = useState<Unit[]>(INITIAL_UNITS)

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
    const limitY = 56 + (scale - 1) * VB_H * 0.55
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
    setView({ x: 0, y: 0, scale: 1 })
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
      setAnimate(true)
      setFocus('all')
      setView({ x: 0, y: 0, scale: 1 })
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
        role="img"
        aria-label="Cleveland Hopkins terminal map. Tap a plane to send it off the runway. Tap the fire truck or ambulance to send it out. The lit path walks from TSA North to Concourse A."
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
          <MapArt focus={focus} units={units} />
        </g>
      </svg>
      <div className="scale" aria-hidden="true">
        <span />
        250 m
      </div>
    </div>
  )
}

function MapArt({ focus, units }: { focus: FocusId; units: Unit[] }) {
  return (
    <>
      <defs>
        <radialGradient id="ground" cx="50%" cy="42%" r="75%">
          <stop offset="0%" stopColor="#24312c" />
          <stop offset="55%" stopColor="#17211e" />
          <stop offset="100%" stopColor="#10161a" />
        </radialGradient>
        <pattern id="hatch" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(35)">
          <line x1="0" y1="0" x2="0" y2="7" stroke="#8a6b32" strokeWidth="2" />
        </pattern>
        <filter id="soft" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="1" stdDeviation="1.2" floodColor="#000" floodOpacity="0.45" />
        </filter>
      </defs>

      <rect width={VB_W} height={VB_H} fill="url(#ground)" />
      <ellipse cx="70" cy="180" rx="90" ry="48" fill="#1c2a22" opacity="0.85" />
      <ellipse cx="330" cy="120" rx="70" ry="36" fill="#1a2822" />
      <ellipse cx="40" cy="520" rx="80" ry="50" fill="#18241e" />
      <ellipse cx="340" cy="600" rx="90" ry="40" fill="#1a2620" />

      <g fill="none" stroke="#2a3832" strokeWidth="14" strokeLinecap="round">
        <path d="M-10 80 C 80 60, 150 110, 250 70 S 380 40, 420 90" />
        <path d="M-20 250 C 70 230, 120 280, 210 250" />
        <path d="M250 640 C 300 610, 350 660, 420 630" />
      </g>
      <g fill="none" stroke="#3d4a38" strokeWidth="8" strokeLinecap="round" opacity="0.7">
        <path d="M20 660 C 120 640, 180 680, 280 650 S 390 640, 420 670" />
      </g>

      <g transform="rotate(-16 120 250)">
        <rect x="10" y="230" width="250" height="16" rx="4" fill="#2c3840" />
        <line x1="24" y1="238" x2="240" y2="238" stroke="#d9d3b0" strokeWidth="1.4" strokeDasharray="12 10" />
        <RunwayPlane unit={units.find((item) => item.id === 'plane-1')} />
      </g>
      <g transform="rotate(8 300 480)">
        <rect x="230" y="430" width="180" height="14" rx="4" fill="#2c3840" />
        <line x1="244" y1="437" x2="390" y2="437" stroke="#d9d3b0" strokeWidth="1.2" strokeDasharray="10 9" />
        <RunwayPlane unit={units.find((item) => item.id === 'plane-2')} />
      </g>

      <g opacity="0.55">
        {Array.from({ length: 6 }, (_, row) =>
          Array.from({ length: 9 }, (_, col) => (
            <rect key={`${row}-${col}`} x={28 + col * 9} y={40 + row * 16} width="5" height="9" rx="1" fill="#31404a" />
          )),
        )}
      </g>

      <path
        d="M120 210 C 150 150, 250 140, 280 210 C 310 250, 300 340, 250 390 L 236 500 L 150 508 L 132 390 C 90 330, 90 250, 120 210 Z"
        fill="#1e2a30"
        opacity="0.9"
      />

      <path
        d="M158 196
           C 158 150, 176 112, 196 112
           C 216 112, 234 150, 234 196
           L 246 280
           L 236 470
           L 214 548
           L 176 552
           L 156 470
           L 146 300 Z"
        fill="#465463"
        stroke="#93a3b2"
        strokeWidth="2.5"
      />
      <path d="M172 190 h48 v250 h-48 Z" fill="#3a4854" />
      <path d="M168 250 h58 M164 310 h66 M170 370 h54 M176 430 h46" stroke="#2c3842" strokeWidth="3" />

      <path
        d="M156 330 L 78 286 C 58 278, 52 300, 66 314 L 108 360 C 122 374, 146 368, 156 350 Z"
        fill="#4c5c6b"
        stroke="#9aabba"
        strokeWidth="2.5"
      />
      <path
        d="M230 360 L 328 348 C 350 346, 356 372, 338 384 L 268 430 C 250 442, 230 424, 230 400 Z"
        fill="#4c5c6b"
        stroke="#9aabba"
        strokeWidth="2.5"
      />
      <circle cx="196" cy="148" r="40" fill="#516274" stroke="#b9d4ee" strokeWidth="3" />

      <g stroke="#d5dde6" strokeWidth="3" strokeLinecap="round" opacity="0.8">
        <path d="M176 128 h-16 M216 128 h16 M166 156 h-14 M226 156 h14 M160 186 h-12 M232 188 h12" />
        <path d="M108 300 h-14 M96 324 h-12 M120 348 h-10" />
        <path d="M300 360 h16 M318 384 h14 M286 410 h12" />
      </g>

      <g>
        <rect x="292" y="486" width="84" height="34" rx="4" fill="url(#hatch)" stroke="#a7843e" strokeWidth="1.5" />
        <text x="334" y="507" textAnchor="middle" className="closed-label">
          D · CLOSED
        </text>
      </g>

      <g fill="none" stroke="#f0d48a" strokeWidth="10" strokeLinecap="round" strokeLinejoin="round" opacity="0.55">
        <polyline points={FLOW.map((point) => point.join(',')).join(' ')} />
      </g>
      <g fill="none" stroke="#f0d48a" strokeWidth="5" strokeLinecap="round" opacity="0.35">
        <polyline points={FLOW_B.map((point) => point.join(',')).join(' ')} />
        <polyline points={FLOW_C.map((point) => point.join(',')).join(' ')} />
      </g>

      <g>
        {CROWD.map((dot, index) => (
          <circle key={index} cx={dot.x} cy={dot.y} r={dot.r} fill={dot.color} />
        ))}
      </g>

      <Aircraft x={118} y={250} rot={-40} />
      <Aircraft x={70} y={360} rot={-20} />
      <Aircraft x={300} y={300} rot={30} />
      <Aircraft x={348} y={430} rot={18} />
      <Aircraft x={250} y={210} rot={-10} />

      <text x="198" y="652" textAnchor="middle" className="place-label">
        TSA North
      </text>
      <text x="196" y="96" textAnchor="middle" className="place-quiet">
        Concourse A
      </text>

      <Rescue unit={units.find((item) => item.id === 'fire')} path={FIRE_PATH} kind="fire" label="Send the fire truck" />
      <Rescue unit={units.find((item) => item.id === 'medic')} path={MEDIC_PATH} kind="medic" label="Send the ambulance" />
      <text x="58" y="642" textAnchor="middle" className="place-quiet">
        Rescue
      </text>

      <Badge x={196} y={148} letter="A" fill="#3c7dff" active={focus === 'A'} label="Center concourse A" />
      <Badge x={86} y={312} letter="B" fill="#8e99a8" active={focus === 'B'} label="Center concourse B" />
      <Badge x={314} y={402} letter="C" fill="#c084fc" active={focus === 'C'} label="Center concourse C" />

      <rect x="168" y="574" width="60" height="36" rx="8" fill="#2a2040" stroke="#c4a6f6" strokeWidth="2" />
    </>
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

function Aircraft({ x, y, rot }: { x: number; y: number; rot: number }) {
  return (
    <path
      transform={`translate(${x} ${y}) rotate(${rot})`}
      d="M0 -12 L1.6 -3 L12 -1 L1.6 1 L0 11 L-1.6 1 L-12 -1 L-1.6 -3 Z"
      fill="#e7eef5"
      opacity="0.78"
    />
  )
}
