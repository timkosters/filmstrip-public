#!/usr/bin/env node
import {spawn} from 'node:child_process';
import {createServer} from 'node:http';
import {readFile, writeFile, stat} from 'node:fs/promises';
import {createReadStream, existsSync, readFileSync, readdirSync, statSync} from 'node:fs';
import {basename, extname, join, resolve} from 'node:path';
import {parse} from 'node:url';

const projectRoot = resolve(new URL('..', import.meta.url).pathname);
const editorDir = resolve(new URL('.', import.meta.url).pathname);
const remotionRoot = join(projectRoot, 'remotion-poster');
const downloadsDir = join(remotionRoot, 'downloads');
const publicDir = join(remotionRoot, 'public');
const manifestsDir = join(projectRoot, 'manifests');

const PORT = Number(process.env.EDITOR_PORT || 5959);

const presetPath = join(remotionRoot, 'src', 'default-preset.json');

const initialManifestName = process.env.EDITOR_MANIFEST
  ? basename(resolve(process.env.EDITOR_MANIFEST))
  : pickInitialManifest();

let currentManifestFile = initialManifestName;
const manifestPathFor = (filename) => join(manifestsDir, filename);

function pickInitialManifest() {
  if (!existsSync(manifestsDir)) return null;
  const files = readdirSync(manifestsDir)
    .filter((n) => n.endsWith('.json') && !n.startsWith('.') && n !== 'example.json');
  if (files.length === 0) return 'example.json';
  if (files.includes('starter.json')) return 'starter.json';
  return files.sort()[0];
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.mp4': 'video/mp4',
  '.mov': 'video/mp4',
  '.webm': 'video/webm',
  '.svg': 'image/svg+xml',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.m4a': 'audio/mp4',
  '.aac': 'audio/aac',
  '.ogg': 'audio/ogg',
  '.flac': 'audio/flac',
};

const send = (res, status, body, type = 'text/plain; charset=utf-8') => {
  res.writeHead(status, {'content-type': type});
  res.end(body);
};

const sendJson = (res, status, body) => send(res, status, JSON.stringify(body, null, 2), MIME['.json']);

const streamFile = async (res, filePath, req) => {
  try {
    const info = await stat(filePath);
    const type = MIME[extname(filePath).toLowerCase()] || 'application/octet-stream';
    const range = req?.headers?.range;
    if (range) {
      const match = /bytes=(\d+)-(\d*)/.exec(range);
      if (match) {
        const start = Number(match[1]);
        const end = match[2] ? Number(match[2]) : info.size - 1;
        res.writeHead(206, {
          'content-type': type,
          'content-range': `bytes ${start}-${end}/${info.size}`,
          'accept-ranges': 'bytes',
          'content-length': end - start + 1,
        });
        createReadStream(filePath, {start, end}).pipe(res);
        return;
      }
    }
    res.writeHead(200, {
      'content-type': type,
      'content-length': info.size,
      'accept-ranges': 'bytes',
    });
    createReadStream(filePath).pipe(res);
  } catch (error) {
    send(res, 404, `Not found: ${filePath}`);
  }
};

const renderJobs = new Map();

const sanitizeFilename = (value) => {
  const clean = String(value || '').trim().replace(/[^a-zA-Z0-9._-]/g, '-');
  if (!clean || clean.startsWith('.')) return '';
  return clean;
};

const slugForProject = (value) => {
  return String(value || 'untitled')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'untitled';
};

const uniqueProjectFile = (name) => {
  const slug = slugForProject(name);
  let file = `${slug}.json`;
  let suffix = 2;
  while (existsSync(manifestPathFor(file))) {
    file = `${slug}-${suffix}.json`;
    suffix += 1;
  }
  return file;
};

const nextBranchName = (value) => {
  const base = String(value || 'Untitled poster').trim();
  const match = /\bv(\d+)\b\s*$/i.exec(base);
  if (!match) return `${base} v2`;
  return `${base.slice(0, match.index).trim()} v${Number(match[1]) + 1}`;
};

