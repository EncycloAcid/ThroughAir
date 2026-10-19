import type { FocusId, Level, Mode, Tab } from './chrome-types'

const STOPS = [
  { id: 'restroom', label: 'Restroom', minutes: 3 },
  { id: 'coffee', label: 'Coffee', minutes: 6 },
  { id: 'food', label: 'Food', minutes: 10 },
  { id: 'bar', label: 'Bar', minutes: 8 },
] as const

export type StopId = (typeof STOPS)[number]['id']

const FLIGHTS: Array<{ code: string; city: string; gate: string; when: string; mode: Mode; party: string }> = [
  { code: 'UA 412', city: 'Newark', gate: 'A3', when: 'Boards 5:23 AM', mode: 'depart', party: 'Maya Chen' },
  { code: 'DL 1882', city: 'Atlanta', gate: 'B12', when: 'Boards 5:52 AM', mode: 'depart', party: 'Owen Brooks' },
  { code: 'AA 2104', city: 'Dallas', gate: 'C7', when: 'Boards 6:05 AM', mode: 'depart', party: 'Priya Nair' },
  { code: 'B6 441', city: 'Boston', gate: 'A6', when: 'Curb by 6:10 AM', mode: 'arrive', party: 'Chris Adelayo' },
  { code: 'F9 1502', city: 'Denver connection', gate: 'C2', when: 'Closes 6:20 AM', mode: 'connect', party: 'Hannah Ivers' },
]

