const BASE_WIDTH = 900;
const BASE_HEIGHT = 674;

const state = {
  preset: null,
  manifest: {duration: null, clips: [], music: null},
  projects: [],
  currentProject: null,
  sources: [],
  selectedIndex: -1,
  moveable: null,
  isPlaying: false,
  playStart: 0,
  currentTime: 0,
  history: [],
  historyIndex: -1,
  musicAudio: null,
  musicPreviewMuted: false,
};

const SNAP_THRESHOLD_SEC = 0.15;
const MIN_CLIP_SECONDS = 0.3;

const stage = document.getElementById('stage');
const paper = document.getElementById('paper');
const textLayer = document.getElementById('text-layer');
const logoLayer = document.getElementById('logo-layer');
const windowsLayer = document.getElementById('windows-layer');
const inspectorEmpty = document.getElementById('selected-empty');
const inspectorForm = document.getElementById('selected-form');
const manifestPathEl = document.getElementById('manifest-path');
const saveStatus = document.getElementById('save-status');
const timeline = document.getElementById('timeline');
const timelineLabels = document.getElementById('timeline-labels');
const playhead = document.getElementById('timeline-playhead');

const fields = {};
['file', 'clipStart', 'clipDuration', 'posterStart', 'posterEnd', 'fadeFrames', 'rotation', 'x', 'y', 'width', 'height'].forEach((key) => {
  fields[key] = document.getElementById('field-' + key);
});

document.documentElement.style.setProperty('--stage-w', BASE_WIDTH + 'px');
document.documentElement.style.setProperty('--stage-h', BASE_HEIGHT + 'px');

