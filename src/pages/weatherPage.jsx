import { useState, useRef, useEffect } from "react";
import {
  getForecastByCoords,
  getAirQualityByCoords,
  weatherCodeToLabel,
  airQualityLabel,
  groundLabel,
  icyLabel,
  pollenLabel
} from "../services/openMeteo";
import "./WeatherPage.css";

// ── Run time bands ────────────────────────────────────────────────────────────
const RUN_BANDS = [
  { id: 1, label: "Morning Run",   timeLabel: "6:00 AM – 12:00 PM", icon: "🌤️", iconType: "morning"   },
  { id: 2, label: "Afternoon Run", timeLabel: "12:00 PM – 6:00 PM", icon: "☀️", iconType: "sunny"     },
  { id: 3, label: "Evening Run",   timeLabel: "6:00 PM – 12:00 AM", icon: "🌆", iconType: "evening"   },
  { id: 4, label: "Night Run",     timeLabel: "12:00 AM – 6:00 AM", icon: "🌙", iconType: "night"     },
];

// ── Load CSV locations ────────────────────────────────────────────────────────
// We inline-parse the CSV that lives next to this file.
// In your Vite project, place england_locations.csv in src/ (or public/) and
// adjust the import path if needed.
let LOCATIONS = [];
try {
  // Dynamic import of raw CSV text via Vite's ?raw suffix
  // We handle this asynchronously in the component below.
} catch (_) {}

async function loadLocations() {
  try {
    const raw = await fetch("/england_locations.csv").then((r) => r.text());
    const lines = raw.trim().split("\n").slice(1); // skip header
    return lines.map((line) => {
      const parts = line.split(",");
      // Name may contain commas (it won't here, but be safe)
      const lat = parseFloat(parts[parts.length - 2]);
      const lng = parseFloat(parts[parts.length - 1]);
      const name = parts.slice(0, parts.length - 2).join(",").trim();
      return { name, lat, lng };
    }).filter((l) => l.name && !isNaN(l.lat) && !isNaN(l.lng));
  } catch (e) {
    console.error("Could not load locations CSV", e);
    return [];
  }
}

// ── Parse raw "lat, lng" input ────────────────────────────────────────────────
function parseLatLng(str) {
  const m = str.match(/^(-?\d+\.?\d*)\s*,\s*(-?\d+\.?\d*)$/);
  if (!m) return null;
  const lat = parseFloat(m[1]);
  const lng = parseFloat(m[2]);
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}

// ── WeatherCard ───────────────────────────────────────────────────────────────
function WeatherCard({ band, weather }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="weather-card">
      <div className="weather-card-header">
        <div className="run-band-info">
          <span className="run-band-icon">{band.icon}</span>
          <div>
            <p className="run-label">{band.label}</p>
            <p className="run-time-label">Expected weather · {band.timeLabel}</p>
          </div>
        </div>
      </div>

      <div className="weather-card-main">
        <span className={`weather-icon ${weather.iconType}`}>{weather.icon}</span>
        <div className="weather-card-info">
          <p className="run-temp">{weather.temp}</p>
          <p className="run-condition">{weather.condition}</p>
        </div>
      </div>

      <div className="weather-card-stats">
        <span>💧 {weather.humidity}</span>
        <span>💨 {weather.wind}</span>
        <span>Ground: <strong>{weather.ground}</strong></span>
      </div>

      {expanded && (
        <div className="weather-card-extra">
          <div className="extra-item">
            <span className="extra-label">Pollen</span>
            <strong>{weather.pollen}</strong>
          </div>
          <div className="extra-item">
            <span className="extra-label">Air Quality</span>
            <strong>{weather.airQuality}</strong>
          </div>
          <div className="extra-item">
            <span className="extra-label">Icyness</span>
            <strong>{weather.icyness}</strong>
          </div>
        </div>
      )}

      <button className="more-btn" onClick={() => setExpanded(!expanded)}>
        {expanded ? "Less ▲" : "More ▼"}
      </button>
    </div>
  );
}

function average(nums) {
  const valid = nums.filter((n) => typeof n === "number");
  if (!valid.length) return null;
  return valid.reduce((a, b) => a + b, 0) / valid.length;
}

function mostCommon(arr) {
  const counts = {};
  for (const value of arr) {
    counts[value] = (counts[value] || 0) + 1;
  }
  return Number(
    Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0]
  );
}

function inBand(hour, bandId) {
  if (bandId === 1) return hour >= 6 && hour < 12;
  if (bandId === 2) return hour >= 12 && hour < 18;
  if (bandId === 3) return hour >= 18 && hour < 24;
  return hour >= 0 && hour < 6;
}

