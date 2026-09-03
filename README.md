# Emrys

Emrys is a responsive, local-first interface for browsing and launching the complete game catalog included in this repository.

## Run locally

```bash
npm start
```

Open `http://127.0.0.1:4173`.

## Verify

```bash
npm test
```

The verification checks the catalog count, unique IDs, launch URLs, local cover and hero artwork, and interface files.

Preferences, onboarding choices, favorites, and play history are stored only in the browser's `localStorage`. Emrys does not host or authenticate access to third-party games; availability and iframe support depend on each external provider.
