import { useEffect, useMemo, useState } from "react";

export default function Home() {
  // Stores the forecast data and the basic loading/error state for the page.
  const [data, setData] = useState(null);
  const [status, setStatus] = useState("loading"); // loading | ok | error
  const [error, setError] = useState("");

  // Loads the forecast once when the page first opens.
  useEffect(() => {
    fetch("/api/forecast")
      .then((r) => r.json())
      .then((json) => {
        if (json?.error) {
          setStatus("error");
          setError(json?.details?.message || JSON.stringify(json));
          return;
        }
        setData(json);
        setStatus("ok");
      })
      .catch((e) => {
        setStatus("error");
        setError(String(e));
      });
  }, []);

  // Converts the raw API response into simpler row objects so the JSX below
  // is easier to read and render.
  const rows = useMemo(() => {
    if (!data?.list) return [];
    return data.list.map((item) => {
      const w = item.weather?.[0] || {};
      return {
        key: item.dt,
        time: formatLocalTime(item.dt_txt), // uses your PC timezone; fine for now
        temp: round(item.main?.temp),
        feels: round(item.main?.feels_like),
        desc: w.description || "",
        main: w.main || "",
        iconUrl: w.icon ? `https://openweathermap.org/img/wn/${w.icon}@2x.png` : "",
        pop: item.pop, // 0..1
        wind: item.wind?.speed,
        humidity: item.main?.humidity,
      };
    });
  }, [data]);

  // Uses the first forecast entry as a simple summary card at the top.
  const header = rows[0];

  return (
    <div style={styles.page}>
      <h1 style={styles.title}>London Weather Forecast</h1>
      <p style={styles.subTitle}>Next updates from OpenWeather</p>

      {status === "loading" && <div style={styles.card}>Loading forecast…</div>}

      {status === "error" && (
        <div style={{ ...styles.card, ...styles.error }}>
          <div style={{ fontWeight: 700 }}>Couldn’t load forecast</div>
          <pre style={styles.pre}>{error}</pre>
        </div>
      )}

      {status === "ok" && header && (
        <>
          {/* “Current / next slot” summary card */}
          <div style={styles.card}>
            <div style={styles.summaryRow}>
              <div>
                <div style={styles.summaryTime}>{header.time}</div>
                <div style={styles.summaryDesc}>{titleCase(header.desc)}</div>
                <div style={styles.muted}>
                  Feels like {header.feels}°C · Humidity {header.humidity}% · Wind{" "}
                  {header.wind ?? "—"} m/s
                </div>
              </div>

              <div style={styles.summaryRight}>
                {header.iconUrl && (
                  <img src={header.iconUrl} alt={header.main} style={styles.iconBig} />
                )}
                <div style={styles.tempBig}>{header.temp}°C</div>
              </div>
            </div>
          </div>

          {/* Forecast list */}
          <div style={styles.card}>
            <h2 style={styles.h2}>Upcoming</h2>

            <div style={styles.table}>
              {rows.map((r) => (
                <div key={r.key} style={styles.row}>
                  <div style={styles.timeCol}>{r.time}</div>

                  <div style={styles.iconCol}>
                    {r.iconUrl ? (
                      <img src={r.iconUrl} alt={r.main} style={styles.iconSmall} />
                    ) : (
                      <span style={styles.muted}>—</span>
                    )}
                  </div>

                  <div style={styles.descCol}>
                    <div style={{ fontWeight: 600 }}>{titleCase(r.desc)}</div>
                    <div style={styles.muted}>
                      POP {r.pop != null ? Math.round(r.pop * 100) : 0}% · Humidity{" "}
                      {r.humidity ?? "—"}% · Wind {r.wind ?? "—"} m/s
                    </div>
                  </div>

                  <div style={styles.tempCol}>{r.temp}°C</div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/* -------- helpers -------- */

// Rounds values for display and gives a fallback if the value is missing.
function round(n) {
  return typeof n === "number" ? Math.round(n) : "—";
}

// Makes weather descriptions look a bit nicer in the UI.
function titleCase(s) {
  if (!s) return "";
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// Input example: "2026-01-30 00:00:00"
// Simple local display (for coursework this is fine; later we can do proper timezone handling)
function formatLocalTime(dtTxt) {
  if (!dtTxt) return "—";
  // Convert the API format into something Date can parse more easily.
  const iso = dtTxt.replace(" ", "T") + "Z"; // treat as UTC; city.timezone is 0 for London here
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return dtTxt;

  // Displays a shorter label like "Fri 00:00" for the forecast list.
  return d.toLocaleString(undefined, {
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/* -------- styles -------- */

// Keeping styles in one object here made it quicker to prototype the page
// without creating a separate CSS file.
const styles = {
  page: {
    maxWidth: 900,
    margin: "32px auto",
    padding: "0 16px",
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif",
  },
  title: { marginBottom: 4 },
  subTitle: { marginTop: 0, color: "#555" },

  card: {
    border: "1px solid #e5e5e5",
    borderRadius: 10,
    padding: 16,
    marginTop: 16,
    background: "#fff",
    boxShadow: "0 1px 6px rgba(0,0,0,0.06)",
  },
  error: {
    borderColor: "#ffb3b3",
    background: "#fff5f5",
  },
  pre: {
    whiteSpace: "pre-wrap",
    marginTop: 8,
    fontSize: 12,
  },

  summaryRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
  },
  summaryTime: { fontWeight: 700, fontSize: 16 },
  summaryDesc: { fontSize: 20, fontWeight: 800, marginTop: 6 },
  summaryRight: { display: "flex", alignItems: "center", gap: 8 },
  iconBig: { width: 72, height: 72 },
  tempBig: { fontSize: 42, fontWeight: 900 },

  h2: { margin: "0 0 12px 0" },

  table: { display: "flex", flexDirection: "column", gap: 10 },
  row: {
    display: "grid",
    gridTemplateColumns: "110px 60px 1fr 80px",
    alignItems: "center",
    gap: 12,
    padding: "10px 8px",
    borderRadius: 8,
    border: "1px solid #eee",
  },
  timeCol: { fontWeight: 700 },
  iconCol: { display: "flex", justifyContent: "center" },
  iconSmall: { width: 40, height: 40 },
  descCol: {},
  tempCol: { textAlign: "right", fontWeight: 800, fontSize: 18 },
  muted: { color: "#666", fontSize: 12, marginTop: 2 },
};
