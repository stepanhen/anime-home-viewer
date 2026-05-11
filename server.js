const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');

const app = express();
app.use(express.json({ limit: '1mb' }));

const APP_ROOT = __dirname;
const CONFIG_PATH = path.join(APP_ROOT, 'config.json');
const DATA_DIR = path.join(APP_ROOT, 'data');
const PROGRESS_PATH = path.join(DATA_DIR, 'progress.json');
const DEFAULT_PROFILE_ID = 'default';
const MAX_PROFILE_NAME_LENGTH = 32;

const PROFILE_COLORS = [
  '#7aa2ff',
  '#9ee37d',
  '#ffcf6e',
  '#ff8c8c',
  '#b18cff',
  '#5ed7d1'
];

function readConfig() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  } catch (_) {
    return {};
  }
}

const config = readConfig();
const PORT = Number(process.env.PORT || config.port || 3000);
const MEDIA_ROOT = path.resolve(process.env.MEDIA_ROOT || config.mediaRoot || path.join(APP_ROOT, 'media'));

const VIDEO_EXTENSIONS = new Set([
  '.mp4', '.m4v', '.webm', '.ogv', '.ogg', '.mov', '.mkv', '.avi'
]);

const MIME_TYPES = {
  '.mp4': 'video/mp4',
  '.m4v': 'video/x-m4v',
  '.webm': 'video/webm',
  '.ogv': 'video/ogg',
  '.ogg': 'video/ogg',
  '.mov': 'video/quicktime',
  '.mkv': 'video/x-matroska',
  '.avi': 'video/x-msvideo'
};

const IGNORED_DIRECTORIES = new Set([
  '$RECYCLE.BIN',
  'System Volume Information',
  'Recovery',
  'Config.Msi',
  'node_modules',
  '.git',
  'data'
]);

function encodeId(value) {
  return Buffer.from(value, 'utf8').toString('base64url');
}

function decodeId(value) {
  return Buffer.from(value, 'base64url').toString('utf8');
}

function normalizeRelativePath(value) {
  return String(value || '')
    .replace(/\\/g, '/')
    .split('/')
    .filter(Boolean)
    .join('/');
}

function joinRelative(...parts) {
  return normalizeRelativePath(parts.join('/'));
}

function idFromRelativePath(relativePath) {
  return encodeId(normalizeRelativePath(relativePath));
}

function isInsideOrSame(parent, child) {
  const relative = path.relative(parent, child);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function resolveMediaRelative(relativePath) {
  const normalized = normalizeRelativePath(relativePath);
  const parts = normalized ? normalized.split('/') : [];
  const fullPath = path.resolve(MEDIA_ROOT, ...parts);
  if (!isInsideOrSame(MEDIA_ROOT, fullPath)) return null;
  return fullPath;
}

function stripTrailingBracketGroups(value) {
  return String(value || '').replace(/\s*(?:\[[^\]]*\]\s*)+$/g, '').trim();
}

function stripLeadingBracketGroups(value) {
  return String(value || '').replace(/^(?:\s*\[[^\]]+\]\s*)+/g, '').trim();
}

function cleanDisplayName(value) {
  return stripTrailingBracketGroups(stripLeadingBracketGroups(value)).trim() || String(value || '').trim();
}

function isIgnoredDirectoryName(name) {
  return !name || name.startsWith('.') || IGNORED_DIRECTORIES.has(name);
}

function isVideoFileName(fileName) {
  return VIDEO_EXTENSIONS.has(path.extname(fileName).toLowerCase());
}

function parseChapterDirectory(folderName, titleRelativePath = '') {
  const match = folderName.match(/^\s*\[(\d+)(?:\s*-\s*(\d+))?\]\s*(.*)$/);
  const relativePath = joinRelative(titleRelativePath, folderName);

  if (!match) {
    return {
      id: idFromRelativePath(relativePath),
      relativePath,
      folderName,
      name: cleanDisplayName(folderName) || folderName,
      orderStart: Number.MAX_SAFE_INTEGER,
      orderEnd: Number.MAX_SAFE_INTEGER,
      rangeLabel: ''
    };
  }

  const orderStart = Number(match[1]);
  const orderEnd = match[2] ? Number(match[2]) : orderStart;
  const rest = match[3] || '';
  const name = stripTrailingBracketGroups(rest) || rest || folderName;

  return {
    id: idFromRelativePath(relativePath),
    relativePath,
    folderName,
    name,
    orderStart,
    orderEnd,
    rangeLabel: match[2] ? `${match[1]}-${match[2]}` : match[1]
  };
}

