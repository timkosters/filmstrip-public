#!/usr/bin/env node
import {copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync} from 'node:fs';
import {basename, dirname, extname, join, relative, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {createInterface} from 'node:readline/promises';
import {stdin as input, stdout as output} from 'node:process';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CAMPAIGNS_DIR = join(ROOT, 'campaigns');
const TEMPLATES_DIR = join(ROOT, 'templates');
const COLUMNS = ['ID', 'Intent', 'People', 'Style', 'Status', 'Source'];
const DEFAULTS = {
  model: 'gpt-image-2',
  size: '1536x1024',
  quality: 'medium',
  format: 'jpeg',
  compression: 90,
  variants: 4,
};
const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.svg']);

const usage = () => {
  console.error(`usage:
  ai-image-pipeline init <campaign> [--template blank|photo-essay|event-recap] [--force]
  ai-image-pipeline prompt <campaign> <shot-id> [--extra "..."]
  ai-image-pipeline generate <campaign> <shot-id> [--variants 4] [--no-open]
  ai-image-pipeline approve <campaign> <shot-id> <variant-number>
  ai-image-pipeline export <campaign> --out <dir> [--manifest <path>] [--layout cascade|sequence]
  ai-image-pipeline list <campaign>

env:
  OPENAI_API_KEY required for generate
`);
  process.exit(1);
};

const parseArgs = (argv) => {
  const flags = {};
  const positional = [];
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) {
      positional.push(token);
      continue;
    }
    const key = token.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) {
      flags[key] = true;
    } else {
      flags[key] = next;
      i += 1;
    }
  }
  return {flags, positional};
};

const loadEnvFile = (path) => {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const match = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(trimmed);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (process.env[key]) continue;
    process.env[key] = rawValue.trim().replace(/^['"]|['"]$/g, '');
  }
};

const loadEnv = () => {
  loadEnvFile(join(ROOT, '.env'));
  loadEnvFile(join(process.cwd(), '.env'));
};

const requireApiKey = () => {
  loadEnv();
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is not set. Add it to .env or export it before generating.');
  }
};

const slugify = (value, fallback = 'shot') => {
  const slug = String(value)
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)
    .replace(/-+$/g, '');
  return slug || fallback;
};

const titleize = (value) => {
  return String(value)
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
};

const campaignDir = (campaign) => join(CAMPAIGNS_DIR, campaign);
const campaignConfigPath = (campaign) => join(campaignDir(campaign), 'campaign.json');
const storyboardPath = (campaign) => join(campaignDir(campaign), 'storyboard.md');
const shotDir = (campaign, id) => join(campaignDir(campaign), 'shots', id);
const approvedDir = (campaign) => join(campaignDir(campaign), 'approved');

const cell = (value) => String(value ?? '-').replace(/\r?\n/g, ' ').replace(/\|/g, '/').trim() || '-';

const renderTable = (rows) => {
  const widths = COLUMNS.map((column, index) => {
    return Math.max(column.length, ...rows.map((row) => cell(row[index]).length), 3);
  });
  const renderRow = (row) => `| ${row.map((value, index) => cell(value).padEnd(widths[index])).join(' | ')} |`;
  return [
    renderRow(COLUMNS),
    `| ${widths.map((width) => '-'.repeat(width)).join(' | ')} |`,
    ...rows.map(renderRow),
  ].join('\n');
};

const rowsFromTemplate = (template) => {
  return template.shots.map((shot) => [
    shot.id,
    shot.intent,
    shot.people ?? 'none visible',
    shot.style ?? '-',
    'needed',
    '-',
  ]);
};

const renderStoryboard = (campaign, template) => {
  return `# ${template.name || titleize(campaign)} storyboard

Storyboard first, generate second. Edit rows freely before generating.

Rules:
- Status values: needed, generated, approved, skipped.
- Keep safety constraints in campaign.json current.
- Approved images land in campaigns/${campaign}/approved/.

${renderTable(rowsFromTemplate(template))}
`;
};

const splitMarkdownRow = (line) => {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((part) => part.trim());
};