function buildBandWeather(forecast, airData) {
  const hourly = forecast.hourly;
  const aqi = airData?.current?.european_aqi ?? null;

  const bandWeather = {};

  for (const band of RUN_BANDS) {
    const indices = hourly.time
      .map((time, i) => ({ time, i }))
      .filter(({ time }) => {
        const d = new Date(time);
        return inBand(d.getHours(), band.id);
      })
      .map(({ i }) => i);

    if (!indices.length) {
      bandWeather[band.id] = {
        temp: "—",
        condition: "No data",
        icon: "❔",
        iconType: "cloudy",
        humidity: "—",
        wind: "—",
        ground: "Unknown",
        pollen: pollenLabel(),
        airQuality: airQualityLabel(aqi),
        icyness: "Unknown"
      };
      continue;
    }

    const temps = indices.map((i) => hourly.temperature_2m[i]);
    const humidity = indices.map((i) => hourly.relative_humidity_2m[i]);
    const wind = indices.map((i) => hourly.wind_speed_10m[i]);
    const codes = indices.map((i) => hourly.weather_code[i]);

    const avgTemp = average(temps);
    const avgHumidity = average(humidity);
    const avgWind = average(wind);
    const commonCode = mostCommon(codes);
    const weatherMeta = weatherCodeToLabel(commonCode);

    bandWeather[band.id] = {
      temp: avgTemp == null ? "—" : `${Math.round(avgTemp)}°C`,
      condition: weatherMeta.label,
      icon: weatherMeta.icon,
      iconType: weatherMeta.iconType,
      humidity: avgHumidity == null ? "—" : `${Math.round(avgHumidity)}%`,
      wind: avgWind == null ? "—" : `${Math.round(avgWind)} km/h`,
      ground: groundLabel(commonCode),
      pollen: pollenLabel(),
      airQuality: airQualityLabel(aqi),
      icyness: icyLabel(avgTemp)
    };
  }

  return bandWeather;
}