function parseVideoFile(fileName, parentName, parentRelativePath, kind = 'episode') {
  const parsedPath = path.parse(fileName);
  const base = parsedPath.name;
  const afterLeadingGroups = stripLeadingBracketGroups(base);
  const clean = stripTrailingBracketGroups(afterLeadingGroups) || base;
  const relativePath = joinRelative(parentRelativePath, fileName);

  let videoName = parentName;
  let episodeLabel = kind === 'movie' ? 'Movie' : 'Video';
  let episodeNumber = Number.MAX_SAFE_INTEGER;
  let displayTitle = cleanDisplayName(clean) || parentName || base;

  if (kind === 'episode') {
    const match = clean.match(/^(.*?)[\s._-]+(\d{1,4}[A-Za-z]?)$/);
    if (match) {
      videoName = match[1].trim() || parentName;
      episodeLabel = match[2];
      const numeric = parseInt(episodeLabel, 10);
      episodeNumber = Number.isFinite(numeric) ? numeric : Number.MAX_SAFE_INTEGER;
      displayTitle = `${videoName} ${episodeLabel}`.trim();
    } else {
      videoName = parentName;
      displayTitle = cleanDisplayName(clean) || parentName || base;
    }
  }

  return {
    id: idFromRelativePath(relativePath),
    relativePath,
    fileName,
    name: videoName,
    episodeLabel,
    episodeNumber,
    displayTitle,
    extension: parsedPath.ext.toLowerCase(),
    kind
  };
}

function compareByLibraryOrder(a, b) {
  if (a.orderStart !== b.orderStart) return a.orderStart - b.orderStart;
  if (a.orderEnd !== b.orderEnd) return a.orderEnd - b.orderEnd;
  return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
}

function compareTitles(a, b) {
  return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
}

function compareVideos(a, b) {
  if (a.episodeNumber !== b.episodeNumber) return a.episodeNumber - b.episodeNumber;
  return a.fileName.localeCompare(b.fileName, undefined, { numeric: true, sensitivity: 'base' });
}

async function ensureDataDir() {
  await fsp.mkdir(DATA_DIR, { recursive: true });
}

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function emptyProgress() {
  return { last: null, titles: {}, lastByTitle: {}, videos: {}, episodes: {} };
}

function normalizeProgressShape(progress = {}) {
  const videos = isObject(progress.videos) ? progress.videos : {};
  const last = progress.last && progress.last.videoId ? progress.last : null;
  const titles = {
    ...(isObject(progress.lastByTitle) ? progress.lastByTitle : {}),
    ...(isObject(progress.titles) ? progress.titles : {})
  };

  // Migration for progress files from older versions: keep the global last item,
  // but also expose it as the last item for that specific title.
  if (last?.titleId && !titles[last.titleId]) {
    titles[last.titleId] = last;
  }

  return {
    last,
    titles,
    // Compatibility alias for any older UI files that may still look for this name.
    lastByTitle: titles,
    videos,
    // Keep old field if present so an older app version does not immediately destroy it.
    episodes: isObject(progress.episodes) ? progress.episodes : {}
  };
}

function normalizeProfileId(value) {
  const id = String(value || '').trim();
  return /^[A-Za-z0-9_-]{1,80}$/.test(id) ? id : '';
}

function normalizeProfileName(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_PROFILE_NAME_LENGTH);
}

