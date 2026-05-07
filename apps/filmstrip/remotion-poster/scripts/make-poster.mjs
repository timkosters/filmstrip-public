#!/usr/bin/env node
import {execFileSync, execSync} from 'node:child_process';
import {cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync} from 'node:fs';
import {basename, dirname, extname, join, resolve} from 'node:path';

const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp', '.avif', '.svg']);
const VIDEO_EXT = new Set(['.mp4', '.mov', '.webm', '.m4v', '.mkv']);
const AUDIO_EXT = new Set(['.mp3', '.wav', '.m4a', '.aac', '.ogg', '.flac']);

const projectRoot = resolve(new URL('..', import.meta.url).pathname);
const publicDir = join(projectRoot, 'public');
const publicAssetsDir = join(publicDir, 'assets');
const outDir = join(projectRoot, 'out');

const parseArgs = (argv) => {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) {
      args[key] = true;
    } else {
      args[key] = next;
      i += 1;
    }
  }
  return args;
};

const toSeconds = (value) => {
  if (value === undefined || value === null) return 0;
  if (typeof value === 'number') return value;
  const str = String(value).trim();
  if (/^\d+(\.\d+)?$/.test(str)) return Number(str);
  const parts = str.split(':').map(Number);
  if (parts.some(Number.isNaN)) return 0;
  if (parts.length === 1) return parts[0];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parts[0] * 3600 + parts[1] * 60 + parts[2];
};

const ffprobeDuration = (absPath) => {
  try {
    const out = execSync(
      `ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 "${absPath.replace(/"/g, '\\"')}"`,
      {encoding: 'utf8'},
    );
    const value = Number(out.trim());
    if (Number.isFinite(value)) return value;
  } catch {}
  return null;
};

const findSourceFile = (file, searchRoots) => {
  for (const root of searchRoots) {
    if (!existsSync(root)) continue;
    const direct = join(root, file);
    if (existsSync(direct)) return direct;
  }
  return null;
};

const extractClip = (absPath, start, duration, destPath) => {
  execFileSync(
    'ffmpeg',
    [
      '-y',
      '-ss', String(start),
      '-i', absPath,
      '-t', String(duration),
      '-an',
      '-vf', "scale='min(1280,iw)':'-2',fps=30",
      '-c:v', 'libx264',
      '-preset', 'veryfast',
      '-crf', '22',
      '-pix_fmt', 'yuv420p',
      '-movflags', '+faststart',
      destPath,
    ],
    {stdio: 'pipe'},
  );
};

const safeName = (name) => name.replace(/[^a-zA-Z0-9-_]/g, '-').toLowerCase();

const loadTimeline = (manifestPath) => {
  const raw = JSON.parse(readFileSync(manifestPath, 'utf8'));
  if (Array.isArray(raw)) {
    return {duration: null, clips: raw, music: null};
  }
  return {
    duration: raw.duration ?? null,
    clips: raw.clips ?? [],
    music: raw.music ?? null,
    // Self-contained manifest fields (new format); undefined if legacy format
    name: raw.name,
    width: raw.width,
    height: raw.height,
    fps: raw.fps,
    background: raw.background,
    text: raw.text,
    logo: raw.logo,
  };
};

