import { groundLabel } from "./openMeteo";

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

function weatherSeverity(code) {
  if (code === 0 || code === 1) return 0.05;
  if (code === 2) return 0.18;
  if (code === 3) return 0.28;
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

export function createRunningProfile({
  id,
  temp,
  humidity,
  wind,
  aqi,
  weatherCode,
  peakPollen,
  ground
}) {
  const resolvedGround = ground ?? groundLabel(weatherCode);

  return {
    id,
    avgTemp: temp,
    avgHumidity: humidity,
    avgWind: wind,
    avgAqi: aqi,
    commonCode: weatherCode,
    peakPollen,
    conditionSeverity: weatherSeverity(weatherCode),
    groundPenalty: groundPenalty(resolvedGround),
    pollenPenalty: pollenPenalty(peakPollen),
    aqiPenalty: aqiPenalty(aqi),
    icyPenalty: icyPenalty(temp),
    hasData: true
  };
}

function buildRawScores(profiles) {
  const validProfiles = profiles.filter((profile) => profile?.hasData);
  if (!validProfiles.length) {
    return new Map();
  }

  const temps = validProfiles.map((profile) => profile.avgTemp).filter((value) => value != null);
  const humidityValues = validProfiles.map((profile) => profile.avgHumidity).filter((value) => value != null);
  const windValues = validProfiles.map((profile) => profile.avgWind).filter((value) => value != null);
  const severityValues = validProfiles.map((profile) => profile.conditionSeverity);
  const groundValues = validProfiles.map((profile) => profile.groundPenalty);
  const pollenValues = validProfiles.map((profile) => profile.peakPollen).filter((value) => value != null);
  const aqiValues = validProfiles.map((profile) => profile.avgAqi).filter((value) => value != null);
  const locationMeanTemp = average(temps);

  return new Map(
    validProfiles.map((profile) => {
      let temperatureRelative;
      if (locationMeanTemp == null) {
        temperatureRelative = 0.5;
      } else if (locationMeanTemp < 10) {
        temperatureRelative = normalizeRelative(profile.avgTemp, temps);
      } else if (locationMeanTemp > 18) {
        temperatureRelative = normalizeRelative(profile.avgTemp, temps, { invert: true });
      } else {
        const distances = temps.map((temp) => Math.abs(temp - 14));
        const currentDistance = Math.abs((profile.avgTemp ?? 14) - 14);
        temperatureRelative = normalizeRelative(currentDistance, distances, { invert: true });
      }

      const temperatureScore =
        0.65 * temperatureRelative + 0.35 * closenessScore(profile.avgTemp, 14, 18);
      const humidityScore =
        0.65 * normalizeRelative(profile.avgHumidity, humidityValues, { invert: true }) +
        0.35 * closenessScore(profile.avgHumidity, 55, 45);
      const windScore =
        0.7 * normalizeRelative(profile.avgWind, windValues, { invert: true }) +
        0.3 * clamp(1 - (profile.avgWind ?? 0) / 35, 0, 1);
      const conditionScore =
        0.7 * normalizeRelative(profile.conditionSeverity, severityValues, { invert: true }) +
        0.3 * (1 - profile.conditionSeverity);
      const groundScore =
        0.7 * normalizeRelative(profile.groundPenalty, groundValues, { invert: true }) +
        0.3 * (1 - profile.groundPenalty);
      const pollenScore =
        0.7 * normalizeRelative(profile.peakPollen, pollenValues, { invert: true }) +
        0.3 * (1 - profile.pollenPenalty);
      const airQualityScore =
        0.7 * normalizeRelative(profile.avgAqi, aqiValues, { invert: true }) +
        0.3 * (1 - profile.aqiPenalty);
      const iceScore = 1 - profile.icyPenalty;

      const rawScore =
        temperatureScore * 0.24 +
        conditionScore * 0.18 +
        windScore * 0.14 +
        humidityScore * 0.1 +
        groundScore * 0.1 +
        airQualityScore * 0.1 +
        pollenScore * 0.08 +
        iceScore * 0.06;

      return [profile, rawScore];
    })
  );
}

export function buildRunningScores(profiles) {
  const rawScores = buildRawScores(profiles);
  const rawValues = [...rawScores.values()];

  if (!rawValues.length) {
    return {};
  }

  const minRaw = Math.min(...rawValues);
  const maxRaw = Math.max(...rawValues);

  return Object.fromEntries(
    profiles.map((profile) => {
      if (!profile?.hasData) {
        return [profile.id, "—"];
      }

      const rawScore = rawScores.get(profile);
      const relativeScore =
        minRaw === maxRaw ? 0.75 : (rawScore - minRaw) / (maxRaw - minRaw);
      const finalScore = Math.round(
        clamp((relativeScore * 0.85 + rawScore * 0.15) * 100, 0, 100)
      );

      return [profile.id, finalScore];
    })
  );
}

export function buildRunningScoreForProfile(profile, referenceProfiles) {
  const scoredProfiles = [profile, ...referenceProfiles.filter(Boolean)];
  const rawScores = buildRawScores(scoredProfiles);
  const rawValues = [...rawScores.values()];

  if (!rawValues.length || !rawScores.has(profile)) {
    return "—";
  }

  const rawScore = rawScores.get(profile);
  const minRaw = Math.min(...rawValues);
  const maxRaw = Math.max(...rawValues);
  const relativeScore =
    minRaw === maxRaw ? 0.75 : (rawScore - minRaw) / (maxRaw - minRaw);

  return Math.round(
    clamp((relativeScore * 0.85 + rawScore * 0.15) * 100, 0, 100)
  );
}
