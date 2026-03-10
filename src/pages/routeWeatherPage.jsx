import { useState, useRef, useCallback, useEffect } from "react";
import "./RouteWeatherPage.css";

// ── Helpers ───────────────────────────────────────────────────────────────────

async function loadLocations() {
  try {
    const raw = await fetch("/england_locations.csv").then((r) => r.text());
    const lines = raw.trim().split("\n").slice(1);
    return lines.map((line) => {
      const parts = line.split(",");
      const lat = parseFloat(parts[parts.length - 2]);
      const lng = parseFloat(parts[parts.length - 1]);
      const name = parts.slice(0, parts.length - 2).join(",").trim();
      return { name, lat, lng };
    }).filter((l) => l.name && !isNaN(l.lat) && !isNaN(l.lng));
  } catch {
    return [];
  }
}

// Haversine distance in km
function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Interpolate lat/lng along a segment by fraction t
function interpolate(lat1, lng1, lat2, lng2, t) {
  return { lat: lat1 + (lat2 - lat1) * t, lng: lng1 + (lng2 - lng1) * t };
}

// Parse "lat, lng" string — returns { lat, lng } or null
function parseLatLng(str) {
  const m = str.match(/^(-?\d+\.?\d*)\s*,\s*(-?\d+\.?\d*)$/);
  if (!m) return null;
  const lat = parseFloat(m[1]);
  const lng = parseFloat(m[2]);
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}

// Mock weather generator (deterministic-ish from lat/lng)
const CONDITIONS = [
  { condition: "Sunny",  icon: "☀️",  iconType: "sunny"  },
  { condition: "Cloudy", icon: "☁️",  iconType: "cloudy" },
  { condition: "Rainy",  icon: "🌧️", iconType: "rainy"  },
  { condition: "Windy",  icon: "💨",  iconType: "windy"  },
  { condition: "Clear",  icon: "🌤️", iconType: "clear"  },
];
function mockWeather(lat, lng) {
  const seed = Math.abs(Math.round((lat * 100 + lng * 37) % CONDITIONS.length));
  const c = CONDITIONS[Math.abs(seed) % CONDITIONS.length];
  const temp = Math.round(5 + Math.abs((lat * 7 + lng * 3) % 15));
  const humidity = Math.round(40 + Math.abs((lat * 11 + lng * 7) % 50));
  const wind = Math.round(5 + Math.abs((lat * 5 + lng * 9) % 30));
  const grounds = ["Dry", "Damp", "Wet"];
  const ground = grounds[Math.abs(Math.round(lat + lng)) % 3];
  const pollens = ["Low", "Medium", "High"];
  const pollen = pollens[Math.abs(Math.round(lat * 2)) % 3];
  const aqList = ["Good", "Moderate", "Poor"];
  const airQuality = aqList[Math.abs(Math.round(lng * 2)) % 3];
  const icyList = ["None", "None", "None", "Icy"];
  const icyness = icyList[Math.abs(Math.round(lat + lng * 3)) % 4];
  return { ...c, temp: `${temp}°C`, humidity: `${humidity}%`, wind: `${wind} km/h`, ground, pollen, airQuality, icyness };
}

// Build the full list of slider points from key stops.
// Rules per segment:
//   - segKm < 2km  -> no waypoints
//   - Otherwise    -> up to MAX_WAYPOINTS_PER_SEG evenly-spaced interior points,
//                     reducing count until spacing >= MIN_WAYPOINT_SPACING_KM
// Examples: 5km->1wp, 10km->4wp, 30km->4wp, 120km->4wp
const MAX_WAYPOINTS_PER_SEG = 4;
const MIN_WAYPOINT_SPACING_KM = 2;

function buildSliderPoints(keyStops) {
  if (keyStops.length < 2) return [];
  const points = [];
  let cumDist = 0;

  for (let s = 0; s < keyStops.length - 1; s++) {
    const from = keyStops[s];
    const to   = keyStops[s + 1];
    const segKm = haversineKm(from.lat, from.lng, to.lat, to.lng);

    // Push the "from" key stop only once (first segment)
    if (s === 0) {
      points.push({ ...from, isKeyStop: true, distFromStart: 0 });
    }

    // Find the largest waypointCount where spacing >= MIN and segKm >= MIN
    let waypointCount = 0;
    if (segKm >= MIN_WAYPOINT_SPACING_KM) {
      for (let n = MAX_WAYPOINTS_PER_SEG; n >= 1; n--) {
        const spacing = segKm / (n + 1);
        if (spacing >= MIN_WAYPOINT_SPACING_KM) {
          waypointCount = n;
          break;
        }
      }
    }

    // Insert interior waypoints
    for (let w = 1; w <= waypointCount; w++) {
      const t = w / (waypointCount + 1);
      const pos = interpolate(from.lat, from.lng, to.lat, to.lng, t);
      const wDist = cumDist + segKm * t;
      points.push({
        name: `~${Math.round(wDist)} km`,
        lat: pos.lat,
        lng: pos.lng,
        isKeyStop: false,
        distFromStart: wDist,
      });
    }

    // Push the "to" key stop
    cumDist += segKm;
    points.push({
      ...to,
      isKeyStop: true,
      distFromStart: cumDist,
    });
  }

  return points;
}

