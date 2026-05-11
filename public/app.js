const state = {
  profiles: [],
  currentProfile: null,
  profileGateOpen: true,
  sidebarOpen: true,
  loadingTitleId: null,
  loadingChapterId: null,
  continueItem: null,
  continueItems: [],
  continueLoading: false,
  continueError: '',
  titles: [],
  progress: { last: null, titles: {}, videos: {} },
  view: 'library',
  currentTitle: null,
  chapters: [],
  currentChapter: null,
  videos: [],
  currentVideo: null,
  playingTitle: null,
  playingChapter: null,
  playingVideos: [],
  playingChapters: [],
  lastSaveAt: 0
};

const PROFILE_STORAGE_KEY = 'animeHomeViewerProfileId';

const appLayout = document.getElementById('appLayout');
const homeButton = document.getElementById('homeButton');
const libraryToggleButton = document.getElementById('libraryToggleButton');
const librarySidebar = document.getElementById('librarySidebar');
const sidebarList = document.getElementById('sidebarList');
const continueSection = document.getElementById('continueSection');
const continueWatching = document.getElementById('continueWatching');
const browserCard = document.getElementById('browserCard');
const browserList = document.getElementById('browserList');
const browserSectionTitle = document.getElementById('browserSectionTitle');
const browserHeading = document.getElementById('browserHeading');
const browserSubheading = document.getElementById('browserSubheading');
const backButton = document.getElementById('backButton');
const playerCard = document.getElementById('playerCard');
const nowPlaying = document.getElementById('nowPlaying');
const playbackMeta = document.getElementById('playbackMeta');
const videoPlayer = document.getElementById('videoPlayer');
const statusBox = document.getElementById('status');
const refreshButton = document.getElementById('refreshButton');
const titleResumeButton = document.getElementById('titleResumeButton');
const profileGate = document.getElementById('profileGate');
const profileList = document.getElementById('profileList');
const profileForm = document.getElementById('profileForm');
const profileNameInput = document.getElementById('profileNameInput');
const profileButton = document.getElementById('profileButton');
const profileButtonAvatar = document.getElementById('profileButtonAvatar');
const profileButtonName = document.getElementById('profileButtonName');
const previousButton = document.getElementById('previousButton');
const playPauseButton = document.getElementById('playPauseButton');
const playPauseIcon = document.getElementById('playPauseIcon');
const nextButton = document.getElementById('nextButton');

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function safeColor(value) {
  const color = String(value || '').trim();
  return /^#[0-9A-Fa-f]{6}$/.test(color) ? color : '#7aa2ff';
}

function getProfileInitial(profile) {
  return String(profile?.name || '?').trim().charAt(0).toUpperCase() || '?';
}

function withProfile(url) {
  if (!state.currentProfile?.id) return url;
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}profileId=${encodeURIComponent(state.currentProfile.id)}`;
}

function mediaUrl(videoId, time = 0) {
  const seconds = Math.max(0, Math.floor(Number(time) || 0));
  return `/media/${encodeURIComponent(videoId)}#t=${seconds}`;
}

function unloadVideoElement(element) {
  if (!element) return;
  try {
    element.pause();
  } catch (_) {}
  element.removeAttribute('src');
  try {
    element.load();
  } catch (_) {}
}

function unloadContinueThumbnail() {
  continueWatching.querySelectorAll('video').forEach(unloadVideoElement);
}

function setContinueMessage(message) {
  unloadContinueThumbnail();
  continueWatching.className = 'continue-watch empty-state';
  continueWatching.textContent = message;
}

function showStatus(message, isError = false) {
  if (!message) {
    statusBox.classList.add('hidden');
    statusBox.textContent = '';
    return;
  }

  statusBox.textContent = message;
  statusBox.classList.remove('hidden');
  statusBox.style.borderColor = isError ? 'rgba(255, 140, 140, 0.55)' : '';
  statusBox.style.background = isError ? 'rgba(255, 140, 140, 0.10)' : '';
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  let body = null;
  try {
    body = await response.json();
  } catch (_) {}

  if (!response.ok) {
    const error = new Error(body?.error || response.statusText || 'Request failed');
    error.body = body;
    throw error;
  }
  return body;
}

function renderProfileButton() {
  const profile = state.currentProfile;
  profileButton.classList.toggle('hidden', !profile);
  if (!profile) return;

  profileButtonAvatar.textContent = getProfileInitial(profile);
  profileButtonAvatar.style.background = safeColor(profile.color);
  profileButtonName.textContent = profile.name || 'Profile';
}

function renderProfileGate() {
  profileGate.classList.toggle('hidden', !state.profileGateOpen);

  if (!state.profileGateOpen) {
    return;
  }

  const lastProfileId = localStorage.getItem(PROFILE_STORAGE_KEY);
  profileList.className = state.profiles.length ? 'profile-list' : 'profile-list empty-state';
  profileList.innerHTML = state.profiles.length
    ? state.profiles.map((profile) => {
      const isCurrent = state.currentProfile?.id === profile.id;
      const isLast = !isCurrent && lastProfileId === profile.id;
      const badges = [];
      if (isCurrent) badges.push('<span class="badge current">Current</span>');
      if (isLast) badges.push('<span class="badge">Last used</span>');

      return `
        <button class="profile-choice${isCurrent ? ' active' : ''}" type="button" data-profile-id="${escapeHtml(profile.id)}">
          <span class="profile-avatar large" style="background: ${safeColor(profile.color)}">${escapeHtml(getProfileInitial(profile))}</span>
          <span class="profile-choice-name">${escapeHtml(profile.name || 'Profile')}</span>
          <span class="badges">${badges.join('')}</span>
        </button>
      `;
    }).join('')
    : 'No profiles yet.';
}

function showProfileGate() {
  state.profileGateOpen = true;
  renderProfileGate();
  renderProfileButton();
  profileNameInput.focus();
}

function hideProfileGate() {
  state.profileGateOpen = false;
  renderProfileGate();
  renderProfileButton();
}

