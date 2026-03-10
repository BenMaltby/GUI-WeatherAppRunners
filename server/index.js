import express from "express";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3001;

// Fixed London coordinates
const LONDON = { lat: 51.5074, lon: -0.1278 };

app.get("/api/forecast", async (req, res) => {
  try {
    const apiKey = process.env.OPENWEATHER_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: "Missing OPENWEATHER_API_KEY in server/.env" });
    }

    const url = new URL("https://api.openweathermap.org/data/2.5/forecast");
    url.searchParams.set("lat", "51.5074");     // London
    url.searchParams.set("lon", "-0.1278");
    url.searchParams.set("appid", apiKey);
    url.searchParams.set("units", "metric");    // Celsius
    url.searchParams.set("cnt", "16");           // ~2 days (optional)


    const r = await fetch(url);
    const data = await r.json();

    if (!r.ok) {
      // OpenWeather usually returns {cod, message}
      return res.status(r.status).json({ error: "OpenWeather error", details: data });
    }

    // Send raw data (fine for now)
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: "Server error", details: String(err) });
  }
});

app.listen(PORT, () => {
  console.log(`API server running on http://localhost:${PORT}`);
});


// Test endpoint
app.get("/api/hello", (req, res) => {
  res.json({ message: "API server is running ✅" });
});

app.get("/api/debug-key", (req, res) => {
  const k = process.env.OPENWEATHER_API_KEY || "";
  res.json({ hasKey: !!k, length: k.length, endsWith: k.slice(-4) });
});