async function fetchJson(url, options) {
  const res = await fetch(url, options);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

function toSeconds(value) {
  if (value === undefined || value === null || value === '') return 0;
  if (typeof value === 'number') return value;
  const s = String(value).trim();
  if (/^\d+(\.\d+)?$/.test(s)) return Number(s);
  const parts = s.split(':').map(Number);
  if (parts.some(Number.isNaN)) return 0;
  if (parts.length === 1) return parts[0];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parts[0] * 3600 + parts[1] * 60 + parts[2];
}

function totalDuration() {
  if (state.manifest.duration) return state.manifest.duration;
  return state.manifest.clips.reduce((max, c) => Math.max(max, Number(c.posterEnd ?? 0)), 10);
}

async function init() {
  await loadAll();
  bindTopbar();
  bindInspector();
  bindMusic();
  bindTextPanel();
  bindProjects();
  bindExportModal();
  bindKeyboard();
}

async function loadAll() {
  state.manifest = await fetchJson('/api/manifest');
  state.preset = derivePresetFromManifest(state.manifest);
  const sourcesResp = await fetchJson('/api/sources');
  state.sources = sourcesResp.files;
  const projectsResp = await fetchJson('/api/projects');
  state.projects = projectsResp.projects || [];
  state.currentProject = projectsResp.current || state.manifest.file;
  manifestPathEl.textContent = state.manifest.file ? `• ${state.manifest.file}` : '';
  pushHistory(true);
  renderProjectSelect();
  renderStage();
  renderTextPanel();
  renderSourcesDropdown();
  renderSourceLibrary();
  renderWindows();
  renderTimeline();
  renderMusicForm();
  ensureMusicAudio();
  syncDurationInput();
}

function derivePresetFromManifest(manifest) {
  // Manifests are self-contained now — text/logo/bg/dimensions inline.
  // Fallback defaults for old/blank manifests.
  return {
    width: manifest.width ?? 900,
    height: manifest.height ?? 674,
    background: manifest.background ?? {color: '#faf7f0', textureOpacity: 0.22},
    text: manifest.text ?? {
      color: '#1a1713',
      overlapColor: '#e4703b',
      titleFont: '"EB Garamond", Georgia, serif',
      monoFont: 'ui-monospace, SFMono-Regular, Menlo, monospace',
      blocks: [],
    },
    logo: manifest.logo,
  };
}

function snapshotManifest() {
  return JSON.parse(JSON.stringify({
    duration: state.manifest.duration,
    clips: state.manifest.clips,
    music: state.manifest.music ?? null,
  }));
}

function pushHistory(initial = false) {
  const snap = snapshotManifest();
  const newHistory = state.history.slice(0, state.historyIndex + 1);
  if (!initial && newHistory.length) {
    const last = newHistory[newHistory.length - 1];
    if (JSON.stringify(last) === JSON.stringify(snap)) return;
  }
  newHistory.push(snap);
  if (newHistory.length > 60) newHistory.shift();
  state.history = newHistory;
  state.historyIndex = newHistory.length - 1;
}

function restoreSnapshot(snap) {
  state.manifest.duration = snap.duration;
  state.manifest.clips = JSON.parse(JSON.stringify(snap.clips));
  state.manifest.music = snap.music ? JSON.parse(JSON.stringify(snap.music)) : null;
  state.selectedIndex = Math.min(state.selectedIndex, state.manifest.clips.length - 1);
  renderWindows();
  renderTimeline();
  renderInspectorValues();
  renderMusicForm();
  ensureMusicAudio();
  syncDurationInput();
}

function syncDurationInput() {
  const el = document.getElementById('poster-duration');
  if (el) el.value = state.manifest.duration ?? totalDuration();
}

function undo() {
  if (state.historyIndex <= 0) return;
  state.historyIndex -= 1;
  restoreSnapshot(state.history[state.historyIndex]);
}
function redo() {
  if (state.historyIndex >= state.history.length - 1) return;
  state.historyIndex += 1;
  restoreSnapshot(state.history[state.historyIndex]);
}

function renderStage() {
  const p = state.preset;
  paper.style.background = p.background?.color || '#faf7f0';
  textLayer.innerHTML = '';
  for (const block of p.text.blocks) {
    const el = document.createElement('div');
    el.className = 'text-block';
    el.style.left = block.left + 'px';
    el.style.top = block.top + 'px';
    if (block.width) el.style.width = block.width + 'px';
    el.style.color = p.text.color;
    el.style.fontFamily = (block.fontFamily === 'mono')
      ? 'ui-monospace, SFMono-Regular, Menlo, monospace'
      : '"EB Garamond", Georgia, serif';
    el.style.fontSize = (block.fontSize || 40) + 'px';
    el.style.lineHeight = (block.lineHeight || block.fontSize || 40) + 'px';
    el.style.fontWeight = block.fontWeight || 500;
    el.style.fontStyle = block.italic ? 'italic' : 'normal';
    el.style.textAlign = block.textAlign || 'left';
    el.innerHTML = block.content.map((line) => `<div>${line || '&nbsp;'}</div>`).join('');
    textLayer.appendChild(el);
  }
  logoLayer.innerHTML = '';
  if (p.logo) {
    const img = document.createElement('img');
    img.src = `/public/${p.logo.src}`;
    img.style.position = 'absolute';
    img.style.left = p.logo.left + 'px';
    img.style.top = p.logo.top + 'px';
    img.style.width = p.logo.width + 'px';
    img.style.height = p.logo.height + 'px';
    img.style.objectFit = 'contain';
    img.style.objectPosition = 'left center';
    logoLayer.appendChild(img);
  }
}

function renderSourcesDropdown() {
  fields.file.innerHTML = state.sources.map((s) => `<option value="${s.file}">${s.file}</option>`).join('');
}

function renderSourceLibrary() {
  const list = document.getElementById('library-list');
  if (!list) return;
  list.innerHTML = '';
  for (const src of state.sources) {
    const li = document.createElement('li');
    const sizeMb = (src.size / (1024 * 1024)).toFixed(1);
    const kind = src.kind || inferKind(src.file);
    li.innerHTML = `<span>${src.file}</span><span class="kind ${kind}">${kind}</span><span class="size">${sizeMb}&nbsp;MB</span>`;
    li.addEventListener('click', () => {
      if (kind === 'audio') {
        setMusicFile(src.file);
      } else {
        addClipFromSource(src.file);
      }
    });
    list.appendChild(li);
  }
  // Populate music dropdown with audio files
  const musicSelect = document.getElementById('music-file');
  if (musicSelect) {
    const current = state.manifest.music?.file || '';
    const opts = ['<option value="">(none)</option>'];
    for (const src of state.sources) {
      if ((src.kind || inferKind(src.file)) === 'audio') {
        opts.push(`<option value="${src.file}">${src.file}</option>`);
      }
    }
    musicSelect.innerHTML = opts.join('');
    musicSelect.value = current;
  }
}

function inferKind(name) {
  if (/\.(mp3|wav|m4a|aac|ogg|flac)$/i.test(name)) return 'audio';
  if (/\.(mp4|mov|webm|m4v|mkv)$/i.test(name)) return 'video';
  return 'image';
}

function setMusicFile(file) {
  if (!state.manifest.music) {
    state.manifest.music = {
      file,
      startFrom: 0,
      volume: 0.7,
      fadeInFrames: 30,
      fadeOutFrames: 45,
    };
  } else {
    state.manifest.music.file = file;
  }
  pushHistory();
  renderMusicForm();
  ensureMusicAudio();
}

function renderMusicForm() {
  const m = state.manifest.music;
  const fileSel = document.getElementById('music-file');
  const startFrom = document.getElementById('music-startFrom');
  const volume = document.getElementById('music-volume');
  const fadeIn = document.getElementById('music-fadeInFrames');
  const fadeOut = document.getElementById('music-fadeOutFrames');
  const preview = document.getElementById('music-preview');
  if (!fileSel) return;
  if (m && m.file) {
    fileSel.value = m.file;
    startFrom.value = m.startFrom ?? 0;
    volume.value = m.volume ?? 0.7;
    fadeIn.value = m.fadeInFrames ?? 0;
    fadeOut.value = m.fadeOutFrames ?? 0;
  } else {
    fileSel.value = '';
    startFrom.value = 0;
    volume.value = 0.7;
    fadeIn.value = 30;
    fadeOut.value = 45;
  }
  preview.textContent = state.musicPreviewMuted ? 'Unmute preview' : 'Mute preview';
  preview.classList.toggle('muted', state.musicPreviewMuted);
}

function ensureMusicAudio() {
  const m = state.manifest.music;
  if (!m || !m.file) {
    if (state.musicAudio) {
      state.musicAudio.pause();
      state.musicAudio.src = '';
      state.musicAudio.remove();
      state.musicAudio = null;
    }
    return;
  }
  const wantedSrc = `/source/${encodeURIComponent(m.file)}`;
  if (!state.musicAudio) {
    const a = document.createElement('audio');
    a.preload = 'auto';
    a.loop = false;
    a.style.display = 'none';
    document.body.appendChild(a);
    state.musicAudio = a;
  }
  if (!state.musicAudio.src.endsWith(wantedSrc)) {
    state.musicAudio.src = wantedSrc;
  }
  syncMusicAudio();
}

function computeMusicVolume(t) {
  const m = state.manifest.music;
  if (!m) return 0;
  const total = totalDuration();
  const base = Number(m.volume ?? 1);
  const fadeInSec = Number(m.fadeInFrames ?? 0) / 30;
  const fadeOutSec = Number(m.fadeOutFrames ?? 0) / 30;
  let v = base;
  if (fadeInSec > 0 && t < fadeInSec) v *= t / fadeInSec;
  if (fadeOutSec > 0 && t > total - fadeOutSec) v *= Math.max(0, (total - t) / fadeOutSec);
  return Math.max(0, Math.min(1, v));
}

function syncMusicAudio() {
  const a = state.musicAudio;
  const m = state.manifest.music;
  if (!a || !m || !m.file) return;
  const total = totalDuration();
  const t = state.currentTime;
  const active = t >= 0 && t <= total;
  const targetAudioTime = Number(m.startFrom ?? 0) + Math.max(0, t);
  const drift = Math.abs(a.currentTime - targetAudioTime);
  const threshold = state.isPlaying ? 0.35 : 0.15;
  if (Number.isFinite(targetAudioTime) && (drift > threshold || a.ended)) {
    try {a.currentTime = Math.max(0, targetAudioTime);} catch (_) {}
  }
  a.muted = state.musicPreviewMuted;
  a.volume = computeMusicVolume(t);
  if (state.isPlaying && active && !state.musicPreviewMuted) {
    if (a.paused || a.ended) a.play().catch(() => {});
  } else {
    if (!a.paused) a.pause();
  }
}

function bindMusic() {
  document.getElementById('music-file').addEventListener('change', (e) => {
    const file = e.target.value;
    if (!file) {
      state.manifest.music = null;
      pushHistory();
      renderMusicForm();
      ensureMusicAudio();
      return;
    }
    setMusicFile(file);
  });
  const numericKeys = [
    ['music-startFrom', 'startFrom'],
    ['music-volume', 'volume'],
    ['music-fadeInFrames', 'fadeInFrames'],
    ['music-fadeOutFrames', 'fadeOutFrames'],
  ];
  for (const [id, key] of numericKeys) {
    document.getElementById(id).addEventListener('change', (e) => {
      if (!state.manifest.music) return;
      state.manifest.music[key] = Number(e.target.value);
      pushHistory();
      syncMusicAudio();
    });
  }
  document.getElementById('music-preview').addEventListener('click', (e) => {
    state.musicPreviewMuted = !state.musicPreviewMuted;
    renderMusicForm();
    syncMusicAudio();
    e.currentTarget.blur();
  });
  document.getElementById('music-clear').addEventListener('click', () => {
    state.manifest.music = null;
    pushHistory();
    renderMusicForm();
    ensureMusicAudio();
  });
}

function addClipFromSource(file) {
  const start = Math.max(0, state.currentTime);
  const duration = 8;
  const clip = {
    file,
    clipStart: '00:00',
    clipDuration: duration,
    posterStart: Math.round(start * 10) / 10,
    posterEnd: Math.round((start + duration) * 10) / 10,
    fadeFrames: 30,
    x: 300,
    y: 200,
    width: 380,
    height: 220,
  };
  state.manifest.clips.push(clip);
  state.selectedIndex = state.manifest.clips.length - 1;
  pushHistory();
  renderWindows();
  renderTimeline();
  renderInspectorValues();
  applyVisibility();
  syncVideosToTime();
}

function renderWindows() {
  windowsLayer.innerHTML = '';
  state.manifest.clips.forEach((clip, index) => {
    const el = document.createElement('div');
    el.className = 'window-box';
    el.dataset.index = String(index);
    el.style.left = (clip.x ?? 100) + 'px';
    el.style.top = (clip.y ?? 100) + 'px';
    el.style.width = (clip.width ?? 300) + 'px';
    el.style.height = (clip.height ?? 200) + 'px';
    el.style.transform = clip.rotation ? `rotate(${clip.rotation}deg)` : '';
    if (index === state.selectedIndex) el.classList.add('selected');

    const isVideo = /\.(mp4|mov|webm|m4v|mkv)$/i.test(clip.file || '');
    if (isVideo) {
      const v = document.createElement('video');
      v.src = `/source/${encodeURIComponent(clip.file)}`;
      v.muted = true;
      v.loop = false;
      v.autoplay = false;
      v.playsInline = true;
      v.preload = 'auto';
      v.addEventListener('loadedmetadata', () => {
        v.currentTime = toSeconds(clip.clipStart || 0);
      });
      el.appendChild(v);
    } else {
      const img = document.createElement('img');
      img.src = `/source/${encodeURIComponent(clip.file)}`;
      el.appendChild(img);
    }

    // Overlap text layer (orange title rendered inside each window)
    const overlap = document.createElement('div');
    overlap.className = 'overlap-text';
    overlap.style.left = (-(clip.x ?? 0)) + 'px';
    overlap.style.top = (-(clip.y ?? 0)) + 'px';
    overlap.style.width = BASE_WIDTH + 'px';
    overlap.style.height = BASE_HEIGHT + 'px';
    const inverseRotate = clip.rotation ? ` rotate(${-clip.rotation}deg)` : '';
    if (inverseRotate) {
      overlap.style.transformOrigin = `${(clip.width ?? 0) / 2 + (clip.x ?? 0)}px ${(clip.height ?? 0) / 2 + (clip.y ?? 0)}px`;
      overlap.style.transform = inverseRotate;
    }
    for (const block of state.preset.text.blocks) {
      if (!block.isTitle) continue;
      const span = document.createElement('div');
      span.className = 'text-block overlap';
      span.style.position = 'absolute';
      span.style.left = block.left + 'px';
      span.style.top = block.top + 'px';
      if (block.width) span.style.width = block.width + 'px';
      span.style.color = state.preset.text.overlapColor;
      span.style.fontFamily = (block.fontFamily === 'mono')
        ? 'ui-monospace, SFMono-Regular, Menlo, monospace'
        : '"EB Garamond", Georgia, serif';
      span.style.fontSize = (block.fontSize || 40) + 'px';
      span.style.lineHeight = (block.lineHeight || block.fontSize || 40) + 'px';
      span.style.fontWeight = block.fontWeight || 500;
      span.style.fontStyle = block.italic ? 'italic' : 'normal';
      span.style.textAlign = block.textAlign || 'left';
      span.innerHTML = block.content.map((line) => `<div>${line || '&nbsp;'}</div>`).join('');
      overlap.appendChild(span);
    }
    el.appendChild(overlap);

    const badge = document.createElement('div');
    badge.className = 'window-badge';
    badge.textContent = `${index + 1} · ${clip.file} · ${clip.posterStart ?? 0}→${clip.posterEnd ?? 0}s`;
    el.appendChild(badge);

    el.addEventListener('mousedown', (evt) => {
      if (evt.target.closest('.moveable-control')) return;
      if (state.selectedIndex === index) return;
      selectClip(index);
    });

    windowsLayer.appendChild(el);
  });
  applyVisibility();
  syncVideosToTime();
  wireMoveable();
}

function syncVideosToTime() {
  const t = state.currentTime;
  state.manifest.clips.forEach((clip, index) => {
    const el = windowsLayer.querySelector(`.window-box[data-index="${index}"]`);
    if (!el) return;
    const v = el.querySelector('video');
    if (!v) return;
    const start = toSeconds(clip.clipStart || 0);
    const posterStart = Number(clip.posterStart ?? 0);
    const posterEnd = Number(clip.posterEnd ?? 0);
    const isActive = t >= posterStart && t <= posterEnd;
    const target = start + Math.max(0, t - posterStart);

    if (!isActive) {
      if (!v.paused) v.pause();
      return;
    }

    const drift = Math.abs(v.currentTime - target);
    const driftThreshold = state.isPlaying ? 0.35 : 0.15;

    if (Number.isFinite(target) && (drift > driftThreshold || v.ended)) {
      try {
        v.currentTime = Math.max(0, target);
      } catch (_) {/* ignore */}
    }

    if (state.isPlaying) {
      if (v.paused || v.ended) v.play().catch(() => {});
    } else if (!v.paused) {
      v.pause();
    }
  });
}

function wireMoveable() {
  if (state.moveable) {
    state.moveable.destroy();
    state.moveable = null;
  }
  if (state.selectedIndex < 0) return;
  const target = windowsLayer.querySelector(`.window-box[data-index="${state.selectedIndex}"]`);
  if (!target) return;

  state.moveable = new Moveable(stage, {
    target,
    draggable: true,
    resizable: true,
    rotatable: true,
    keepRatio: false,
    throttleDrag: 1,
    throttleResize: 1,
    throttleRotate: 1,
    edge: true,
    origin: false,
    snappable: true,
    snapGridWidth: 10,
    snapGridHeight: 10,
    snapThreshold: 6,
    verticalGuidelines: [0, BASE_WIDTH / 2, BASE_WIDTH],
    horizontalGuidelines: [0, BASE_HEIGHT / 2, BASE_HEIGHT],
  });

  const updateOverlapOffset = (left, top) => {
    const overlap = target.querySelector('.overlap-text');
    if (overlap) {
      overlap.style.left = -left + 'px';
      overlap.style.top = -top + 'px';
    }
  };

  state.moveable.on('drag', ({left, top}) => {
    target.style.left = left + 'px';
    target.style.top = top + 'px';
    updateOverlapOffset(left, top);
    commitLiveEdit({x: Math.round(left), y: Math.round(top)});
  });
  state.moveable.on('dragEnd', () => pushHistory());
  state.moveable.on('resize', ({width, height, drag}) => {
    target.style.width = width + 'px';
    target.style.height = height + 'px';
    target.style.left = drag.left + 'px';
    target.style.top = drag.top + 'px';
    updateOverlapOffset(drag.left, drag.top);
    commitLiveEdit({
      x: Math.round(drag.left),
      y: Math.round(drag.top),
      width: Math.round(width),
      height: Math.round(height),
    });
  });
  state.moveable.on('resizeEnd', () => pushHistory());
  state.moveable.on('rotate', ({rotation}) => {
    target.style.transform = `rotate(${rotation}deg)`;
    commitLiveEdit({rotation: Math.round(rotation * 10) / 10});
  });
  state.moveable.on('rotateEnd', () => pushHistory());
}

function commitLiveEdit(patch) {
  if (state.selectedIndex < 0) return;
  const clip = state.manifest.clips[state.selectedIndex];
  Object.assign(clip, patch);
  renderInspectorValues();
  renderTimeline();
}

function selectClip(index) {
  state.selectedIndex = index;
  for (const el of windowsLayer.querySelectorAll('.window-box')) {
    el.classList.toggle('selected', Number(el.dataset.index) === index);
  }
  renderInspectorValues();
  renderTimeline();
  wireMoveable();
}

function renderInspectorValues() {
  if (state.selectedIndex < 0) {
    inspectorEmpty.hidden = false;
    inspectorForm.hidden = true;
    return;
  }
  inspectorEmpty.hidden = true;
  inspectorForm.hidden = false;
  const clip = state.manifest.clips[state.selectedIndex];
  fields.file.value = clip.file || '';
  fields.clipStart.value = clip.clipStart ?? '00:00';
  fields.clipDuration.value = clip.clipDuration ?? 2.5;
  fields.posterStart.value = clip.posterStart ?? 0;
  fields.posterEnd.value = clip.posterEnd ?? (Number(clip.posterStart ?? 0) + Number(clip.clipDuration ?? 2.5));
  fields.fadeFrames.value = clip.fadeFrames ?? 0;
  fields.rotation.value = clip.rotation ?? 0;
  fields.x.value = clip.x ?? 0;
  fields.y.value = clip.y ?? 0;
  fields.width.value = clip.width ?? 300;
  fields.height.value = clip.height ?? 200;
}

function bindInspector() {
  const keys = ['clipStart', 'clipDuration', 'posterStart', 'posterEnd', 'fadeFrames', 'rotation', 'x', 'y', 'width', 'height', 'file'];
  for (const key of keys) {
    fields[key].addEventListener('change', () => {
      if (state.selectedIndex < 0) return;
      const clip = state.manifest.clips[state.selectedIndex];
      const val = fields[key].value;
      if (key === 'clipStart' || key === 'file') {
        clip[key] = val;
      } else {
        clip[key] = Number(val);
      }
      pushHistory();
      renderWindows();
      renderTimeline();
      selectClip(state.selectedIndex);
    });
  }
  document.getElementById('field-delete').addEventListener('click', () => {
    if (state.selectedIndex < 0) return;
    state.manifest.clips.splice(state.selectedIndex, 1);
    state.selectedIndex = -1;
    pushHistory();
    renderWindows();
    renderTimeline();
    renderInspectorValues();
  });
}

function bindTopbar() {
  document.getElementById('save').addEventListener('click', save);
  document.getElementById('export').addEventListener('click', openExportModal);
  document.getElementById('add-clip').addEventListener('click', (e) => {
    addClip();
    e.currentTarget.blur();
  });
  document.getElementById('play-pause').addEventListener('click', (e) => {
    togglePlay();
    e.currentTarget.blur();
  });

  const durationInput = document.getElementById('poster-duration');
  durationInput.value = state.manifest.duration ?? totalDuration();
  durationInput.addEventListener('change', () => {
    const v = Number(durationInput.value);
    if (!Number.isFinite(v) || v < 0.5) {
      durationInput.value = state.manifest.duration ?? totalDuration();
      return;
    }
    state.manifest.duration = v;
    state.currentTime = Math.min(state.currentTime, v);
    pushHistory();
    renderTimeline();
    applyVisibility();
    syncVideosToTime();
    updatePlayhead();
  });

  stage.addEventListener('mousedown', (evt) => {
    if (!evt.target.closest('.window-box') && !evt.target.closest('.moveable-control')) {
      deselectClip();
    }
  });
  // Clicking empty timeline area also deselects (scrub handler already fires; just add deselect)
  timeline.addEventListener('mousedown', (evt) => {
    if (!evt.target.closest('.timeline-clip')) {
      deselectClip();
    }
  });

  let scrubbing = false;
  const scrubFromEvent = (evt) => {
    const rect = timeline.getBoundingClientRect();
    const x = Math.max(0, Math.min(rect.width, evt.clientX - rect.left));
    state.currentTime = (x / rect.width) * totalDuration();
    applyVisibility();
    syncVideosToTime();
    syncMusicAudio();
    updatePlayhead();
  };
  timeline.addEventListener('mousedown', (evt) => {
    if (evt.target.closest('.timeline-clip')) return;
    scrubbing = true;
    if (state.isPlaying) togglePlay();
    scrubFromEvent(evt);
  });
  window.addEventListener('mousemove', (evt) => {
    if (scrubbing) scrubFromEvent(evt);
  });
  window.addEventListener('mouseup', () => {scrubbing = false;});
}

function bindKeyboard() {
  document.addEventListener('keydown', (e) => {
    const inField = e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA';
    const meta = e.metaKey || e.ctrlKey;

    if (meta && e.key.toLowerCase() === 's') {
      e.preventDefault();
      save();
      return;
    }
    if (meta && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      if (e.shiftKey) redo(); else undo();
      return;
    }
    if (meta && e.key.toLowerCase() === 'y') {
      e.preventDefault();
      redo();
      return;
    }

    if (inField) return;

    if (e.key === ' ') {
      e.preventDefault();
      togglePlay();
      return;
    }
    const step = e.shiftKey ? 1 : 1 / 30;
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      if (state.isPlaying) togglePlay();
      state.currentTime = Math.min(totalDuration(), state.currentTime + step);
      applyVisibility();
      syncVideosToTime();
      updatePlayhead();
      return;
    }
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      if (state.isPlaying) togglePlay();
      state.currentTime = Math.max(0, state.currentTime - step);
      applyVisibility();
      syncVideosToTime();
      updatePlayhead();
      return;
    }
    if (e.key === 'Home') {
      e.preventDefault();
      state.currentTime = 0;
      applyVisibility();
      syncVideosToTime();
      updatePlayhead();
      return;
    }
    if (e.key === 'End') {
      e.preventDefault();
      state.currentTime = totalDuration();
      applyVisibility();
      syncVideosToTime();
      updatePlayhead();
      return;
    }
    if (e.key === 'Backspace' || e.key === 'Delete') {
      if (state.selectedIndex >= 0) {
        e.preventDefault();
        document.getElementById('field-delete').click();
      }
      return;
    }
    if (e.key === 'Escape') {
      const modal = document.getElementById('export-modal');
      if (modal && !modal.hidden) {
        e.preventDefault();
        closeExportModal();
        return;
      }
      if (state.selectedIndex >= 0) {
        e.preventDefault();
        deselectClip();
      }
      return;
    }
  });
}