function clearPlayback() {
  if (state.currentVideo) {
    const time = Number.isFinite(videoPlayer.currentTime) ? videoPlayer.currentTime : 0;
    const duration = Number.isFinite(videoPlayer.duration) ? videoPlayer.duration : 0;
    saveProgress(true, false, time, duration);
  }

  state.currentVideo = null;
  state.playingTitle = null;
  state.playingChapter = null;
  state.playingVideos = [];
  state.playingChapters = [];
  state.lastSaveAt = 0;

  unloadVideoElement(videoPlayer);

  nowPlaying.textContent = 'Select a video';
  playbackMeta.textContent = '';
  renderPlayer();
}

function normalizeProgress(progress = {}) {
  const normalized = {
    last: progress?.last || null,
    titles: { ...(progress?.titles || {}) },
    videos: { ...(progress?.videos || {}) },
    episodes: progress?.episodes || {}
  };

  // Migration support for progress files created before per-title resume existed.
  if (normalized.last?.titleId && normalized.last?.videoId && !normalized.titles[normalized.last.titleId]) {
    normalized.titles[normalized.last.titleId] = { ...normalized.last };
  }

  return normalized;
}

function getVideoProgress(videoId) {
  return state.progress?.videos?.[videoId] || null;
}

function getTitleResume(titleId) {
  if (!titleId) return null;
  const titleResume = state.progress?.titles?.[titleId];
  if (titleResume?.videoId) return titleResume;
  const last = state.progress?.last;
  return last?.titleId === titleId && last?.videoId ? last : null;
}

function getCurrentTitleResume() {
  return getTitleResume(state.currentTitle?.id);
}

function getResumeProgress(resume) {
  if (!resume?.videoId) return null;
  return getVideoProgress(resume.videoId) || resume;
}

function isUsefulResume(resume) {
  if (!resume?.videoId) return false;
  const videoProgress = getResumeProgress(resume);
  return !videoProgress?.finished;
}

function canResumeCurrentTitle() {
  const title = state.currentTitle;
  const resume = getCurrentTitleResume();
  if (!title || !isUsefulResume(resume)) return false;

  if (title.type === 'series') {
    if (!resume.chapterId || !state.chapters.length) return false;
    return state.chapters.some((chapter) => chapter.id === resume.chapterId);
  }

  if (!state.videos.length) return false;
  return state.videos.some((video) => video.id === resume.videoId);
}

