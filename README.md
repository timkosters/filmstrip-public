# Filmstrip

Filmstrip turns a folder of photos, video clips, or generated stills into an editorial poster-style video. It includes a browser editor, a deterministic Remotion renderer, and an optional local OpenAI Images API pipeline for generating image sets with human approval.

This repo is designed to be handed to a coding agent. Give the agent your source photos or a campaign idea, then ask it to follow `AGENTS.md`.

## What Is Included

| Part | Path | Purpose |
|---|---|---|
| Filmstrip editor and renderer | `apps/filmstrip/` | Arrange media on a poster canvas and render MP4, GIF, or PNG. |
| Image pipeline | `packages/image-pipeline/` | Generate variants, approve selected images, and export them into Filmstrip. |
| Generic examples | `apps/filmstrip/examples/` | Small SVG media and a starter manifest for smoke testing. |

## Requirements

- Node.js 20+
- npm
- ffmpeg, required when rendering video clips or MP4/GIF output

Install dependencies:

```bash
npm run setup
```

## Render The Example

```bash
npm run still:example
npm run render:example
```

The outputs land in `apps/filmstrip/remotion-poster/out/`.

## Use Your Own Photos

Put images or videos in:

```text
apps/filmstrip/remotion-poster/downloads/
```

Open the editor:

```bash
npm run editor
```

Then open `http://localhost:5959`, add media from the source library, save the manifest, and render from the UI or CLI.

## Generate Images First

```bash
cd packages/image-pipeline
cp .env.example .env
```

Add `OPENAI_API_KEY` to `.env`, then:

```bash
./bin/ai-image-pipeline.mjs init my-roll --template photo-essay
./bin/ai-image-pipeline.mjs generate my-roll 01
./bin/ai-image-pipeline.mjs export my-roll \
  --out ../../apps/filmstrip/remotion-poster/downloads \
  --manifest ../../apps/filmstrip/manifests/my-roll.json
```

Render it:

```bash
apps/filmstrip/bin/make-poster \
  --manifest apps/filmstrip/manifests/my-roll.json \
  --out apps/filmstrip/remotion-poster/out/my-roll.mp4
```

## Privacy Model

Source media, generated variants, approved images, `.env`, local manifests, Remotion assets, and render outputs are ignored by git. Public examples are generic placeholders only.

For release hygiene, run:

```bash
npm run check
rg -n -i "api_key|secret|token|replace-with-your-private-search-terms" .
```

## Docs

- [Agent workflow](docs/agent-workflow.md)
- [Filmstrip app](apps/filmstrip/README.md)
- [Image pipeline](packages/image-pipeline/README.md)