function deselectClip() {
  state.selectedIndex = -1;
  if (state.moveable) {
    state.moveable.destroy();
    state.moveable = null;
  }
  for (const el of windowsLayer.querySelectorAll('.window-box')) {
    el.classList.remove('selected');
  }
  renderInspectorValues();
  applyVisibility();
}

function addClip() {
  const defaultFile = state.sources[0]?.file || '';
  const start = state.manifest.clips.length * 2;
  const clip = {
    file: defaultFile,
    clipStart: '00:00',
    clipDuration: 8,
    posterStart: start,
    posterEnd: start + 8,
    fadeFrames: 30,
    x: 300,
    y: 200,
    width: 380,
    height: 220,
  };
  state.manifest.clips.push(clip);
  state.selectedIndex = state.manifest.clips.length - 1;
  pushHistory();
  renderWindows();
  renderTimeline();
  renderInspectorValues();
}

let exportPoll = null;
let exportJobId = null;
let exportPath = null;

function openExportModal() {
  if (state.isPlaying) togglePlay();
  const modal = document.getElementById('export-modal');
  const filename = document.getElementById('export-filename');
  const progress = document.getElementById('export-progress');
  const result = document.getElementById('export-result');
  const err = document.getElementById('export-error');
  const phase = document.getElementById('export-phase');
  const fill = document.getElementById('export-progress-fill');
  const startBtn = document.getElementById('export-start');
  const suggestion = `poster-${new Date().toISOString().replace(/[:T.-]/g, '').slice(0, 14)}`;
  filename.value = suggestion;
  progress.hidden = true;
  result.hidden = true;
  err.hidden = true;
  phase.textContent = '';
  fill.style.width = '0%';
  startBtn.disabled = false;
  startBtn.textContent = 'Start render';
  modal.hidden = false;
}

