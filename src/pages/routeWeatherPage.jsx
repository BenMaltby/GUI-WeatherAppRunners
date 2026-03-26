import { useState, useRef, useCallback, useEffect } from "react";
import {
  geocodeCity,
  getForecastByCoords,
  getAirQualityByCoords,
  weatherCodeToLabel,
  airQualityLabel,
  groundLabel,
  icyLabel,
  pollenLabel
} from "../services/openMeteo";
import LocationAutocompleteInput from "../components/LocationAutocompleteInput";
import { loadPresetLocations, parseLatLng } from "../services/locationSearch";
import "./routeWeatherPage.css";

// ── Helpers ───────────────────────────────────────────────────────────────────

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

// ── VerticalSlider ─ ───────────────────────────────────────────────────────────
function VerticalSlider({ points, activeIndex, onChange }) {
  const trackRef = useRef(null);
  const isDragging = useRef(false);
  const [dragPercent, setDragPercent] = useState(null);

  const percentForIndex = useCallback(
    (i) => (points.length < 2 ? 0 : i / (points.length - 1)),
    [points.length]
  );
  const snappedPercent = percentForIndex(activeIndex);
  const displayPercent = dragPercent !== null ? dragPercent : snappedPercent;

  const getNearestIndex = useCallback((pct) => {
    let nearest = 0, minDist = Infinity;
    points.forEach((_, i) => {
      const d = Math.abs(percentForIndex(i) - pct);
      if (d < minDist) { minDist = d; nearest = i; }
    });
    return nearest;
  }, [percentForIndex, points]);

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
function WeatherCard({ point, index, total, weather, loading, error }) {
  const [expanded, setExpanded] = useState(false);

  if (loading) {
    return (
      <div className="route-weather-card">
        <p>Loading weather for {point.name}…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="route-weather-card">
        <p>Could not load weather.</p>
        <p>{error}</p>
      </div>
    );
  }

  if (!weather) {
    return (
      <div className="route-weather-card">
        <p>No weather data available.</p>
      </div>
    );
  }

  return (
    <div className="route-weather-card">
      <div className="route-card-top-row">
        <p className="route-position">
          {point.isKeyStop ? <span className="key-stop-badge">📍 Key Stop</span> : "Waypoint"}{" "}
          · {point.name}
        </p>
        <p className="route-position-sub">
          Point {index + 1}/{total} · ~{point.distFromStart.toFixed(1)} km from start
        </p>
      </div>

      <div className="route-card-main">
        <span className={`route-icon ${weather.iconType}`}>{weather.icon}</span>
        <div>
          <p className="route-temp">{weather.temp}</p>
          <p className="route-condition">{weather.condition}</p>
        </div>
      </div>

      <div className="route-stats">
        <div className="route-stat"><span className="stat-label">💧 Humidity:</span><strong>{weather.humidity}</strong></div>
        <div className="route-stat"><span className="stat-label">💨 Wind Speed:</span><strong>{weather.wind}</strong></div>
        <div className="route-stat"><span className="stat-label">Ground:</span><strong>{weather.ground}</strong></div>
      </div>

      {expanded && (
        <div className="route-card-extra">
          <div className="extra-item"><span className="extra-label">Pollen</span><strong>{weather.pollen}</strong></div>
          <div className="extra-item"><span className="extra-label">Air Quality</span><strong>{weather.airQuality}</strong></div>
          <div className="extra-item"><span className="extra-label">Icyness</span><strong>{weather.icyness}</strong></div>
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
  const [activeWeather, setActiveWeather] = useState(null);
  const [weatherLoading, setWeatherLoading] = useState(false);
  const [weatherError, setWeatherError] = useState("");
  const [locations, setLocations] = useState([]);
  // keyStops: array of { id, resolved: {name,lat,lng}|null, error: string }
  const [keyStops, setKeyStops] = useState([
    { id: 1, query: "", resolved: null, error: "" }, // start
    { id: 2, query: "", resolved: null, error: "" }, // end
  ]);
  const [sliderPoints, setSliderPoints] = useState([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [totalKm, setTotalKm] = useState(null);
  const [searched, setSearched] = useState(false);
  const nextId = useRef(3);

  useEffect(() => { loadPresetLocations().then(setLocations); }, []);

  const updateStop = (id, updates) => {
    setKeyStops((prev) =>
      prev.map((stop) => (stop.id === id ? { ...stop, ...updates, error: "" } : stop))
    );
  };

  const addStop = () => {
    if (keyStops.length >= MAX_STOPS) return;
    const newStop = { id: nextId.current++, query: "", resolved: null, error: "" };
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
        setKeyStops((prev) =>
          prev.map((s, i) => (i === 0 ? { ...s, query: nearest.name, resolved: nearest, error: "" } : s))
        );
      }
    });
  };

  const handleSearch = async () => {
    const updated = await Promise.all(
      keyStops.map(async (stop) => {
        if (stop.resolved) {
          return { ...stop, error: "" };
        }

        const trimmed = stop.query.trim();
        if (!trimmed) {
          return { ...stop, error: "Please enter a location." };
        }

        const parsed = parseLatLng(trimmed);
        if (parsed) {
          return {
            ...stop,
            resolved: { name: trimmed, lat: parsed.lat, lng: parsed.lng },
            error: "",
          };
        }

        try {
          const resolved = await geocodeCity(trimmed);
          return {
            ...stop,
            query: resolved.name,
            resolved,
            error: "",
          };
        } catch {
          return { ...stop, error: "Please select a valid location." };
        }
      })
    );

    setKeyStops(updated);
    const valid = updated.every((stop) => stop.resolved);
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

  useEffect(() => {
    async function loadPointWeather() {
      if (!activePoint) return;

      try {
        setWeatherLoading(true);
        setWeatherError("");

        const [forecast, airData] = await Promise.all([
          getForecastByCoords(activePoint.lat, activePoint.lng),
          getAirQualityByCoords(activePoint.lat, activePoint.lng).catch(() => null)
        ]);

        const current = forecast.current;
        const meta = weatherCodeToLabel(current.weather_code);

        setActiveWeather({
          temp: current.temperature_2m == null ? "—" : `${Math.round(current.temperature_2m)}°C`,
          condition: meta.label,
          icon: meta.icon,
          iconType: meta.iconType,
          humidity: current.relative_humidity_2m == null ? "—" : `${Math.round(current.relative_humidity_2m)}%`,
          wind: current.wind_speed_10m == null ? "—" : `${Math.round(current.wind_speed_10m)} km/h`,
          ground: groundLabel(current.weather_code),
          pollen: pollenLabel(),
          airQuality: airQualityLabel(airData?.current?.european_aqi),
          icyness: icyLabel(current.temperature_2m)
        });
      } catch (err) {
        setWeatherError(err.message || "Failed to fetch route weather");
        setActiveWeather(null);
      } finally {
        setWeatherLoading(false);
      }
    }

    loadPointWeather();
  }, [activePoint]);

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
                    <LocationAutocompleteInput
                      label={isStart ? "Start Point" : isEnd ? "End Point" : `Stop ${idx}`}
                      resolvedLocation={stop.resolved}
                      query={stop.query}
                      onQueryChange={(query) => updateStop(stop.id, { query })}
                      onResolvedChange={(resolved) => updateStop(stop.id, { resolved })}
                      presetLocations={locations}
                      placeholder="City name or lat, lng"
                      error={stop.error}
                      showGeo={isStart}
                      onGeo={handleGeoForStart}
                      wrapperClassName="loc-input-block"
                      rowClassName="loc-input-row"
                      labelClassName="route-input-label"
                      inputClassName="route-input"
                      errorClassName="input-error-msg"
                      resolvedClassName="resolved-coords"
                      geoButtonClassName="geo-icon-btn"
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
              weather={activeWeather}
              loading={weatherLoading}
              error={weatherError}
            />
          ) : null}
        </div>

      </div>
    </div>
  );
}