const parseStoryboard = (campaign) => {
  const path = storyboardPath(campaign);
  if (!existsSync(path)) {
    throw new Error(`Storyboard not found: ${path}. Run init first.`);
  }
  const lines = readFileSync(path, 'utf8').split(/\r?\n/);
  const tableStart = lines.findIndex((line) => /^\|\s*ID\s*\|/.test(line));
  if (tableStart === -1) throw new Error(`No storyboard table found in ${path}`);
  const rows = [];
  let tableEnd = tableStart + 2;
  for (; tableEnd < lines.length; tableEnd += 1) {
    const line = lines[tableEnd];
    if (!line.trim().startsWith('|')) break;
    const values = splitMarkdownRow(line);
    if (values.length >= COLUMNS.length) rows.push(values.slice(0, COLUMNS.length));
  }
  return {
    path,
    before: lines.slice(0, tableStart).join('\n').replace(/\s*$/g, ''),
    after: lines.slice(tableEnd).join('\n').replace(/^\s*/g, ''),
    rows,
  };
};

const writeStoryboard = ({path, before, after, rows}) => {
  const parts = [];
  if (before) parts.push(before);
  parts.push(renderTable(rows));
  if (after) parts.push(after);
  writeFileSync(path, `${parts.join('\n\n')}\n`);
};

const rowObject = (row) => Object.fromEntries(COLUMNS.map((column, index) => [column, row[index] ?? '-']));

const findShot = (campaign, id) => {
  const parsed = parseStoryboard(campaign);
  const index = parsed.rows.findIndex((row) => row[0] === id);
  if (index === -1) throw new Error(`Shot ${id} not found in ${parsed.path}`);
  return {parsed, index, shot: rowObject(parsed.rows[index])};
};

const setShotStatus = (campaign, id, status, source = null) => {
  const {parsed, index} = findShot(campaign, id);
  parsed.rows[index][4] = status;
  if (source !== null) parsed.rows[index][5] = source;
  writeStoryboard(parsed);
};

const loadCampaign = (campaign) => {
  const path = campaignConfigPath(campaign);
  if (!existsSync(path)) throw new Error(`Campaign config not found: ${path}`);
  return JSON.parse(readFileSync(path, 'utf8'));
};

const buildPrompt = (campaignConfig, shot, extra = '') => {
  return [
    'Create one photorealistic candid image.',
    '',
    `Campaign: ${campaignConfig.name}.`,
    `Shot intent: ${shot.Intent}`,
    `People guidance: ${shot.People}`,
    `Shot-specific style notes: ${shot.Style}`,
    '',
    `Context: ${campaignConfig.context}`,
    `Shared style: ${campaignConfig.style}`,
    `Safety and avoid rules: ${campaignConfig.safety}`,
    `Text policy: ${campaignConfig.textPolicy}`,
    'Output: a single image, no collage, no border, no poster overlay.',
    extra ? `Additional prompt edit: ${extra}` : '',
  ].filter(Boolean).join('\n');
};

const archiveVariants = (dir) => {
  const existing = Array.from({length: 12}, (_, index) => index + 1)
    .flatMap((variant) => ['.jpg', '.jpeg', '.png', '.webp'].map((ext) => join(dir, `v${variant}${ext}`)))
    .filter(existsSync);
  if (existing.length === 0) return;
  const archiveDir = join(dir, `archive-${new Date().toISOString().replace(/[:.]/g, '-')}`);
  mkdirSync(archiveDir, {recursive: true});
  for (const file of existing) renameSync(file, join(archiveDir, basename(file)));
};

const imageExtension = (format) => {
  if (format === 'jpeg') return 'jpg';
  return format;
};

const imageRequestBody = (prompt, flags) => {
  const format = flags.format || process.env.OPENAI_IMAGE_OUTPUT_FORMAT || DEFAULTS.format;
  const body = {
    model: flags.model || process.env.OPENAI_IMAGE_MODEL || DEFAULTS.model,
    prompt,
    n: 1,
    size: flags.size || process.env.OPENAI_IMAGE_SIZE || DEFAULTS.size,
    quality: flags.quality || process.env.OPENAI_IMAGE_QUALITY || DEFAULTS.quality,
    output_format: format,
  };
  const compression = Number(flags.compression || process.env.OPENAI_IMAGE_OUTPUT_COMPRESSION || DEFAULTS.compression);
  if (Number.isFinite(compression) && format !== 'png') body.output_compression = compression;
  return body;
};

