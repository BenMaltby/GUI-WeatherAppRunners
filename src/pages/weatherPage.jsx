import { useState, useEffect, useRef } from "react";
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

        <div className="running-score">
          <span className="running-score-label">Running Score</span>
          <strong className="running-score-value">{weather.runningScore}</strong>
        </div>
      </div>

      <div className="weather-card-main">
        <span className={`weather-icon ${weather.iconType}`}>{weather.icon}</span>
        <div className="weather-card-info">
          <div className="run-temp-row">
            <p className="run-temp">{weather.temp}</p>
            {weather.feelsLike && <p className="run-feels-like">{weather.feelsLike}</p>}
          </div>
          <p className="run-condition">{weather.condition}</p>
        </div>
      </div>

      {expanded && (
        <div className="weather-card-extra">
          <div className="extra-item">
            <span className="extra-label">Humidity</span>
            <strong>{weather.humidity}</strong>
          </div>
          <div className="extra-item">
            <span className="extra-label">Wind Speed</span>
            <strong>{weather.wind}</strong>
          </div>
          <div className="extra-item">
            <span className="extra-label">Ground</span>
            <strong>{weather.ground}</strong>
          </div>
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

function RunnerAdviceCard({ advice, loading, locationName }) {
  if (loading) {
    return (
      <div className="runner-advice-card">
        <p className="runner-advice-eyebrow">Runner Advice</p>
        <h3>Building today&apos;s plan</h3>
        <p className="runner-advice-summary">
          Checking the best run time, kit, and hydration.
        </p>
      </div>
    );
  }

  if (!advice) {
    return (
      <div className="runner-advice-card">
        <p className="runner-advice-eyebrow">Runner Advice</p>
        <h3>Daily running guidance</h3>
        <p className="runner-advice-summary">
          Search for a location to get a same-day clothing, hydration, and timing recommendation.
        </p>
      </div>
    );
  }

  return (
    <div className="runner-advice-card">
      <div className="runner-advice-header">
        <div>
          <p className="runner-advice-eyebrow">Runner Advice</p>
          <h3>{locationName ? `${locationName} today` : "Today"}</h3>
        </div>
        <span className={`runner-advice-badge tone-${advice.tone}`}>{advice.badge}</span>
      </div>

      <p className="runner-advice-summary">{advice.summary}</p>

      <div className="runner-advice-grid">
        <div className="runner-advice-section runner-advice-highlight">
          <span className="runner-advice-label">Best Time To Run</span>
          <p>{advice.bestTime}</p>
        </div>

        <div className="runner-advice-section">
          <span className="runner-advice-label">Clothing</span>
          <p>{advice.clothing}</p>
        </div>

        <div className="runner-advice-section">
          <span className="runner-advice-label">Hydration</span>
          <p>{advice.hydration}</p>
        </div>
      </div>
    </div>
  );
}

function average(nums) {
  const valid = nums.filter((n) => typeof n === "number");
  if (!valid.length) return null;
  return valid.reduce((a, b) => a + b, 0) / valid.length;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function normalizeRelative(value, values, { invert = false, neutral = 0.75 } = {}) {
  const valid = values.filter((n) => typeof n === "number" && !Number.isNaN(n));
  if (typeof value !== "number" || Number.isNaN(value)) return 0.5;
  if (!valid.length) return 0.5;

  const min = Math.min(...valid);
  const max = Math.max(...valid);
  if (min === max) return neutral;

  const normalized = (value - min) / (max - min);
  return invert ? 1 - normalized : normalized;
}

function closenessScore(value, target, tolerance) {
  if (typeof value !== "number" || Number.isNaN(value)) return 0.5;
  return clamp(1 - Math.abs(value - target) / tolerance, 0, 1);
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

function weatherSeverity(code) {
  if (code === 0 || code === 1) return 0.05;
  if (code === 2) return 0.07;
  if (code === 3) return 0.09;
  if (code === 45 || code === 48) return 0.42;
  if ([51, 53, 55].includes(code)) return 0.5;
  if ([61, 63, 65, 80, 81, 82].includes(code)) return 0.72;
  if ([71, 73, 75].includes(code)) return 0.8;
  if (code === 95) return 1;
  return 0.45;
}

function groundPenalty(label) {
  if (label === "Dry") return 0;
  if (label === "Damp") return 0.35;
  if (label === "Wet") return 0.7;
  return 0.45;
}

function icyPenalty(tempC) {
  if (typeof tempC !== "number" || Number.isNaN(tempC)) return 0.2;
  if (tempC <= 0) return 0.95;
  if (tempC <= 1) return 0.85;
  if (tempC <= 3) return 0.45;
  return 0;
}

function pollenPenalty(value) {
  if (value == null) return 0.2;
  if (value < 1) return 0.05;
  if (value < 20) return 0.18;
  if (value < 80) return 0.42;
  if (value < 250) return 0.7;
  return 0.95;
}

function aqiPenalty(aqi) {
  if (aqi == null) return 0.2;
  return clamp(aqi / 120, 0, 1);
}

function buildRunningScores(bandSummaries) {
  const validBands = bandSummaries.filter((band) => band.hasData);
  if (!validBands.length) {
    return {};
  }

  const temps = validBands.map((band) => band.avgTemp).filter((value) => value != null);
  const humidityValues = validBands.map((band) => band.avgHumidity).filter((value) => value != null);
  const windValues = validBands.map((band) => band.avgWind).filter((value) => value != null);
  const severityValues = validBands.map((band) => band.conditionSeverity);
  const groundValues = validBands.map((band) => band.groundPenalty);
  const pollenValues = validBands.map((band) => band.peakPollen).filter((value) => value != null);
  const aqiValues = validBands.map((band) => band.avgAqi).filter((value) => value != null);
  const locationMeanTemp = average(temps);

  const rawScores = {};

  for (const band of validBands) {
    let temperatureRelative;
    if (locationMeanTemp == null) {
      temperatureRelative = 0.5;
    } else if (locationMeanTemp < 10) {
      temperatureRelative = normalizeRelative(band.avgTemp, temps);
    } else if (locationMeanTemp > 18) {
      temperatureRelative = normalizeRelative(band.avgTemp, temps, { invert: true });
    } else {
      const distances = temps.map((temp) => Math.abs(temp - 14));
      const currentDistance = Math.abs((band.avgTemp ?? 14) - 14);
      temperatureRelative = normalizeRelative(currentDistance, distances, { invert: true });
    }

    const temperatureScore =
      0.65 * temperatureRelative + 0.35 * closenessScore(band.avgTemp, 14, 18);
    const humidityScore =
      0.65 * normalizeRelative(band.avgHumidity, humidityValues, { invert: true }) +
      0.35 * closenessScore(band.avgHumidity, 55, 45);
    const windScore =
      0.7 * normalizeRelative(band.avgWind, windValues, { invert: true }) +
      0.3 * clamp(1 - (band.avgWind ?? 0) / 35, 0, 1);
    const conditionScore =
      0.7 * normalizeRelative(band.conditionSeverity, severityValues, { invert: true }) +
      0.3 * (1 - band.conditionSeverity);
    const groundScore =
      0.7 * normalizeRelative(band.groundPenalty, groundValues, { invert: true }) +
      0.3 * (1 - band.groundPenalty);
    const pollenScore =
      0.7 * normalizeRelative(band.peakPollen, pollenValues, { invert: true }) +
      0.3 * (1 - band.pollenPenalty);
    const airQualityScore =
      0.7 * normalizeRelative(band.avgAqi, aqiValues, { invert: true }) +
      0.3 * (1 - band.aqiPenalty);
    const iceScore = 1 - band.icyPenalty;

    rawScores[band.id] =
      temperatureScore * 0.35 +
      conditionScore * 0.24 +
      groundScore * 0.18 +
      humidityScore * 0.07 +
      windScore * 0.05 +
      airQualityScore * 0.05 +
      pollenScore * 0.04 +
      iceScore * 0.02;
  }

  const rawValues = Object.values(rawScores);
  const minRaw = Math.min(...rawValues);
  const maxRaw = Math.max(...rawValues);

  return Object.fromEntries(
    bandSummaries.map((band) => {
      if (!band.hasData) {
        return [band.id, "—"];
      }

      const rawScore = rawScores[band.id];
      const relativeScore =
        minRaw === maxRaw ? 0.75 : (rawScore - minRaw) / (maxRaw - minRaw);
      const finalScore = Math.round(
        clamp((relativeScore * 0.85 + rawScore * 0.15) * 100, 0, 100)
      );

      return [band.id, finalScore];
    })
  );
}

function formatTemperatureRange(minTemp, maxTemp) {
  if (minTemp == null || maxTemp == null) {
    return "mixed temperatures";
  }

  if (Math.round(minTemp) === Math.round(maxTemp)) {
    return `${Math.round(minTemp)}°C`;
  }

  return `${Math.round(minTemp)}-${Math.round(maxTemp)}°C`;
}

function buildRunnerAdvice(bandSummaries, runningScores) {
  const validBands = bandSummaries.filter((band) => band.hasData);
  if (!validBands.length) {
    return null;
  }

  const minTemp = Math.min(...validBands.map((band) => band.avgTemp ?? Infinity));
  const maxTemp = Math.max(...validBands.map((band) => band.avgTemp ?? -Infinity));
  const averageTemp = average(validBands.map((band) => band.avgTemp)) ?? 15;
  const highestHumidity = Math.max(...validBands.map((band) => band.avgHumidity ?? 0));
  const highestWind = Math.max(...validBands.map((band) => band.avgWind ?? 0));
  const worstSeverity = Math.max(...validBands.map((band) => band.conditionSeverity ?? 0));
  const wettestGround = validBands.some((band) => band.ground === "Wet");
  const dampGround = validBands.some((band) => band.ground === "Damp");
  const icyConditions = validBands.some((band) => (band.avgTemp ?? 10) <= 1);
  const highestPollen = Math.max(...validBands.map((band) => band.peakPollen ?? 0));
  const highestAqi = Math.max(...validBands.map((band) => band.avgAqi ?? 0));
  const scoredBands = validBands
    .map((band) => ({
      ...band,
      runningScore: typeof runningScores[band.id] === "number" ? runningScores[band.id] : -1,
    }))
    .sort((a, b) => b.runningScore - a.runningScore);
  const bestBand = scoredBands[0];
  const bestBandMeta = RUN_BANDS.find((band) => band.id === bestBand.id);

  let clothing;
  if (maxTemp <= 2) {
    clothing = "Thermal layers, tights, gloves, and a hat or buff.";
  } else if (maxTemp <= 8) {
    clothing = "Long sleeves, tights, and a light jacket.";
  } else if (maxTemp <= 15) {
    clothing = "Light layers with a breathable top.";
  } else if (maxTemp <= 22) {
    clothing = "Shorts and a light technical tee.";
  } else {
    clothing = "Light, breathable kit with a cap or sunglasses.";
  }

  if (wettestGround || dampGround || worstSeverity >= 0.5) {
    clothing += " Add grippy shoes and a light rain layer.";
  } else if (highestWind >= 20) {
    clothing += " Take a light wind layer.";
  }

  if (icyConditions) {
    clothing += " Watch for icy patches.";
  }

  let hydration;
  if (maxTemp >= 24 || highestHumidity >= 80) {
    hydration = "Carry water. Add electrolytes for longer runs.";
  } else if (maxTemp >= 18 || highestHumidity >= 70) {
    hydration = "Drink before and after. Carry water for longer runs.";
  } else {
    hydration = "Normal hydration should be enough. Drink before and after.";
  }

  if (highestPollen >= 80) {
    hydration += " Rinse off after if pollen affects you.";
  }

  if (highestAqi >= 60) {
    hydration += " Keep effort easier if breathing feels irritated.";
  }

  const bestTime = bestBandMeta
    ? `${bestBandMeta.label} (${bestBandMeta.timeLabel}) is your best window today.`
    : "The highest-scoring part of the day looks best.";

  const score = bestBand.runningScore;
  let badge = "Favourable";
  let tone = "good";
  let summary = `${formatTemperatureRange(minTemp, maxTemp)} overall. Good running conditions.`;

  if (score < 45) {
    badge = "Caution";
    tone = "caution";
    summary = `${formatTemperatureRange(minTemp, maxTemp)} overall. Pick your run time carefully.`;
  } else if (score < 70) {
    badge = "Mixed";
    tone = "mixed";
    summary = `${formatTemperatureRange(minTemp, maxTemp)} overall. Conditions are mixed.`;
  } else if (averageTemp < 12) {
    badge = "Cold Day";
    tone = "cold";
    summary = `${formatTemperatureRange(minTemp, maxTemp)} overall. A colder day for running.`;
  } else if (averageTemp > 18) {
    badge = "Hot Day";
    tone = "hot";
    summary = `${formatTemperatureRange(minTemp, maxTemp)} overall. A warm day for running.`;
  }

  return {
    badge,
    tone,
    summary,
    clothing,
    hydration,
    bestTime,
  };
}

function inBand(hour, bandId) {
  if (bandId === 1) return hour >= 6 && hour < 12;
  if (bandId === 2) return hour >= 12 && hour < 18;
  if (bandId === 3) return hour >= 18 && hour < 24;
  return hour >= 0 && hour < 6;
}

function buildBandWeather(forecast, airData) {
  const hourly = forecast.hourly;
  const currentAqi = airData?.current?.european_aqi ?? null;

  const bandSummaries = [];

  for (const band of RUN_BANDS) {
    const indices = hourly.time
      .map((time, i) => ({ time, i }))
      .filter(({ time }) => {
        const d = new Date(time);
        return inBand(d.getHours(), band.id);
      })
      .map(({ i }) => i);

    if (!indices.length) {
      bandSummaries.push({
        id: band.id,
        hasData: false
      });
      continue;
    }

    const temps = indices.map((i) => hourly.temperature_2m[i]);
    const apparentTemps = indices.map((i) => hourly.apparent_temperature[i]);
    const humidity = indices.map((i) => hourly.relative_humidity_2m[i]);
    const wind = indices.map((i) => hourly.wind_speed_10m[i]);
    const codes = indices.map((i) => hourly.weather_code[i]);
    const aqiValues = indices
      .map((i) => airData?.hourly?.european_aqi?.[i])
      .filter((value) => value != null);
    const pollenValues = indices
      .map((i) => getHourlyPollenValue(airData, i))
      .filter((value) => value != null);

    const avgTemp = average(temps);
    const avgApparentTemp = average(apparentTemps);
    const avgHumidity = average(humidity);
    const avgWind = average(wind);
    const avgAqi = average(aqiValues) ?? currentAqi;
    const commonCode = mostCommon(codes);
    const peakPollen = pollenValues.length ? Math.max(...pollenValues) : null;
    const ground = groundLabel(commonCode);

    bandSummaries.push({
      id: band.id,
      hasData: true,
      avgTemp,
      avgApparentTemp,
      avgHumidity,
      avgWind,
      avgAqi,
      commonCode,
      peakPollen,
      ground,
      conditionSeverity: weatherSeverity(commonCode),
      groundPenalty: groundPenalty(ground),
      pollenPenalty: pollenPenalty(peakPollen),
      aqiPenalty: aqiPenalty(avgAqi),
      icyPenalty: icyPenalty(avgTemp)
    });
  }

  const runningScores = buildRunningScores(bandSummaries);
  const bandWeather = {};
  const runnerAdvice = buildRunnerAdvice(bandSummaries, runningScores);

  for (const summary of bandSummaries) {
    if (!summary.hasData) {
      bandWeather[summary.id] = {
        temp: "—",
        feelsLike: null,
        condition: "No data",
        icon: "❔",
        iconType: "cloudy",
        humidity: "—",
        wind: "—",
        ground: "Unknown",
        pollen: pollenLabel(null),
        airQuality: airQualityLabel(currentAqi),
        icyness: "Unknown",
        runningScore: runningScores[summary.id] ?? "—"
      };
      continue;
    }

    const weatherMeta = weatherCodeToLabel(summary.commonCode);

    bandWeather[summary.id] = {
      temp: summary.avgTemp == null ? "—" : `${Math.round(summary.avgTemp)}°C`,
      feelsLike:
        summary.avgApparentTemp == null
          ? null
          : `Feels like ${Math.round(summary.avgApparentTemp)}°C`,
      condition: weatherMeta.label,
      icon: weatherMeta.icon,
      iconType: weatherMeta.iconType,
      humidity: summary.avgHumidity == null ? "—" : `${Math.round(summary.avgHumidity)}%`,
      wind: summary.avgWind == null ? "—" : `${Math.round(summary.avgWind)} km/h`,
      ground: groundLabel(summary.commonCode),
      pollen: pollenLabel(summary.peakPollen),
      airQuality: airQualityLabel(summary.avgAqi),
      icyness: icyLabel(summary.avgTemp),
      runningScore: runningScores[summary.id] ?? "—"
    };
  }

  return { bandWeather, runnerAdvice };
}


// ── Main Page ─────────────────────────────────────────────────────────────────
export default function WeatherPage({ onNavigateToRoute }) {
  const [weatherBands, setWeatherBands] = useState({});
  const [runnerAdvice, setRunnerAdvice] = useState(null);
  const [weatherLoading, setWeatherLoading] = useState(false);
  const [weatherError, setWeatherError] = useState("");
  const [inputValue, setInputValue] = useState("");
  const [selectedLocation, setSelectedLocation] = useState(null); // { name, lat, lng }
  const [searchedLocation, setSearchedLocation] = useState(null);
  const [locationError, setLocationError] = useState("");
  const [geoLoading, setGeoLoading] = useState(false);
  const [locations, setLocations] = useState([]);
  const [pilotPanelHeight, setPilotPanelHeight] = useState(null);
  const finderPanelRef = useRef(null);
  const hasExpandedResults =
    Boolean(searchedLocation) && !weatherLoading && !weatherError;

  // Load CSV on mount
  useEffect(() => {
    loadPresetLocations().then(setLocations);
  }, []);

  useEffect(() => {
    if (!hasExpandedResults) {
      setPilotPanelHeight(null);
      return undefined;
    }

    const panel = finderPanelRef.current;
    if (!panel) {
      return undefined;
    }

    const updateHeight = () => {
      setPilotPanelHeight(Math.round(panel.getBoundingClientRect().height));
    };

    updateHeight();

    const observer = new ResizeObserver(() => {
      updateHeight();
    });

    observer.observe(panel);

    return () => {
      observer.disconnect();
    };
  }, [hasExpandedResults, runnerAdvice, weatherLoading]);

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
      setSearchedLocation(finalLocation);
      setWeatherBands({});
      setRunnerAdvice(null);

      const [forecast, airData] = await Promise.all([
        getForecastByCoords(finalLocation.lat, finalLocation.lng),
        getAirQualityByCoords(finalLocation.lat, finalLocation.lng).catch(() => null)
      ]);

      const { bandWeather, runnerAdvice: nextRunnerAdvice } = buildBandWeather(forecast, airData);
      setWeatherBands(bandWeather);
      setRunnerAdvice(nextRunnerAdvice);
      setSearchedLocation(finalLocation);
    } catch (err) {
      setWeatherError(err.message || "Failed to fetch weather data");
      setSearchedLocation(null);
      setRunnerAdvice(null);
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

      <div
        className={`weather-layout${hasExpandedResults ? " weather-layout-expanded" : ""}`}
        style={
          hasExpandedResults && pilotPanelHeight
            ? { "--pilot-panel-height": `${pilotPanelHeight}px` }
            : undefined
        }
      >
        {/* ── Left Panel ── */}
        <div className="finder-panel" ref={finderPanelRef}>
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

          <button
            className="get-weather-btn"
            onClick={handleSearch}
            disabled={weatherLoading}
          >
            {weatherLoading ? "Getting Weather…" : "Get Weather"}
          </button>

          <RunnerAdviceCard
            advice={runnerAdvice}
            loading={weatherLoading}
            locationName={searchedLocation?.name}
          />
        </div>

        {/* ── Right Panel ── */}
        <div className={`results-panel${hasExpandedResults ? " results-panel-expanded" : ""}`}>
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
                <p className="loading-message">Loading weather data…</p>
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
