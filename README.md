# Weather App Runners

This project is a weather application for runners. It allows a user to:

- search for a location and view weather conditions for different running time bands
- build a route with multiple stops and inspect the weather along that route

## Requirements

Before running the project, make sure the machine has:

- Node.js 20 or newer
- npm

To check:

```bash
node -v
npm -v
```

## 1. Install Frontend Dependencies

From the project root:

```bash
npm install
```

## 2. Run The App

Start the frontend development server:

```bash
npm run dev
```

Vite will print a local address in the terminal, usually:

```text
http://localhost:5173/
```

Open that address in a browser.

## 3. Build The App

To create a production build:

```bash
npm run build
```

The built files will be placed in the `dist/` folder.

## 4. Optional: Preview The Production Build

After building, you can preview the production version locally:

```bash
npm run preview
```

## 5. Optional: Run The Express Server

Most of the current app functionality uses Open-Meteo directly from the frontend, so the main app can be tested without starting the server.

There is also an Express server included in the `server/` folder for older or supporting API routes.

To run it:

```bash
cd server
npm install
npm run dev
```

This starts the server on:

```text
http://localhost:3001/
```

If the server is being used, create a file called `server/.env` and add:

```env
OPENWEATHER_API_KEY=your_api_key_here
```

## Quick Start

If you only want to test the main app quickly:

```bash
npm install
npm run dev
```

Then open `http://localhost:5173/`.

## Notes For Testing

- Internet access is required because weather, air quality, geocoding, and pollen data are fetched from online APIs.
- The frontend is the main part of the coursework app.
- The route weather page and single-location weather page are both accessed from the running frontend.
- UK locations are supported, and many global locations will also work for weather search.
- Pollen data is available through Open-Meteo for supported European locations, including the UK.

## Troubleshooting

If the app does not start:

1. Make sure `node -v` shows Node.js 20 or newer.
2. Run `npm install` again in the project root.
3. Check that the terminal output from `npm run dev` does not show a port conflict.
4. If weather data does not load, confirm the machine has internet access.

If the optional server does not start:

1. Make sure `npm install` has also been run inside the `server/` folder.
2. Check that `server/.env` exists if testing the OpenWeather-backed endpoints.

<!--
Previous README content preserved for reference:

# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Babel](https://babeljs.io/) (or [oxc](https://oxc.rs) when used in [rolldown-vite](https://vite.dev/guide/rolldown)) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

## React Compiler

The React Compiler is currently not compatible with SWC. See [this issue](https://github.com/vitejs/vite-plugin-react/issues/428) for tracking the progress.

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.
-->