const requestHeaders = () => {
  const headers = {
    Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    'Content-Type': 'application/json',
  };
  if (process.env.OPENAI_ORG_ID) headers['OpenAI-Organization'] = process.env.OPENAI_ORG_ID;
  if (process.env.OPENAI_PROJECT_ID) headers['OpenAI-Project'] = process.env.OPENAI_PROJECT_ID;
  return headers;
};

const parseOpenAIError = (text) => {
  try {
    return JSON.parse(text).error?.message || text;
  } catch {
    return text;
  }
};

const generateImage = async (prompt, outPath, flags) => {
  const response = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: requestHeaders(),
    body: JSON.stringify(imageRequestBody(prompt, flags)),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`OpenAI image generation failed (${response.status}): ${parseOpenAIError(text)}`);
  }
  const json = JSON.parse(text);
  const image = json.data?.[0];
  if (!image) throw new Error('OpenAI returned no image data.');
  if (image.b64_json) {
    writeFileSync(outPath, Buffer.from(image.b64_json, 'base64'));
    return;
  }
  if (image.url) {
    const imageResponse = await fetch(image.url);
    if (!imageResponse.ok) throw new Error(`Could not download generated image: ${imageResponse.status}`);
    writeFileSync(outPath, Buffer.from(await imageResponse.arrayBuffer()));
    return;
  }
  throw new Error('OpenAI image response had neither b64_json nor url.');
};

const writePreview = (dir, campaign, id, shot, prompt, count, ext) => {
  const figures = Array.from({length: count}, (_, index) => {
    const n = index + 1;
    const rotation = [-1.4, 1.2, -0.8, 1.7, -1.1, 0.9, -1.8, 1.5][index % 8];
    return `  <figure style="--r:${rotation}deg"><img src="v${n}.${ext}"><figcaption>Variant ${n}</figcaption></figure>`;
  }).join('\n');
  const html = `<!doctype html>
<meta charset="utf-8">
<title>${campaign} ${id}</title>
<style>
  body { margin: 24px; font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif; background: #f7f2e8; color: #1a1713; }
  h1 { font-size: 18px; margin: 0 0 6px; }
  p { margin: 0 0 18px; max-width: 900px; line-height: 1.4; }
  .grid { display: grid; grid-template-columns: repeat(2, minmax(320px, 1fr)); gap: 18px; max-width: 1100px; }
  figure { margin: 0; background: #fffaf1; padding: 10px; box-shadow: 0 8px 30px rgba(0,0,0,0.13); transform: rotate(var(--r)); }
  img { display: block; width: 100%; aspect-ratio: 3 / 2; object-fit: cover; }
  figcaption { margin-top: 8px; font-size: 14px; font-weight: 700; }
  pre { white-space: pre-wrap; max-width: 1100px; padding: 14px; background: rgba(255,255,255,0.62); overflow: auto; }
</style>
<h1>${campaign} / shot ${id}</h1>
<p>${shot.Intent}</p>
<div class="grid">
${figures}
</div>
<h1 style="margin-top:28px">Prompt</h1>
<pre>${prompt.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</pre>
`;
  writeFileSync(join(dir, 'preview.html'), html);
};

const openPreview = (path) => {
  if (process.platform === 'darwin') spawnSync('open', [path], {stdio: 'ignore'});
};

const ask = async (question) => {
  const rl = createInterface({input, output});
  try {
    return (await rl.question(question)).trim();
  } finally {
    rl.close();
  }
};

const uniqueApprovedName = (campaign, shot, extension = '.jpg') => {
  const base = `ai-${shot.ID}-${slugify(shot.Intent)}`;
  const ext = extension.startsWith('.') ? extension : `.${extension}`;
  let name = `${base}${ext}`;
  let counter = 2;
  while (existsSync(join(approvedDir(campaign), name))) {
    name = `${base}-${counter}${ext}`;
    counter += 1;
  }
  return name;
};