function formatTime(totalSeconds) {
  const value = Math.max(0, Math.floor(Number(totalSeconds) || 0));
  const hours = Math.floor(value / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  const seconds = value % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function plural(count, single, many = `${single}s`) {
  return `${count} ${count === 1 ? single : many}`;
}

function getTitleMeta(title) {
  if (!title) return '';
  if (title.type === 'series') {
    return `${plural(title.chapterCount, 'chapter')} | ${plural(title.videoCount, 'episode')}`;
  }
  return title.videoCount === 1 ? 'Movie' : plural(title.videoCount, 'video');
}

function getResumeMeta(resume) {
  const progress = getResumeProgress(resume);
  if (!progress) return 'Resume available';

  const time = Number(progress.time ?? resume?.time ?? 0) || 0;
  const duration = Number(progress.duration ?? resume?.duration ?? 0) || 0;

  if (duration > 0) {
    return `Resume at ${formatTime(time)} / ${formatTime(duration)}`;
  }
  if (time > 0) {
    return `Resume at ${formatTime(time)}`;
  }
  return 'Resume available';
}

function getChapterMeta(chapter) {
  if (!chapter) return '';
  const parts = [];
  if (chapter.rangeLabel) parts.push(`Episodes ${chapter.rangeLabel}`);
  if (chapter.videoCount) parts.push(plural(chapter.videoCount, 'episode'));
  return parts.join(' | ');
}

function setBrowserHeader(sectionTitle, heading, subheading = '', showBack = false) {
  browserSectionTitle.textContent = sectionTitle;
  browserHeading.textContent = heading;
  browserSubheading.textContent = subheading;
  backButton.classList.toggle('hidden', !showBack);
}

function setBrowserLoading(message) {
  browserList.className = 'browser-list empty-state';
  browserList.textContent = message;
}

function renderBrowserActions() {
  const showResume = Boolean(state.currentProfile) && state.view !== 'library' && canResumeCurrentTitle();
  titleResumeButton.classList.toggle('hidden', !showResume);
}

function renderLibraryView() {
  setBrowserHeader('Home', 'Home', state.currentProfile ? `Watching as ${state.currentProfile.name}` : '', false);
  renderBrowserActions();
}

function renderMenuVideoButton(video) {
  const progress = getVideoProgress(video.id) || video.progress;
  const isResumeVideo = getCurrentTitleResume()?.videoId === video.id && isUsefulResume(getCurrentTitleResume());
  const isActive = state.currentVideo?.id === video.id;
  const time = progress?.time || 0;
  const duration = progress?.duration || 0;
  const percent = duration > 0 ? Math.min(100, Math.round((time / duration) * 100)) : 0;
  const sublineParts = [];
  const badges = [];

  if (duration > 0) sublineParts.push(`${formatTime(time)} / ${formatTime(duration)}`);
  if (isActive) badges.push('<span class="badge current">Playing</span>');
  if (progress?.finished) badges.push('<span class="badge done">Finished</span>');
  if (isResumeVideo) badges.push('<span class="badge current">Resume point</span>');

  return `
    <button class="menu-video-button${isActive ? ' active' : ''}${isResumeVideo ? ' current' : ''}" data-video-id="${escapeHtml(video.id)}" type="button">
      <span class="episode-number">${escapeHtml(video.episodeLabel)}</span>
      <span>
        <span class="episode-title">${escapeHtml(video.displayTitle)}</span>
        <span class="episode-subline">${escapeHtml(sublineParts.join(' | '))}</span>
        <span class="progress-wrap" aria-hidden="true"><span class="progress-bar" style="width: ${percent}%"></span></span>
      </span>
      <span class="badges">${badges.join('')}</span>
    </button>
  `;
}

function renderMenuVideos(videos, emptyMessage) {
  if (!videos.length) {
    return `<div class="menu-note">${escapeHtml(emptyMessage)}</div>`;
  }
  return videos.map(renderMenuVideoButton).join('');
}

function renderSidebar() {
  appLayout.classList.remove('sidebar-collapsed');
  librarySidebar.classList.toggle('menu-collapsed', !state.sidebarOpen);
  libraryToggleButton.setAttribute('aria-expanded', String(state.sidebarOpen));
  refreshButton.classList.toggle('hidden', !state.currentProfile);

  if (!state.currentProfile) {
    sidebarList.className = 'sidebar-list empty-state';
    sidebarList.classList.toggle('hidden', !state.sidebarOpen);
    sidebarList.textContent = 'Choose a profile.';
    return;
  }

  if (!state.titles.length) {
    sidebarList.className = 'sidebar-list empty-state';
    sidebarList.classList.toggle('hidden', !state.sidebarOpen);
    sidebarList.textContent = 'No titles found.';
    return;
  }

  const last = state.progress?.last;
  sidebarList.className = 'sidebar-list';
  sidebarList.classList.toggle('hidden', !state.sidebarOpen);
  sidebarList.innerHTML = state.titles.map((title) => {
    const resume = getTitleResume(title.id);
    const hasResume = isUsefulResume(resume);
    const isPlaying = state.playingTitle?.id === title.id && state.currentVideo;
    const active = state.currentTitle?.id === title.id ? ' active' : '';
    const current = last?.titleId === title.id ? ' current' : '';
    const expanded = state.currentTitle?.id === title.id;
    const badges = [];
    const children = [];

    if (isPlaying) badges.push('<span class="badge current">Playing</span>');
    if (hasResume) badges.push('<span class="badge">Resume</span>');
    if (last?.titleId === title.id) badges.push('<span class="badge current">Last watched</span>');

    if (expanded && title.type === 'movie') {
      children.push(state.loadingTitleId === title.id
        ? '<div class="menu-note">Loading videos...</div>'
        : renderMenuVideos(state.videos, 'No playable video files were found in this title folder.'));
    }

    if (expanded && title.type === 'series') {
      if (state.loadingTitleId === title.id) {
        children.push('<div class="menu-note">Loading chapters...</div>');
      } else if (!state.chapters.length) {
        children.push('<div class="menu-note">No chapter folders with playable videos were found for this title.</div>');
      } else {
        children.push(state.chapters.map((chapter) => {
          const chapterActive = state.currentChapter?.id === chapter.id ? ' active' : '';
          const resumeChapter = hasResume && resume?.chapterId === chapter.id;
          const playingChapter = state.playingChapter?.id === chapter.id && state.currentVideo;
          const chapterBadges = [];

          if (playingChapter) chapterBadges.push('<span class="badge current">Playing</span>');
          if (resumeChapter) chapterBadges.push('<span class="badge current">Resume chapter</span>');

          return `
            <div class="menu-branch">
              <button class="menu-chapter-button${chapterActive}${resumeChapter || playingChapter ? ' current' : ''}" data-chapter-id="${escapeHtml(chapter.id)}" type="button">
                <span class="chapter-name">${escapeHtml(chapter.name)}</span>
                <span class="chapter-range">${escapeHtml(getChapterMeta(chapter))}</span>
                <span class="badges">${chapterBadges.join('')}</span>
              </button>
              ${state.currentChapter?.id === chapter.id
                ? `<div class="menu-children menu-videos">${
                  state.loadingChapterId === chapter.id
                    ? '<div class="menu-note">Loading episodes...</div>'
                    : renderMenuVideos(state.videos, 'No playable video files were found in this chapter folder.')
                }</div>`
                : ''}
            </div>
          `;
        }).join(''));
      }
    }

    return `
      <div class="menu-branch">
        <button class="menu-title-button${active}${current}" data-title-id="${escapeHtml(title.id)}" type="button">
          <span class="title-name">${escapeHtml(title.name)}</span>
          <span class="title-meta">${escapeHtml(getTitleMeta(title))}</span>
          <span class="badges">${badges.join('')}</span>
        </button>
        ${children.length ? `<div class="menu-children">${children.join('')}</div>` : ''}
      </div>
    `;
  }).join('');
}

function focusPlayingEpisodeInSidebar() {
  if (!state.sidebarOpen || !state.currentVideo?.id || !state.playingTitle?.id) return;

  requestAnimationFrame(() => {
    const episodeButton = [...sidebarList.querySelectorAll('[data-video-id]')]
      .find((button) => button.dataset.videoId === state.currentVideo.id);
    const titleButton = [...sidebarList.querySelectorAll('[data-title-id]')]
      .find((button) => button.dataset.titleId === state.playingTitle.id);
    const targetButton = episodeButton || titleButton;
    if (!targetButton) return;

    try {
      targetButton.focus({ preventScroll: true });
    } catch (_) {
      targetButton.focus();
    }
    targetButton.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' });
  });
}

async function openLibraryFocusedOnPlayingEpisode() {
  state.sidebarOpen = true;

  if (!state.currentVideo || !state.playingTitle?.id) {
    renderSidebar();
    return;
  }

  const needsTitleLoad = state.currentTitle?.id !== state.playingTitle.id
    || (state.playingTitle.type === 'series' ? !state.chapters.length : !state.videos.length);
  if (needsTitleLoad) {
    await selectTitle(state.playingTitle.id);
  }

  if (state.playingTitle.type === 'series' && state.playingChapter?.id) {
    if (state.currentChapter?.id !== state.playingChapter.id || !state.videos.length) {
      await selectChapter(state.playingChapter.id);
    }
  }

  renderSidebar();
  focusPlayingEpisodeInSidebar();
}

function renderTitleView() {
  if (!state.currentTitle) {
    state.view = 'library';
    renderLibraryView();
    return;
  }

  const title = state.currentTitle;
  const resume = getCurrentTitleResume();
  const canResume = canResumeCurrentTitle();
  const metaParts = [getTitleMeta(title)];
  if (canResume) metaParts.push(getResumeMeta(resume));

  const sectionTitle = title.type === 'series'
    ? 'Chapters'
    : title.videoCount === 1 ? 'Movie' : 'Videos';

  setBrowserHeader(sectionTitle, title.name, metaParts.filter(Boolean).join(' | '), true);
  renderBrowserActions();

  if (title.type === 'movie') {
    renderVideoButtons(state.videos, 'No playable video files were found in this title folder.');
    return;
  }

  if (!state.chapters.length) {
    browserList.className = 'browser-list empty-state';
    browserList.textContent = 'No chapter folders with playable videos were found for this title.';
    return;
  }

  const showResumeChapter = isUsefulResume(resume);
  browserList.className = 'browser-list';
  browserList.innerHTML = state.chapters.map((chapter) => {
    const active = state.currentChapter?.id === chapter.id ? ' active' : '';
    const resumeChapter = showResumeChapter && resume?.chapterId === chapter.id;
    const playingChapter = state.playingChapter?.id === chapter.id && state.currentVideo;
    const current = resumeChapter || playingChapter ? ' current' : '';
    const badges = [];

    if (playingChapter) badges.push('<span class="badge current">Playing</span>');
    if (resumeChapter) badges.push('<span class="badge current">Resume chapter</span>');

    return `
      <button class="chapter-button${active}${current}" data-chapter-id="${escapeHtml(chapter.id)}">
        <span class="chapter-name">${escapeHtml(chapter.name)}</span>
        <span class="chapter-range">${escapeHtml(getChapterMeta(chapter))}</span>
        <span class="badges">${badges.join('')}</span>
      </button>
    `;
  }).join('');
}

function renderChapterView() {
  if (!state.currentTitle || !state.currentChapter) {
    state.view = state.currentTitle ? 'title' : 'library';
    renderBrowser();
    return;
  }

  const subheadingParts = [state.currentTitle.name, getChapterMeta(state.currentChapter)].filter(Boolean);
  setBrowserHeader('Episodes', state.currentChapter.name, subheadingParts.join(' | '), true);
  renderBrowserActions();
  renderVideoButtons(state.videos, 'No playable video files were found in this chapter folder.');
}

function renderVideoButtons(videos, emptyMessage) {
  if (!videos.length) {
    browserList.className = 'browser-list empty-state';
    browserList.textContent = emptyMessage;
    return;
  }

  const resume = getCurrentTitleResume();
  const showResumeVideo = isUsefulResume(resume);
  browserList.className = 'browser-list';
  browserList.innerHTML = videos.map((video) => {
    const progress = getVideoProgress(video.id) || video.progress;
    const isResumeVideo = showResumeVideo && resume?.videoId === video.id;
    const isActive = state.currentVideo?.id === video.id;
    const time = progress?.time || 0;
    const duration = progress?.duration || 0;
    const percent = duration > 0 ? Math.min(100, Math.round((time / duration) * 100)) : 0;
    const sublineParts = [];

    if (video.name && video.kind !== 'movie') sublineParts.push(video.name);
    if (duration > 0) sublineParts.push(`${formatTime(time)} / ${formatTime(duration)}`);

    const badges = [];
    if (isActive) badges.push('<span class="badge current">Playing</span>');
    if (progress?.finished) badges.push('<span class="badge done">Finished</span>');
    if (isResumeVideo) badges.push('<span class="badge current">Resume point</span>');

    return `
      <button class="episode-button${isActive ? ' active' : ''}${isResumeVideo ? ' current' : ''}" data-video-id="${escapeHtml(video.id)}">
        <span class="episode-number">${escapeHtml(video.episodeLabel)}</span>
        <span>
          <span class="episode-title">${escapeHtml(video.displayTitle)}</span>
          <span class="episode-subline">${escapeHtml(sublineParts.join(' | '))}</span>
          <span class="progress-wrap" aria-hidden="true"><span class="progress-bar" style="width: ${percent}%"></span></span>
        </span>
        <span class="badges">${badges.join('')}</span>
      </button>
    `;
  }).join('');
}

function renderContinueWatching() {
  if (state.currentVideo) {
    unloadContinueThumbnail();
    continueWatching.textContent = '';
    continueSection.classList.add('hidden');
    return;
  }
  continueSection.classList.remove('hidden');

  if (!state.currentProfile) {
    setContinueMessage('Choose a profile.');
    return;
  }

  if (state.continueLoading) {
    setContinueMessage('Loading saved place...');
    return;
  }

  if (state.continueError) {
    setContinueMessage(state.continueError);
    return;
  }

  const items = state.continueItems.length
    ? state.continueItems
    : state.continueItem ? [state.continueItem] : [];
  if (!items.length) {
    setContinueMessage('Nothing to continue yet.');
    return;
  }

  unloadContinueThumbnail();
  continueWatching.className = 'continue-watch';
  continueWatching.innerHTML = `
    <div class="continue-rail">
      ${items.map((item) => {
        const progress = item.progress || item.resume || {};
        const time = Number(progress.time) || 0;
        const duration = Number(progress.duration) || 0;
        const progressText = duration > 0
          ? `${formatTime(time)} / ${formatTime(duration)}`
          : time > 0 ? formatTime(time) : 'Ready to resume';
        const titleName = item.title?.name || 'Saved title';
        const episodeName = item.video?.displayTitle || item.video?.name || 'Saved video';
        const detailParts = [episodeName, item.chapter?.name, progressText].filter(Boolean);

        return `
          <button class="continue-button" type="button" data-continue-watch="true" data-continue-title-id="${escapeHtml(item.resume.titleId)}">
            <span class="continue-thumb-wrap">
              <video class="continue-thumbnail" muted preload="metadata" playsinline src="${escapeHtml(mediaUrl(item.video.id, time))}"></video>
            </span>
            <span class="continue-details">
              <span class="continue-name">${escapeHtml(titleName)}</span>
              <span class="continue-episode">${escapeHtml(detailParts.join(' | '))}</span>
            </span>
          </button>
        `;
      }).join('')}
    </div>
  `;
}

function renderBrowser() {
  browserCard.classList.add('hidden');
  renderLibraryView();
}

function getCurrentPlaybackVideoIndex() {
  if (!state.currentVideo) return -1;
  return state.playingVideos.findIndex((video) => video.id === state.currentVideo.id);
}

function hasAdjacentChapter(direction) {
  if (state.playingTitle?.type !== 'series' || !state.playingChapter || !state.playingChapters.length) {
    return false;
  }

  const chapterIndex = state.playingChapters.findIndex((chapter) => chapter.id === state.playingChapter.id);
  if (chapterIndex < 0) return false;

  const chapters = direction < 0
    ? state.playingChapters.slice(0, chapterIndex)
    : state.playingChapters.slice(chapterIndex + 1);

  return chapters.some((chapter) => chapter.videoCount !== 0);
}

function hasPreviousVideo() {
  if (!state.currentVideo) return false;
  const videoIndex = getCurrentPlaybackVideoIndex();
  return videoIndex > 0 || hasAdjacentChapter(-1);
}

function hasNextVideo() {
  if (!state.currentVideo) return false;
  const videoIndex = getCurrentPlaybackVideoIndex();
  return (videoIndex >= 0 && videoIndex < state.playingVideos.length - 1) || hasAdjacentChapter(1);
}

function renderPlayerControls() {
  const hasVideo = Boolean(state.currentVideo);
  previousButton.disabled = !hasVideo || !hasPreviousVideo();
  playPauseButton.disabled = !hasVideo;
  nextButton.disabled = !hasVideo || !hasNextVideo();

  const isPaused = !hasVideo || videoPlayer.paused || videoPlayer.ended;
  playPauseIcon.innerHTML = isPaused ? '&#9654;' : '&#10074;&#10074;';
  playPauseButton.setAttribute('aria-label', isPaused ? 'Play video' : 'Pause video');
  playPauseButton.title = isPaused ? 'Play video' : 'Pause video';
}

function renderPlayer() {
  playerCard.classList.toggle('hidden', !state.currentVideo);
  renderPlayerControls();
}

function renderAll() {
  renderProfileButton();
  renderProfileGate();
  renderSidebar();
  renderContinueWatching();
  renderPlayer();
  renderBrowser();
}

function resetToLibrary() {
  state.view = 'library';
  state.currentTitle = null;
  state.currentChapter = null;
  state.chapters = [];
  state.videos = [];
  state.loadingTitleId = null;
  state.loadingChapterId = null;
  renderAll();
}

function getResumableTitleResumes() {
  const resumesByTitle = new Map();

  Object.values(state.progress?.titles || {}).forEach((resume) => {
    if (isUsefulResume(resume) && resume.titleId) {
      resumesByTitle.set(resume.titleId, resume);
    }
  });

  const last = state.progress?.last;
  if (isUsefulResume(last) && last.titleId) {
    resumesByTitle.set(last.titleId, last);
  }

  return [...resumesByTitle.values()]
    .sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
}

function sortContinueItems(items) {
  return [...items].sort((a, b) => {
    const aTime = String(a.resume?.updatedAt || a.progress?.updatedAt || '');
    const bTime = String(b.resume?.updatedAt || b.progress?.updatedAt || '');
    return bTime.localeCompare(aTime);
  });
}

function setContinueItems(items) {
  state.continueItems = sortContinueItems(items);
  state.continueItem = state.continueItems[0] || null;
}

async function refreshContinueWatching() {
  const resumes = getResumableTitleResumes();

  if (!resumes.length) {
    setContinueItems([]);
    state.continueLoading = false;
    state.continueError = '';
    renderContinueWatching();
    return;
  }

  const existingItems = state.continueItems.length
    ? state.continueItems
    : state.continueItem ? [state.continueItem] : [];
  const existingByTitle = new Map(existingItems.map((item) => [item.resume?.titleId, item]));
  const canReuseItems = resumes.every((resume) => {
    const item = existingByTitle.get(resume.titleId);
    return item?.video?.id === resume.videoId;
  });

  if (canReuseItems) {
    setContinueItems(resumes.map((resume) => {
      const item = existingByTitle.get(resume.titleId);
      return {
        ...item,
        resume,
        progress: getResumeProgress(resume) || resume
      };
    }));
    state.continueLoading = false;
    state.continueError = '';
    renderContinueWatching();
    return;
  }

  setContinueItems([]);
  state.continueLoading = true;
  state.continueError = '';
  renderContinueWatching();

  try {
    const loadedItems = await Promise.all(resumes.map(async (resume) => {
      try {
        const data = await fetchJson(withProfile(`/api/videos/${encodeURIComponent(resume.videoId)}`));
        const latestResume = getTitleResume(resume.titleId);
        if (!isUsefulResume(latestResume) || latestResume.videoId !== resume.videoId) return null;

        return {
          resume: latestResume,
          progress: getResumeProgress(latestResume) || latestResume,
          title: data.title,
          chapter: data.chapter,
          video: data.video
        };
      } catch (_) {
        return null;
      }
    }));
    setContinueItems(loadedItems.filter(Boolean));
    state.continueError = state.continueItems.length
      ? ''
      : 'Saved videos could not be found. Refresh the library if files were moved.';
  } finally {
    state.continueLoading = false;
    renderContinueWatching();
  }
}

function updateContinueItemFromPlayback(resume, progress, title, chapter, video) {
  if (!resume?.videoId || resume.videoId !== video?.id) return false;
  const existingItems = state.continueItems.length
    ? state.continueItems
    : state.continueItem ? [state.continueItem] : [];
  if (!isUsefulResume(resume)) {
    setContinueItems(existingItems.filter((item) => item.resume?.titleId !== resume.titleId));
    state.continueLoading = false;
    state.continueError = '';
    return true;
  }

  const nextItem = {
    resume,
    progress: progress || getResumeProgress(resume) || resume,
    title,
    chapter: chapter || null,
    video: {
      ...video,
      progress: progress || video.progress || null
    }
  };
  const otherItems = existingItems.filter((item) => item.resume?.titleId !== resume.titleId);
  setContinueItems([nextItem, ...otherItems]);
  state.continueLoading = false;
  state.continueError = '';
  return true;
}

async function loadProfiles() {
  try {
    showStatus('Loading profiles...');
    const data = await fetchJson('/api/profiles');
    state.profiles = data.profiles || [];
    showStatus('');
    showProfileGate();
  } catch (error) {
    showStatus(error.message, true);
    state.profiles = [];
    showProfileGate();
  }
}

async function createProfileFromName(name) {
  const trimmedName = String(name || '').trim();
  if (!trimmedName) return;

  try {
    showStatus('Creating profile...');
    const data = await fetchJson('/api/profiles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: trimmedName })
    });

    state.profiles = data.profiles || [];
    showStatus('');
    profileNameInput.value = '';
    await selectProfile(data.profile?.id);
  } catch (error) {
    showStatus(error.message, true);
  }
}

async function selectProfile(profileId) {
  const profile = state.profiles.find((item) => item.id === profileId);
  if (!profile) return;

  const changedProfile = state.currentProfile?.id !== profile.id;
  if (changedProfile && state.currentVideo) {
    await saveProgress(true, false);
    clearPlayback();
  }
  if (changedProfile) {
    setContinueItems([]);
    state.continueError = '';
  }

  state.currentProfile = profile;
  localStorage.setItem(PROFILE_STORAGE_KEY, profile.id);
  hideProfileGate();
  await loadLibrary();
}

async function loadLibrary() {
  if (!state.currentProfile) {
    showProfileGate();
    return;
  }

  try {
    showStatus('Loading library...');
    const data = await fetchJson(withProfile('/api/library'));
    state.titles = data.titles || [];
    state.progress = normalizeProgress(data.progress || {});

    showStatus('');
    resetToLibrary();
    await refreshContinueWatching();
  } catch (error) {
    const hint = error.body?.hint ? ` ${error.body.hint}` : '';
    showStatus(`${error.message}.${hint}`, true);
    state.view = 'library';
    setBrowserHeader('Library', 'Library', '', false);
    browserList.innerHTML = '<div class="empty-state">Library could not be loaded.</div>';
  }
}

async function selectTitle(titleId) {
  const title = state.titles.find((item) => item.id === titleId);
  if (!title) return;

  state.view = 'library';
  state.currentTitle = title;
  state.currentChapter = null;
  state.chapters = [];
  state.videos = [];
  state.loadingTitleId = titleId;
  state.loadingChapterId = null;
  renderAll();

  try {
    const data = await fetchJson(withProfile(`/api/titles/${encodeURIComponent(titleId)}`));
    state.currentTitle = data.title;
    state.chapters = data.chapters || [];
    state.videos = data.videos || [];
    state.currentChapter = null;
    state.progress = normalizeProgress(data.progress || state.progress);
    state.loadingTitleId = null;

    renderAll();
  } catch (error) {
    state.loadingTitleId = null;
    showStatus(error.message, true);
    renderAll();
  }
}

async function selectChapter(chapterId) {
  if (!state.currentTitle || state.currentTitle.type !== 'series') return;

  const chapter = state.chapters.find((item) => item.id === chapterId);
  if (!chapter) return;

  state.view = 'library';
  state.currentChapter = chapter;
  state.videos = [];
  state.loadingChapterId = chapterId;
  renderAll();

  try {
    const data = await fetchJson(
      withProfile(`/api/titles/${encodeURIComponent(state.currentTitle.id)}/chapters/${encodeURIComponent(chapterId)}/videos`)
    );
    state.currentTitle = data.title;
    state.currentChapter = data.chapter;
    state.videos = data.videos || [];
    state.progress = normalizeProgress(data.progress || state.progress);
    state.loadingChapterId = null;

    renderAll();
  } catch (error) {
    state.loadingChapterId = null;
    showStatus(error.message, true);
    renderAll();
  }
}

function activatePlaybackContext(title, chapter, videos, chapters) {
  state.currentTitle = title;
  state.currentChapter = chapter || null;
  state.chapters = chapters || [];
  state.videos = videos || [];
  state.view = 'library';
}

async function openVideo(video, shouldResume = true) {
  if (!state.currentTitle || !video) return;

  const title = state.currentTitle;
  const chapter = title.type === 'series' ? state.currentChapter : null;
  const videos = [...state.videos];
  const chapters = [...state.chapters];
  const savedProgress = getVideoProgress(video.id) || video.progress;

  state.currentVideo = video;
  state.playingTitle = title;
  state.playingChapter = chapter;
  state.playingVideos = videos;
  state.playingChapters = chapters;
  state.lastSaveAt = 0;

  nowPlaying.textContent = video.displayTitle;
  playbackMeta.textContent = shouldResume && savedProgress?.duration
    ? `Saved at ${formatTime(savedProgress.time)} of ${formatTime(savedProgress.duration)}`
    : '';

  videoPlayer.src = `/media/${encodeURIComponent(video.id)}`;
  videoPlayer.load();

  videoPlayer.addEventListener('loadedmetadata', () => {
    const savedTime = Number(savedProgress?.time) || 0;
    const duration = Number(videoPlayer.duration) || Number(savedProgress?.duration) || 0;
    let startTime = 0;
    if (shouldResume && savedTime > 3 && (!duration || savedTime < duration - 5) && !savedProgress?.finished) {
      videoPlayer.currentTime = savedTime;
      startTime = savedTime;
    }
    saveProgress(true, false, startTime, duration);
  }, { once: true });

  renderAll();

  try {
    await videoPlayer.play();
  } catch (_) {
    // Browser autoplay rules can block play on some devices. The user can press play manually.
  }
}

async function saveProgress(force = false, finished = false, overrideTime = null, overrideDuration = null) {
  const title = state.playingTitle || state.currentTitle;
  const chapter = state.playingChapter || null;
  const video = state.currentVideo;
  if (!state.currentProfile || !title || !video) return;

  const now = Date.now();
  if (!force && now - state.lastSaveAt < 5000) return;
  state.lastSaveAt = now;

  const time = overrideTime ?? videoPlayer.currentTime ?? 0;
  const duration = overrideDuration ?? videoPlayer.duration ?? 0;

  try {
    const data = await fetchJson('/api/progress', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        titleId: title.id,
        chapterId: chapter?.id || null,
        videoId: video.id,
        profileId: state.currentProfile.id,
        time,
        duration: Number.isFinite(duration) ? duration : 0,
        finished
      })
    });

    const savedProgress = normalizeProgress(data.progress || state.progress);
    state.progress = savedProgress;

    const updated = savedProgress?.videos?.[video.id] || null;
    const resume = savedProgress?.last || null;
    video.progress = updated;

    const visibleIndex = state.videos.findIndex((item) => item.id === video.id);
    if (visibleIndex >= 0) state.videos[visibleIndex].progress = updated;

    const playingIndex = state.playingVideos.findIndex((item) => item.id === video.id);
    if (playingIndex >= 0) state.playingVideos[playingIndex].progress = updated;

    if (!updateContinueItemFromPlayback(resume, updated, title, chapter, video)) {
      await refreshContinueWatching();
    }
    renderAll();
  } catch (error) {
    console.warn('Could not save progress:', error.message);
  }
}