function normalizeProfileColor(value, index = 0) {
  const color = String(value || '').trim();
  if (/^#[0-9A-Fa-f]{6}$/.test(color)) return color;
  return PROFILE_COLORS[index % PROFILE_COLORS.length];
}

function createEmptyProfile(id, name, color, now = new Date().toISOString()) {
  return {
    id,
    name,
    color,
    createdAt: now,
    updatedAt: now,
    ...emptyProgress()
  };
}

function profileSummary(profile) {
  return {
    id: profile.id,
    name: profile.name,
    color: profile.color,
    createdAt: profile.createdAt,
    updatedAt: profile.updatedAt
  };
}

function progressSnapshot(profile) {
  return {
    last: profile.last || null,
    titles: profile.titles || {},
    lastByTitle: profile.titles || {},
    videos: profile.videos || {},
    episodes: profile.episodes || {}
  };
}

function normalizeProfile(rawProfile, fallbackId, fallbackName, index = 0) {
  const profileData = isObject(rawProfile) ? rawProfile : {};
  const id = normalizeProfileId(profileData.id || fallbackId);
  if (!id) return null;

  const now = new Date().toISOString();
  const name = normalizeProfileName(profileData.name || fallbackName) || fallbackName || 'Profile';
  const progressSource = isObject(profileData.progress) ? profileData.progress : profileData;
  const progress = normalizeProgressShape(progressSource);

  return {
    id,
    name,
    color: normalizeProfileColor(profileData.color, index),
    createdAt: profileData.createdAt || now,
    updatedAt: profileData.updatedAt || progress.last?.updatedAt || now,
    ...progress
  };
}

function normalizeProgressStore(parsed = {}) {
  const profiles = {};

  if (isObject(parsed.profiles)) {
    Object.entries(parsed.profiles).forEach(([profileId, profile], index) => {
      const normalized = normalizeProfile(profile, profileId, `Profile ${index + 1}`, index);
      if (normalized) profiles[normalized.id] = normalized;
    });
  }

  if (!Object.keys(profiles).length) {
    const defaultProfile = normalizeProfile(parsed, DEFAULT_PROFILE_ID, 'Default', 0);
    if (defaultProfile) profiles[DEFAULT_PROFILE_ID] = defaultProfile;
  }

  if (!Object.keys(profiles).length) {
    profiles[DEFAULT_PROFILE_ID] = createEmptyProfile(
      DEFAULT_PROFILE_ID,
      'Default',
      PROFILE_COLORS[0]
    );
  }

  return { version: 2, profiles };
}

function serializeProgressStore(store) {
  const normalizedStore = normalizeProgressStore(store);
  const profiles = normalizedStore.profiles;
  const legacyProfile = profiles[DEFAULT_PROFILE_ID] || Object.values(profiles)[0] || createEmptyProfile(
    DEFAULT_PROFILE_ID,
    'Default',
    PROFILE_COLORS[0]
  );

  return {
    version: 2,
    profiles,
    ...progressSnapshot(legacyProfile)
  };
}

async function loadProgressStore() {
  await ensureDataDir();
  try {
    const raw = await fsp.readFile(PROGRESS_PATH, 'utf8');
    return normalizeProgressStore(JSON.parse(raw));
  } catch (error) {
    if (error.code !== 'ENOENT') {
      const backupPath = `${PROGRESS_PATH}.bad-${Date.now()}`;
      try {
        await fsp.rename(PROGRESS_PATH, backupPath);
        console.warn(`Progress file was unreadable. Moved it to ${backupPath}`);
      } catch (_) {}
    }
    return normalizeProgressStore({});
  }
}

async function saveProgressStore(store) {
  await ensureDataDir();
  const tempPath = `${PROGRESS_PATH}.tmp`;
  await fsp.writeFile(tempPath, JSON.stringify(serializeProgressStore(store), null, 2));
  await fsp.rename(tempPath, PROGRESS_PATH);
}

function getProfileIdFromRequest(req) {
  const raw = req.body?.profileId || req.query?.profileId || req.get('x-profile-id') || DEFAULT_PROFILE_ID;
  return normalizeProfileId(raw);
}

async function getProfileContext(req, res) {
  const profileId = getProfileIdFromRequest(req);
  if (!profileId) {
    res.status(400).json({ error: 'Invalid profileId.' });
    return null;
  }

  const store = await loadProgressStore();
  const profile = store.profiles[profileId];
  if (!profile) {
    res.status(404).json({ error: 'Profile not found.' });
    return null;
  }

  return { store, profile, progress: progressSnapshot(profile) };
}

function createProfile(name, existingCount) {
  const now = new Date().toISOString();
  const randomId = typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : encodeId(`${now}-${Math.random()}`);

  return createEmptyProfile(
    normalizeProfileId(randomId.replace(/[^A-Za-z0-9_-]/g, '')) || encodeId(randomId),
    name,
    PROFILE_COLORS[existingCount % PROFILE_COLORS.length],
    now
  );
}

async function listVideoFiles(relativeDirectory) {
  const directoryPath = resolveMediaRelative(relativeDirectory);
  if (!directoryPath) return [];

  const entries = await fsp.readdir(directoryPath, { withFileTypes: true }).catch(() => []);
  return entries
    .filter((entry) => entry.isFile())
    .filter((entry) => isVideoFileName(entry.name));
}

async function getVideosInDirectory(relativeDirectory, parentName, kind = 'episode') {
  const videoEntries = await listVideoFiles(relativeDirectory);
  const videos = videoEntries
    .map((entry) => parseVideoFile(entry.name, parentName, relativeDirectory, kind))
    .sort(compareVideos);

  if (kind === 'movie' && videos.length > 1) {
    videos.forEach((video, index) => {
      if (video.episodeLabel === 'Movie') {
        video.episodeLabel = String(index + 1);
      }
    });
  }

  return videos;
}

async function getPlayableChaptersForTitle(titleRelativePath, titleName) {
  const titlePath = resolveMediaRelative(titleRelativePath);
  if (!titlePath) return [];

  const entries = await fsp.readdir(titlePath, { withFileTypes: true }).catch(() => []);
  const chapterPromises = entries
    .filter((entry) => entry.isDirectory())
    .filter((entry) => !isIgnoredDirectoryName(entry.name))
    .map(async (entry) => {
      const chapterRelativePath = joinRelative(titleRelativePath, entry.name);
      const videoEntries = await listVideoFiles(chapterRelativePath);
      if (!videoEntries.length) return null;
      return {
        ...parseChapterDirectory(entry.name, titleRelativePath),
        titleName,
        videoCount: videoEntries.length
      };
    });

  const chapters = (await Promise.all(chapterPromises)).filter(Boolean);
  return chapters.sort(compareByLibraryOrder);
}

async function inspectTitleFolder(entry) {
  if (!entry.isDirectory() || isIgnoredDirectoryName(entry.name)) return null;

  const titleRelativePath = normalizeRelativePath(entry.name);
  const titlePath = resolveMediaRelative(titleRelativePath);
  const stat = titlePath ? await fsp.stat(titlePath).catch(() => null) : null;
  if (!stat || !stat.isDirectory()) return null;

  const titleName = cleanDisplayName(entry.name) || entry.name;
  const chapters = await getPlayableChaptersForTitle(titleRelativePath, titleName);
  const directVideos = await listVideoFiles(titleRelativePath);

  if (!chapters.length && !directVideos.length) return null;

  const hasChapters = chapters.length > 0;
  return {
    id: idFromRelativePath(titleRelativePath),
    relativePath: titleRelativePath,
    folderName: entry.name,
    name: titleName,
    type: hasChapters ? 'series' : 'movie',
    chapterCount: chapters.length,
    videoCount: hasChapters
      ? chapters.reduce((total, chapter) => total + chapter.videoCount, 0)
      : directVideos.length
  };
}

async function getLibrary() {
  const entries = await fsp.readdir(MEDIA_ROOT, { withFileTypes: true });
  const titles = (await Promise.all(entries.map(inspectTitleFolder))).filter(Boolean);
  return titles.sort(compareTitles);
}

async function getTitleById(titleId) {
  const relativePath = normalizeRelativePath(decodeId(titleId));
  if (!relativePath || relativePath.includes('/')) return null;

  const titlePath = resolveMediaRelative(relativePath);
  const stat = titlePath ? await fsp.stat(titlePath).catch(() => null) : null;
  if (!stat || !stat.isDirectory()) return null;

  const entry = { name: path.basename(relativePath), isDirectory: () => true };
  const title = await inspectTitleFolder(entry);
  if (!title || title.id !== titleId) return null;
  return title;
}

async function getChapterById(title, chapterId) {
  const relativePath = normalizeRelativePath(decodeId(chapterId));
  const chapterPath = resolveMediaRelative(relativePath);
  const titlePath = resolveMediaRelative(title.relativePath);

  if (!chapterPath || !titlePath || !isInsideOrSame(titlePath, chapterPath) || chapterPath === titlePath) {
    return null;
  }

  const stat = await fsp.stat(chapterPath).catch(() => null);
  if (!stat || !stat.isDirectory()) return null;

  const folderName = path.basename(chapterPath);
  const parentRelativePath = normalizeRelativePath(path.dirname(relativePath).replace(/\\/g, '/'));
  if (parentRelativePath !== title.relativePath) return null;

  const videos = await listVideoFiles(relativePath);
  if (!videos.length) return null;

  return {
    ...parseChapterDirectory(folderName, title.relativePath),
    titleName: title.name,
    videoCount: videos.length
  };
}

async function getVideoPath(videoId) {
  const relativePath = normalizeRelativePath(decodeId(videoId));
  const fullPath = resolveMediaRelative(relativePath);

  if (!fullPath) return null;

  const stat = await fsp.stat(fullPath).catch(() => null);
  if (!stat || !stat.isFile()) return null;
  if (!isVideoFileName(fullPath)) return null;

  return fullPath;
}

async function getVideoInfo(videoId) {
  const relativePath = normalizeRelativePath(decodeId(videoId));
  const fullPath = await getVideoPath(videoId);
  if (!fullPath) return null;

  const parts = relativePath.split('/').filter(Boolean);
  if (parts.length < 2) return null;

  const titleRelativePath = parts[0];
  const titleId = idFromRelativePath(titleRelativePath);
  const title = await getTitleById(titleId);
  if (!title) return null;

  const fileName = path.basename(fullPath);
  const parentRelativePath = normalizeRelativePath(parts.slice(0, -1).join('/'));
  const parentName = cleanDisplayName(path.basename(parentRelativePath));

  if (title.type === 'movie' || parentRelativePath === title.relativePath) {
    return {
      title,
      chapter: null,
      video: parseVideoFile(fileName, title.name, title.relativePath, 'movie')
    };
  }

  const chapter = parseChapterDirectory(path.basename(parentRelativePath), title.relativePath);
  if (normalizeRelativePath(path.dirname(parentRelativePath).replace(/\\/g, '/')) !== title.relativePath) {
    return {
      title,
      chapter: null,
      video: parseVideoFile(fileName, parentName || title.name, parentRelativePath, 'episode')
    };
  }

  return {
    title,
    chapter: {
      ...chapter,
      titleName: title.name
    },
    video: parseVideoFile(fileName, chapter.name, parentRelativePath, 'episode')
  };
}

function pipeMediaStream(videoPath, res, options = {}) {
  const stream = fs.createReadStream(videoPath, options);
  res.on('close', () => stream.destroy());
  stream.pipe(res);
}

function addProgressToVideos(videos, progress) {
  return videos.map((video) => ({
    ...video,
    progress: progress.videos[video.id] || null
  }));
}

function getProfileSummaries(store) {
  return Object.values(store.profiles)
    .map(profileSummary)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

app.get('/api/profiles', async (_req, res, next) => {
  try {
    const store = await loadProgressStore();
    res.json({ profiles: getProfileSummaries(store) });
  } catch (error) {
    next(error);
  }
});

app.post('/api/profiles', async (req, res, next) => {
  try {
    const name = normalizeProfileName(req.body?.name);
    if (!name) {
      res.status(400).json({ error: 'Profile name is required.' });
      return;
    }

    const store = await loadProgressStore();
    const profile = createProfile(name, Object.keys(store.profiles).length);
    store.profiles[profile.id] = profile;

    await saveProgressStore(store);
    res.status(201).json({
      profile: profileSummary(profile),
      profiles: getProfileSummaries(store)
    });
  } catch (error) {
    next(error);
  }
});

app.get('/api/health', async (_req, res) => {
  const mediaExists = Boolean(await fsp.stat(MEDIA_ROOT).catch(() => null));
  res.json({ ok: true, mediaRoot: MEDIA_ROOT, mediaExists });
});

app.get('/api/library', async (_req, res, next) => {
  try {
    const profileContext = await getProfileContext(_req, res);
    if (!profileContext) return;

    const titles = await getLibrary();
    res.json({
      mediaRoot: MEDIA_ROOT,
      titles,
      progress: profileContext.progress,
      profile: profileSummary(profileContext.profile)
    });
  } catch (error) {
    if (error.code === 'ENOENT') {
      res.status(500).json({
        error: `Media folder not found: ${MEDIA_ROOT}`,
        hint: 'Create config.json from config.example.json or set MEDIA_ROOT before starting the app.'
      });
      return;
    }
    next(error);
  }
});

app.get('/api/titles/:titleId', async (req, res, next) => {
  try {
    const profileContext = await getProfileContext(req, res);
    if (!profileContext) return;

    const title = await getTitleById(req.params.titleId);
    if (!title) {
      res.status(404).json({ error: 'Title not found.' });
      return;
    }

    const chapters = title.type === 'series'
      ? await getPlayableChaptersForTitle(title.relativePath, title.name)
      : [];
    const videos = title.type === 'movie'
      ? addProgressToVideos(await getVideosInDirectory(title.relativePath, title.name, 'movie'), profileContext.progress)
      : [];

    res.json({ title, chapters, videos, progress: profileContext.progress });
  } catch (error) {
    next(error);
  }
});

app.get('/api/titles/:titleId/chapters/:chapterId/videos', async (req, res, next) => {
  try {
    const profileContext = await getProfileContext(req, res);
    if (!profileContext) return;

    const title = await getTitleById(req.params.titleId);
    if (!title) {
      res.status(404).json({ error: 'Title not found.' });
      return;
    }

    const chapter = await getChapterById(title, req.params.chapterId);
    if (!chapter) {
      res.status(404).json({ error: 'Chapter not found.' });
      return;
    }

    const videos = addProgressToVideos(
      await getVideosInDirectory(chapter.relativePath, chapter.name, 'episode'),
      profileContext.progress
    );

    res.json({ title, chapter, videos, progress: profileContext.progress });
  } catch (error) {
    next(error);
  }
});

// Compatibility endpoint for the old UI. It exposes top-level titles with chapters as "chapters".
app.get('/api/chapters', async (_req, res, next) => {
  try {
    const profileContext = await getProfileContext(_req, res);
    if (!profileContext) return;

    const titles = await getLibrary();
    res.json({
      mediaRoot: MEDIA_ROOT,
      chapters: titles,
      titles,
      progress: profileContext.progress
    });
  } catch (error) {
    next(error);
  }
});

app.get('/api/progress', async (_req, res, next) => {
  try {
    const profileContext = await getProfileContext(_req, res);
    if (!profileContext) return;
    res.json(profileContext.progress);
  } catch (error) {
    next(error);
  }
});

app.get('/api/videos/:videoId', async (req, res, next) => {
  try {
    const profileContext = await getProfileContext(req, res);
    if (!profileContext) return;

    const info = await getVideoInfo(req.params.videoId);
    if (!info) {
      res.status(404).json({ error: 'Video file not found.' });
      return;
    }

    res.json({
      ...info,
      progress: profileContext.progress.videos[req.params.videoId] || null
    });
  } catch (error) {
    next(error);
  }
});

app.post('/api/progress', async (req, res, next) => {
  try {
    const profileContext = await getProfileContext(req, res);
    if (!profileContext) return;

    const { titleId, chapterId, videoId } = req.body || {};
    if (!titleId || !videoId) {
      res.status(400).json({ error: 'titleId and videoId are required.' });
      return;
    }

    const videoPath = await getVideoPath(videoId);
    if (!videoPath) {
      res.status(404).json({ error: 'Video file not found.' });
      return;
    }

    const now = new Date().toISOString();
    const time = Math.max(0, Number(req.body.time) || 0);
    const duration = Math.max(0, Number(req.body.duration) || 0);
    const existingProgress = profileContext.profile;
    existingProgress.videos = existingProgress.videos || {};
    existingProgress.titles = existingProgress.titles || existingProgress.lastByTitle || {};
    existingProgress.lastByTitle = existingProgress.titles;

    const existingVideo = existingProgress.videos[videoId] || {};
    const endedByPosition = duration > 0 && time >= Math.max(0, duration - 8);
    const completedNow = Boolean(req.body.finished || endedByPosition);
    const finished = Boolean(existingVideo.finished || completedNow);
    const savedTime = completedNow && duration > 0 ? duration : time;

    existingProgress.videos[videoId] = {
      time: savedTime,
      duration,
      finished,
      updatedAt: now
    };

    const lastForTitle = {
      titleId,
      chapterId: chapterId || null,
      videoId,
      time: savedTime,
      duration,
      updatedAt: now
    };

    existingProgress.last = lastForTitle;
    existingProgress.titles[titleId] = lastForTitle;
    existingProgress.lastByTitle = existingProgress.titles;
    existingProgress.updatedAt = now;

    await saveProgressStore(profileContext.store);
    res.json({
      ok: true,
      profile: profileSummary(existingProgress),
      progress: progressSnapshot(existingProgress)
    });
  } catch (error) {
    next(error);
  }
});

app.post('/api/progress/reset', async (_req, res, next) => {
  try {
    const profileContext = await getProfileContext(_req, res);
    if (!profileContext) return;

    const resetProgress = emptyProgress();
    Object.assign(profileContext.profile, resetProgress, { updatedAt: new Date().toISOString() });

    await saveProgressStore(profileContext.store);
    res.json({
      ok: true,
      profile: profileSummary(profileContext.profile),
      progress: progressSnapshot(profileContext.profile)
    });
  } catch (error) {
    next(error);
  }
});

app.get('/media/:videoId', async (req, res, next) => {
  try {
    const videoPath = await getVideoPath(req.params.videoId);
    if (!videoPath) {
      res.status(404).send('Video not found.');
      return;
    }

    const stat = await fsp.stat(videoPath);
    const fileSize = stat.size;
    const extension = path.extname(videoPath).toLowerCase();
    const contentType = MIME_TYPES[extension] || 'application/octet-stream';
    const range = req.headers.range;

    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Content-Type', contentType);

    if (!range) {
      res.setHeader('Content-Length', fileSize);
      pipeMediaStream(videoPath, res);
      return;
    }

    const rangeParts = range.replace(/bytes=/, '').split('-');
    const start = parseInt(rangeParts[0], 10);
    const end = rangeParts[1] ? parseInt(rangeParts[1], 10) : fileSize - 1;

    if (!Number.isFinite(start) || !Number.isFinite(end) || start >= fileSize || end >= fileSize || start > end) {
      res.status(416).setHeader('Content-Range', `bytes */${fileSize}`);
      res.end();
      return;
    }

    const chunkSize = end - start + 1;
    res.writeHead(206, {
      'Content-Range': `bytes ${start}-${end}/${fileSize}`,
      'Content-Length': chunkSize,
      'Content-Type': contentType,
      'Accept-Ranges': 'bytes'
    });
    pipeMediaStream(videoPath, res, { start, end });
  } catch (error) {
    next(error);
  }
});

app.use(express.static(path.join(APP_ROOT, 'public')));

app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(500).json({ error: error.message || 'Internal server error.' });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Anime Home Viewer is running at http://0.0.0.0:${PORT}`);
  console.log(`Media root: ${MEDIA_ROOT}`);
});
