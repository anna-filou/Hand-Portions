# Handful

A small progressive web app for counting meal portions using your hand as a
reference, based on the Precision Nutrition method.

## Files

- `index.html` - app markup and PWA metadata
- `styles.css` - app styles
- `app.js` - calorie/portion logic, local storage persistence, and service worker registration
- `version.js` - app release version (semver); read by the service worker and registration
- `manifest.webmanifest` - installable PWA manifest (includes matching `version`)
- `service-worker.js` - offline app shell cache
- `icons/` - PWA icons
- `AGENTS.md` - instructions for AI agents (including required version bumps)

## Versioning

The app version uses semver (`0.2.1` format). **Bump it on every release** so installed PWAs get the update.

Update both of these to the same value:

1. `APP_VERSION` in `version.js`
2. `"version"` in `manifest.webmanifest`

- **Patch** (`0.2.1` → `0.2.2`) — fixes and small changes
- **Minor** (`0.2.1` → `0.3.0`) — new features
- **Major** (`0.2.1` → `1.0.0`) — breaking changes

See `AGENTS.md` for the full agent checklist.

## Run locally

Serve the directory with any static web server:

```sh
python3 -m http.server 8000
```

Then open `http://localhost:8000`. After the first load, the service worker
caches the app shell so it can reopen offline. Meal data and settings are saved
in the browser's local storage.