const startRender = ({outFile, format}) => {
  const id = String(Date.now()) + '-' + Math.random().toString(36).slice(2, 8);
  const absOut = outFile || join(remotionRoot, 'out', `filmstrip-${new Date().toISOString().replace(/[-:T]/g, '').slice(0, 15)}.${format || 'mp4'}`);
  const job = {
    id,
    status: 'running',
    outFile: absOut,
    startedAt: Date.now(),
    lines: [],
    lastProgress: null,
    error: null,
    endedAt: null,
  };
  renderJobs.set(id, job);

  const args = [
    join(remotionRoot, 'scripts', 'make-poster.mjs'),
    '--manifest', manifestPathFor(currentManifestFile),
    '--out', absOut,
  ];
  const child = spawn('node', args, {cwd: remotionRoot, env: process.env});
  job.pid = child.pid;
  const consume = (chunk) => {
    const text = chunk.toString('utf8');
    const lines = text.split(/\r|\n/).filter(Boolean);
    for (const line of lines) {
      job.lines.push(line);
      const m = /Rendered (\d+)\/(\d+)/.exec(line);
      if (m) {
        job.lastProgress = {phase: 'render', current: Number(m[1]), total: Number(m[2])};
      }
      const e = /Encoded (\d+)\/(\d+)/.exec(line);
      if (e) {
        job.lastProgress = {phase: 'encode', current: Number(e[1]), total: Number(e[2])};
      }
      if (job.lines.length > 500) job.lines.splice(0, job.lines.length - 500);
    }
  };
  child.stdout.on('data', consume);
  child.stderr.on('data', consume);
  child.on('error', (err) => {
    job.status = 'error';
    job.error = err.message;
    job.endedAt = Date.now();
  });
  child.on('close', (code) => {
    job.endedAt = Date.now();
    if (code === 0) {
      job.status = 'done';
    } else {
      job.status = 'error';
      if (!job.error) job.error = `make-poster exited with code ${code}`;
    }
  });
  return job;
};

const openPath = (path) => {
  const command = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'explorer' : 'xdg-open';
  const child = spawn(command, [path]);
  child.on('error', () => {});
  child.unref();
};

const listSources = () => {
  if (!existsSync(downloadsDir)) return [];
  return readdirSync(downloadsDir)
    .filter((name) => !name.startsWith('.'))
    .filter((name) => /\.(mp4|mov|webm|m4v|mkv|png|jpg|jpeg|webp|svg|mp3|wav|m4a|aac|ogg|flac)$/i.test(name))
    .map((name) => {
      const ext = name.slice(name.lastIndexOf('.')).toLowerCase();
      const kind = /\.(mp3|wav|m4a|aac|ogg|flac)$/i.test(name)
        ? 'audio'
        : /\.(mp4|mov|webm|m4v|mkv)$/i.test(name) ? 'video' : 'image';
      return {
        file: name,
        size: statSync(join(downloadsDir, name)).size,
        kind,
      };
    });
};