export function MapChrome({
  level,
  focus,
  mode,
  tab,
  query,
  stops,
  sheetOpen,
  layersOpen,
  cardOpen,
  walking,
  onQuery,
  onLevel,
  onFocus,
  onLocate,
  onMode,
  onTab,
  onToggleStop,
  onToggleSheet,
  onToggleLayers,
  onCloseCard,
  onGo,
}: {
  level: Level
  focus: FocusId
  mode: Mode
  tab: Tab
  query: string
  stops: StopId[]
  sheetOpen: boolean
  layersOpen: boolean
  cardOpen: boolean
  walking: boolean
  onQuery: (value: string) => void
  onLevel: (level: Level) => void
  onFocus: (focus: FocusId) => void
  onLocate: () => void
  onMode: (mode: Mode) => void
  onTab: (tab: Tab) => void
  onToggleStop: (id: StopId) => void
  onToggleSheet: () => void
  onToggleLayers: () => void
  onCloseCard: () => void
  onGo: () => void
}) {
  const extra = stops.reduce((sum, id) => sum + (STOPS.find((stop) => stop.id === id)?.minutes ?? 0), 0)
  const baseMinutes = mode === 'depart' ? 9 : mode === 'arrive' ? 8 : 6
  const meters = mode === 'depart' ? 650 : mode === 'arrive' ? 590 : 410
  const minutes = baseMinutes + extra
  const arrive = formatClock((mode === 'depart' ? 5 * 60 + 14 : mode === 'arrive' ? 5 * 60 + 40 : 5 * 60 + 50) + minutes)
  const via =
    mode === 'depart'
      ? 'Concourse A, Main terminal and Food court'
      : mode === 'arrive'
        ? 'Main terminal, Baggage claim and Arrivals curb'
        : 'Food court and Concourse C'
  const from = mode === 'depart' ? 'TSA North checkpoint' : mode === 'arrive' ? 'Concourse A' : 'Concourse A'
  const flights = FLIGHTS.filter((flight) => flight.mode === mode && matches(flight, query))

  return (
    <>
      <form className="search" role="search" onSubmit={(event) => event.preventDefault()}>
        <SearchIcon />
        <input
          value={query}
          onChange={(event) => onQuery(event.target.value)}
          placeholder="Search Cleveland Hopkins"
          aria-label="Search Cleveland Hopkins"
        />
      </form>

      <div className="scale" aria-hidden="true">
        <span />
        250 m
      </div>

      <div className="rail">
        <div className="level-toggle" role="group" aria-label="Terminal level">
          <button type="button" className={level === 'U' ? 'on' : ''} aria-pressed={level === 'U'} onClick={() => onLevel('U')}>
            U
          </button>
          <button type="button" className={level === 'L' ? 'on' : ''} aria-pressed={level === 'L'} onClick={() => onLevel('L')}>
            L
          </button>
        </div>
        <button type="button" className="rail-btn" aria-label="Recenter map" onClick={onLocate}>
          <LocateIcon />
        </button>
        <button type="button" className={`rail-btn ${layersOpen ? 'on' : ''}`} aria-label="Map layers" aria-expanded={layersOpen} onClick={onToggleLayers}>
          <LayersIcon />
        </button>
        <button type="button" className="rail-btn" aria-label={sheetOpen ? 'Hide the trip card' : 'Show the trip card'} onClick={onToggleSheet}>
          <ExpandIcon />
        </button>
        {(['A', 'B', 'C'] as const).map((id) => (
          <button
            key={id}
            type="button"
            className={`pier pier-${id} ${focus === id ? 'on' : ''}`}
            aria-label={`Show concourse ${id}`}
            onClick={() => onFocus(focus === id ? 'all' : id)}
          >
            {id}
          </button>
        ))}
      </div>

      {layersOpen && (
        <div className="layers" role="note">
          Tap a plane to send it off the runway. Tap the fire truck or ambulance to send rescue.
        </div>
      )}

      {sheetOpen && (
        <section className="sheet" aria-label="Trip">
          <div className="grabber" />
          <div className="sheet-head">
            <button type="button" className="airport" aria-label="Cleveland Hopkins">
              <strong>CLE</strong>
              <em>Cleveland</em>
              <CaretIcon />
            </button>
            <div className="modes" role="group" aria-label="Trip type">
              {(['depart', 'arrive', 'connect'] as const).map((item) => (
                <button key={item} type="button" className={mode === item ? 'on' : ''} aria-pressed={mode === item} onClick={() => onMode(item)}>
                  {item === 'depart' ? 'Depart' : item === 'arrive' ? 'Arrive' : 'Connect'}
                </button>
              ))}
            </div>
          </div>
          <div className="tabs" role="tablist">
            {(
              [
                ['directions', 'Directions'],
                ['passtime', 'Pass Time'],
                ['airlines', 'Airlines'],
              ] as const
            ).map(([id, label]) => (
              <button key={id} type="button" role="tab" aria-selected={tab === id} className={tab === id ? 'on' : ''} onClick={() => onTab(id)}>
                {label}
              </button>
            ))}
          </div>

          {tab === 'directions' && cardOpen && (
            <article className="trip-card">
              <div className="minutes">
                <strong>{minutes}</strong>
                <span>min</span>
              </div>
              <div className="trip-copy">
                <p className="meters">{meters} m walk</p>
                <p>
                  Arrive {arrive} via {via}
                </p>
              </div>
              <button type="button" className="dismiss" aria-label="Close directions" onClick={onCloseCard}>
                <CloseIcon />
              </button>
              <button type="button" className="go" onClick={onGo} disabled={walking}>
                <WalkIcon />
                {walking ? 'Walking' : 'Go'}
              </button>
            </article>
          )}

          {tab === 'directions' && !cardOpen && <p className="empty-card">Pick a direction from Airlines.</p>}

          {tab === 'passtime' && (
            <ul className="pass-list">
              {STOPS.map((stop) => {
                const on = stops.includes(stop.id)
                return (
                  <li key={stop.id}>
                    <button type="button" aria-pressed={on} onClick={() => onToggleStop(stop.id)}>
                      <span className={`amenity-icon ${stop.id}`}>
                        <AmenityIcon kind={stop.id} />
                      </span>
                      <span>
                        <strong>{stop.label}</strong>
                        <em>+{stop.minutes} min</em>
                      </span>
                      <span className="add">{on ? 'Added' : 'Add'}</span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}

          {tab === 'airlines' && (
            <ul className="airlines">
              {flights.length === 0 && <li className="empty-card">No flights match.</li>}
              {flights.map((flight) => (
                <li key={flight.code}>
                  <button type="button" onClick={() => onTab('directions')}>
                    <span className="code">{flight.code}</span>
                    <span>{flight.city}</span>
                    <b>{flight.gate}</b>
                    <span>{flight.when}</span>
                    <span className="party">{flight.party}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {tab === 'directions' && (
            <>
              <div className="amenity-row">
                {STOPS.map((stop) => (
                  <button
                    key={stop.id}
                    type="button"
                    className={`amenity ${stop.id} ${stops.includes(stop.id) ? 'on' : ''}`}
                    aria-pressed={stops.includes(stop.id)}
                    onClick={() => onToggleStop(stop.id)}
                  >
                    <AmenityIcon kind={stop.id} />
                    {stop.label}
                  </button>
                ))}
              </div>
              <p className="from-line">
                <i />
                From {from}
              </p>
            </>
          )}
        </section>
      )}
    </>
  )
}

function matches(flight: { code: string; city: string; gate: string; party: string }, query: string) {
  const q = query.trim().toLowerCase()
  if (!q) return true
  return `${flight.code} ${flight.city} ${flight.gate} ${flight.party}`.toLowerCase().includes(q)
}

function formatClock(mins: number) {
  const day = ((mins % (24 * 60)) + 24 * 60) % (24 * 60)
  let h = Math.floor(day / 60)
  const m = day % 60
  const ap = h >= 12 ? 'PM' : 'AM'
  h = h % 12 || 12
  return `${h}:${m.toString().padStart(2, '0')} ${ap}`
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="11" cy="11" r="6.25" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M16 16.5 20 20.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

function LocateIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 3.5 14.2 10 20.5 12 14.2 14 12 20.5 9.8 14 3.5 12 9.8 10 12 3.5Z" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
    </svg>
  )
}

function LayersIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 4.2 20 8.2 12 12.2 4 8.2 12 4.2Z" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      <path d="m4 12 8 4 8-4M4 15.4l8 4 8-4" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
    </svg>
  )
}

function ExpandIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M9 4H4v5M15 4h5v5M9 20H4v-5M15 20h5v-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}

function CaretIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="m7 10 5 5 5-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="m7 7 10 10M17 7 7 17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

function WalkIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="15" cy="4.2" r="1.7" fill="currentColor" />
      <path d="m8 21 3.1-6.1 2.2 2 1.4 4M11.1 15 8.4 12.2l2.2-3.3 3.4 1.6 2.5-1" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function AmenityIcon({ kind }: { kind: StopId }) {
  if (kind === 'restroom') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="8" cy="5" r="1.5" fill="currentColor" />
        <circle cx="16" cy="5" r="1.5" fill="currentColor" />
        <path d="M6.2 21V11h3.6V21M14.2 21V11h3.6V21M8 11V8.2M16 11V8.2" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    )
  }
  if (kind === 'coffee') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M6 9h9v6.2a3.6 3.6 0 0 1-3.6 3.6H9.2A3.6 3.6 0 0 1 5.6 15V9H6Z" fill="none" stroke="currentColor" strokeWidth="1.6" />
        <path d="M15 11h2.1a2.2 2.2 0 0 1 0 4.4H15M8 6.2c.4-.8.4-1.4 0-2.2M11 6.2c.4-.8.4-1.4 0-2.2" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    )
  }
  if (kind === 'food') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M8 3.5v7M6 3.5v7M10 3.5v7M8 10.5V21M16 3.5c1.6 2 2.4 3.8 2.4 6.2S17.2 14 16 14v7" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    )
  }
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M8 4.2c2.4 0 3.8 1.5 3.8 4.4S10.2 20 8 20s-3.8-2.8-3.8-11.4S5.6 4.2 8 4.2Z" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d="M12 12h6.2L17 20h-5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  )
}