function saveProgressWithBeacon() {
  if (!state.currentProfile || !state.playingTitle || !state.currentVideo || !navigator.sendBeacon) return;
  const duration = Number.isFinite(videoPlayer.duration) ? videoPlayer.duration : 0;
  const payload = JSON.stringify({
    titleId: state.playingTitle.id,
    chapterId: state.playingChapter?.id || null,
    videoId: state.currentVideo.id,
    profileId: state.currentProfile.id,
    time: videoPlayer.currentTime || 0,
    duration,
    finished: false
  });
  const blob = new Blob([payload], { type: 'application/json' });
  navigator.sendBeacon('/api/progress', blob);
}

async function playPreviousVideo() {
  if (!state.playingTitle || !state.currentVideo) return false;

  const currentVideoIndex = getCurrentPlaybackVideoIndex();

  if (currentVideoIndex > 0) {
    activatePlaybackContext(
      state.playingTitle,
      state.playingChapter,
      state.playingVideos,
      state.playingChapters
    );
    await openVideo(state.playingVideos[currentVideoIndex - 1], false);
    return true;
  }

  if (state.playingTitle.type !== 'series' || !state.playingChapter) return false;

  const currentChapterId = state.playingChapter.id;
  const currentChapterIndex = state.playingChapters.findIndex((chapter) => chapter.id === currentChapterId);
  if (currentChapterIndex < 0) return false;

  activatePlaybackContext(state.playingTitle, state.playingChapter, state.playingVideos, state.playingChapters);

  for (const previousChapter of state.playingChapters.slice(0, currentChapterIndex).reverse()) {
    await selectChapter(previousChapter.id);
    if (state.videos.length > 0) {
      await openVideo(state.videos[state.videos.length - 1], false);
      return true;
    }
  }

  return false;
}

