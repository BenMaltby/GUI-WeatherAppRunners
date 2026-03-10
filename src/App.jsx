
import { useState } from "react";
import WeatherPage from "./pages/weatherPage";
import RouteWeatherPage from "./pages/routeWeatherPage";

export default function App() {
  const [page, setPage] = useState("weather"); // "weather" | "route"

  return (
    <>
      {page === "weather" ? (
        <WeatherPage onNavigateToRoute={() => setPage("route")} />
      ) : (
        <RouteWeatherPage onNavigateToWeather={() => setPage("weather")} />
      )}
    </>
  );
}