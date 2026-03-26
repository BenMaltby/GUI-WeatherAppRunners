export async function loadPresetLocations() {
  try {
    const raw = await fetch("/england_locations.csv").then((r) => r.text());
    const lines = raw.trim().split("\n").slice(1);
    return lines
      .map((line) => {
        const parts = line.split(",");
        const lat = parseFloat(parts[parts.length - 2]);
        const lng = parseFloat(parts[parts.length - 1]);
        const name = parts.slice(0, parts.length - 2).join(",").trim();
        return { name, lat, lng };
      })
      .filter((location) => location.name && !Number.isNaN(location.lat) && !Number.isNaN(location.lng));
  } catch (error) {
    console.error("Could not load locations CSV", error);
    return [];
  }
}

export function parseLatLng(str) {
  const match = str.match(/^(-?\d+\.?\d*)\s*,\s*(-?\d+\.?\d*)$/);
  if (!match) return null;

  const lat = parseFloat(match[1]);
  const lng = parseFloat(match[2]);

  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return null;
  }

  return { lat, lng };
}
