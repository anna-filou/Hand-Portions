# Handful

A small progressive web app for counting meal portions using your hand as a
reference, based on the Precision Nutrition method.

## Files

- `index.html` - app markup and PWA metadata
- `styles.css` - app styles
- `app.js` - calorie/portion logic, local storage persistence, and service worker registration
- `manifest.webmanifest` - installable PWA manifest
- `service-worker.js` - offline app shell cache
- `icons/` - PWA icons

## Run locally

Serve the directory with any static web server:

```sh
python3 -m http.server 8000
```

Then open `http://localhost:8000`. After the first load, the service worker
caches the app shell so it can reopen offline. Meal data and settings are saved
in the browser's local storage.