// ── Main Page ─────────────────────────────────────────────────────────────────
export default function WeatherPage({ onNavigateToRoute }) {
  const [weatherBands, setWeatherBands] = useState({});
  const [weatherLoading, setWeatherLoading] = useState(false);
  const [weatherError, setWeatherError] = useState("");
  const [inputValue, setInputValue] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [selectedLocation, setSelectedLocation] = useState(null); // { name, lat, lng }
  const [searchedLocation, setSearchedLocation] = useState(null);
  const [locationError, setLocationError] = useState("");
  const [geoLoading, setGeoLoading] = useState(false);
  const [locations, setLocations] = useState([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const inputRef = useRef(null);
  const dropdownRef = useRef(null);

  // Load CSV on mount
  useEffect(() => {
    loadLocations().then(setLocations);
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e) => {
      if (
        dropdownRef.current && !dropdownRef.current.contains(e.target) &&
        inputRef.current && !inputRef.current.contains(e.target)
      ) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleInputChange = (e) => {
    const val = e.target.value;
    setInputValue(val);
    setSelectedLocation(null);
    setLocationError("");

    // Accept raw lat, lng input
    const parsed = parseLatLng(val.trim());
    if (parsed) {
      setSelectedLocation({ name: val.trim(), lat: parsed.lat, lng: parsed.lng });
      setSuggestions([]);
      setShowDropdown(false);
      return;
    }

    if (val.trim().length < 2) {
      setSuggestions([]);
      setShowDropdown(false);
      return;
    }

    const lower = val.toLowerCase();
    const matches = locations
      .filter((l) => l.name.toLowerCase().startsWith(lower))
      .slice(0, 8);
    setSuggestions(matches);
    setShowDropdown(matches.length > 0);
  };

  const handleSelectSuggestion = (loc) => {
    setInputValue(loc.name);
    setSelectedLocation(loc);
    setSuggestions([]);
    setShowDropdown(false);
    setLocationError("");
  };

  const handleSearch = async () => {
    setLocationError("");
    setWeatherError("");

    if (!inputValue.trim()) return;

    let finalLocation = selectedLocation;

    if (!finalLocation) {
      const parsed = parseLatLng(inputValue.trim());
      if (parsed) {
        finalLocation = { name: inputValue.trim(), lat: parsed.lat, lng: parsed.lng };
        setSelectedLocation(finalLocation);
      } else {
        const exact = locations.find(
          (l) => l.name.toLowerCase() === inputValue.trim().toLowerCase()
        );

        if (exact) {
          finalLocation = exact;
          setSelectedLocation(exact);
          setInputValue(exact.name);
        } else {
          setLocationError(
            "Location not found. Enter a city name or valid lat, lng (e.g. 51.5074, -0.1278)."
          );
          setSearchedLocation(null);
          return;
        }
      }
    }

    try {
      setWeatherLoading(true);

      const [forecast, airData] = await Promise.all([
        getForecastByCoords(finalLocation.lat, finalLocation.lng),
        getAirQualityByCoords(finalLocation.lat, finalLocation.lng).catch(() => null)
      ]);

      const bandData = buildBandWeather(forecast, airData);
      setWeatherBands(bandData);
      setSearchedLocation(finalLocation);
    } catch (err) {
      setWeatherError(err.message || "Failed to fetch weather data");
      setSearchedLocation(null);
    } finally {
      setWeatherLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter") handleSearch();
    if (e.key === "Escape") setShowDropdown(false);
  };

  const handleGetCurrentLocation = () => {
    if (!navigator.geolocation) {
      setLocationError("Geolocation is not supported by your browser.");
      return;
    }
    setGeoLoading(true);
    setLocationError("");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        // Find nearest location in CSV
        let nearest = null;
        let minDist = Infinity;
        locations.forEach((loc) => {
          const dist = Math.sqrt(
            Math.pow(loc.lat - latitude, 2) + Math.pow(loc.lng - longitude, 2)
          );
          if (dist < minDist) {
            minDist = dist;
            nearest = loc;
          }
        });

        if (nearest) {
          setInputValue(nearest.name);
          setSelectedLocation(nearest);
          setSearchedLocation(nearest);
          setLocationError("");
        } else {
          setLocationError("Could not match your location to a known city.");
        }
        setGeoLoading(false);
      },
      (err) => {
        setLocationError("Unable to retrieve your location. Please allow location access.");
        setGeoLoading(false);
      }
    );
  };

  return (
    <div className="weather-page">
      <nav className="top-nav">
        <button className="nav-btn" onClick={onNavigateToRoute}>
          Weather for Route
        </button>
      </nav>

      <div className="weather-layout">
        {/* ── Left Panel ── */}
        <div className="finder-panel">
          <h2>Weather Finder</h2>

          <label className="input-label">Enter Location</label>

          <div className="input-wrapper">
            <div className="input-row">
              <div className="autocomplete-container">
                <input
                  ref={inputRef}
                  className={`location-input ${locationError ? "input-error" : ""}`}
                  type="text"
                  placeholder="City name or lat, lng"
                  value={inputValue}
                  onChange={handleInputChange}
                  onKeyDown={handleKeyDown}
                  onFocus={() => suggestions.length > 0 && setShowDropdown(true)}
                  autoComplete="off"
                />
                {showDropdown && (
                  <ul className="suggestions-dropdown" ref={dropdownRef}>
                    {suggestions.map((loc, i) => (
                      <li
                        key={i}
                        className="suggestion-item"
                        onMouseDown={() => handleSelectSuggestion(loc)}
                      >
                        <span className="suggestion-name">{loc.name}</span>
                        <span className="suggestion-coords">
                          {loc.lat.toFixed(4)}, {loc.lng.toFixed(4)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            {locationError && (
              <p className="location-error">{locationError}</p>
            )}

            {selectedLocation && (
              <p className="location-coords">
                📍 {selectedLocation.lat.toFixed(4)}, {selectedLocation.lng.toFixed(4)}
              </p>
            )}
          </div>

          <button
            className="geo-btn"
            onClick={handleGetCurrentLocation}
            disabled={geoLoading}
          >
            {geoLoading ? "Detecting…" : "📍 Use My Current Location"}
          </button>

          <button className="get-weather-btn" onClick={handleSearch}>
            Get Weather
          </button>
        </div>

        {/* ── Right Panel ── */}
        <div className="results-panel">
          <h2>Weather Results</h2>
          {!searchedLocation ? (
            <div className="empty-state">
              <span className="empty-cloud">☁</span>
              <p>Enter a location to see weather data</p>
            </div>
          ) : (
            <div className="results-list">
              <p className="results-location">{searchedLocation.name}</p>
              {weatherLoading ? (
                <p>Loading weather data…</p>
              ) : weatherError ? (
                <p className="location-error">{weatherError}</p>
              ) : (
                RUN_BANDS.map((band) => (
                  <WeatherCard
                    key={band.id}
                    band={band}
                    weather={weatherBands[band.id]}
                  />
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}