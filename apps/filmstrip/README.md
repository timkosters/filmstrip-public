# Filmstrip App

Filmstrip is the editor and renderer for poster-style media sequences. It reads a JSON manifest, stages images/videos on a paper canvas, and renders MP4, GIF, or PNG through Remotion.

## Components

| Component | Path | Use |
|---|---|---|
| Visual editor | `editor/` | Drag, resize, rotate, trim, time, and save clips. |
| Remotion renderer | `remotion-poster/` | Deterministic render from a manifest. |
| Manifests | `manifests/` | JSON files describing clip timing and layout. |
| Example media | `examples/media/` | Small generic SVGs for smoke tests. |
| User media | `remotion-poster/downloads/` | Local photos, videos, generated stills, and audio. Ignored by git. |

## Setup

From the repo root:

```bash
npm run setup
```

Or from this folder:

```bash
cd remotion-poster
npm install
```

## Render The Example

From the repo root:

```bash
npm run still:example
npm run render:example
```

From this folder:

```bash
./bin/make-poster --manifest manifests/example.json --still --out remotion-poster/out/example.png
./bin/make-poster --manifest manifests/example.json --out remotion-poster/out/example.mp4
```

## Use Your Own Media

Put images, videos, or audio in:

```text
remotion-poster/downloads/
```

Open the editor:

```bash
./bin/editor
```

Then open `http://localhost:5959`. Click media in the source library to add clips, arrange them on the canvas and timeline, save, then render.

For rapid generated-image sequences, the editor has an Image seconds control for retiming every clip at once, plus a Frame panel for changing the shared image scale and background color/image.

## Render From A Folder

```bash
./bin/make-poster --images ~/Pictures/my-roll --out remotion-poster/out/my-roll.mp4
```

This auto-discovers media and places it in a cascade. Use a manifest when you want precise layout.

## Manifest Format

```json
{
  "name": "My Filmstrip",
  "duration": 10,
  "clips": [
    {
      "file": "photo-01.jpg",
      "clipStart": "00:00",
      "clipDuration": 5,
      "posterStart": 0,
      "posterEnd": 8,
      "revealFrames": 8,
      "fadeFrames": 0,
      "x": 430,
      "y": 82,
      "width": 420,
      "height": 250,
      "rotation": -1.5
    }
  ]
}
```

| Field | Meaning |
|---|---|
| `file` | Media path. Usually a filename in `remotion-poster/downloads/`; relative paths also work from the manifest folder. |
| `clipStart` | `mm:ss` or seconds, where a source video starts. Ignored for still images. |
| `clipDuration` | Seconds of source video to extract. |
| `posterStart` / `posterEnd` | When the clip is visible on the Filmstrip timeline. |
| `revealFrames` | Fade-in duration in frames. |
| `fadeFrames` | Fade-out duration in frames. |
| `x` / `y` / `width` / `height` | Window position on the canvas. |
| `rotation` | Degrees. |
| `cropX` / `cropY` | Object-position focus point from `0` to `1`. |

## Text And Theme

The base theme lives in `remotion-poster/src/default-preset.json`. A manifest can override `width`, `height`, `fps`, `background`, `text`, `logo`, and `music`.

## CLI Flags

```text
./bin/make-poster

--manifest <path>        manifest JSON
--images <dir>           source folder for auto-layout or referenced files
--out <path>             output file (.mp4 / .gif / .png)
--still                  render final-frame PNG
--duration <seconds>     override total duration
--fps <n>                frame rate
--clip <seconds>         default video clip length
--format <WxH>           canvas size
--background <color>     paper color override
--accent <color>         overlap text color override
--seed <n>               layout seed
```
