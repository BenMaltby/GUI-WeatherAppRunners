import { useState, useEffect } from "react";
import {
  geocodeCity,
  getForecastByCoords,
  getAirQualityByCoords,
  getHourlyPollenValue,
  weatherCodeToLabel,
  airQualityLabel,
  groundLabel,
  icyLabel,
  pollenLabel
} from "../services/openMeteo";
import LocationAutocompleteInput from "../components/LocationAutocompleteInput";
import { loadPresetLocations, parseLatLng } from "../services/locationSearch";
import "./weatherPage.css";


// Keela's comment
// ── Run time bands ────────────────────────────────────────────────────────────
const RUN_BANDS = [
  { id: 1, label: "Morning Run",   timeLabel: "6:00 AM – 12:00 PM", icon: "🌤️", iconType: "morning"   },
  { id: 2, label: "Afternoon Run", timeLabel: "12:00 PM – 6:00 PM", icon: "☀️", iconType: "sunny"     },
  { id: 3, label: "Evening Run",   timeLabel: "6:00 PM – 12:00 AM", icon: "🌆", iconType: "evening"   },
  { id: 4, label: "Night Run",     timeLabel: "12:00 AM – 6:00 AM", icon: "🌙", iconType: "night"     },
];

// ── WeatherCard ───────────────────────────────────────────────────────────────
function WeatherCard({ band, weather }) {
  const [expanded, setExpanded] = useState(false);

  if (!weather) {
    return (
      <div className="weather-card">
        <div className="weather-card-header">
          <div className="run-band-info">
            <span className="run-band-icon">{band.icon}</span>
            <div>
              <p className="run-label">{band.label}</p>
              <p className="run-time-label">Weather data unavailable</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

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
        pollen: pollenLabel(null),
        airQuality: airQualityLabel(aqi),
        icyness: "Unknown"
      };
      continue;
    }

    const temps = indices.map((i) => hourly.temperature_2m[i]);
    const humidity = indices.map((i) => hourly.relative_humidity_2m[i]);
    const wind = indices.map((i) => hourly.wind_speed_10m[i]);
    const codes = indices.map((i) => hourly.weather_code[i]);
    const pollenValues = indices
      .map((i) => getHourlyPollenValue(airData, i))
      .filter((value) => value != null);

    const avgTemp = average(temps);
    const avgHumidity = average(humidity);
    const avgWind = average(wind);
    const commonCode = mostCommon(codes);
    const weatherMeta = weatherCodeToLabel(commonCode);
    const peakPollen = pollenValues.length ? Math.max(...pollenValues) : null;

    bandWeather[band.id] = {
      temp: avgTemp == null ? "—" : `${Math.round(avgTemp)}°C`,
      condition: weatherMeta.label,
      icon: weatherMeta.icon,
      iconType: weatherMeta.iconType,
      humidity: avgHumidity == null ? "—" : `${Math.round(avgHumidity)}%`,
      wind: avgWind == null ? "—" : `${Math.round(avgWind)} km/h`,
      ground: groundLabel(commonCode),
      pollen: pollenLabel(peakPollen),
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
  const [selectedLocation, setSelectedLocation] = useState(null); // { name, lat, lng }
  const [searchedLocation, setSearchedLocation] = useState(null);
  const [locationError, setLocationError] = useState("");
  const [geoLoading, setGeoLoading] = useState(false);
  const [locations, setLocations] = useState([]);

  // Load CSV on mount
  useEffect(() => {
    loadPresetLocations().then(setLocations);
  }, []);

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
          try {
            const liveLocation = await geocodeCity(inputValue.trim());
            finalLocation = liveLocation;
            setSelectedLocation(finalLocation);
            setInputValue(finalLocation.name);
          } catch {
            setLocationError(
              "Location not found. Enter a city name anywhere in the world or valid lat, lng (e.g. 51.5074, -0.1278)."
            );
            setSearchedLocation(null);
            return;
          }
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
          setSearchedLocation(null);
          setWeatherBands({});
          setWeatherError("");
          setLocationError("");
        } else {
          setLocationError("Could not match your location to a known city.");
        }
        setGeoLoading(false);
      },
      () => {
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

          <LocationAutocompleteInput
            query={inputValue}
            resolvedLocation={selectedLocation}
            onQueryChange={(value) => {
              setInputValue(value);
              setLocationError("");
            }}
            onResolvedChange={(location) => {
              setSelectedLocation(location);
              setLocationError("");
            }}
            presetLocations={locations}
            placeholder="City name or lat, lng"
            error={locationError}
            onEnter={handleSearch}
            wrapperClassName="input-wrapper"
            rowClassName="input-row"
            inputClassName="location-input"
            errorClassName="location-error"
            resolvedClassName="location-coords"
          />

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