const buildTimelineWindows = ({clips, searchRoots, defaultClipDuration, fps, baseWidth, baseHeight}) => {
  rmSync(publicAssetsDir, {recursive: true, force: true});
  mkdirSync(publicAssetsDir, {recursive: true});
  const usedDestNames = new Map();
  const windows = [];
  let maxPosterEnd = 0;

  for (let i = 0; i < clips.length; i += 1) {
    const clip = clips[i];
    if (!clip.file) throw new Error(`Manifest clip #${i + 1} missing "file"`);
    const src = findSourceFile(clip.file, searchRoots);
    if (!src) throw new Error(`Source not found for clip "${clip.file}" (searched: ${searchRoots.join(', ')})`);

    const ext = extname(clip.file).toLowerCase();
    const isVideo = VIDEO_EXT.has(ext);
    const isImage = IMAGE_EXT.has(ext);
    if (!isVideo && !isImage) throw new Error(`Unsupported file type: ${clip.file}`);

    const clipDuration = Number(clip.clipDuration ?? clip.duration ?? defaultClipDuration);
    const posterStart = Number(toSeconds(clip.posterStart ?? 0));
    const posterEnd = Number(toSeconds(clip.posterEnd ?? (posterStart + clipDuration)));
    maxPosterEnd = Math.max(maxPosterEnd, posterEnd);

    const baseKey = safeName(basename(clip.file, ext));
    const uniqueIndex = (usedDestNames.get(baseKey) ?? 0) + 1;
    usedDestNames.set(baseKey, uniqueIndex);
    const destName = uniqueIndex === 1 && isImage
      ? `${baseKey}${ext}`
      : `${baseKey}-${uniqueIndex}.${isImage ? ext.slice(1) : 'mp4'}`;
    const dest = join(publicAssetsDir, destName);

    if (isVideo) {
      const total = ffprobeDuration(src);
      const clipStart = clip.clipStart !== undefined ? toSeconds(clip.clipStart) : null;
      let start = clipStart;
      if (start === null) {
        start = total && total > clipDuration + 2 ? Math.max(1, (total - clipDuration) / 2) : 0;
      }
      if (total !== null) {
        if (start >= total) {
          throw new Error(`Clip ${clip.file}: clipStart ${start}s is past source duration (${total.toFixed(2)}s)`);
        }
        if (start + clipDuration > total) {
          const adjusted = Math.max(0, total - clipDuration - 0.1);
          console.warn(`  WARN: ${clip.file} clip ${start}+${clipDuration} exceeds source ${total.toFixed(2)}s. Shifting start to ${adjusted.toFixed(2)}.`);
          start = adjusted;
        }
      }
      console.log(`  [${i + 1}] ${clip.file} clip ${start.toFixed(2)}s+${clipDuration}s -> poster ${posterStart}s..${posterEnd}s`);
      extractClip(src, start, clipDuration, dest);
      const out = ffprobeDuration(dest);
      if (!out || out < 0.1) {
        throw new Error(`ffmpeg produced empty output for ${clip.file}. Source ${total}s, start ${start}s, duration ${clipDuration}s.`);
      }
    } else {
      cpSync(src, dest);
      console.log(`  [${i + 1}] image ${clip.file} -> poster ${posterStart}s..${posterEnd}s`);
    }

    const width = Number(clip.width ?? 420);
    const height = Number(clip.height ?? 250);
    const x = Number(clip.x ?? Math.round((baseWidth - width) / 2));
    const y = Number(clip.y ?? Math.round((baseHeight - height) / 2));

    windows.push({
      asset: {
        path: `assets/${destName}`,
        kind: isVideo ? 'video' : 'image',
      },
      x,
      y,
      width,
      height,
      rotation: Number(clip.rotation ?? 0),
      cropX: Number(clip.cropX ?? 0.5),
      cropY: Number(clip.cropY ?? 0.5),
      zIndex: 20 + i,
      posterStartFrame: Math.round(posterStart * fps),
      posterEndFrame: Math.round(posterEnd * fps),
      revealFrames: Math.max(0, Math.round(Number(clip.revealFrames ?? 0))),
      fadeFrames: Math.max(0, Math.round(Number(clip.fadeFrames ?? 0))),
    });
  }

  return {windows, maxPosterEnd};
};

const autoDiscoverTimeline = (imagesDir, defaultClipDuration) => {
  const absolute = resolve(imagesDir);
  const entries = readdirSync(absolute)
    .filter((name) => !name.startsWith('.'))
    .filter((name) => IMAGE_EXT.has(extname(name).toLowerCase()) || VIDEO_EXT.has(extname(name).toLowerCase()))
    .sort();
  if (entries.length === 0) throw new Error(`No media in ${absolute}`);
  // Simple cascade: each clip plays for 3s, new one enters every 1.5s
  const STEP = 1.5;
  const SHOW = 4;
  const positions = [
    {x: 470, y: 90, width: 380, height: 220},
    {x: 40, y: 230, width: 380, height: 240},
    {x: 450, y: 360, width: 420, height: 260},
    {x: 60, y: 100, width: 360, height: 220},
    {x: 480, y: 250, width: 380, height: 220},
    {x: 80, y: 410, width: 400, height: 220},
  ];
  return entries.map((name, i) => ({
    file: name,
    clipDuration: defaultClipDuration,
    posterStart: i * STEP,
    posterEnd: i * STEP + SHOW,
    ...positions[i % positions.length],
  }));
};

const pickFormat = (value) => {
  const presets = {
    '900x674': {width: 900, height: 674},
    '1080x1080': {width: 1080, height: 1080},
    '1080x1350': {width: 1080, height: 1350},
    '1920x1080': {width: 1920, height: 1080},
  };
  if (presets[value]) return presets[value];
  const match = /^(\d+)x(\d+)$/.exec(value || '');
  if (!match) return presets['900x674'];
  return {width: Number(match[1]), height: Number(match[2])};
};

