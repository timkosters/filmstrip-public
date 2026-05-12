# Filmstrip App Notes

This folder contains the browser editor and Remotion renderer only. AI image generation lives in `../../packages/image-pipeline` and communicates by writing approved images into `remotion-poster/downloads/`.

For large generated still batches, keep files on disk and show a folder path or compact contact sheet. Do not inline dozens of full-size generated images in chat; it makes long agent sessions slow to reload.

## Main Paths

| Path | Use |
|---|---|
| `editor/` | Browser editor, default port 5959. |
| `remotion-poster/` | Remotion composition and render CLI. |
| `manifests/` | Example and user-created manifests. |
| `examples/media/` | Generic sample media for smoke tests. |
| `remotion-poster/downloads/` | User media folder, ignored by git. |

## Rules

- Keep this app generic. Do not add branded campaigns, personal data, private locations, or real user media.
- Do not commit files from `downloads/`, `public/assets/`, `out/`, or `.remotion/`.
- Use `staticFile()` for Remotion assets from `public/`.
- When changing manifest behavior, update `README.md`, `editor/README.md`, and `remotion-poster/scripts/make-poster.mjs` together.