async function playNextVideo() {
  if (!state.playingTitle || !state.currentVideo) return false;

  const currentVideoId = state.currentVideo.id;
  const currentVideoIndex = state.playingVideos.findIndex((video) => video.id === currentVideoId);

  if (currentVideoIndex >= 0 && currentVideoIndex < state.playingVideos.length - 1) {
    activatePlaybackContext(
      state.playingTitle,
      state.playingChapter,
      state.playingVideos,
      state.playingChapters
    );
    await openVideo(state.playingVideos[currentVideoIndex + 1], false);
    return true;
  }

  if (state.playingTitle.type !== 'series' || !state.playingChapter) return false;

  const currentChapterId = state.playingChapter.id;
  const currentChapterIndex = state.playingChapters.findIndex((chapter) => chapter.id === currentChapterId);
  if (currentChapterIndex < 0) return false;

  activatePlaybackContext(state.playingTitle, state.playingChapter, state.playingVideos, state.playingChapters);

  for (const nextChapter of state.playingChapters.slice(currentChapterIndex + 1)) {
    await selectChapter(nextChapter.id);
    if (state.videos.length > 0) {
      await openVideo(state.videos[0], false);
      return true;
    }
  }

  return false;
}

async function playAdjacentVideo(direction) {
  if (!state.currentVideo) return;
  await saveProgress(true, false);
  const didStartVideo = direction < 0 ? await playPreviousVideo() : await playNextVideo();
  if (!didStartVideo) {
    playbackMeta.textContent = direction < 0 ? 'No previous video found.' : 'No next video found.';
    renderPlayerControls();
  }
}