const run = () => {
  const args = parseArgs(process.argv.slice(2));
  if (!args.manifest && !args.images) {
    console.error(`usage: make-poster [--manifest <json>] [--images <dir>] [options]

Timeline mode (recommended):
  --manifest <path>      JSON with per-clip x/y/size/timing. See README.
  --images <dir>         directory to search for referenced files (also downloads/).

Auto mode (quick test):
  --images <dir>         folder of images or videos; auto-places into a cascade.

Common:
  --out <path>           output mp4 or gif path
  --still                render final-frame PNG
  --duration <seconds>   override total poster duration (default: auto-fit)
  --fps 30               frame rate
  --clip 2.5             default clip length for videos
  --format 900x674       canvas size
  --background           override background color
  --accent               override overlap color
`);
    process.exit(1);
  }

  const fps = Number(args.fps || 30);
  const defaultClipDuration = Number(args.clip || 2.5);
  const {width, height} = pickFormat(args.format);

  const basePresetPath = args.preset ? resolve(args.preset) : join(projectRoot, 'src', 'default-preset.json');
  const basePreset = JSON.parse(readFileSync(basePresetPath, 'utf8'));

  const searchRoots = [];
  if (args.images) searchRoots.push(resolve(args.images));
  if (args.manifest) searchRoots.push(dirname(resolve(args.manifest)));
  searchRoots.push(join(projectRoot, 'downloads'));

  let clips;
  let manifestMusic = null;
  let manifestData = {};
  if (args.manifest) {
    const timeline = loadTimeline(resolve(args.manifest));
    clips = timeline.clips;
    manifestMusic = timeline.music;
    manifestData = timeline;
    if (timeline.duration && !args.duration) args.duration = timeline.duration;
  } else {
    clips = autoDiscoverTimeline(args.images, defaultClipDuration);
  }

  // Self-contained manifest overrides base preset
  const effectiveWidth = manifestData.width ?? (args.format ? width : basePreset.width);
  const effectiveHeight = manifestData.height ?? (args.format ? height : basePreset.height);
  const effectiveFps = Number(args.fps || manifestData.fps || basePreset.fps || 30);

  const {windows, maxPosterEnd} = buildTimelineWindows({
    clips,
    searchRoots,
    defaultClipDuration,
    fps: effectiveFps,
    baseWidth: effectiveWidth,
    baseHeight: effectiveHeight,
  });

  const totalSeconds = Number(args.duration ?? (maxPosterEnd + 0.3));
  const durationInFrames = Math.max(30, Math.round(effectiveFps * totalSeconds));

  // Music
  let music = null;
  const musicSpec = manifestMusic;
  if (musicSpec && musicSpec.file) {
    const src = findSourceFile(musicSpec.file, searchRoots);
    if (!src) {
      throw new Error(`Music source not found: ${musicSpec.file} (searched ${searchRoots.join(', ')})`);
    }
    const destName = `music-${safeName(basename(musicSpec.file, extname(musicSpec.file)))}${extname(musicSpec.file).toLowerCase()}`;
    const dest = join(publicAssetsDir, destName);
    cpSync(src, dest);
    music = {
      file: `assets/${destName}`,
      startFrom: Number(musicSpec.startFrom ?? 0),
      volume: Number(musicSpec.volume ?? 1),
      fadeInFrames: Math.round(Number(musicSpec.fadeInFrames ?? 0)),
      fadeOutFrames: Math.round(Number(musicSpec.fadeOutFrames ?? 0)),
    };
    console.log(`  music: ${musicSpec.file} -> ${destName} (vol ${music.volume}, fade ${music.fadeInFrames}/${music.fadeOutFrames})`);
  }

  const preset = {
    ...basePreset,
    width: effectiveWidth,
    height: effectiveHeight,
    fps: effectiveFps,
    durationInFrames,
    seed: Number(args.seed || basePreset.seed),
    stillFrame: args.still ? durationInFrames - 1 : null,
    background: {
      ...basePreset.background,
      ...(manifestData.background ?? {}),
      color: args.background || manifestData.background?.color || basePreset.background.color,
    },
    text: {
      ...basePreset.text,
      ...(manifestData.text ?? {}),
      overlapColor: args.accent || manifestData.text?.overlapColor || basePreset.text.overlapColor,
      blocks: manifestData.text?.blocks ?? basePreset.text.blocks,
    },
    logo: manifestData.logo ?? basePreset.logo,
    music,
    windows,
  };

  mkdirSync(outDir, {recursive: true});
  const propsPath = join(outDir, 'props.json');
  writeFileSync(propsPath, JSON.stringify(preset, null, 2));

  console.log(`\nTimeline: ${windows.length} clips, total ${totalSeconds.toFixed(2)}s (${durationInFrames} frames)`);
  console.log(`Props written to ${propsPath}`);

  if (args['no-render']) {
    console.log('Skipping render (--no-render). Open Remotion Studio with: bin/preview');
    return;
  }

  const outFile = args.out
    ? resolve(args.out)
    : join(outDir, args.still ? 'poster.png' : 'poster.mp4');
  mkdirSync(resolve(outFile, '..'), {recursive: true});

  if (args.still) {
    console.log(`Rendering still → ${outFile}`);
    execFileSync(
      'npx',
      ['remotion', 'still', 'src/index.ts', 'PosterStill', outFile, `--props=${propsPath}`],
      {cwd: projectRoot, stdio: 'inherit'},
    );
  } else {
    const ext = extname(outFile).toLowerCase();
    const isGif = ext === '.gif';
    const renderArgs = [
      'remotion',
      'render',
      'src/index.ts',
      'Poster',
      outFile,
      `--props=${propsPath}`,
    ];
    if (isGif) renderArgs.push('--codec=gif');
    console.log(`Rendering ${isGif ? 'gif' : 'mp4'} → ${outFile}`);
    execFileSync('npx', renderArgs, {cwd: projectRoot, stdio: 'inherit'});
  }

  console.log(`\nDone: ${outFile}`);
};

try {
  run();
} catch (error) {
  console.error(error.message || error);
  process.exit(1);
}
