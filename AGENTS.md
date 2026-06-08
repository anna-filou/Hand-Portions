# Agent instructions

Instructions for AI agents and contributors working on this repo.

## Versioning (required on every change)

This PWA uses semver (`MAJOR.MINOR.PATCH`, e.g. `0.2.1`). **Bump the version on every commit or PR that changes shipped app behavior, UI, styles, or assets** — even small fixes. Installed PWA clients only pick up updates when the version changes.

### Files to update (keep in sync)

1. **`version.js`** — set `APP_VERSION`
2. **`manifest.webmanifest`** — set the `"version"` field to the same value

Do not change only one file. Both must match.

### How to bump

| Change type | Example | Bump |
|-------------|---------|------|
| Bug fix, copy tweak, style polish | Fix button layout | Patch: `0.2.1` → `0.2.2` |
| New feature or noticeable behavior change | Add export, new tab | Minor: `0.2.1` → `0.3.0` |
| Breaking change (data format, removed feature) | Rename storage keys | Major: `0.2.1` → `1.0.0` |

Reset patch to `0` when bumping minor; reset minor and patch to `0` when bumping major.

### Checklist before finishing work

- [ ] `APP_VERSION` in `version.js` updated
- [ ] `"version"` in `manifest.webmanifest` matches
- [ ] No other hardcoded version strings added elsewhere (the service worker reads `version.js` automatically)

### Why this matters

The service worker cache name is `handful-pwa-${APP_VERSION}`. Without a version bump, browsers with the PWA installed keep serving the old cached app.