function closeExportModal() {
  document.getElementById('export-modal').hidden = true;
  if (exportPoll) {clearInterval(exportPoll); exportPoll = null;}
  exportJobId = null;
}

async function startExport() {
  const filename = document.getElementById('export-filename').value.trim();
  const progress = document.getElementById('export-progress');
  const result = document.getElementById('export-result');
  const err = document.getElementById('export-error');
  const phase = document.getElementById('export-phase');
  const fill = document.getElementById('export-progress-fill');
  const startBtn = document.getElementById('export-start');

  result.hidden = true;
  err.hidden = true;
  progress.hidden = false;
  phase.textContent = 'Saving manifest…';
  fill.style.width = '0%';
  startBtn.disabled = true;
  startBtn.textContent = 'Rendering…';

  try {
    await save();
    phase.textContent = 'Starting render…';
    const job = await fetchJson('/api/render', {
      method: 'POST',
      headers: {'content-type': 'application/json'},
      body: JSON.stringify({filename}),
    });
    exportJobId = job.id;
    exportPath = job.outFile;
    phase.textContent = `Rendering to ${job.outFile.split('/').pop()}…`;
    exportPoll = setInterval(pollExport, 400);
  } catch (e) {
    err.hidden = false;
    err.textContent = 'Export failed: ' + (e.message || e);
    startBtn.disabled = false;
    startBtn.textContent = 'Start render';
  }
}

