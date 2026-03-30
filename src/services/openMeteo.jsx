const GEO_BASE = "https://geocoding-api.open-meteo.com/v1/search";
const WEATHER_BASE = "https://api.open-meteo.com/v1/forecast";
const AIR_BASE = "https://air-quality-api.open-meteo.com/v1/air-quality";

// These are the pollen values I want to request from the API and compare later.
const POLLEN_FIELDS = [
  "alder_pollen",
  "birch_pollen",
  "grass_pollen",
  "mugwort_pollen",
  "olive_pollen",
  "ragweed_pollen",
];

// Normalises location text so I can compare results more reliably even if
// the spacing or capital letters are different.
function normalizeLocationText(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

// Removes repeated place name parts so the final location string does not
// end up with duplicate values.
function uniqueLocationParts(parts) {
  const seen = new Set();

  return parts.filter((part) => {
    const normalized = normalizeLocationText(part);
    if (!normalized || seen.has(normalized)) {
      return false;
    }

    seen.add(normalized);
    return true;
  });
}

// Builds a readable place name from the geocoding result by combining the
// most useful location fields in order.
function buildLocationName(result) {
  return uniqueLocationParts([
    result.name,
    result.admin4,
    result.admin3,
    result.admin2,
    result.admin1,
    result.country,
  ]).join(", ");
}

// Gives each search result a score so closer matches appear first
// This helps if the API returns several places with similar names
function scoreLocationResult(result, query) {
  const normalizedQuery = normalizeLocationText(query);
  const queryParts = normalizedQuery.split(",").map((part) => part.trim()).filter(Boolean);
  const name = normalizeLocationText(result.name);
  const fullName = normalizeLocationText(buildLocationName(result));

  let score = 0;

  if (name === normalizedQuery) score += 200;
  if (fullName === normalizedQuery) score += 260;
  if (name.startsWith(normalizedQuery)) score += 80;
  if (fullName.startsWith(normalizedQuery)) score += 120;
  if (name.includes(normalizedQuery)) score += 40;
  if (fullName.includes(normalizedQuery)) score += 60;

  queryParts.forEach((part, index) => {
    if (fullName.includes(part)) {
      score += 30;
    }

    if (index === 0 && name.startsWith(part)) {
      score += 50;
    }
  });

  return score;
}

// Keeps the geocoding result in a simpler format for the rest of the app.
function formatGeocodeResult(result) {
  return {
    name: buildLocationName(result),
    lat: result.latitude,
    lng: result.longitude,
  };
}

// Searches for locations using the OpenMeteo geocoding API, then sorts the
// results so the most relevant matches are shown first
export async function searchLocations(name, count = 8) {
  const res = await fetch(
    `${GEO_BASE}?name=${encodeURIComponent(name)}&count=${count}&language=en&format=json`
  );

  if (!res.ok) {
    throw new Error("Failed to search for location");
  }

  const data = await res.json();
  if (!data.results || data.results.length === 0) {
    return [];
  }

  return data.results
    .slice()
    .sort((a, b) => scoreLocationResult(b, name) - scoreLocationResult(a, name))
    .slice(0, count)
    .map(formatGeocodeResult);
}

// Reuses the search function but just returns the single best match
export async function geocodeCity(name) {
  const results = await searchLocations(name, 8);
  if (!results.length) {
    throw new Error("Location not found");
  }

  return results[0];
}

// Requests the current weather, hourly weather and daily weather for the
// coordinates the user selected
export async function getForecastByCoords(lat, lng) {
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lng),
    hourly: [
      "temperature_2m",
      "apparent_temperature",
      "relative_humidity_2m",
      "weather_code",
      "wind_speed_10m"
    ].join(","),
    daily: [
      "temperature_2m_max",
      "temperature_2m_min",
      "weather_code"
    ].join(","),
    current: [
      "temperature_2m",
      "apparent_temperature",
      "relative_humidity_2m",
      "weather_code",
      "wind_speed_10m"
    ].join(","),
    timezone: "auto",
    forecast_days: "2"
  });

  const res = await fetch(`${WEATHER_BASE}?${params.toString()}`);
  if (!res.ok) {
    throw new Error("Failed to fetch forecast");
  }
  return res.json();
}

// Gets air quality and pollen data for the same coordinates so it can be
// displayed alongside the weather data.
export async function getAirQualityByCoords(lat, lng) {
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lng),
    current: ["european_aqi", ...POLLEN_FIELDS].join(","),
    hourly: ["european_aqi", ...POLLEN_FIELDS].join(","),
    timezone: "auto",
  });

  const res = await fetch(`${AIR_BASE}?${params.toString()}`);
  if (!res.ok) {
    throw new Error("Failed to fetch air quality");
  }
  return res.json();
}