async function togglePlayPause() {
  if (!state.currentVideo) return;

  if (videoPlayer.paused || videoPlayer.ended) {
    try {
      await videoPlayer.play();
    } catch (_) {
      // Browser playback rules can still require using the native player controls.
    }
  } else {
    videoPlayer.pause();
  }

  renderPlayerControls();
}

async function handleVideoEnded() {
  await saveProgress(true, true);
  const didStartNextVideo = await playNextVideo();
  if (!didStartNextVideo) {
    playbackMeta.textContent = 'Finished. No next video found.';
    renderPlayerControls();
  }
}

async function resumeTitle(titleId) {
  const title = state.titles.find((item) => item.id === titleId);
  if (!title) return;

  if (!state.currentTitle || state.currentTitle.id !== titleId) {
    await selectTitle(titleId);
  } else if (state.currentTitle.type === 'series' && !state.chapters.length) {
    await selectTitle(titleId);
  } else if (state.currentTitle.type === 'movie' && !state.videos.length) {
    await selectTitle(titleId);
  }

  let resume = getTitleResume(titleId);
  if (!isUsefulResume(resume)) {
    showStatus('No saved progress for this title yet.');
    renderAll();
    return;
  }

  if (state.currentTitle.type === 'series') {
    if (!resume.chapterId) {
      showStatus('The saved chapter for this title could not be found.', true);
      return;
    }

    if (state.currentChapter?.id !== resume.chapterId || !state.videos.length) {
      await selectChapter(resume.chapterId);
    }
  }

  resume = getTitleResume(titleId);
  const video = state.videos.find((item) => item.id === resume?.videoId);
  if (!video) {
    showStatus('The saved video could not be found. Refresh the library if files were moved.', true);
    renderAll();
    return;
  }

  showStatus('');
  await openVideo(video, true);
}