async function pollExport() {
  if (!exportJobId) return;
  try {
    const status = await fetchJson('/api/render/' + exportJobId);
    const phase = document.getElementById('export-phase');
    const fill = document.getElementById('export-progress-fill');
    if (status.lastProgress) {
      const {phase: p, current, total} = status.lastProgress;
      const pct = Math.min(100, (current / total) * 100);
      fill.style.width = pct.toFixed(1) + '%';
      phase.textContent = `${p === 'encode' ? 'Encoding' : 'Rendering'} ${current}/${total}`;
    }
    if (status.status === 'done') {
      clearInterval(exportPoll); exportPoll = null;
      fill.style.width = '100%';
      phase.textContent = 'Done';
      exportPath = status.outFile;
      document.getElementById('export-path').textContent = status.outFile;
      document.getElementById('export-result').hidden = false;
      document.getElementById('export-progress').hidden = true;
      document.getElementById('export-start').disabled = false;
      document.getElementById('export-start').textContent = 'Render again';
    } else if (status.status === 'error') {
      clearInterval(exportPoll); exportPoll = null;
      const err = document.getElementById('export-error');
      err.hidden = false;
      err.textContent = 'Render failed: ' + (status.error || 'unknown');
      const tail = status.tail?.slice(-5).join('\n');
      if (tail) err.textContent += '\n\n' + tail;
      document.getElementById('export-start').disabled = false;
      document.getElementById('export-start').textContent = 'Retry';
    }
  } catch (_) {/* keep polling */}
}

