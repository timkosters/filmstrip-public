# Agent Workflow

This repo is intentionally simple for coding agents: image generation and video rendering communicate through ordinary files.

## User Has Photos Or Videos

1. Put source files in `apps/filmstrip/remotion-poster/downloads/`.
2. Start the editor with `npm run editor`.
3. Arrange clips, save a manifest, then render from the editor or:

```bash
apps/filmstrip/bin/make-poster --manifest apps/filmstrip/manifests/example.json --out apps/filmstrip/remotion-poster/out/filmstrip.mp4
```

## User Wants AI-Generated Stills

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

5. Render:

```bash
cd ../..
apps/filmstrip/bin/make-poster --manifest apps/filmstrip/manifests/my-roll.json --out apps/filmstrip/remotion-poster/out/my-roll.mp4
```

## Notes For Agents

- Use the `blank` template when the user’s concept is unusual.
- Use `--dry-run` on `generate` to inspect prompts without spending API calls.
- If the user is not interactive, generate variants with `--no-open`, then ask them which variant to approve.
- Generated media is ignored by git. Keep it that way.