async function resumeContinueWatching(item = state.continueItem) {
  const resume = item?.resume;
  if (!resume?.titleId) return;

  if (item.title?.id === resume.titleId && item.video?.id === resume.videoId) {
    const existingChapters = state.currentTitle?.id === item.title.id ? state.chapters : [];
    const existingVideos = state.currentChapter?.id === item.chapter?.id || item.title.type === 'movie'
      ? state.videos
      : [];
    const videos = existingVideos.some((video) => video.id === item.video.id) ? existingVideos : [item.video];
    const chapters = existingChapters.length ? existingChapters : (item.chapter ? [item.chapter] : []);

    activatePlaybackContext(item.title, item.chapter || null, videos, chapters);
    showStatus('');
    await openVideo(item.video, true);
    hydratePlaybackContextForContinue(item);
    return;
  }

  await resumeTitle(resume.titleId);
}

async function hydratePlaybackContextForContinue(item) {
  const videoId = item?.video?.id;
  const titleId = item?.title?.id;
  if (!videoId || !titleId || state.playingVideos.length > 1 || state.playingChapters.length > 1) return;

  try {
    await selectTitle(titleId);
    if (!state.currentVideo || state.currentVideo.id !== videoId) return;

    if (state.currentTitle?.type === 'series' && item.chapter?.id) {
      await selectChapter(item.chapter.id);
      if (!state.currentVideo || state.currentVideo.id !== videoId) return;
    }

    const queuedVideo = state.videos.find((video) => video.id === videoId) || state.currentVideo;
    state.currentVideo = queuedVideo;
    state.playingTitle = state.currentTitle;
    state.playingChapter = state.currentTitle?.type === 'series' ? state.currentChapter : null;
    state.playingVideos = state.videos.length ? [...state.videos] : [queuedVideo];
    state.playingChapters = [...state.chapters];
    renderAll();
  } catch (error) {
    console.warn('Could not load adjacent videos:', error.message);
    renderPlayerControls();
  }
}