function bindExportModal() {
  document.getElementById('export-start').addEventListener('click', startExport);
  document.getElementById('export-cancel').addEventListener('click', closeExportModal);
  document.getElementById('export-close').addEventListener('click', closeExportModal);
  // Backdrop click closes (but not clicks inside the card)
  document.getElementById('export-modal').addEventListener('click', (e) => {
    if (e.target.id === 'export-modal') closeExportModal();
  });
  document.getElementById('export-open-folder').addEventListener('click', async () => {
    if (!exportPath) return;
    await fetch('/api/open-folder', {
      method: 'POST',
      headers: {'content-type': 'application/json'},
      body: JSON.stringify({path: exportPath}),
    });
  });
  document.getElementById('export-open-file').addEventListener('click', async () => {
    if (!exportPath) return;
    await fetch('/api/open-folder', {
      method: 'POST',
      headers: {'content-type': 'application/json'},
      body: JSON.stringify({path: exportPath, reveal: false}),
    });
  });
  document.getElementById('export-copy-path').addEventListener('click', async () => {
    if (!exportPath) return;
    try {
      await navigator.clipboard.writeText(exportPath);
      const btn = document.getElementById('export-copy-path');
      const orig = btn.textContent;
      btn.textContent = 'Copied ✓';
      setTimeout(() => {btn.textContent = orig;}, 1500);
    } catch (_) {/* ignore */}
  });
}

async function save() {
  saveStatus.textContent = 'Saving…';
  try {
    const body = {
      name: state.manifest.name,
      duration: Math.ceil(totalDuration()),
      width: state.manifest.width ?? state.preset.width,
      height: state.manifest.height ?? state.preset.height,
      fps: state.manifest.fps ?? 30,
      background: state.manifest.background ?? state.preset.background,
      text: state.manifest.text ?? state.preset.text,
      logo: state.manifest.logo ?? state.preset.logo,
      music: state.manifest.music ?? null,
      clips: state.manifest.clips,
    };
    await fetchJson('/api/manifest', {
      method: 'POST',
      headers: {'content-type': 'application/json'},
      body: JSON.stringify(body),
    });
    saveStatus.textContent = `Saved ${new Date().toLocaleTimeString()}`;
  } catch (error) {
    saveStatus.textContent = 'Save failed: ' + error.message;
  }
}

function renderProjectSelect() {
  const sel = document.getElementById('project-select');
  if (!sel) return;
  sel.innerHTML = state.projects.map((p) => `<option value="${p.file}">${p.name} (${p.clipCount})</option>`).join('');
  if (state.currentProject) sel.value = state.currentProject;
}

