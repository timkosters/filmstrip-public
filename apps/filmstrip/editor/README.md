# Poster Editor

Browser-based visual editor for the Filmstrip manifest. Reads/writes `manifests/<name>.json` and lets you drag, resize, rotate, trim, and sequence media clips on a manifest-sized canvas with a scrubbable timeline. The default canvas is 900x674.

Render is handled by Remotion via `./bin/make-poster`. The editor can start a render job, but all encoding still happens in the Remotion CLI.

## Running

```bash
./bin/editor                              # uses manifests/example.json unless starter.json exists
./bin/editor --manifest manifests/x.json  # different manifest
./bin/editor --port 6060                  # different port
```

Open http://localhost:5959 after launch.

## Feature map

| Feature | Where |
|---|---|
| Canvas (paper, text, logo, clip windows) | `editor.js` → `renderStage`, `renderWindows` |
| Drag / resize / rotate via Moveable.js | `editor.js` → `wireMoveable` |
| Play / pause + scrubbable timeline | `editor.js` → `togglePlay`, `tick`, `syncVideosToTime`, scrub handlers in `bindTopbar` |
| Visibility + fade-out per clip window | `editor.js` → `applyVisibility` |
| Timeline drag + edge trim + snap | `editor.js` → `startClipDrag`, `applySnap`, `collectSnapTargets` |
| Source library (click to add clip) | `editor.js` → `renderSourceLibrary`, `addClipFromSource` |
| Bulk image interval / scale controls | `editor.js` → `applyImageInterval`, `applySharedImageScale` |
| Frame background controls | `editor.js` → `renderFramePanel`, `updateFrameBackground` |
| Undo / redo (snapshot history) | `editor.js` → `pushHistory`, `undo`, `redo` |
| Keyboard shortcuts | `editor.js` → `bindKeyboard` |
| Save to disk | `editor.js` → `save`, `server.mjs` → `POST /api/manifest` |
| Asset / manifest / preset HTTP + Range | `server.mjs` → `streamFile`, route handlers |

## State model

Single `state` object in `editor.js`:

- `state.preset` — effective preset derived from the manifest plus fallback defaults.
- `state.manifest` — `{duration, width, height, background, text, logo, clips[]}`. The editor mutates clips, duration, music, and frame background in place and on save POSTs it to the server.
- `state.currentTime` — scrubber position in seconds (not tied to render fps).
- `state.selectedIndex` — index into `state.manifest.clips`, or `-1`.
- `state.history[]` + `state.historyIndex` — undo stack, snapshots of the manifest after each commit.

Every mutation follows the pattern: mutate `state.manifest` → `pushHistory()` → `renderTimeline()` / `renderWindows()` / `renderStage()` / `applyVisibility()` / `syncVideosToTime()` / `renderInspectorValues()` as needed.

## Video playback contract

The non-obvious part. Each `<video>` element shows the same source that Remotion will read at render time, not a pre-trimmed clip. The editor fakes the trim by setting `video.currentTime` on each tick.

During playback:

```
target = clip.clipStart + (state.currentTime - clip.posterStart)
```

If `target` drifts from `video.currentTime` by more than the threshold (0.35s playing, 0.15s paused), we re-seek. On loop wrap, we `pauseAllVideos()` so the next tick re-activates clips from `clipStart` without a stale-frame flash.

Clips outside their `[posterStart, posterEnd]` window are paused unconditionally. Fade-out is applied to `el.style.opacity` based on `fadeFrames / 30`.

## API (server)

| Method | Path | Use |
|---|---|---|
| `GET` | `/` | editor HTML |
| `GET` | `/editor.js` / `/editor.css` | static client |
| `GET` | `/api/preset` | the Remotion default preset (text layout) |
| `GET` | `/api/manifest` | current manifest |
| `POST` | `/api/manifest` | overwrite manifest with request body |
| `GET` | `/api/sources` | list of files in `remotion-poster/downloads/` |
| `GET` | `/source/<name>` | video from `downloads/`, supports `Range` |
| `GET` | `/public/<path>` | asset from `remotion-poster/public/` (logo, extracted clips) |

## Known limitations

- The `<video>` elements get recreated on every inspector field change, which triggers a visible flicker. Acceptable for now — Moveable drag and timeline drag use direct style edits, so they're fine.
- Source library doesn't refresh after new downloads; reload the page.
- No drag-to-reorder on the timeline; order is set implicitly by `posterStart`.
- No text-block editing in the UI yet (edit `src/default-preset.json` instead).
