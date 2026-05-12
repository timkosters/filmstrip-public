# Agent Workflow

This repo is intentionally simple for Codex and other coding agents: image generation and video rendering communicate through ordinary files.

## User Has Photos Or Videos

1. Put source files in `apps/filmstrip/remotion-poster/downloads/`.
2. Start the editor with `npm run editor`.
3. Arrange clips, save a manifest, then render from the editor or:

```bash
apps/filmstrip/bin/make-poster --manifest apps/filmstrip/manifests/example.json --out apps/filmstrip/remotion-poster/out/filmstrip.mp4
```

## User Wants AI-Generated Stills In Codex Or ChatGPT

Prefer native image generation when the user's Codex/ChatGPT environment supports it. This is usually the lowest-friction path because it can use the user's ChatGPT account instead of requiring a separate API key.

1. Draft a short storyboard or shot list.
2. Generate images natively in the conversation.
3. Ask the user which images to approve.
4. Put the approved image files in `apps/filmstrip/remotion-poster/downloads/`.
5. Create a manifest in `apps/filmstrip/manifests/`.
6. Render:

```bash
apps/filmstrip/bin/make-poster --manifest apps/filmstrip/manifests/my-roll.json --out apps/filmstrip/remotion-poster/out/my-roll.mp4
```

For large image sets, keep the workflow disk-first: save generated files into a folder and show the user a folder path or compact contact sheet. Avoid embedding dozens of full-size generated images in the chat, because that makes long agent sessions slow to reload.

## User Wants API-Backed Local Generation

Use this path when native image generation is unavailable, the user wants reproducible CLI runs, or the work needs an explicit campaign folder.

1. Create a campaign:

```bash
cd packages/image-pipeline
./bin/ai-image-pipeline.mjs init my-roll --template photo-essay
```

2. Edit `campaigns/my-roll/campaign.json` and `campaigns/my-roll/storyboard.md`.
3. Generate and approve shots:

```bash
./bin/ai-image-pipeline.mjs generate my-roll 01
```

4. Export approved images into Filmstrip:

```bash
./bin/ai-image-pipeline.mjs export my-roll \
  --out ../../apps/filmstrip/remotion-poster/downloads \
  --manifest ../../apps/filmstrip/manifests/my-roll.json
```

For rapid one-image-after-another videos, export a centered sequence manifest:

```bash
./bin/ai-image-pipeline.mjs export my-roll \
  --out ../../apps/filmstrip/remotion-poster/downloads \
  --manifest ../../apps/filmstrip/manifests/my-roll-sequence.json \
  --layout sequence \
  --interval 0.3 \
  --scale 86
```

5. Render:

```bash
cd ../..
apps/filmstrip/bin/make-poster --manifest apps/filmstrip/manifests/my-roll-sequence.json --out apps/filmstrip/remotion-poster/out/my-roll.mp4
```

## Notes For Agents

- Use the `blank` template when the user’s concept is unusual.
- Prefer native Codex/ChatGPT image generation before asking the user to configure an API key.
- Use `--dry-run` on `generate` to inspect prompts without spending API calls.
- If the user is not interactive, generate variants with `--no-open`, then ask them which variant to approve.
- Generated media is ignored by git. Keep it that way.
