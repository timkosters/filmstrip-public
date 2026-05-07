# Image Pipeline

A reusable local workflow for generating coherent image sets with OpenAI's Images API. It is storyboard first: write the campaign, generate variants, approve by hand, then export selected images into any downstream tool.

Filmstrip is one downstream tool, but this package can also be used on its own.

## Setup

```bash
cp .env.example .env
```

Add your API key:

```bash
OPENAI_API_KEY=...
```

Defaults:

```bash
OPENAI_IMAGE_MODEL=gpt-image-2
OPENAI_IMAGE_SIZE=1536x1024
OPENAI_IMAGE_QUALITY=medium
OPENAI_IMAGE_OUTPUT_FORMAT=jpeg
OPENAI_IMAGE_OUTPUT_COMPRESSION=90
```

OpenAI's image generation guide lists `gpt-image-2` as a GPT Image model and documents quality, size, format, and compression options. The model remains configurable through env vars and command flags.

## Quick Start

Create a generic photo essay:

```bash
./bin/ai-image-pipeline.mjs init my-roll --template photo-essay
```

Create an event recap:

```bash
./bin/ai-image-pipeline.mjs init launch-night --template event-recap
```

Inspect the prompt for one shot:

```bash
./bin/ai-image-pipeline.mjs prompt my-roll 01
```

Generate variants and approve one:

```bash
./bin/ai-image-pipeline.mjs generate my-roll 01
```

Approve an existing variant without regenerating:

```bash
./bin/ai-image-pipeline.mjs approve my-roll 01 2
```

Export approved images into Filmstrip and write a starter manifest:

```bash
./bin/ai-image-pipeline.mjs export my-roll \
  --out ../../apps/filmstrip/remotion-poster/downloads \
  --manifest ../../apps/filmstrip/manifests/my-roll.json
```

## Folder Layout

```text
campaigns/
  my-roll/
    campaign.json
    storyboard.md
    shots/
      01/
        prompt.txt
        preview.html
        v1.jpg
        v2.jpg
        v3.jpg
        v4.jpg
    approved/
      ai-01-establishing-image.jpg
```

`shots/` and `approved/` are ignored by git. Keep `campaign.json` and `storyboard.md` if you want the creative plan tracked.

## Commands

```text
init <campaign> [--template blank|photo-essay|event-recap] [--force]
prompt <campaign> <shot-id> [--extra "..."]
generate <campaign> <shot-id> [--variants 4] [--extra "..."] [--no-open] [--dry-run]
approve <campaign> <shot-id> <variant-number>
export <campaign> --out <dir> [--manifest <path>] [--duration <seconds>]
list <campaign>
```

Generation flags:

```text
--model <model>
--size <size>
--quality <quality>
--format <jpeg|png|webp>
--compression <0-100>
```

## Template Format

Campaign templates live in `templates/*.json`.

```json
{
  "name": "Campaign Name",
  "context": "Shared project context.",
  "style": "Shared visual style.",
  "safety": "Avoid rules and consent constraints.",
  "textPolicy": "How generated images should treat text.",
  "shots": [
    {
      "id": "01",
      "intent": "Shot intent.",
      "people": "People guidance.",
      "style": "Shot-specific style notes."
    }
  ]
}
```

## Safety Notes

- Use fictional people unless the user supplies consented references.
- Avoid readable private information, official documents, addresses, watermarks, and real-person claims.
- Keep human approval in the loop before exporting images into a public artifact.