const approveVariant = (campaign, id, variant) => {
  const {shot} = findShot(campaign, id);
  const dir = shotDir(campaign, id);
  const candidates = ['jpg', 'jpeg', 'png', 'webp'].map((ext) => join(dir, `v${variant}.${ext}`));
  const source = candidates.find(existsSync);
  if (!source) throw new Error(`Variant v${variant} not found in ${dir}`);
  mkdirSync(approvedDir(campaign), {recursive: true});
  const dest = join(approvedDir(campaign), uniqueApprovedName(campaign, shot, extname(source)));
  copyFileSync(source, dest);
  const rel = relative(campaignDir(campaign), dest);
  setShotStatus(campaign, id, 'approved', rel);
  return dest;
};

const commandInit = ({positional, flags}) => {
  const [campaign] = positional;
  if (!campaign) usage();
  const templateName = flags.template || 'blank';
  const templatePath = join(TEMPLATES_DIR, `${templateName}.json`);
  if (!existsSync(templatePath)) throw new Error(`Template not found: ${templatePath}`);
  const dir = campaignDir(campaign);
  const configPath = campaignConfigPath(campaign);
  const boardPath = storyboardPath(campaign);
  if ((existsSync(configPath) || existsSync(boardPath)) && !flags.force) {
    throw new Error(`Campaign already exists: ${dir}. Use --force to overwrite campaign.json and storyboard.md.`);
  }
  const template = JSON.parse(readFileSync(templatePath, 'utf8'));
  mkdirSync(dir, {recursive: true});
  writeFileSync(configPath, `${JSON.stringify(template, null, 2)}\n`);
  writeFileSync(boardPath, renderStoryboard(campaign, template));
  console.log(`Created ${dir}`);
};

const commandPrompt = ({positional, flags}) => {
  const [campaign, id] = positional;
  if (!campaign || !id) usage();
  const config = loadCampaign(campaign);
  const {shot} = findShot(campaign, id);
  console.log(buildPrompt(config, shot, flags.extra || ''));
};

const commandGenerate = async ({positional, flags}) => {
  const [campaign, id] = positional;
  if (!campaign || !id) usage();
  const config = loadCampaign(campaign);
  const {shot} = findShot(campaign, id);
  const prompt = buildPrompt(config, shot, flags.extra || '');
  if (flags['dry-run']) {
    console.log(prompt);
    return;
  }
  requireApiKey();
  const variants = Math.max(1, Number(flags.variants || DEFAULTS.variants));
  const format = flags.format || process.env.OPENAI_IMAGE_OUTPUT_FORMAT || DEFAULTS.format;
  const ext = imageExtension(format);
  const dir = shotDir(campaign, id);
  mkdirSync(dir, {recursive: true});
  archiveVariants(dir);
  writeFileSync(join(dir, 'prompt.txt'), prompt);

  for (let index = 1; index <= variants; index += 1) {
    const outPath = join(dir, `v${index}.${ext}`);
    console.log(`Generating variant ${index}/${variants}...`);
    await generateImage(prompt, outPath, flags);
  }

  writePreview(dir, campaign, id, shot, prompt, variants, ext);
  setShotStatus(campaign, id, 'generated', '-');
  const previewPath = join(dir, 'preview.html');
  if (!flags['no-open']) openPreview(previewPath);
  console.log(`Preview: ${previewPath}`);

  if (!process.stdin.isTTY) return;
  while (true) {
    const choice = (await ask(`Approve variant [1-${variants}], S to skip: `)).toLowerCase();
    if (choice === 's') return;
    if (/^\d+$/.test(choice) && Number(choice) >= 1 && Number(choice) <= variants) {
      const approved = approveVariant(campaign, id, Number(choice));
      console.log(`Approved: ${approved}`);
      return;
    }
    console.log(`Enter a number from 1 to ${variants}, or S.`);
  }
};

const commandApprove = ({positional}) => {
  const [campaign, id, variant] = positional;
  if (!campaign || !id || !variant) usage();
  const approved = approveVariant(campaign, id, Number(variant));
  console.log(`Approved: ${approved}`);
};