function goBack() {
  if (state.view === 'chapter') {
    state.view = 'title';
    state.videos = [];
    renderAll();
    return;
  }

  if (state.view === 'title') {
    resetToLibrary();
  }
}

browserList.addEventListener('click', (event) => {
  const titleButton = event.target.closest('[data-title-id]');
  if (titleButton) {
    selectTitle(titleButton.dataset.titleId);
    return;
  }

  const chapterButton = event.target.closest('[data-chapter-id]');
  if (chapterButton) {
  // Toggle: if already open, close it
  if (state.currentChapter && state.currentChapter.id === chapterButton.dataset.chapterId) {
    state.currentChapter = null;
    state.videos = [];
    renderAll();
    return;
  }
  selectChapter(chapterButton.dataset.chapterId);
  return;
}

  const videoButton = event.target.closest('[data-video-id]');
  if (videoButton) {
    const video = state.videos.find((item) => item.id === videoButton.dataset.videoId);
    openVideo(video, true);
  }
});

sidebarList.addEventListener('click', (event) => {
  const videoButton = event.target.closest('[data-video-id]');
  if (videoButton) {
    const video = state.videos.find((item) => item.id === videoButton.dataset.videoId);
    openVideo(video, true);
    return;
  }

  const chapterButton = event.target.closest('[data-chapter-id]');
  if (chapterButton) {
  // Toggle: if already open, close it
  if (state.currentChapter && state.currentChapter.id === chapterButton.dataset.chapterId) {
    state.currentChapter = null;
    state.videos = [];
    renderAll();
    return;
  }
  selectChapter(chapterButton.dataset.chapterId);
  return;
}

  const titleButton = event.target.closest('[data-title-id]');
  if (!titleButton) return;
  // Toggle: if already open, close it
  if (state.currentTitle && state.currentTitle.id === titleButton.dataset.titleId) {
    state.currentTitle = null;
    state.currentChapter = null;
    state.chapters = [];
    state.videos = [];
    renderAll();
    return;
  }
  selectTitle(titleButton.dataset.titleId);
});

continueWatching.addEventListener('click', async (event) => {
  const continueButton = event.target.closest('[data-continue-watch]');
  const titleId = continueButton?.dataset.continueTitleId;
  const item = state.continueItems.find((entry) => entry.resume?.titleId === titleId) || state.continueItem;
  if (!continueButton || !item?.resume?.titleId) return;
  continueButton.disabled = true;
  unloadContinueThumbnail();
  showStatus('Opening saved video...');
  try {
    await resumeContinueWatching(item);
  } catch (error) {
    showStatus(error.message || 'Could not open saved video.', true);
  } finally {
    if (!state.currentVideo && continueButton.isConnected) {
      continueButton.disabled = false;
    }
  }
});

profileList.addEventListener('click', (event) => {
  const profileChoice = event.target.closest('[data-profile-id]');
  if (!profileChoice) return;
  selectProfile(profileChoice.dataset.profileId);
});

profileForm.addEventListener('submit', (event) => {
  event.preventDefault();
  createProfileFromName(profileNameInput.value);
});

profileButton.addEventListener('click', async () => {
  await saveProgress(true, false);
  showProfileGate();
});

homeButton.addEventListener('click', () => {
  clearPlayback();           // stops video, clears player state
  state.view = 'library';
  state.currentTitle = null; // collapses any open title
  state.currentChapter = null;
  state.chapters = [];
  state.videos = [];
  state.loadingTitleId = null;
  state.loadingChapterId = null;
  state.sidebarOpen = false; // collapses the library sidebar
  renderAll();
});

libraryToggleButton.addEventListener('click', async () => {
  if (state.sidebarOpen) {
    state.sidebarOpen = false;
    renderSidebar();
    return;
  }

  await openLibraryFocusedOnPlayingEpisode();
});

backButton.addEventListener('click', goBack);

titleResumeButton.addEventListener('click', () => {
  if (!state.currentTitle) return;
  resumeTitle(state.currentTitle.id);
});

previousButton.addEventListener('click', () => playAdjacentVideo(-1));
playPauseButton.addEventListener('click', togglePlayPause);
nextButton.addEventListener('click', () => playAdjacentVideo(1));

refreshButton.addEventListener('click', loadLibrary);

videoPlayer.addEventListener('timeupdate', () => saveProgress(false, false));
videoPlayer.addEventListener('play', renderPlayerControls);
videoPlayer.addEventListener('pause', () => {
  saveProgress(true, false);
  renderPlayerControls();
});
videoPlayer.addEventListener('ended', handleVideoEnded);
window.addEventListener('beforeunload', saveProgressWithBeacon);

loadProfiles();