function bindProjects() {
  const sel = document.getElementById('project-select');
  sel.addEventListener('change', async () => {
    const file = sel.value;
    if (!file || file === state.currentProject) return;
    try {
      await fetchJson('/api/switch-project', {
        method: 'POST',
        headers: {'content-type': 'application/json'},
        body: JSON.stringify({file}),
      });
      state.selectedIndex = -1;
      if (state.moveable) {state.moveable.destroy(); state.moveable = null;}
      await loadAll();
    } catch (e) {
      alert('Could not switch project: ' + e.message);
    }
  });
  document.getElementById('project-new').addEventListener('click', async (e) => {
    e.currentTarget.blur();
    const name = prompt('New project name?', 'Untitled poster');
    if (!name) return;
    try {
      const created = await fetchJson('/api/projects', {
        method: 'POST',
        headers: {'content-type': 'application/json'},
        body: JSON.stringify({name}),
      });
      state.selectedIndex = -1;
      if (state.moveable) {state.moveable.destroy(); state.moveable = null;}
      await loadAll();
      const sel2 = document.getElementById('project-select');
      sel2.value = created.file;
    } catch (err) {
      alert('Could not create project: ' + err.message);
    }
  });

  document.getElementById('project-branch').addEventListener('click', async (e) => {
    e.currentTarget.blur();
    const defaultName = nextBranchName(state.manifest.name || state.currentProject?.replace(/\.json$/, '') || 'Untitled poster');
    const name = prompt('Branch current project as?', defaultName);
    if (!name) return;
    try {
      await save();
      const created = await fetchJson('/api/branch-project', {
        method: 'POST',
        headers: {'content-type': 'application/json'},
        body: JSON.stringify({name, file: state.currentProject}),
      });
      state.selectedIndex = -1;
      if (state.moveable) {state.moveable.destroy(); state.moveable = null;}
      await loadAll();
      const sel2 = document.getElementById('project-select');
      sel2.value = created.file;
    } catch (err) {
      alert('Could not branch project: ' + err.message);
    }
  });
}

function nextBranchName(value) {
  const base = String(value || 'Untitled poster').trim();
  const match = /\bv(\d+)\b\s*$/i.exec(base);
  if (!match) return `${base} v2`;
  return `${base.slice(0, match.index).trim()} v${Number(match[1]) + 1}`;
}

function renderTextPanel() {
  const list = document.getElementById('text-blocks-list');
  if (!list) return;
  list.innerHTML = '';
  const blocks = state.manifest.text?.blocks ?? state.preset.text?.blocks ?? [];
  blocks.forEach((block, index) => {
    const wrap = document.createElement('div');
    wrap.className = 'text-block-editor';

    const head = document.createElement('div');
    head.className = 'block-head';
    const idEl = document.createElement('span');
    idEl.className = 'block-id';
    idEl.textContent = block.id || `block-${index + 1}`;
    const preview = document.createElement('span');
    preview.className = 'block-preview';
    preview.textContent = (block.content || []).join(' ');
    head.appendChild(idEl);
    head.appendChild(preview);
    wrap.appendChild(head);

    const textarea = document.createElement('textarea');
    textarea.value = (block.content || []).join('\n');
    textarea.placeholder = 'One line per line';
    textarea.addEventListener('change', () => {
      const lines = textarea.value.split('\n');
      updateTextBlock(index, {content: lines});
    });
    wrap.appendChild(textarea);

    const miniRow = document.createElement('div');
    miniRow.className = 'mini-row';
    const fields = [
      ['fontSize', 'Size', block.fontSize ?? 40],
      ['left', 'X', block.left ?? 0],
      ['top', 'Y', block.top ?? 0],
    ];
    for (const [key, label, val] of fields) {
      const l = document.createElement('label');
      const lt = document.createElement('span');
      lt.textContent = label;
      const inp = document.createElement('input');
      inp.type = 'number';
      inp.step = key === 'fontSize' ? '1' : '1';
      inp.value = val;
      inp.addEventListener('change', () => {
        updateTextBlock(index, {[key]: Number(inp.value)});
      });
      l.appendChild(lt);
      l.appendChild(inp);
      miniRow.appendChild(l);
    }
    wrap.appendChild(miniRow);

    list.appendChild(wrap);
  });
}

function updateTextBlock(index, patch) {
  if (!state.manifest.text) state.manifest.text = {...(state.preset.text ?? {}), blocks: []};
  if (!state.manifest.text.blocks) state.manifest.text.blocks = [];
  const block = {...state.manifest.text.blocks[index], ...patch};
  if (patch.fontSize) block.lineHeight = Math.round(patch.fontSize * 0.92);
  state.manifest.text.blocks[index] = block;
  state.preset = derivePresetFromManifest(state.manifest);
  pushHistory();
  renderStage();
  renderWindows();
  renderTextPanel();
}

function bindTextPanel() {
  // Panel is rendered on demand; no global listeners needed.
}

function renderTimeline() {
  const total = totalDuration();
  timeline.innerHTML = '';
  const snapGuide = document.createElement('div');
  snapGuide.id = 'snap-guide';
  timeline.appendChild(snapGuide);

  const laneHeight = 18;
  const laneGap = 2;
  state.manifest.clips.forEach((clip, index) => {
    const block = document.createElement('div');
    block.className = 'timeline-clip';
    if (index === state.selectedIndex) block.classList.add('selected');
    const start = Number(clip.posterStart ?? 0);
    const end = Number(clip.posterEnd ?? 0);
    const startPct = (start / total) * 100;
    const widthPct = ((end - start) / total) * 100;
    const topPx = 6 + (index % 6) * (laneHeight + laneGap);
    block.style.left = startPct + '%';
    block.style.width = widthPct + '%';
    block.style.top = topPx + 'px';
    block.style.height = laneHeight + 'px';
    block.dataset.index = String(index);
    block.textContent = `${index + 1}. ${clip.file}  ·  ${start}s→${end}s`;
    block.title = `${clip.file}\nposter ${start}→${end}s\nclip source ${clip.clipStart}+${clip.clipDuration}s`;

    const edgeL = document.createElement('div');
    edgeL.className = 'edge left';
    edgeL.dataset.role = 'trim-left';
    block.appendChild(edgeL);

    const edgeR = document.createElement('div');
    edgeR.className = 'edge right';
    edgeR.dataset.role = 'trim-right';
    block.appendChild(edgeR);

    block.addEventListener('mousedown', (e) => startClipDrag(e, index));
    timeline.appendChild(block);
  });
  timelineLabels.innerHTML = '';
  const labelStep = total <= 10 ? 1 : total <= 30 ? 2 : 5;
  for (let s = 0; s <= total; s += labelStep) {
    const label = document.createElement('div');
    label.className = 'timeline-label';
    label.style.left = `${(s / total) * 100}%`;
    label.textContent = `${s}s`;
    timelineLabels.appendChild(label);
  }
  updatePlayhead();
}