const approvedImages = (campaign) => {
  const dir = approvedDir(campaign);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => !name.startsWith('.'))
    .filter((name) => IMAGE_EXTENSIONS.has(extname(name).toLowerCase()))
    .sort();
};

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const makeCascadeClips = (files, duration) => {
  const positions = [
    {x: 430, y: 82, width: 420, height: 250, rotation: -1.5},
    {x: 50, y: 220, width: 370, height: 245, rotation: 1.2},
    {x: 470, y: 350, width: 370, height: 235, rotation: 1.6},
    {x: 95, y: 70, width: 300, height: 205, rotation: -2},
    {x: 520, y: 215, width: 330, height: 220, rotation: 2},
    {x: 120, y: 430, width: 335, height: 205, rotation: -1.1},
  ];
  return files.map((file, index) => {
    const start = Math.round(index * 0.55 * 100) / 100;
    return {
      file,
      clipStart: 0,
      clipDuration: duration,
      posterStart: start,
      posterEnd: duration,
      revealFrames: 8,
      fadeFrames: 0,
      cropX: 0.5,
      cropY: 0.5,
      ...positions[index % positions.length],
    };
  });
};

const makeSequenceWindow = (flags) => {
  const baseWidth = Number(flags.width || 900);
  const baseHeight = Number(flags.height || 674);
  const scale = clamp(Number(flags.scale || 86), 20, 100) / 100;
  const width = Math.round(baseWidth * scale);
  const height = Math.round(baseHeight * scale);
  return {
    x: Math.round((baseWidth - width) / 2),
    y: Math.round((baseHeight - height) / 2),
    width,
    height,
  };
};

const makeSequenceClips = (files, interval, flags) => {
  const window = makeSequenceWindow(flags);
  return files.map((file, index) => {
    const start = Math.round(index * interval * 1000) / 1000;
    const end = Math.round((index + 1) * interval * 1000) / 1000;
    return {
      file,
      clipStart: 0,
      clipDuration: Math.max(1, interval),
      posterStart: start,
      posterEnd: end,
      revealFrames: 0,
      fadeFrames: 0,
      rotation: 0,
      cropX: 0.5,
      cropY: 0.5,
      ...window,
    };
  });
};

const commandExport = ({positional, flags}) => {
  const [campaign] = positional;
  if (!campaign || !flags.out) usage();
  const files = approvedImages(campaign);
  if (files.length === 0) throw new Error(`No approved images found for ${campaign}. Approve at least one variant first.`);

  const outDir = resolve(flags.out);
  mkdirSync(outDir, {recursive: true});
  for (const file of files) {
    copyFileSync(join(approvedDir(campaign), file), join(outDir, file));
  }
  console.log(`Copied ${files.length} approved image${files.length === 1 ? '' : 's'} to ${outDir}`);

  if (flags.manifest) {
    const layout = flags.layout || (flags.sequence ? 'sequence' : 'cascade');
    const interval = Number(flags.interval || 0.3);
    if (layout === 'sequence' && (!Number.isFinite(interval) || interval <= 0)) {
      throw new Error('--interval must be a positive number of seconds.');
    }
    if (!['cascade', 'sequence'].includes(layout)) {
      throw new Error('--layout must be either cascade or sequence.');
    }
    const duration = layout === 'sequence'
      ? Number(flags.duration || Math.round(files.length * interval * 1000) / 1000)
      : Number(flags.duration || 10);
    const manifest = {
      name: titleize(campaign),
      duration,
      clips: layout === 'sequence' ? makeSequenceClips(files, interval, flags) : makeCascadeClips(files, duration),
    };
    if (flags.width) manifest.width = Number(flags.width);
    if (flags.height) manifest.height = Number(flags.height);
    if (flags.fps) manifest.fps = Number(flags.fps);
    if (flags.background) {
      manifest.background = {color: flags.background, textureOpacity: 0};
    }
    const manifestPath = resolve(flags.manifest);
    mkdirSync(dirname(manifestPath), {recursive: true});
    writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    console.log(`Wrote Filmstrip manifest: ${manifestPath}`);
  }
};

const commandList = ({positional}) => {
  const [campaign] = positional;
  if (!campaign) usage();
  const parsed = parseStoryboard(campaign);
  console.log(renderTable(parsed.rows));
};

const main = async () => {
  const [command, ...argv] = process.argv.slice(2);
  if (!command) usage();
  const parsed = parseArgs(argv);
  if (command === 'init') return commandInit(parsed);
  if (command === 'prompt') return commandPrompt(parsed);
  if (command === 'generate') return commandGenerate(parsed);
  if (command === 'approve') return commandApprove(parsed);
  if (command === 'export') return commandExport(parsed);
  if (command === 'list') return commandList(parsed);
  usage();
};

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
