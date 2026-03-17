const GEO_BASE = "https://geocoding-api.open-meteo.com/v1/search";
const WEATHER_BASE = "https://api.open-meteo.com/v1/forecast";
const AIR_BASE = "https://air-quality-api.open-meteo.com/v1/air-quality";

export async function geocodeCity(name) {
  const res = await fetch(
    `${GEO_BASE}?name=${encodeURIComponent(name)}&count=1&language=en&format=json`
  );

  if (!res.ok) {
    throw new Error("Failed to search for location");
  }

  const data = await res.json();
  if (!data.results || data.results.length === 0) {
    throw new Error("Location not found");
  }

  return data.results[0];
}

export async function getForecastByCoords(lat, lng) {
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lng),
    hourly: [
      "temperature_2m",
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

export async function getAirQualityByCoords(lat, lng) {
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lng),
    current: "european_aqi"
  });

  const res = await fetch(`${AIR_BASE}?${params.toString()}`);
  if (!res.ok) {
    throw new Error("Failed to fetch air quality");
  }
  return res.json();
}

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

export function airQualityLabel(aqi) {
  if (aqi == null) return "Unknown";
  if (aqi <= 20) return "Good";
  if (aqi <= 40) return "Fair";
  if (aqi <= 60) return "Moderate";
  if (aqi <= 80) return "Poor";
  if (aqi <= 100) return "Very Poor";
  return "Extremely Poor";
}

export function groundLabel(weatherCode) {
  if ([61, 63, 65, 80, 81, 82].includes(weatherCode)) return "Wet";
  if ([51, 53, 55].includes(weatherCode)) return "Damp";
  return "Dry";
}

export function icyLabel(tempC) {
  if (tempC == null) return "Unknown";
  return tempC <= 1 ? "Icy" : "None";
}

export function pollenLabel() {
  return "Not available";
}