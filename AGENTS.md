# Filmstrip Agent Guide

You are helping a user make a short filmstrip-style video from their own media or generated stills. Keep the repo generic. Do not add user names, private locations, real likenesses, generated media, API keys, or one-off campaign data to git.

## Main Paths

| Path | Use |
|---|---|
| `apps/filmstrip/` | Browser editor and Remotion renderer. |
| `apps/filmstrip/remotion-poster/downloads/` | User media input folder, ignored by git. |
| `apps/filmstrip/manifests/` | Public examples plus user-created local manifests. |
| `packages/image-pipeline/` | Optional OpenAI Images API workflow. |
| `packages/image-pipeline/campaigns/` | User campaign configs and storyboards. Generated shots and approved images are ignored. |

## Recommended Workflow

1. Ask whether the user already has images/video or wants generated stills.
2. If they have media, put it in `apps/filmstrip/remotion-poster/downloads/`.
3. If they want generated stills, use `packages/image-pipeline`:
   - create a campaign from `photo-essay`, `event-recap`, or `blank`
   - edit `campaign.json` and `storyboard.md` for the user
   - generate variants one shot at a time
   - keep human approval in the loop
   - export approved images into Filmstrip
4. Use the editor or a generated manifest to arrange clips.
5. Render a still or video and verify the output exists.

## Useful Commands

```bash
npm run setup
npm run check
npm run still:example
npm run render:example
npm run editor
```

```bash
cd packages/image-pipeline
./bin/ai-image-pipeline.mjs init my-roll --template photo-essay
./bin/ai-image-pipeline.mjs prompt my-roll 01
./bin/ai-image-pipeline.mjs generate my-roll 01
./bin/ai-image-pipeline.mjs export my-roll --out ../../apps/filmstrip/remotion-poster/downloads --manifest ../../apps/filmstrip/manifests/my-roll.json
```

## Guardrails

- Never commit `.env`, generated images, approved images, user uploads, or render outputs.
- Keep example media generic and small.
- Keep prompt templates fictional unless the user explicitly provides consented references.
- Prefer `gpt-image-2` for new image-generation workflows, but leave the model configurable through environment variables and flags.
- For Remotion assets, keep renderable files in `public/` and reference them through `staticFile()` inside components.