const server = createServer(async (req, res) => {
  const url = parse(req.url || '/', true);
  const pathname = url.pathname || '/';

  try {
    if (pathname === '/' || pathname === '/index.html') {
      return streamFile(res, join(editorDir, 'index.html'), req);
    }
    if (pathname === '/editor.js' || pathname === '/editor.css') {
      return streamFile(res, join(editorDir, pathname.slice(1)), req);
    }

    if (pathname === '/api/preset') {
      const preset = JSON.parse(await readFile(presetPath, 'utf8'));
      return sendJson(res, 200, preset);
    }

    if (pathname === '/api/manifest' && req.method === 'GET') {
      const p = manifestPathFor(currentManifestFile);
      if (!existsSync(p)) {
        const seed = JSON.parse(await readFile(presetPath, 'utf8'));
        return sendJson(res, 200, {
          duration: null, clips: [], file: currentManifestFile,
          width: seed.width, height: seed.height, fps: seed.fps,
          background: seed.background, text: seed.text, logo: seed.logo, music: null,
        });
      }
      const raw = JSON.parse(await readFile(p, 'utf8'));
      const normalized = Array.isArray(raw) ? {duration: null, clips: raw} : raw;
      const seed = JSON.parse(await readFile(presetPath, 'utf8'));
      // Backfill self-contained fields from default-preset.json if missing
      const merged = {
        ...normalized,
        width: normalized.width ?? seed.width,
        height: normalized.height ?? seed.height,
        fps: normalized.fps ?? seed.fps,
        background: normalized.background ?? seed.background,
        text: normalized.text ?? seed.text,
        logo: normalized.logo ?? seed.logo,
        music: normalized.music ?? null,
        path: p,
        file: currentManifestFile,
      };
      return sendJson(res, 200, merged);
    }

    if (pathname === '/api/manifest' && req.method === 'POST') {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      const p = manifestPathFor(currentManifestFile);
      await writeFile(p, JSON.stringify(body, null, 2) + '\n');
      return sendJson(res, 200, {ok: true, path: p, file: currentManifestFile});
    }

    if (pathname === '/api/projects' && req.method === 'GET') {
      if (!existsSync(manifestsDir)) return sendJson(res, 200, {projects: [], current: currentManifestFile});
      const projects = readdirSync(manifestsDir)
        .filter((n) => n.endsWith('.json') && !n.startsWith('.'))
        .sort()
        .map((file) => {
          try {
            const data = JSON.parse(readFileSync(join(manifestsDir, file), 'utf8'));
            return {
              file,
              name: data.name || file.replace(/\.json$/, ''),
              clipCount: Array.isArray(data) ? data.length : (data.clips?.length ?? 0),
            };
          } catch (_) {
            return {file, name: file.replace(/\.json$/, ''), clipCount: 0};
          }
        });
      return sendJson(res, 200, {projects, current: currentManifestFile});
    }

    if (pathname === '/api/projects' && req.method === 'POST') {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      let body = {};
      try {body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');} catch (_) {/* ignore */}
      const rawName = (body.name || 'untitled').toString().trim();
      const file = uniqueProjectFile(rawName);
      // Seed from default-preset.json
      const seed = JSON.parse(await readFile(presetPath, 'utf8'));
      const newManifest = {
        name: rawName,
        duration: 10,
        width: seed.width ?? 900,
        height: seed.height ?? 674,
        fps: seed.fps ?? 30,
        background: seed.background,
        text: seed.text,
        logo: seed.logo,
        music: null,
        clips: [],
      };
      await writeFile(manifestPathFor(file), JSON.stringify(newManifest, null, 2) + '\n');
      currentManifestFile = file;
      return sendJson(res, 201, {file, name: rawName});
    }

    if (pathname === '/api/branch-project' && req.method === 'POST') {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      let body = {};
      try {body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');} catch (_) {/* ignore */}
      const sourceFile = body.file || currentManifestFile;
      const sourcePath = manifestPathFor(sourceFile);
      if (!sourceFile || !existsSync(sourcePath)) return sendJson(res, 404, {error: 'Project not found'});

      const sourceRaw = JSON.parse(await readFile(sourcePath, 'utf8'));
      const sourceManifest = Array.isArray(sourceRaw) ? {duration: null, clips: sourceRaw} : sourceRaw;
      const sourceName = sourceManifest.name || sourceFile.replace(/\.json$/, '');
      const rawName = (body.name || nextBranchName(sourceName)).toString().trim();
      const file = uniqueProjectFile(rawName);
      const branched = {
        ...sourceManifest,
        name: rawName,
        branchedFrom: {
          file: sourceFile,
          name: sourceName,
          at: new Date().toISOString(),
        },
      };
      await writeFile(manifestPathFor(file), JSON.stringify(branched, null, 2) + '\n');
      currentManifestFile = file;
      return sendJson(res, 201, {file, name: rawName, branchedFrom: sourceFile});
    }

    if (pathname === '/api/switch-project' && req.method === 'POST') {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      let body = {};
      try {body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');} catch (_) {/* ignore */}
      const file = body.file;
      if (!file || !existsSync(manifestPathFor(file))) return sendJson(res, 404, {error: 'Project not found'});
      currentManifestFile = file;
      return sendJson(res, 200, {current: currentManifestFile});
    }

    if (pathname === '/api/sources') {
      return sendJson(res, 200, {files: listSources(), dir: downloadsDir});
    }

    if (pathname === '/api/render' && req.method === 'POST') {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      let body = {};
      try {body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');} catch (_) {/* ignore */}
      const nameSafe = sanitizeFilename(body.filename);
      const format = body.format === 'gif' ? 'gif' : 'mp4';
      let outFile;
      if (nameSafe) {
        const withExt = /\.(mp4|gif)$/i.test(nameSafe) ? nameSafe : `${nameSafe}.${format}`;
        outFile = join(remotionRoot, 'out', withExt);
      }
      const job = startRender({outFile, format});
      return sendJson(res, 202, {id: job.id, outFile: job.outFile});
    }

    if (pathname.startsWith('/api/render/') && req.method === 'GET') {
      const id = pathname.slice('/api/render/'.length);
      const job = renderJobs.get(id);
      if (!job) return sendJson(res, 404, {error: 'Unknown job'});
      return sendJson(res, 200, {
        id: job.id,
        status: job.status,
        outFile: job.outFile,
        lastProgress: job.lastProgress,
        startedAt: job.startedAt,
        endedAt: job.endedAt,
        error: job.error,
        tail: job.lines.slice(-30),
      });
    }

    if (pathname === '/api/open-folder' && req.method === 'POST') {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      let body = {};
      try {body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');} catch (_) {/* ignore */}
      const p = body.path ? resolve(body.path) : null;
      if (!p || !existsSync(p)) return sendJson(res, 404, {error: 'File not found'});
      openPath(body.reveal === false ? p : p);
      return sendJson(res, 200, {ok: true});
    }

    if (pathname.startsWith('/source/')) {
      const name = decodeURIComponent(pathname.slice('/source/'.length));
      return streamFile(res, join(downloadsDir, name), req);
    }

    if (pathname.startsWith('/public/')) {
      const rel = decodeURIComponent(pathname.slice('/public/'.length));
      return streamFile(res, join(publicDir, rel), req);
    }

    send(res, 404, `Not found: ${pathname}`);
  } catch (error) {
    send(res, 500, `Error: ${error.message}`);
  }
});

server.listen(PORT, () => {
  console.log(`Editor running at http://localhost:${PORT}`);
  console.log(`Initial project: ${currentManifestFile}`);
});