function collectSnapTargets(excludeIndex) {
  const targets = new Set();
  targets.add(0);
  targets.add(totalDuration());
  targets.add(Math.max(0, state.currentTime));
  state.manifest.clips.forEach((clip, i) => {
    if (i === excludeIndex) return;
    targets.add(Number(clip.posterStart ?? 0));
    targets.add(Number(clip.posterEnd ?? 0));
  });
  return Array.from(targets);
}

function applySnap(valueSec, targets) {
  let best = null;
  let bestDist = SNAP_THRESHOLD_SEC;
  for (const t of targets) {
    const d = Math.abs(valueSec - t);
    if (d < bestDist) {
      bestDist = d;
      best = t;
    }
  }
  return best !== null ? best : valueSec;
}

function showSnapGuide(sec) {
  const guide = document.getElementById('snap-guide');
  if (!guide) return;
  if (sec === null) {
    guide.style.display = 'none';
    return;
  }
  guide.style.display = 'block';
  guide.style.left = `${(sec / totalDuration()) * 100}%`;
}

function startClipDrag(e, index) {
  e.preventDefault();
  e.stopPropagation();
  selectClip(index);
  const role = e.target.dataset.role || 'move';
  const rect = timeline.getBoundingClientRect();
  const total = totalDuration();
  const clip = state.manifest.clips[index];
  const startMouseSec = ((e.clientX - rect.left) / rect.width) * total;
  const origStart = Number(clip.posterStart ?? 0);
  const origEnd = Number(clip.posterEnd ?? 0);
  const origDuration = origEnd - origStart;
  const block = timeline.querySelector(`.timeline-clip[data-index="${index}"]`);
  block?.classList.add('dragging');

  function onMove(ev) {
    const mouseSec = ((ev.clientX - rect.left) / rect.width) * total;
    const delta = mouseSec - startMouseSec;
    const targets = collectSnapTargets(index);

    let newStart = origStart;
    let newEnd = origEnd;
    let snappedAt = null;

    if (role === 'move') {
      newStart = Math.max(0, origStart + delta);
      newEnd = newStart + origDuration;
      const snappedStart = applySnap(newStart, targets);
      if (snappedStart !== newStart) {
        snappedAt = snappedStart;
        newStart = snappedStart;
        newEnd = newStart + origDuration;
      } else {
        const snappedEnd = applySnap(newEnd, targets);
        if (snappedEnd !== newEnd) {
          snappedAt = snappedEnd;
          newEnd = snappedEnd;
          newStart = newEnd - origDuration;
        }
      }
    } else if (role === 'trim-left') {
      newStart = Math.max(0, origStart + delta);
      const snappedStart = applySnap(newStart, targets);
      if (snappedStart !== newStart) snappedAt = snappedStart;
      newStart = Math.min(snappedStart, origEnd - MIN_CLIP_SECONDS);
    } else if (role === 'trim-right') {
      newEnd = Math.max(origStart + MIN_CLIP_SECONDS, origEnd + delta);
      const snappedEnd = applySnap(newEnd, targets);
      if (snappedEnd !== newEnd) snappedAt = snappedEnd;
      newEnd = Math.max(origStart + MIN_CLIP_SECONDS, snappedEnd);
    }

    clip.posterStart = Math.round(newStart * 100) / 100;
    clip.posterEnd = Math.round(newEnd * 100) / 100;
    renderTimeline();
    applyVisibility();
    syncVideosToTime();
    showSnapGuide(snappedAt);
  }

  function onUp() {
    window.removeEventListener('mousemove', onMove);
    window.removeEventListener('mouseup', onUp);
    showSnapGuide(null);
    block?.classList.remove('dragging');
    pushHistory();
  }

  window.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup', onUp);
}

function applyVisibility() {
  for (const el of windowsLayer.querySelectorAll('.window-box')) {
    const i = Number(el.dataset.index);
    const clip = state.manifest.clips[i];
    if (!clip) continue;
    const t = state.currentTime;
    const start = Number(clip.posterStart ?? 0);
    const end = Number(clip.posterEnd ?? 0);
    const fadeSec = Number(clip.fadeFrames || 0) / 30;
    let opacity = 0;
    if (t >= start && t <= end) {
      opacity = 1;
      if (fadeSec > 0 && t > end - fadeSec) {
        opacity = Math.max(0, (end - t) / fadeSec);
      }
    }
    el.style.opacity = String(opacity);
    el.classList.toggle('off', opacity < 0.05);
  }
}

function updatePlayhead() {
  const total = totalDuration();
  playhead.style.left = `${(state.currentTime / total) * 100}%`;
}

function togglePlay() {
  state.isPlaying = !state.isPlaying;
  document.getElementById('play-pause').textContent = state.isPlaying ? '⏸︎ Pause' : '▶︎ Play';
  if (state.isPlaying) {
    state.playStart = performance.now() - state.currentTime * 1000;
    requestAnimationFrame(tick);
  } else {
    pauseAllVideos();
    if (state.musicAudio && !state.musicAudio.paused) state.musicAudio.pause();
  }
  syncVideosToTime();
  syncMusicAudio();
}

function pauseAllVideos() {
  for (const v of windowsLayer.querySelectorAll('video')) {
    if (!v.paused) {
      try {v.pause();} catch (_) {/* ignore */}
    }
  }
}

function tick(now) {
  if (!state.isPlaying) return;
  const total = totalDuration();
  const prevTime = state.currentTime;
  state.currentTime = ((now - state.playStart) / 1000) % total;
  if (state.currentTime < prevTime) {
    // Loop wrap: pause everything so sync re-activates clips cleanly from clipStart
    pauseAllVideos();
  }
  applyVisibility();
  syncVideosToTime();
  updatePlayhead();
  requestAnimationFrame(tick);
}

init().catch((err) => {
  console.error(err);
  document.body.innerHTML = `<pre style="color:#d4533a;padding:20px">${err.message}</pre>`;
});