// Total route distance in km
function totalRouteKm(keyStops) {
  let d = 0;
  for (let i = 0; i < keyStops.length - 1; i++) {
    d += haversineKm(keyStops[i].lat, keyStops[i].lng, keyStops[i + 1].lat, keyStops[i + 1].lng);
  }
  return d;
}

// ── LocationInput ─────────────────────────────────────────────────────────────
function LocationInput({ label, value, onChange, locations, placeholder, error, onGeo, showGeo }) {
  const [inputVal, setInputVal] = useState(value?.name ?? "");
  const [suggestions, setSuggestions] = useState([]);
  const [showDrop, setShowDrop] = useState(false);
  const inputRef = useRef(null);
  const dropRef = useRef(null);

  // Sync if parent resets (geo)
  useEffect(() => {
    setInputVal(value?.name ?? "");
  }, [value]);

  useEffect(() => {
    const handler = (e) => {
      if (dropRef.current && !dropRef.current.contains(e.target) &&
          inputRef.current && !inputRef.current.contains(e.target)) {
        setShowDrop(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleChange = (e) => {
    const v = e.target.value;
    setInputVal(v);
    onChange(null); // clear resolved location

    // Try lat,lng parse first
    const parsed = parseLatLng(v);
    if (parsed) {
      onChange({ name: v, lat: parsed.lat, lng: parsed.lng });
      setSuggestions([]);
      setShowDrop(false);
      return;
    }

    if (v.trim().length < 2) { setSuggestions([]); setShowDrop(false); return; }
    const lower = v.toLowerCase();
    const matches = locations.filter(l => l.name.toLowerCase().startsWith(lower)).slice(0, 8);
    setSuggestions(matches);
    setShowDrop(matches.length > 0);
  };

  const handleSelect = (loc) => {
    setInputVal(loc.name);
    onChange(loc);
    setSuggestions([]);
    setShowDrop(false);
  };

  return (
    <div className="loc-input-block">
      <label className="route-input-label">{label}</label>
      <div className="loc-input-row">
        <div className="autocomplete-container">
          <input
            ref={inputRef}
            className={`route-input${error ? " input-error" : ""}`}
            placeholder={placeholder}
            value={inputVal}
            onChange={handleChange}
            onFocus={() => suggestions.length > 0 && setShowDrop(true)}
            onKeyDown={e => e.key === "Escape" && setShowDrop(false)}
            autoComplete="off"
          />
          {showDrop && (
            <ul className="suggestions-dropdown" ref={dropRef}>
              {suggestions.map((loc, i) => (
                <li key={i} className="suggestion-item" onMouseDown={() => handleSelect(loc)}>
                  <span className="suggestion-name">{loc.name}</span>
                  <span className="suggestion-coords">{loc.lat.toFixed(3)}, {loc.lng.toFixed(3)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        {showGeo && (
          <button className="geo-icon-btn" onClick={onGeo} title="Use my location">📍</button>
        )}
      </div>
      {error && <p className="input-error-msg">{error}</p>}
      {value && <p className="resolved-coords">{value.lat.toFixed(4)}, {value.lng.toFixed(4)}</p>}
    </div>
  );
}

// ── VerticalSlider ────────────────────────────────────────────────────────────
function VerticalSlider({ points, activeIndex, onChange }) {
  const trackRef = useRef(null);
  const isDragging = useRef(false);
  const [dragPercent, setDragPercent] = useState(null);

  const percentForIndex = (i) => (points.length < 2 ? 0 : i / (points.length - 1));
  const snappedPercent = percentForIndex(activeIndex);
  const displayPercent = dragPercent !== null ? dragPercent : snappedPercent;

  const getNearestIndex = useCallback((pct) => {
    let nearest = 0, minDist = Infinity;
    points.forEach((_, i) => {
      const d = Math.abs(percentForIndex(i) - pct);
      if (d < minDist) { minDist = d; nearest = i; }
    });
    return nearest;
  }, [points]);

  const pctFromEvent = useCallback((clientY) => {
    const rect = trackRef.current.getBoundingClientRect();
    return Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));
  }, []);

  const onPointerDown = useCallback((e) => {
    e.preventDefault();
    isDragging.current = true;
    trackRef.current.setPointerCapture(e.pointerId);
    const pct = pctFromEvent(e.clientY);
    setDragPercent(pct);
    onChange(getNearestIndex(pct));
  }, [pctFromEvent, getNearestIndex, onChange]);

  const onPointerMove = useCallback((e) => {
    if (!isDragging.current) return;
    const pct = pctFromEvent(e.clientY);
    setDragPercent(pct);
    onChange(getNearestIndex(pct));
  }, [pctFromEvent, getNearestIndex, onChange]);

  const onPointerUp = useCallback((e) => {
    if (!isDragging.current) return;
    isDragging.current = false;
    const pct = pctFromEvent(e.clientY);
    onChange(getNearestIndex(pct));
    setDragPercent(null);
  }, [pctFromEvent, getNearestIndex, onChange]);

  return (
    <div
      ref={trackRef}
      className="slider-track"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <div className="slider-rail-white" />
      <div className="slider-rail-black" style={{ height: `${displayPercent * 100}%` }} />

      {points.map((pt, i) => {
        const pct = percentForIndex(i);
        const isPassed = pct < displayPercent - 0.005;
        const isActive = i === activeIndex && dragPercent === null;
        return (
          <div
            key={i}
            className={`snap-marker${pt.isKeyStop ? " key-stop" : ""}${isPassed ? " passed" : ""}${isActive ? " active" : ""}`}
            style={{ top: `${pct * 100}%` }}
            title={pt.name}
          />
        );
      })}

      <div className="slider-handle" style={{ top: `${displayPercent * 100}%` }} />
    </div>
  );
}

// ── WeatherCard ───────────────────────────────────────────────────────────────
function WeatherCard({ point, index, total }) {
  const [expanded, setExpanded] = useState(false);
  const w = mockWeather(point.lat, point.lng);

  return (
    <div className="route-weather-card">
      <div className="route-card-top-row">
        <p className="route-position">
          {point.isKeyStop ? <span className="key-stop-badge">📍 Key Stop</span> : "Waypoint"}{" "}
          · {point.name}
        </p>
        <p className="route-position-sub">Point {index + 1}/{total} · ~{point.distFromStart.toFixed(1)} km from start</p>
      </div>

      <div className="route-card-main">
        <span className={`route-icon ${w.iconType}`}>{w.icon}</span>
        <div>
          <p className="route-temp">{w.temp}</p>
          <p className="route-condition">{w.condition}</p>
        </div>
      </div>

      <div className="route-stats">
        <div className="route-stat"><span className="stat-label">💧 Humidity:</span><strong>{w.humidity}</strong></div>
        <div className="route-stat"><span className="stat-label">💨 Wind Speed:</span><strong>{w.wind}</strong></div>
        <div className="route-stat"><span className="stat-label">Ground:</span><strong>{w.ground}</strong></div>
      </div>

      {expanded && (
        <div className="route-card-extra">
          <div className="extra-item"><span className="extra-label">Pollen</span><strong>{w.pollen}</strong></div>
          <div className="extra-item"><span className="extra-label">Air Quality</span><strong>{w.airQuality}</strong></div>
          <div className="extra-item"><span className="extra-label">Icyness</span><strong>{w.icyness}</strong></div>
        </div>
      )}

      <button className="route-more-btn" onClick={() => setExpanded(!expanded)}>
        {expanded ? "Less ▲" : "More ▼"}
      </button>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
const MAX_STOPS = 5; // start + end + 3 middle

export default function RouteWeatherPage({ onNavigateToWeather }) {
  const [locations, setLocations] = useState([]);
  // keyStops: array of { id, resolved: {name,lat,lng}|null, error: string }
  const [keyStops, setKeyStops] = useState([
    { id: 1, resolved: null, error: "" }, // start
    { id: 2, resolved: null, error: "" }, // end
  ]);
  const [sliderPoints, setSliderPoints] = useState([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [totalKm, setTotalKm] = useState(null);
  const [searched, setSearched] = useState(false);
  const nextId = useRef(3);

  useEffect(() => { loadLocations().then(setLocations); }, []);

  const updateStop = (id, resolved) => {
    setKeyStops(prev => prev.map(s => s.id === id ? { ...s, resolved, error: "" } : s));
  };

  const addStop = () => {
    if (keyStops.length >= MAX_STOPS) return;
    const newStop = { id: nextId.current++, resolved: null, error: "" };
    setKeyStops(prev => {
      const copy = [...prev];
      copy.splice(copy.length - 1, 0, newStop); // insert before end
      return copy;
    });
  };

  const removeStop = (id) => {
    setKeyStops(prev => prev.filter(s => s.id !== id));
  };

  const handleGeoForStart = () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition((pos) => {
      const { latitude: lat, longitude: lng } = pos.coords;
      let nearest = null, minDist = Infinity;
      locations.forEach(loc => {
        const d = haversineKm(lat, lng, loc.lat, loc.lng);
        if (d < minDist) { minDist = d; nearest = loc; }
      });
      if (nearest) {
        setKeyStops(prev => prev.map((s, i) => i === 0 ? { ...s, resolved: nearest, error: "" } : s));
      }
    });
  };

  const handleSearch = () => {
    // Validate all stops resolved
    let valid = true;
    const updated = keyStops.map(s => {
      if (!s.resolved) { valid = false; return { ...s, error: "Please select a valid location." }; }
      return { ...s, error: "" };
    });
    setKeyStops(updated);
    if (!valid) return;

    const resolvedStops = updated.map(s => s.resolved);
    const pts = buildSliderPoints(resolvedStops);
    setSliderPoints(pts);
    setTotalKm(totalRouteKm(resolvedStops));
    setActiveIndex(0);
    setSearched(true);
  };

  const handleIndexChange = useCallback((i) => setActiveIndex(i), []);

  const canAddStop = keyStops.length < MAX_STOPS;
  const activePoint = sliderPoints[activeIndex] ?? null;

  return (
    <div className="route-page">
      <nav className="route-top-nav">
        <button className="route-nav-btn" onClick={onNavigateToWeather}>← Weather Finder</button>
      </nav>

      <div className="route-outer-layout">

        {/* ── LEFT: Route Builder ── */}
        <div className="route-builder-panel">
          <h2>Route Weather Finder</h2>

          <div className="stops-list">
            {keyStops.map((stop, idx) => {
              const isStart = idx === 0;
              const isEnd = idx === keyStops.length - 1;
              const isMiddle = !isStart && !isEnd;
              return (
                <div key={stop.id} className="stop-row">
                  <div className={`stop-dot ${isStart ? "start-dot" : isEnd ? "end-dot" : "mid-dot"}`}>
                    {isStart ? "S" : isEnd ? "E" : idx}
                  </div>
                  <div className="stop-input-area">
                    <LocationInput
                      label={isStart ? "Start Point" : isEnd ? "End Point" : `Stop ${idx}`}
                      value={stop.resolved}
                      onChange={(loc) => updateStop(stop.id, loc)}
                      locations={locations}
                      placeholder="City name or lat, lng"
                      error={stop.error}
                      showGeo={isStart}
                      onGeo={handleGeoForStart}
                    />
                  </div>
                  {isMiddle && (
                    <button className="remove-stop-btn" onClick={() => removeStop(stop.id)} title="Remove stop">✕</button>
                  )}
                </div>
              );
            })}
          </div>

          {canAddStop && (
            <button className="add-stop-btn" onClick={addStop}>
              + Add Stop
            </button>
          )}

          <button className="get-route-btn" onClick={handleSearch}>
            Get Route Weather
          </button>

          {searched && totalKm !== null && (
            <div className="distance-badge">
              🗺️ Approx. route distance: <strong>{totalKm.toFixed(1)} km</strong>
            </div>
          )}
        </div>

        {/* ── MIDDLE: Slider ── */}
        {searched && sliderPoints.length > 0 && (
          <div className="route-slider-panel">
            <h3>Route</h3>
            <p className="slider-point-count">{sliderPoints.length} points</p>

            <div className="slider-col-inner">
              <div className="route-pin">
                <div className="pin-icon">📍</div>
                <span className="pin-label">{keyStops[0].resolved?.name}</span>
              </div>

              <VerticalSlider
                points={sliderPoints}
                activeIndex={activeIndex}
                onChange={handleIndexChange}
              />

              <div className="route-pin">
                <div className="pin-icon">📍</div>
                <span className="pin-label">{keyStops[keyStops.length - 1].resolved?.name}</span>
              </div>
            </div>

            {/* Legend */}
            <div className="slider-legend">
              <span className="legend-key"><span className="legend-dot key-dot" /> Key stop</span>
              <span className="legend-key"><span className="legend-dot way-dot" /> Waypoint</span>
            </div>
          </div>
        )}

        {/* ── RIGHT: Weather Card ── */}
        <div className="route-results-panel">
          <h2>Route Weather Results</h2>

          {!searched ? (
            <div className="route-empty-state">
              <span className="empty-cloud">☁</span>
              <p>Build your route and click Get Route Weather</p>
            </div>
          ) : activePoint ? (
            <WeatherCard
              point={activePoint}
              index={activeIndex}
              total={sliderPoints.length}
            />
          ) : null}
        </div>

      </div>
    </div>
  );
}