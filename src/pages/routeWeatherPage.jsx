import { useState, useRef, useCallback, useEffect } from "react";
import {
  geocodeCity,
  getForecastByCoords,
  getAirQualityByCoords,
  getCurrentPollenValue,
  getHourlyPollenValue,
  weatherCodeToLabel,
  airQualityLabel,
  groundLabel,
  icyLabel,
  pollenLabel
} from "../services/openMeteo";
import LocationAutocompleteInput from "../components/LocationAutocompleteInput";
import { loadPresetLocations, parseLatLng } from "../services/locationSearch";
import {
  createRunningProfile,
  buildRunningScoreForProfile
} from "../services/runningScore";
import "./routeWeatherPage.css";

// Formats a Date into the HH:MM format expected by the time input.
function formatTimeInputValue(date) {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

// Builds the next departure Date from the chosen time input.
// If the selected time has already passed today, it moves it to tomorrow.
function buildNextDepartureDateTime(timeValue) {
  const [hoursText = "0", minutesText = "0"] = String(timeValue ?? "").split(":");
  const hours = Number.parseInt(hoursText, 10);
  const minutes = Number.parseInt(minutesText, 10);
  const now = new Date();

  if (Number.isNaN(hours) || Number.isNaN(minutes)) {
    return now;
  }

  const departure = new Date(now);
  departure.setHours(hours, minutes, 0, 0);

  if (departure.getTime() < now.getTime()) {
    departure.setDate(departure.getDate() + 1);
  }

  return departure;
}

// Finds the hourly forecast entry closest to the user's departure time.
function getClosestHourlyIndex(hourlyTimes, targetDate) {
  if (!hourlyTimes?.length) {
    return -1;
  }

  let nearestIndex = 0;
  let nearestDiff = Infinity;

  hourlyTimes.forEach((time, index) => {
    const forecastDate = new Date(time);
    const diff = Math.abs(forecastDate.getTime() - targetDate.getTime());

    if (diff < nearestDiff) {
      nearestDiff = diff;
      nearestIndex = index;
    }
  });

  return nearestIndex;
}

// Used for showing readable forecast/departure labels in the route card.
function formatForecastMoment(value) {
  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
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

// Works out a point part-way along a route segment.
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

// Builds the list of points used by the route slider, including extra
// waypoints between the main stops so the user can inspect weather along
// the route instead of only at the start and end.
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

// Creates a set of hourly running profiles which are then used as a reference
// when calculating the score for the selected route point.
function buildRouteReferenceProfiles(forecast, airData) {
  const hourly = forecast?.hourly;
  if (!hourly?.time?.length) {
    return [];
  }

  return hourly.time.slice(0, 24).map((_, index) =>
    createRunningProfile({
      id: `hour-${index}`,
      temp: hourly.temperature_2m?.[index] ?? null,
      humidity: hourly.relative_humidity_2m?.[index] ?? null,
      wind: hourly.wind_speed_10m?.[index] ?? null,
      aqi: airData?.hourly?.european_aqi?.[index] ?? airData?.current?.european_aqi ?? null,
      weatherCode: hourly.weather_code?.[index] ?? null,
      peakPollen: getHourlyPollenValue(airData, index),
    })
  );
}

// Custom vertical slider for moving through route points and waypoints.
function VerticalSlider({ points, activeIndex, onChange }) {
  const trackRef = useRef(null);
  const isDragging = useRef(false);
  const [dragPercent, setDragPercent] = useState(null);

  // Converts the selected point index into a percentage position on the slider.
  const percentForIndex = useCallback(
    (i) => (points.length < 2 ? 0 : i / (points.length - 1)),
    [points.length]
  );
  const snappedPercent = percentForIndex(activeIndex);
  const displayPercent = dragPercent !== null ? dragPercent : snappedPercent;

  // Finds the nearest real point to wherever the user dragged the handle.
  const getNearestIndex = useCallback((pct) => {
    let nearest = 0, minDist = Infinity;
    points.forEach((_, i) => {
      const d = Math.abs(percentForIndex(i) - pct);
      if (d < minDist) { minDist = d; nearest = i; }
    });
    return nearest;
  }, [percentForIndex, points]);

  // Converts pointer position into a 0-1 slider percentage.
  const pctFromEvent = useCallback((clientY) => {
    const rect = trackRef.current.getBoundingClientRect();
    return Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));
  }, []);

  // Pointer handlers let the slider work smoothly on mouse and touch.
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

// Shows the weather for the currently selected point on the route.
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
        <div className="route-card-header">
          <div>
            <p className="route-position">
              {point.isKeyStop ? <span className="key-stop-badge">📍 Key Stop</span> : "Waypoint"}{" "}
              · {point.name}
            </p>
            <p className="route-position-sub">
              Point {index + 1}/{total} · ~{point.distFromStart.toFixed(1)} km from start
            </p>
            {weather.forecastTimeLabel && (
              <p className="route-forecast-sub">
                Depart at {weather.departAtLabel} · Forecast used {weather.forecastTimeLabel}
              </p>
            )}
          </div>

          <div className="route-running-score">
            <span className="route-running-score-label">Running Score</span>
            <strong className="route-running-score-value">{weather.runningScore}</strong>
          </div>
        </div>
      </div>

      <div className="route-card-main">
        <span className={`route-icon ${weather.iconType}`}>{weather.icon}</span>
        <div>
          <div className="route-temp-row">
            <p className="route-temp">{weather.temp}</p>
            {weather.feelsLike && <p className="route-feels-like">{weather.feelsLike}</p>}
          </div>
          <p className="route-condition">{weather.condition}</p>
        </div>
      </div>

      {expanded && (
        <div className="route-card-extra">
          <div className="extra-item"><span className="extra-label">Humidity</span><strong>{weather.humidity}</strong></div>
          <div className="extra-item"><span className="extra-label">Wind Speed</span><strong>{weather.wind}</strong></div>
          <div className="extra-item"><span className="extra-label">Ground</span><strong>{weather.ground}</strong></div>
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

const MAX_STOPS = 5; // start + end + 3 middle

// Main page for building a route and checking weather at points along it.
export default function RouteWeatherPage({ onNavigateToWeather }) {
  // Stores the route setup, the currently selected point, and the weather
  // information shown in the results panel.
  const [activeWeather, setActiveWeather] = useState(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [weatherLoading, setWeatherLoading] = useState(false);
  const [weatherError, setWeatherError] = useState("");
  const [departureTime, setDepartureTime] = useState(() => formatTimeInputValue(new Date()));
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

  // Loads the preset CSV locations for all the route autocomplete inputs.
  useEffect(() => { loadPresetLocations().then(setLocations); }, []);

  // Updates just one stop without replacing the whole route manually each time.
  const updateStop = (id, updates) => {
    setKeyStops((prev) =>
      prev.map((stop) => (stop.id === id ? { ...stop, ...updates, error: "" } : stop))
    );
  };

  // Inserts a new middle stop just before the end point.
  const addStop = () => {
    if (keyStops.length >= MAX_STOPS) return;
    const newStop = { id: nextId.current++, query: "", resolved: null, error: "" };
    setKeyStops(prev => {
      const copy = [...prev];
      copy.splice(copy.length - 1, 0, newStop); // insert before end
      return copy;
    });
  };

  // Removes a middle stop from the route.
  const removeStop = (id) => {
    setKeyStops(prev => prev.filter(s => s.id !== id));
  };

  // Uses browser geolocation and matches the start point to the nearest
  // preset location.
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

  // Resolves every stop into coordinates and then builds the slider points
  // for the route.
  const handleSearch = async () => {
    try {
      setRouteLoading(true);
      setWeatherError("");
      setActiveWeather(null);

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
    } finally {
      setRouteLoading(false);
    }
  };

  const handleIndexChange = useCallback((i) => setActiveIndex(i), []);

  const canAddStop = keyStops.length < MAX_STOPS;
  const activePoint = sliderPoints[activeIndex] ?? null;

  // Whenever the selected route point or departure time changes, load the
  // matching forecast for that point.
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

        const targetDeparture = buildNextDepartureDateTime(departureTime);
        const forecastIndex = getClosestHourlyIndex(forecast?.hourly?.time, targetDeparture);
        const hasHourlyForecast = forecastIndex >= 0;
        const weatherSource = hasHourlyForecast
          ? {
              temperature_2m: forecast.hourly.temperature_2m?.[forecastIndex] ?? null,
              apparent_temperature: forecast.hourly.apparent_temperature?.[forecastIndex] ?? null,
              relative_humidity_2m: forecast.hourly.relative_humidity_2m?.[forecastIndex] ?? null,
              wind_speed_10m: forecast.hourly.wind_speed_10m?.[forecastIndex] ?? null,
              weather_code: forecast.hourly.weather_code?.[forecastIndex] ?? null,
            }
          : forecast.current;
        const forecastTimeLabel = hasHourlyForecast
          ? formatForecastMoment(forecast.hourly.time?.[forecastIndex])
          : "current conditions";
        const departureLabel = formatForecastMoment(targetDeparture);
        const meta = weatherCodeToLabel(weatherSource.weather_code);
        const selectedProfile = createRunningProfile({
          id: hasHourlyForecast ? `hour-${forecastIndex}` : "current",
          temp: weatherSource.temperature_2m ?? null,
          humidity: weatherSource.relative_humidity_2m ?? null,
          wind: weatherSource.wind_speed_10m ?? null,
          aqi: hasHourlyForecast
            ? airData?.hourly?.european_aqi?.[forecastIndex] ?? airData?.current?.european_aqi ?? null
            : airData?.current?.european_aqi ?? null,
          weatherCode: weatherSource.weather_code ?? null,
          peakPollen: hasHourlyForecast
            ? getHourlyPollenValue(airData, forecastIndex)
            : getCurrentPollenValue(airData),
        });
        const runningScore = buildRunningScoreForProfile(
          selectedProfile,
          buildRouteReferenceProfiles(forecast, airData)
        );

        setActiveWeather({
          temp: weatherSource.temperature_2m == null ? "—" : `${Math.round(weatherSource.temperature_2m)}°C`,
          feelsLike:
            weatherSource.apparent_temperature == null
              ? null
              : `Feels like ${Math.round(weatherSource.apparent_temperature)}°C`,
          condition: meta.label,
          icon: meta.icon,
          iconType: meta.iconType,
          humidity:
            weatherSource.relative_humidity_2m == null
              ? "—"
              : `${Math.round(weatherSource.relative_humidity_2m)}%`,
          wind:
            weatherSource.wind_speed_10m == null
              ? "—"
              : `${Math.round(weatherSource.wind_speed_10m)} km/h`,
          ground: groundLabel(weatherSource.weather_code),
          pollen: pollenLabel(
            hasHourlyForecast ? getHourlyPollenValue(airData, forecastIndex) : getCurrentPollenValue(airData)
          ),
          airQuality: airQualityLabel(
            hasHourlyForecast
              ? airData?.hourly?.european_aqi?.[forecastIndex] ?? airData?.current?.european_aqi
              : airData?.current?.european_aqi
          ),
          icyness: icyLabel(weatherSource.temperature_2m),
          runningScore,
          departAtLabel: departureLabel,
          forecastTimeLabel
        });
      } catch (err) {
        setWeatherError(err.message || "Failed to fetch route weather");
        setActiveWeather(null);
      } finally {
        setWeatherLoading(false);
      }
    }

    loadPointWeather();
  }, [activePoint, departureTime]);

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

          <div className="route-time-block">
            <label className="route-input-label" htmlFor="route-departure-time">
              Depart At
            </label>
            <input
              id="route-departure-time"
              className="route-input route-time-input"
              type="time"
              value={departureTime}
              onChange={(event) => setDepartureTime(event.target.value)}
            />
            <p className="route-time-help">
              Weather along the route will use the closest forecast hour to this departure time.
            </p>
          </div>

          <button
            className="get-route-btn"
            onClick={handleSearch}
            disabled={routeLoading}
          >
            {routeLoading ? "Getting Route Weather…" : "Get Route Weather"}
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

          {!searched && !routeLoading ? (
            <div className="route-empty-state">
              <span className="empty-cloud">☁</span>
              <p>Build your route and click Get Route Weather</p>
            </div>
          ) : routeLoading ? (
            <div className="route-empty-state">
              <span className="empty-cloud">☁</span>
              <p>Loading route weather…</p>
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
