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
