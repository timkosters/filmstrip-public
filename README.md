# Filmstrip

Filmstrip turns a folder of photos, video clips, or generated stills into an editorial poster-style video. It includes a browser editor, a deterministic Remotion renderer, and Codex-first instructions for using native ChatGPT/Codex image generation when available.

This repo is designed to be handed to Codex or another coding agent. Give the agent your source photos or a campaign idea, then ask it to follow `AGENTS.md`.

## What Is Included

| Part | Path | Purpose |
|---|---|---|
| Filmstrip editor and renderer | `apps/filmstrip/` | Arrange media on a poster canvas and render MP4, GIF, or PNG. |
| Optional API image pipeline | `packages/image-pipeline/` | Standalone OpenAI Images API fallback for repeatable local generation and approval. |
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

## Codex-First Image Generation

The easiest workflow is usually to run this repo in Codex or ChatGPT with native image generation available through the user's ChatGPT account:

1. Ask the agent to create a shot list or storyboard.
2. Generate images natively in the conversation, keeping human approval in the loop.
3. Put the approved image files in `apps/filmstrip/remotion-poster/downloads/`.
4. Ask the agent to create or update a Filmstrip manifest and render the video.

This path avoids requiring a separate OpenAI API key for the basic experience. If native image generation is unavailable, or you want a repeatable command-line workflow, use the optional API pipeline below.

For large generated batches, keep the images on disk and share a folder path or compact contact sheet instead of embedding every image in the chat. That keeps agent sessions much faster to reopen and continue.

## Optional API Image Pipeline

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

To make a fast aligned slideshow where every image appears in the same position, use the sequence layout:

```bash
./bin/ai-image-pipeline.mjs export my-roll \
  --out ../../apps/filmstrip/remotion-poster/downloads \
  --manifest ../../apps/filmstrip/manifests/my-roll-sequence.json \
  --layout sequence \
  --interval 0.3 \
  --scale 86
```

Render it:

```bash
apps/filmstrip/bin/make-poster \
  --manifest apps/filmstrip/manifests/my-roll.json \
  --out apps/filmstrip/remotion-poster/out/my-roll.mp4
```

OpenAI's [API image-generation docs](https://developers.openai.com/api/docs/guides/image-generation#choosing-the-right-api) note that API organization verification may be required for GPT Image models, including `gpt-image-2`. That is one reason the Codex/ChatGPT-native workflow is the recommended first path when it is available.

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