// Converts Open-Meteo weather codes into labels and icons that are easier
// to show in the UI.
export function weatherCodeToLabel(code) {
  const map = {
    0: { label: "Clear sky", icon: "☀️", iconType: "sunny" },
    1: { label: "Mainly clear", icon: "🌤️", iconType: "clear" },
    2: { label: "Partly cloudy", icon: "⛅", iconType: "cloudy" },
    3: { label: "Overcast", icon: "☁️", iconType: "cloudy" },
    45: { label: "Fog", icon: "🌫️", iconType: "cloudy" },
    48: { label: "Rime fog", icon: "🌫️", iconType: "cloudy" },
    51: { label: "Light drizzle", icon: "🌦️", iconType: "rainy" },
    53: { label: "Drizzle", icon: "🌦️", iconType: "rainy" },
    55: { label: "Dense drizzle", icon: "🌧️", iconType: "rainy" },
    61: { label: "Slight rain", icon: "🌦️", iconType: "rainy" },
    63: { label: "Rain", icon: "🌧️", iconType: "rainy" },
    65: { label: "Heavy rain", icon: "🌧️", iconType: "rainy" },
    71: { label: "Slight snow", icon: "🌨️", iconType: "cloudy" },
    73: { label: "Snow", icon: "🌨️", iconType: "cloudy" },
    75: { label: "Heavy snow", icon: "❄️", iconType: "cloudy" },
    80: { label: "Rain showers", icon: "🌦️", iconType: "rainy" },
    81: { label: "Rain showers", icon: "🌧️", iconType: "rainy" },
    82: { label: "Violent rain showers", icon: "⛈️", iconType: "rainy" },
    95: { label: "Thunderstorm", icon: "⛈️", iconType: "rainy" }
  };

  return map[code] || { label: "Unknown", icon: "❔", iconType: "cloudy" };
}

// Converts the AQI number into a simpler text description for the user.
export function airQualityLabel(aqi) {
  if (aqi == null) return "Unknown";
  if (aqi <= 20) return "Good";
  if (aqi <= 40) return "Fair";
  if (aqi <= 60) return "Moderate";
  if (aqi <= 80) return "Poor";
  if (aqi <= 100) return "Very Poor";
  return "Extremely Poor";
}

// Gives a rough road/ground condition based on weather codes, mainly to show
// whether conditions are dry, damp or wet.
export function groundLabel(weatherCode) {
  if ([61, 63, 65, 80, 81, 82].includes(weatherCode)) return "Wet";
  if ([51, 53, 55].includes(weatherCode)) return "Damp";
  return "Dry";
}

// Marks temperatures around freezing as icy so it is easier to warn the user.
export function icyLabel(tempC) {
  if (tempC == null) return "Unknown";
  return tempC <= 1 ? "Icy" : "None";
}

// Filters out invalid pollen values from the API before comparing them.
function toValidPollenValue(value) {
  return typeof value === "number" && !Number.isNaN(value) ? value : null;
}

// Finds the highest pollen reading because that is the one I want to use
// as the overall pollen level.
export function getPeakPollenValue(pollenValues) {
  const validValues = pollenValues
    .map(toValidPollenValue)
    .filter((value) => value != null);

  if (!validValues.length) {
    return null;
  }

  return Math.max(...validValues);
}

// Gets the current pollen level from the current air quality data.
export function getCurrentPollenValue(airData) {
  if (!airData?.current) {
    return null;
  }

  return getPeakPollenValue(POLLEN_FIELDS.map((field) => airData.current[field]));
}

// Gets the pollen level for a specific hourly index so hourly cards/graphs
// can show the matching value for that time.
export function getHourlyPollenValue(airData, index) {
  if (!airData?.hourly) {
    return null;
  }

  return getPeakPollenValue(
    POLLEN_FIELDS.map((field) => airData.hourly[field]?.[index])
  );
}

// Turns the pollen value into a label that is easier to understand
export function pollenLabel(pollenValue) {
  if (pollenValue == null) return "Unavailable";
  if (pollenValue < 1) return "Very Low";
  if (pollenValue < 20) return "Low";
  if (pollenValue < 80) return "Moderate";
  if (pollenValue < 250) return "High";
  return "Very High";
}
