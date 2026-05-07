# Filmstrip Remotion Renderer

This is the renderable Remotion composition used by Filmstrip. It takes props generated from a manifest and exports MP4, GIF, or a still PNG.

## Commands

From `apps/filmstrip`:

```bash
./bin/make-poster --manifest manifests/example.json --out remotion-poster/out/example.mp4
./bin/make-poster --manifest manifests/example.json --still --out remotion-poster/out/example.png
./bin/preview --manifest manifests/example.json
```

From this folder:

```bash
npm install
npm run check
npm run preview
```

## How Rendering Works

1. `scripts/make-poster.mjs` reads the manifest.
2. Source media is copied or extracted into `public/assets/`.
3. A complete Remotion props file is written to `out/props.json`.
4. `npx remotion render` or `npx remotion still` renders the composition.

Images are copied directly. Videos are trimmed with ffmpeg before rendering so Remotion receives small timeline-ready clips.
