const defaultDownloadDir = "%USERPROFILE%\\Desktop\\youtube videos";
const downloadDirStorageKey = "ytDlpDownloadDir";
const useBrowserCookiesStorageKey = "ytDlpUseBrowserCookies";
const recentTasksStorageKey = "ytDlpRecentTasks";

const urlInput = document.getElementById("url");
const urlHint = document.getElementById("urlHint");
const downloadDirInput = document.getElementById("downloadDir");
const qualityInput = document.getElementById("quality");
const useBrowserCookiesInput = document.getElementById("useBrowserCookies");
const statusText = document.getElementById("status");
const resolveButton = document.getElementById("resolve");
const downloadSelectedButton = document.getElementById("downloadSelected");
const refreshButton = document.getElementById("refresh");
const clearFinishedTasksButton = document.getElementById("clearFinishedTasks");
const retryFailedTasksButton = document.getElementById("retryFailedTasks");
const cancelActiveTasksButton = document.getElementById("cancelActiveTasks");
const tasksList = document.getElementById("tasksList");
const taskSummary = document.getElementById("taskSummary");
const taskOverview = document.getElementById("taskOverview");
const videoList = document.getElementById("videoList");
const resolveSummary = document.getElementById("resolveSummary");
const resolveChips = document.getElementById("resolveChips");
const selectAllInput = document.getElementById("selectAll");
const selectionMeta = document.getElementById("selectionMeta");
const versionText = document.getElementById("version");
const loginAccountButton = document.getElementById("loginAccount");
const logoutAccountButton = document.getElementById("logoutAccount");
const loadAccountButton = document.getElementById("loadAccount");
const accountStatus = document.getElementById("accountStatus");
const accountSummary = document.getElementById("accountSummary");
const recentList = document.getElementById("recentList");
const likedList = document.getElementById("likedList");
const playlistList = document.getElementById("playlistList");
const useCurrentPageButton = document.getElementById("useCurrentPage");
const clearUrlButton = document.getElementById("clearUrl");
const qualityPresets = [...document.querySelectorAll("[data-quality]")];
const views = {
  resolve: document.getElementById("resolveView"),
  tasks: document.getElementById("tasksView"),
  account: document.getElementById("accountView")
};
const tabs = [...document.querySelectorAll(".tab")];

function previewThumbnail(title, color = "#ff0033") {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="320" height="180" viewBox="0 0 320 180">
      <defs>
        <linearGradient id="bg" x1="0" x2="1" y1="0" y2="1">
          <stop stop-color="${color}" stop-opacity="0.95"/>
          <stop offset="1" stop-color="#111"/>
        </linearGradient>
      </defs>
      <rect width="320" height="180" rx="12" fill="url(#bg)"/>
      <rect x="24" y="24" width="168" height="14" rx="7" fill="rgba(255,255,255,0.20)"/>
      <rect x="24" y="48" width="250" height="10" rx="5" fill="rgba(255,255,255,0.13)"/>
      <circle cx="160" cy="94" r="34" fill="rgba(0,0,0,0.42)"/>
      <path d="M149 74l35 20-35 20z" fill="#fff"/>
      <text x="24" y="157" fill="rgba(255,255,255,0.88)" font-family="Arial, sans-serif" font-size="18" font-weight="700">${escapeHtml(title)}</text>
    </svg>
  `;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

const previewVideos = [
  {
    id: "dQw4w9WgXcQ",
    url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    title: "示例视频：准备下载",
    uploader: "示例频道",
    thumbnail: previewThumbnail("准备下载", "#ff0033"),
    duration: "3:33",
    index: 1
  },
  {
    id: "KpcaZCkYFv4",
    url: "https://www.youtube.com/watch?v=KpcaZCkYFv4",
    title: "合集视频：可选 1080p 画质",
    uploader: "示例频道",
    thumbnail: previewThumbnail("合集视频", "#065fd4"),
    duration: "8:14",
    index: 2
  }
];
const previewTasks = [
  {
    id: "demo-running",
    status: "running",
    percent: 64.3,
    quality: "1080",
    playlistMode: "single",
    speed: "5.2MiB/s",
    eta: "00:18",
    lastLine: "[download] 64.3% of 152.34MiB at 5.2MiB/s ETA 00:18"
  },
  {
    id: "demo-done",
    status: "done",
    percent: 100,
    quality: "audio",
    playlistMode: "single",
    speed: "",
    eta: "",
    lastLine: "[ExtractAudio] Destination: sample-track.mp3"
  }
];
const previewStalledTasks = [
  {
    id: "demo-stalled",
    status: "starting",
    percent: 0,
    quality: "1080",
    playlistMode: "single",
    speed: "",
    eta: "",
    lastLine: "",
    startedAt: new Date(Date.now() - 28000).toISOString(),
    updatedAt: new Date(Date.now() - 28000).toISOString()
  }
];
const previewAccount = {
  channel: {
    title: "fengjunda888",
    thumbnail: "icons/icon-48.png"
  },
  recentHistory: previewVideos.map(video => ({
    url: video.url,
    title: video.title,
    thumbnail: video.thumbnail,
    duration: video.duration,
    lastVisitTime: Date.now(),
    visitCount: 3
  })),
  likedVideos: previewVideos,
  playlists: [
    { id: "PLdemo", title: "收藏的教程合集", count: 18, thumbnail: previewThumbnail("教程合集", "#0f9d58") }
  ]
};

let pollTimer;
let resolvedVideos = [];
let previewMode = "";
let oauthConfigured = true;
let latestTasks = [];
const hiddenFinishedTaskIds = new Set();
let showingRecentTasks = false;

function setStatus(message, state = "") {
  statusText.textContent = message;
  statusText.dataset.state = state;
  statusText.setAttribute("aria-busy", String(state === "busy"));
}

function setButtonBusy(button, busy, label = "") {
  if (busy) {
    button.dataset.previousLabel = button.textContent;
  }
  button.classList.toggle("isBusy", busy);
  button.disabled = busy;
  button.setAttribute("aria-busy", String(busy));
  button.setAttribute("aria-disabled", String(busy));
  button.textContent = busy ? label : button.dataset.previousLabel || button.textContent;
  if (!busy) {
    delete button.dataset.previousLabel;
  }
}

function setView(name, options = {}) {
  for (const [viewName, element] of Object.entries(views)) {
    const active = viewName === name;
    element.classList.toggle("active", active);
    element.hidden = !active;
  }
  tabs.forEach(tab => {
    const active = tab.dataset.view === name;
    tab.classList.toggle("active", active);
    tab.setAttribute("aria-selected", String(active));
    tab.tabIndex = active ? 0 : -1;
  });
  if (name === "tasks" && !options.skipRefresh) {
    refreshTasks({ silent: true });
    startPolling();
  }
}

async function sendNative(payload) {
  const result = await chrome.runtime.sendMessage({
    type: "native-request",
    payload
  });

  if (!result?.ok) {
    throw new Error(result?.error || "Native host did not respond.");
  }
  if (result.response?.ok === false) {
    throw new Error(result.response.error || "Native host rejected the request.");
  }
  return result.response;
}

function sendNativeWithTimeout(payload, timeoutMs = 8000) {
  return Promise.race([
    sendNative(payload),
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error("Native host request timed out.")), timeoutMs);
    })
  ]);
}

async function sendAccount(payload) {
  let result;
  try {
    result = await chrome.runtime.sendMessage({
      type: "account-request",
      payload
    });
  } catch (error) {
    throw new Error(error.message || "Background service worker did not respond.");
  }

  if (!result?.ok) {
    throw new Error(result?.error || chrome.runtime.lastError?.message || "Account request failed.");
  }
  if (result.response?.ok === false) {
    throw new Error(result.response.error || "Account request was rejected.");
  }
  return result.response;
}

async function getActiveTabInfo() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return {
    url: tab?.url || "",
    title: tab?.title || ""
  };
}

function isYouTubeUrl(value) {
  try {
    const url = new URL(value);
    return ["youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be"].includes(url.hostname);
  } catch {
    return false;
  }
}

function getYouTubeVideoId(value) {
  try {
    const url = new URL(value);
    if (url.hostname === "youtu.be") {
      return url.pathname.split("/").filter(Boolean)[0] || "";
    }
    if (["youtube.com", "www.youtube.com", "m.youtube.com"].includes(url.hostname)) {
      return url.searchParams.get("v") || "";
    }
  } catch {
    return "";
  }
  return "";
}

function needsNativeResolve(value) {
  try {
    const url = new URL(value);
    return url.pathname.includes("/playlist") || !getYouTubeVideoId(value);
  } catch {
    return true;
  }
}

function cleanYouTubeTitle(title) {
  return String(title || "")
    .replace(/\s*-\s*YouTube$/i, "")
    .trim();
}

function quickVideoFromUrl(value, title = "") {
  const id = getYouTubeVideoId(value);
  if (!id) {
    return null;
  }
  return {
    id,
    url: `https://www.youtube.com/watch?v=${id}`,
    title: cleanYouTubeTitle(title) || "YouTube 视频",
    uploader: "YouTube",
    thumbnail: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
    duration: "",
    index: 1
  };
}

function syncUrlHint() {
  const value = urlInput.value.trim();
  const emptyResolveButton = videoList.querySelector('[data-empty-action="resolve"]');
  if (!value) {
    urlHint.textContent = "支持视频、合集和 youtu.be 短链接。";
    urlHint.dataset.state = "";
    urlInput.dataset.state = "";
    if (!resolveButton.classList.contains("isBusy")) {
      resolveButton.disabled = true;
      resolveButton.setAttribute("aria-disabled", "true");
    }
    if (emptyResolveButton) {
      emptyResolveButton.disabled = true;
      emptyResolveButton.setAttribute("aria-disabled", "true");
    }
    return;
  }

  const valid = isYouTubeUrl(value);
  urlHint.textContent = valid ? "可解析此 YouTube 链接。" : "仅支持 YouTube 视频、合集或 youtu.be 链接。";
  urlHint.dataset.state = valid ? "success" : "error";
  urlInput.dataset.state = valid ? "success" : "error";
  if (!resolveButton.classList.contains("isBusy")) {
    resolveButton.disabled = !valid;
    resolveButton.setAttribute("aria-disabled", String(!valid));
  }
  if (emptyResolveButton) {
    emptyResolveButton.disabled = !valid;
    emptyResolveButton.setAttribute("aria-disabled", String(!valid));
  }
}

function getDownloadDir() {
  return downloadDirInput.value.trim() || defaultDownloadDir;
}

function getUseBrowserCookies() {
  return useBrowserCookiesInput ? useBrowserCookiesInput.checked : false;
}

function syncQualityPreset(value) {
  qualityPresets.forEach(button => {
    const active = button.dataset.quality === value;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
}

async function resolveCurrentUrl() {
  const url = urlInput.value.trim();
  if (!isYouTubeUrl(url)) {
    setStatus("这不是 YouTube 链接。", "error");
    return;
  }

  localStorage.setItem(downloadDirStorageKey, getDownloadDir());
  setButtonBusy(resolveButton, true, "正在检测...");
  const activeTabInfo = previewMode ? { url: "", title: "" } : await getActiveTabInfo();
  const inputVideoId = getYouTubeVideoId(url);
  const activeVideoId = getYouTubeVideoId(activeTabInfo.url);
  const quickTitle = inputVideoId && inputVideoId === activeVideoId ? activeTabInfo.title : "";
  const quickVideo = needsNativeResolve(url) ? null : quickVideoFromUrl(url, quickTitle);
  if (quickVideo) {
    resolvedVideos = [quickVideo];
    renderVideos(resolvedVideos);
    setStatus("已识别 1 个视频，可直接添加。", "success");
    setButtonBusy(resolveButton, false);
    return;
  }

  try {
    setStatus("正在检测视频信息...", "busy");
    renderResolvingState();
    const response = await sendNative({ action: "resolve", url, useBrowserCookies: getUseBrowserCookies() });
    resolvedVideos = response.videos || [];
    renderVideos(resolvedVideos);
    setStatus(resolvedVideos.length ? `已找到 ${resolvedVideos.length} 个视频。` : "没有找到可用视频，请检查链接或稍后重试。", resolvedVideos.length ? "success" : "error");
  } catch (error) {
    resolvedVideos = [];
    renderVideos([]);
    setStatus(`检测失败：${friendlyError(error)}`, "error");
  } finally {
    setButtonBusy(resolveButton, false);
  }
}

async function downloadSelectedVideos() {
  const selected = getSelectedVideos();
  const downloadDir = getDownloadDir();
  if (!selected.length) {
    setStatus("请先选择要下载的视频。", "error");
    return;
  }

  localStorage.setItem(downloadDirStorageKey, downloadDir);
  setButtonBusy(downloadSelectedButton, true, `正在添加（${selected.length}）...`);
  setStatus(`正在添加 ${selected.length} 个下载任务...`, "busy");
  setView("tasks", { skipRefresh: true });
  startPolling();
  renderQueueingState(selected.length);

  const results = await Promise.allSettled(
    selected.map(video =>
      sendNativeWithTimeout({
        action: "start",
        url: video.url,
        downloadDir,
        quality: qualityInput.value,
        playlistMode: "single",
        useBrowserCookies: getUseBrowserCookies()
      }, 7000)
    )
  );

  const successCount = results.filter(result => result.status === "fulfilled").length;
  const failed = results.find(result => result.status === "rejected");
  const lastError = failed ? friendlyError(failed.reason) : "";

  if (lastError && !successCount) {
    setStatus(`下载任务未添加：${lastError}`, "error");
  } else if (lastError) {
    setStatus(`已添加 ${successCount} 个任务，部分未添加：${lastError}`, "error");
  } else {
    setStatus(`已添加 ${successCount} 个下载任务。`, "success");
  }
  setButtonBusy(downloadSelectedButton, false);
  updateSelectionState();
  await refreshTasks({ silent: true });
}

function renderQueueingState(count) {
  taskSummary.innerHTML = `
    <span>${count} 个任务</span>
    <span>正在加入队列</span>
  `;
  taskOverview.hidden = false;
  taskOverview.innerHTML = `
    <div class="overviewHead">
      <strong>正在加入下载队列</strong>
      <span>请稍等</span>
    </div>
    <div class="bar indeterminate" role="progressbar" aria-label="正在加入下载队列"><span></span></div>
    <div class="overviewMeta">
      <span>已发送 ${count} 个下载请求</span>
      <span>正在等待本地组件确认</span>
    </div>
  `;
  tasksList.innerHTML = `
    <div class="loadingState" role="status" aria-live="polite">
      <span class="loadingIcon" aria-hidden="true"></span>
      <div>
        <strong>正在启动下载</strong>
        <span>任务会在确认后显示进度。</span>
        <span class="loadingBar" aria-hidden="true"><span></span></span>
      </div>
    </div>
  `;
}


async function refreshTasks({ silent = false } = {}) {
  if (!silent) {
    setButtonBusy(refreshButton, true, "刷新中...");
  }

  if (previewMode) {
    renderTasks(previewMode === "tasks" ? previewTasks : []);
    if (!silent) {
      setButtonBusy(refreshButton, false);
    }
    return;
  }

  try {
    const response = await sendNative({ action: "list" });
    renderTasks(response.tasks || []);
  } catch (error) {
    const recentTasks = loadRecentTasks();
    if (recentTasks.length) {
      renderTasks(recentTasks, {
        recent: true,
        notice: `下载助手未连接，下面是最近任务：${friendlyError(error)}`
      });
    } else {
      tasksList.innerHTML = emptyState("下载助手未连接", friendlyError(error), "error", {
        label: "重试",
        action: "refresh-tasks"
      });
      bindEmptyActions(tasksList);
    }
  } finally {
    if (!silent) {
      setButtonBusy(refreshButton, false);
    }
  }
}

async function cancelTask(id, button = null) {
  if (button) {
    setButtonBusy(button, true, "取消中...");
  }
  try {
    await sendNative({ action: "cancel", id });
    await refreshTasks();
  } catch (error) {
    setStatus(`取消失败：${friendlyError(error)}`, "error");
    if (button) {
      setButtonBusy(button, false);
    }
  }
}

function taskId(task) {
  return String(task.Id || task.id || "");
}

function taskStatus(task) {
  return task.Status || task.status || "unknown";
}

function isActiveTask(task) {
  return ["running", "starting"].includes(taskStatus(task));
}

function isFinishedTask(task) {
  return ["done", "canceled"].includes(taskStatus(task));
}

function isFailedTask(task) {
  return taskStatus(task) === "error";
}

function taskUrl(task) {
  return task.Url || task.url || "";
}

function taskDownloadDir(task) {
  return task.DownloadDir || task.downloadDir || getDownloadDir();
}

function taskQuality(task) {
  return task.Quality || task.quality || qualityInput.value || "best-mp4";
}

function taskPlaylistMode(task) {
  return task.PlaylistMode || task.playlistMode || "single";
}

function visibleTasksForRender(tasks) {
  return tasks.filter(task => !hiddenFinishedTaskIds.has(taskId(task)));
}

function rememberRecentTasks(tasks) {
  if (previewMode || !tasks.length) {
    return;
  }
  const recent = tasks.slice(0, 30).map(task => ({
    id: taskId(task),
    url: taskUrl(task),
    downloadDir: taskDownloadDir(task),
    quality: taskQuality(task),
    playlistMode: taskPlaylistMode(task),
    status: taskStatus(task),
    percent: Math.max(0, Math.min(100, Number(task.Percent || task.percent || 0))),
    speed: task.Speed || task.speed || "",
    eta: task.Eta || task.eta || "",
    lastLine: task.LastLine || task.lastLine || task.Message || task.message || "",
    updatedAt: task.UpdatedAt || task.updatedAt || new Date().toISOString()
  }));
  localStorage.setItem(recentTasksStorageKey, JSON.stringify(recent));
}

function loadRecentTasks() {
  try {
    const parsed = JSON.parse(localStorage.getItem(recentTasksStorageKey) || "[]");
    return Array.isArray(parsed) ? parsed.filter(task => task?.id || task?.url).slice(0, 30) : [];
  } catch {
    return [];
  }
}

function syncTaskBulkActions(tasks = latestTasks) {
  const finishedCount = tasks.filter(task => isFinishedTask(task) && !hiddenFinishedTaskIds.has(taskId(task))).length;
  const failedCount = tasks.filter(isFailedTask).length;
  const activeCount = tasks.filter(isActiveTask).length;

  clearFinishedTasksButton.disabled = finishedCount === 0;
  retryFailedTasksButton.disabled = failedCount === 0;
  cancelActiveTasksButton.disabled = activeCount === 0;

  clearFinishedTasksButton.textContent = finishedCount ? `清空已完成（${finishedCount}）` : "清空已完成";
  retryFailedTasksButton.textContent = failedCount ? `重试失败（${failedCount}）` : "重试失败";
  cancelActiveTasksButton.textContent = activeCount ? `全部取消（${activeCount}）` : "全部取消";
}

function clearFinishedTasks() {
  latestTasks.filter(isFinishedTask).forEach(task => {
    const id = taskId(task);
    if (id) {
      hiddenFinishedTaskIds.add(id);
    }
  });
  renderTasks(latestTasks);
  setStatus("已隐藏完成和取消的任务。", "success");
}

async function retryFailedTasks() {
  const failedTasks = latestTasks.filter(task => isFailedTask(task) && taskUrl(task));
  if (!failedTasks.length) {
    setStatus("没有可重试的失败任务。", "error");
    return;
  }

  setButtonBusy(retryFailedTasksButton, true, `重试中（${failedTasks.length}）...`);
  try {
    const results = await Promise.allSettled(failedTasks.map(task =>
      sendNativeWithTimeout({
        action: "start",
        url: taskUrl(task),
        downloadDir: taskDownloadDir(task),
        quality: taskQuality(task),
        playlistMode: taskPlaylistMode(task),
        useBrowserCookies: getUseBrowserCookies()
      }, 7000)
    ));
    const successCount = results.filter(result => result.status === "fulfilled").length;
    const failed = results.find(result => result.status === "rejected");
    if (failed && !successCount) {
      setStatus(`重试未添加：${friendlyError(failed.reason)}`, "error");
    } else if (failed) {
      setStatus(`已重试 ${successCount} 个任务，部分未添加：${friendlyError(failed.reason)}`, "error");
    } else {
      setStatus(`已重新添加 ${successCount} 个失败任务。`, "success");
    }
    await refreshTasks({ silent: true });
  } finally {
    setButtonBusy(retryFailedTasksButton, false);
    syncTaskBulkActions();
  }
}

async function cancelActiveTasks() {
  const activeTasks = latestTasks.filter(isActiveTask);
  if (!activeTasks.length) {
    setStatus("没有正在进行的任务。", "error");
    return;
  }
  if (!window.confirm(`确定取消 ${activeTasks.length} 个正在进行的下载任务吗？`)) {
    return;
  }

  setButtonBusy(cancelActiveTasksButton, true, `取消中（${activeTasks.length}）...`);
  try {
    const results = await Promise.allSettled(activeTasks.map(task => sendNative({ action: "cancel", id: taskId(task) })));
    const successCount = results.filter(result => result.status === "fulfilled").length;
    const failed = results.find(result => result.status === "rejected");
    if (failed) {
      setStatus(`已取消 ${successCount} 个任务，部分失败：${friendlyError(failed.reason)}`, "error");
    } else {
      setStatus(`已取消 ${successCount} 个任务。`, "success");
    }
    await refreshTasks({ silent: true });
  } finally {
    setButtonBusy(cancelActiveTasksButton, false);
    syncTaskBulkActions();
  }
}

async function copyTaskUrl(url, button) {
  if (!url) {
    setStatus("这个任务没有可复制的链接。", "error");
    return;
  }
  try {
    await navigator.clipboard.writeText(url);
    setStatus("已复制任务链接。", "success");
    if (button) {
      const previous = button.textContent;
      button.textContent = "已复制";
      setTimeout(() => {
        button.textContent = previous;
      }, 1200);
    }
  } catch {
    setStatus(url, "success");
  }
}

function startPolling() {
  if (pollTimer) {
    clearInterval(pollTimer);
  }
  pollTimer = setInterval(() => refreshTasks({ silent: true }), 1500);
}

async function loadAccountData() {
  if (!oauthConfigured && !previewMode) {
    accountStatus.textContent = "账号功能未启用：发布者配置 Google OAuth Client ID 后即可读取收藏和播放列表。下载功能不受影响。";
    renderAccount({});
    return;
  }

  setButtonBusy(loginAccountButton, true, "连接中...");
  setButtonBusy(loadAccountButton, true, "刷新中...");
  accountStatus.setAttribute("aria-busy", "true");
  accountStatus.textContent = "正在读取 YouTube 账号数据...";

  try {
    const data = previewMode ? previewAccount : await sendAccount({ action: "load" });
    renderAccount(data);
    accountStatus.textContent = "账号数据已读取。";
  } catch (error) {
    accountStatus.textContent = `读取失败：${friendlyError(error)}`;
    renderAccount({});
  } finally {
    accountStatus.setAttribute("aria-busy", "false");
    setButtonBusy(loginAccountButton, false);
    setButtonBusy(loadAccountButton, false);
  }
}

async function logoutAccount() {
  try {
    if (!previewMode) {
      await sendAccount({ action: "logout" });
    }
    accountStatus.textContent = "已退出授权。";
    renderAccount({});
  } catch (error) {
    accountStatus.textContent = `退出失败：${friendlyError(error)}`;
  }
}

function renderVideos(videos) {
  videoList.closest(".selection")?.classList.toggle("isEmpty", !videos.length);
  selectAllInput.checked = false;
  selectAllInput.indeterminate = false;
  if (!videos.length) {
    resolveSummary.textContent = "等待检测视频。";
    resolveChips.innerHTML = "";
    selectionMeta.textContent = "未选择视频";
    videoList.innerHTML = emptyState("等待检测", "输入 YouTube 链接后检测可下载视频。", "", {
      label: "检测视频",
      action: "resolve"
    });
    bindEmptyActions(videoList);
    updateSelectionState();
    return;
  }

  resolveSummary.textContent = `已找到 ${videos.length} 个视频，可多选添加。`;
  resolveChips.innerHTML = `
    <span>${videos.length} 个视频</span>
    <span>${escapeHtml(qualityText(qualityInput.value))}</span>
    <span>路径已设置</span>
  `;
  videoList.innerHTML = videos.map((video, index) => `
    <label class="videoItem checked">
      <input type="checkbox" data-video-index="${index}" aria-label="选择 ${escapeHtml(video.title || `第 ${index + 1} 个视频`)}" checked>
      ${videoThumbHtml(video, "video")}
      <span class="videoBody">
        <span class="videoTitleRow">
          <strong>${escapeHtml(video.index ? `${video.index}. ${video.title}` : video.title)}</strong>
          <span class="videoQualityBadge">${escapeHtml(qualityShortText(qualityInput.value))}</span>
        </span>
        <span class="videoMetaRow">
          <span class="metaChip">${escapeHtml(video.uploader || "YouTube")}</span>
          <span class="metaChip subtle">${escapeHtml(video.index ? `第 ${video.index} 项` : "单个视频")}</span>
        </span>
        <span class="urlLine">${escapeHtml(shortUrl(video.url))}</span>
      </span>
    </label>
  `).join("");

  videoList.querySelectorAll("input[type='checkbox']").forEach(input => {
    input.addEventListener("change", updateSelectionState);
  });
  updateSelectionState();
}

function renderResolvingState() {
  videoList.closest(".selection")?.classList.add("isEmpty");
  selectAllInput.checked = false;
  selectAllInput.indeterminate = false;
  resolveSummary.textContent = "正在检测链接。";
  resolveChips.innerHTML = "";
  selectionMeta.textContent = "未选择视频";
  videoList.innerHTML = `
    <div class="loadingState" role="status" aria-live="polite" aria-label="正在检测链接">
      <span class="loadingIcon" aria-hidden="true"></span>
      <div>
        <strong>正在检测</strong>
        <span>正在读取视频和合集信息。</span>
        <span class="loadingBar" aria-hidden="true"><span></span></span>
      </div>
    </div>
  `;
  updateSelectionState();
}

function renderTasks(tasks, options = {}) {
  showingRecentTasks = Boolean(options.recent);
  latestTasks = tasks;
  if (!showingRecentTasks) {
    rememberRecentTasks(tasks);
  }
  hiddenFinishedTaskIds.forEach(id => {
    if (!tasks.some(task => taskId(task) === id)) {
      hiddenFinishedTaskIds.delete(id);
    }
  });
  syncTaskBulkActions(tasks);
  const visibleTasks = visibleTasksForRender(tasks);

  if (!tasks.length) {
    taskSummary.innerHTML = "";
    taskOverview.hidden = true;
    taskOverview.innerHTML = "";
    tasksList.innerHTML = emptyState("暂无下载任务", "添加视频后，下载进度会显示在这里。", "", {
      label: "去检测视频",
      action: "resolve-view"
    });
    bindEmptyActions(tasksList);
    return;
  }

  if (!visibleTasks.length) {
    taskSummary.innerHTML = `
      <span>${tasks.length} 个任务</span>
      <span>已隐藏完成任务</span>
    `;
    taskOverview.hidden = true;
    taskOverview.innerHTML = "";
    tasksList.innerHTML = emptyState("已清空当前列表", "已完成和已取消的任务已隐藏；刷新后仍可从本地组件读取最新状态。", "", {
      label: "刷新任务",
      action: "refresh-tasks"
    });
    bindEmptyActions(tasksList);
    return;
  }

  const runningCount = visibleTasks.filter(isActiveTask).length;
  const doneCount = visibleTasks.filter(task => taskStatus(task) === "done").length;
  const errorCount = visibleTasks.filter(isFailedTask).length;
  const averageProgress = visibleTasks.reduce((sum, task) => sum + Math.max(0, Math.min(100, Number(task.Percent || task.percent || 0))), 0) / visibleTasks.length;
  const latestTask = visibleTasks.find(isActiveTask) || visibleTasks[0];
  const latestLine = latestTask?.LastLine || latestTask?.lastLine || latestTask?.Message || latestTask?.message || "等待新的下载任务。";
  const latestSpeed = latestTask?.Speed || latestTask?.speed || "";
  const latestEta = latestTask?.Eta || latestTask?.eta || "";
  const stalledCount = visibleTasks.filter(isTaskStalled).length;
  taskSummary.innerHTML = `
    <span>${visibleTasks.length} 个任务</span>
    <span>${runningCount} 个进行中</span>
    <span>${doneCount} 个已完成</span>
    ${errorCount ? `<span>${errorCount} 个失败</span>` : ""}
    ${stalledCount ? `<span>${stalledCount} 个等待较久</span>` : ""}
  `;
  taskOverview.hidden = false;
  taskOverview.innerHTML = `
    <div class="overviewHead">
      <strong>${showingRecentTasks ? "最近任务" : "下载概览"}</strong>
      <span>总进度 ${averageProgress.toFixed(averageProgress ? 1 : 0)}%</span>
    </div>
    <div class="bar" role="progressbar" aria-label="总进度" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${averageProgress.toFixed(1)}"><span style="width:${averageProgress}%"></span></div>
    <div class="overviewMeta">
      <span>${runningCount ? `当前 ${runningCount} 个任务处理中` : "当前没有进行中的任务"}</span>
      <span>${latestSpeed ? `速度 ${escapeHtml(latestSpeed)}` : "等待速度信息"}</span>
      <span>${latestEta ? `剩余 ${escapeHtml(latestEta)}` : "等待剩余时间"}</span>
    </div>
    <p class="fieldHint">${escapeHtml(options.notice || (stalledCount ? "如果长时间没有速度，通常是 yt-dlp、网络或代理正在等待 YouTube 响应。" : latestLine))}</p>
  `;

  tasksList.innerHTML = visibleTasks.map(task => {
    const percent = Math.max(0, Math.min(100, Number(task.Percent || task.percent || 0)));
    const status = task.Status || task.status || "unknown";
    const id = task.Id || task.id;
    const line = task.LastLine || task.lastLine || task.Message || task.message || "";
    const displayLine = status === "error" ? friendlyError(line) : line;
    const eta = task.Eta || task.eta || "";
    const speed = task.Speed || task.speed || "";
    const quality = task.Quality || task.quality || "";
    const canCancel = !showingRecentTasks && (status === "running" || status === "starting");
    const url = taskUrl(task);
    const stalled = isTaskStalled(task);
    const phase = taskPhaseText(status, percent, stalled);
    const taskTitle = `${statusTextFor(status)}，进度 ${percent.toFixed(percent ? 1 : 0)}%`;

    return `
      <article class="task task-${escapeHtml(status)}" role="listitem" aria-label="${escapeHtml(taskTitle)}">
        <div class="taskTop">
          <strong><span class="statusPill ${escapeHtml(status)}">${escapeHtml(statusTextFor(status))}</span></strong>
          <span class="taskPercent">${percent.toFixed(percent ? 1 : 0)}%</span>
        </div>
        <div class="taskPhase">
          <span>${escapeHtml(phase)}</span>
          <span>${escapeHtml(progressText(status, percent))}</span>
        </div>
        <div class="bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${percent.toFixed(1)}"><span style="width:${percent}%"></span></div>
        <div class="taskMetaRow">
          <span class="metaChip">${escapeHtml(qualityText(quality))}</span>
          ${speed ? `<span class="metaChip subtle">${escapeHtml(speed)}</span>` : ""}
          ${eta ? `<span class="metaChip subtle">ETA ${escapeHtml(eta)}</span>` : ""}
        </div>
        <div class="line">${escapeHtml(stalled ? "启动等待较久：请检查网络、代理、yt-dlp 是否可访问 YouTube。" : displayLine)}</div>
        <div class="taskActions">
          ${url ? `<button class="ghost small" data-copy-task-url="${escapeHtml(url)}">复制链接</button>` : ""}
          ${!showingRecentTasks && isFailedTask(task) && url ? `<button class="ghost small" data-retry-task="${escapeHtml(id)}">重试</button>` : ""}
          ${canCancel ? `<button class="ghost small" data-cancel="${escapeHtml(id)}">取消</button>` : ""}
        </div>
      </article>
    `;
  }).join("");

  tasksList.querySelectorAll("[data-copy-task-url]").forEach(button => {
    button.addEventListener("click", () => copyTaskUrl(button.dataset.copyTaskUrl, button));
  });
  tasksList.querySelectorAll("[data-retry-task]").forEach(button => {
    button.addEventListener("click", () => retrySingleTask(button.dataset.retryTask, button));
  });
  tasksList.querySelectorAll("[data-cancel]").forEach(button => {
    button.addEventListener("click", () => cancelTask(button.dataset.cancel, button));
  });
}

async function retrySingleTask(id, button = null) {
  const task = latestTasks.find(item => taskId(item) === String(id));
  if (!task || !taskUrl(task)) {
    setStatus("没有找到可重试的任务链接。", "error");
    return;
  }
  if (button) {
    setButtonBusy(button, true, "重试中...");
  }
  try {
    await sendNativeWithTimeout({
      action: "start",
      url: taskUrl(task),
      downloadDir: taskDownloadDir(task),
      quality: taskQuality(task),
      playlistMode: taskPlaylistMode(task),
      useBrowserCookies: getUseBrowserCookies()
    }, 7000);
    setStatus("已重新添加失败任务。", "success");
    await refreshTasks({ silent: true });
  } catch (error) {
    setStatus(`重试未添加：${friendlyError(error)}`, "error");
    if (button) {
      setButtonBusy(button, false);
    }
  }
}

function renderAccount(data) {
  const channel = data.channel;
  const connected = Boolean(channel?.title);
  logoutAccountButton.hidden = !connected;
  loginAccountButton.textContent = connected ? "刷新账号数据" : "登录 YouTube";
  loginAccountButton.setAttribute("aria-label", connected ? "刷新 YouTube 账号数据" : "登录 YouTube");
  if (channel?.title) {
    accountSummary.innerHTML = `
      <div class="accountCard">
        ${channel.thumbnail ? `<img src="${escapeHtml(channel.thumbnail)}" alt="">` : ""}
        <div>
          <strong>${escapeHtml(channel.title)}</strong>
          <span>已连接 YouTube 账号</span>
        </div>
      </div>
    `;
  } else {
    accountSummary.innerHTML = emptyState("未连接账号", "登录后可以读取播放列表、喜欢视频和最近浏览。", "", {
      label: "登录 YouTube",
      action: "login"
    });
    bindEmptyActions(accountSummary);
  }

  renderLinkList(recentList, data.recentHistory || [], item => ({
    title: item.title,
    kind: "历史",
    meta: `访问 ${item.visitCount || 1} 次`,
    subtitle: item.lastVisitTime ? `最近访问：${new Date(item.lastVisitTime).toLocaleString()}` : item.url,
    thumbnail: item.thumbnail,
    url: item.url
  }));
  renderLinkList(likedList, data.likedVideos || [], item => ({
    title: item.title,
    kind: "喜欢",
    meta: item.duration || "已喜欢",
    subtitle: item.channelTitle || item.uploader || item.url,
    thumbnail: item.thumbnail,
    url: item.url
  }));
  renderLinkList(playlistList, data.playlists || [], item => ({
    title: item.title,
    kind: "列表",
    meta: `列表 ${item.id || ""}`.trim(),
    subtitle: `${item.count || 0} 个视频`,
    thumbnail: item.thumbnail,
    url: `https://www.youtube.com/playlist?list=${item.id}`
  }));
}

function renderLinkList(container, items, mapItem) {
  if (!items.length) {
    container.innerHTML = emptyState("暂无内容", "登录或刷新后，这里会显示可检测的 YouTube 项目。", "", {
      label: "刷新",
      action: "load-account"
    });
    bindEmptyActions(container);
    return;
  }

  container.innerHTML = items.map(item => {
    const mapped = mapItem(item);
    return `
      <article class="compactItem" role="listitem">
        ${videoThumbHtml(mapped, "mini")}
        <div>
          <span class="compactTitleRow">
            <strong>${escapeHtml(mapped.title || mapped.url)}</strong>
            ${mapped.kind ? `<span class="itemTypeBadge">${escapeHtml(mapped.kind)}</span>` : ""}
          </span>
          ${mapped.meta ? `<span class="videoMetaRow"><span class="metaChip subtle">${escapeHtml(mapped.meta)}</span></span>` : ""}
          <span>${escapeHtml(mapped.subtitle || "")}</span>
        </div>
        <button class="ghost small" data-use-url="${escapeHtml(mapped.url)}" aria-label="检测 ${escapeHtml(mapped.title || mapped.url)}">检测</button>
      </article>
    `;
  }).join("");

  container.querySelectorAll("[data-use-url]").forEach(button => {
    button.addEventListener("click", () => {
      urlInput.value = button.dataset.useUrl;
      syncUrlHint();
      setView("resolve");
      setStatus("已填入链接，可以开始检测。", "success");
    });
  });
}

function videoThumbHtml(item, size = "video") {
  const wrapClass = size === "mini" ? "miniThumbWrap" : "videoThumbWrap";
  const thumbClass = size === "mini" ? "miniThumb" : "videoThumb";
  const badgeClass = size === "mini" ? "miniBadge" : "thumbBadge";
  const label = item.duration || (item.kind === "列表" ? "列表" : size === "video" ? "视频" : "");
  const image = item.thumbnail || item.thumbnailUrl || item.thumbnails?.[0]?.url || "";
  const media = image
    ? `<img class="${thumbClass}" src="${escapeHtml(image)}" alt="" loading="lazy">`
    : `<span class="${thumbClass}" aria-hidden="true"></span>`;
  const badge = label ? `<span class="${badgeClass}">${escapeHtml(label)}</span>` : "";
  return `
    <span class="${wrapClass}">
      ${media}
      ${badge}
    </span>
  `;
}

function updateSelectionState() {
  const checkboxes = [...videoList.querySelectorAll("input[type='checkbox']")];
  const selectedCount = checkboxes.filter(input => input.checked).length;
  const qualityLabel = qualityShortText(qualityInput.value);
  downloadSelectedButton.disabled = selectedCount === 0;
  downloadSelectedButton.textContent = selectedCount ? `添加 ${selectedCount} 个 · ${qualityLabel}` : "添加到下载";
  downloadSelectedButton.setAttribute("aria-label", selectedCount ? `添加 ${selectedCount} 个选中视频，画质 ${qualityText(qualityInput.value)}` : "添加到下载");
  selectAllInput.disabled = checkboxes.length === 0;
  selectAllInput.checked = checkboxes.length > 0 && selectedCount === checkboxes.length;
  selectAllInput.indeterminate = selectedCount > 0 && selectedCount < checkboxes.length;
  selectionMeta.textContent = checkboxes.length ? `已选 ${selectedCount} / ${checkboxes.length}` : "未选择视频";
  checkboxes.forEach(input => {
    const item = input.closest(".videoItem");
    item?.classList.toggle("checked", input.checked);
    item?.setAttribute("aria-selected", String(input.checked));
  });
  videoList.querySelectorAll(".videoQualityBadge").forEach(badge => {
    badge.textContent = qualityLabel;
  });
}

function emptyState(title, description, tone = "", action = null) {
  return `
    <div class="empty ${escapeHtml(tone)}">
      <span class="emptyIcon" aria-hidden="true"></span>
      <div>
        <strong>${escapeHtml(title)}</strong>
        <span>${escapeHtml(description)}</span>
        ${action ? `<button class="ghost small emptyAction" type="button" data-empty-action="${escapeHtml(action.action)}" aria-label="${escapeHtml(action.label)}">${escapeHtml(action.label)}</button>` : ""}
      </div>
    </div>
  `;
}

function bindEmptyActions(container) {
  container.querySelectorAll("[data-empty-action]").forEach(button => {
    button.addEventListener("click", () => {
      const action = button.dataset.emptyAction;
      if (action === "resolve") {
        resolveCurrentUrl();
      }
      if (action === "resolve-view") {
        setView("resolve");
      }
      if (action === "login") {
        loadAccountData();
      }
      if (action === "load-account") {
        loadAccountData();
      }
      if (action === "refresh-tasks") {
        refreshTasks();
      }
    });
  });
}

function getSelectedVideos() {
  return [...videoList.querySelectorAll("input[type='checkbox']:checked")]
    .map(input => resolvedVideos[Number(input.dataset.videoIndex)])
    .filter(Boolean);
}

function statusTextFor(status) {
  return {
    starting: "启动中",
    running: "下载中",
    done: "已完成",
    error: "失败",
    canceled: "已取消"
  }[status] || status;
}

function qualityText(value) {
  return {
    "best-mp4": "最佳单文件 MP4",
    "1080": "最高 1080p",
    "720": "最高 720p",
    "480": "最高 480p",
    audio: "仅音频 MP3"
  }[value] || value;
}

function qualityShortText(value) {
  return {
    "best-mp4": "MP4",
    "1080": "1080p",
    "720": "720p",
    "480": "480p",
    audio: "MP3"
  }[value] || value;
}

function isTaskStalled(task) {
  const status = task.Status || task.status || "";
  const percent = Number(task.Percent || task.percent || 0);
  const line = task.LastLine || task.lastLine || "";
  const updatedAt = Date.parse(task.UpdatedAt || task.updatedAt || task.StartedAt || task.startedAt || "");
  if (!["running", "starting"].includes(status) || percent > 0 || line) {
    return false;
  }
  return Number.isFinite(updatedAt) && Date.now() - updatedAt > 15000;
}

function taskPhaseText(status, percent, stalled = false) {
  if (status === "done") return "已保存到本地";
  if (status === "error") return "下载失败";
  if (status === "canceled") return "已取消任务";
  if (stalled) return "等待 YouTube 响应";
  if (status === "starting") return "正在准备下载";
  if (percent >= 95) return "正在收尾合并";
  if (percent > 0) return "正在下载媒体";
  return "等待下载开始";
}

function progressText(status, percent) {
  if (status === "done") return "完成";
  if (status === "error") return "需要重试";
  if (status === "canceled") return "已停止";
  return `${Math.max(0, Math.min(100, Number(percent || 0))).toFixed(percent ? 1 : 0)}%`;
}

function friendlyError(error) {
  const message = String(error?.message || error || "");
  if (/Could not copy Chrome cookie database|cookie database|issues\/7271/i.test(message)) {
    return "Chrome Cookie 读取失败。请关闭“使用浏览器登录状态”，按最初方式直接下载。";
  }
  if (/Netscape format cookies file|does not look like a Netscape/i.test(message)) {
    return "浏览器 Cookie 临时文件格式错误，已修复为 yt-dlp 需要的格式。请重新加载扩展后再试。";
  }
  if (/confirm you.?re not a bot|confirm you're not a bot|cookies-from-browser|pass cookies|Sign in to confirm/i.test(message)) {
    return "YouTube 要求登录确认。请保持 Chrome 已登录 YouTube，并开启“使用浏览器登录状态”后重试。";
  }
  if (/timed out|timeout/i.test(message)) {
    return "本地下载组件响应太慢，请在下载任务页点刷新确认是否已开始。";
  }
  if (/Native host|native host|disconnected|did not respond|rejected/i.test(message)) {
    return "本地下载组件未连接，请确认已安装并重新打开浏览器。";
  }
  if (/OAuth|Client ID|identity|getAuthToken/i.test(message)) {
    return "账号授权尚未配置。下载不受影响，配置 OAuth 后可读取收藏和播放列表。";
  }
  if (/fetch|network|Failed to fetch|YouTube API/i.test(message)) {
    return "YouTube 数据读取失败，请检查网络或稍后重试。";
  }
  if (/permission|not authorized|denied/i.test(message)) {
    return "当前权限不足，请检查扩展权限或重新授权。";
  }
  return message || "操作没有完成，请稍后重试。";
}

function shortUrl(value) {
  try {
    const url = new URL(value);
    return `${url.hostname}${url.pathname}${url.search ? "?" + url.searchParams.toString().slice(0, 36) : ""}`;
  } catch {
    return value;
  }
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

document.addEventListener("DOMContentLoaded", async () => {
  previewMode = new URLSearchParams(window.location.search).get("preview") || "";
  const manifest = chrome?.runtime?.getManifest?.();
  versionText.textContent = `v${manifest?.version || "0.2.0"}`;
  oauthConfigured = !manifest?.oauth2?.client_id?.startsWith("REPLACE_WITH_");
  if (!oauthConfigured && !previewMode) {
    accountStatus.textContent = "账号功能是可选项：配置 Google OAuth Client ID 后可读取 YouTube 收藏和播放列表。";
  }

  const savedDir = localStorage.getItem(downloadDirStorageKey);
  downloadDirInput.value = savedDir || defaultDownloadDir;
  useBrowserCookiesInput.checked = false;
  localStorage.setItem(useBrowserCookiesStorageKey, "false");
  syncQualityPreset(qualityInput.value);

  if (previewMode) {
    urlInput.value = previewMode === "invalid" ? "https://example.com/not-youtube" : "https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PLdemo";
    syncUrlHint();
    resolvedVideos = ["empty", "invalid"].includes(previewMode) ? [] : previewVideos;
    if (previewMode === "resolving") {
      renderResolvingState();
    } else {
      renderVideos(["tasks", "empty", "invalid"].includes(previewMode) ? [] : previewVideos);
    }
    renderTasks(previewMode === "tasks" ? previewTasks : previewMode === "stalled" ? previewStalledTasks : []);
    if (previewMode === "queue") {
      renderQueueingState(1);
    }
    renderAccount(previewMode === "account" ? previewAccount : {});
    if (previewMode === "resolving") {
      setStatus("正在检测视频信息...", "busy");
    } else if (previewMode === "invalid") {
      setStatus("这不是 YouTube 链接。", "error");
    } else {
      setStatus("准备好了。", "success");
    }
    syncUrlHint();
    const previewView = ["queue", "stalled"].includes(previewMode) ? "tasks" : ["tasks", "account"].includes(previewMode) ? previewMode : "resolve";
    setView(previewView, { skipRefresh: ["queue", "stalled"].includes(previewMode) });
    return;
  }

  const currentTab = await getActiveTabInfo();
  const currentUrl = currentTab.url;
  urlInput.value = currentUrl;
  syncUrlHint();
  setStatus(isYouTubeUrl(currentUrl) ? "准备好了。" : "请打开一个 YouTube 视频页。");
  renderVideos([]);
  await refreshTasks();
});

tabs.forEach((tab, index) => {
  tab.addEventListener("click", () => setView(tab.dataset.view));
  tab.addEventListener("keydown", event => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
      return;
    }
    event.preventDefault();
    const nextIndex = {
      ArrowLeft: (index - 1 + tabs.length) % tabs.length,
      ArrowRight: (index + 1) % tabs.length,
      Home: 0,
      End: tabs.length - 1
    }[event.key];
    const nextTab = tabs[nextIndex];
    setView(nextTab.dataset.view);
    nextTab.focus();
  });
});
selectAllInput.addEventListener("change", () => {
  videoList.querySelectorAll("input[type='checkbox']").forEach(input => {
    input.checked = selectAllInput.checked;
  });
  updateSelectionState();
});
resolveButton.addEventListener("click", resolveCurrentUrl);
downloadSelectedButton.addEventListener("click", downloadSelectedVideos);
refreshButton.addEventListener("click", refreshTasks);
clearFinishedTasksButton.addEventListener("click", clearFinishedTasks);
retryFailedTasksButton.addEventListener("click", retryFailedTasks);
cancelActiveTasksButton.addEventListener("click", cancelActiveTasks);
loginAccountButton.addEventListener("click", loadAccountData);
loadAccountButton.addEventListener("click", loadAccountData);
logoutAccountButton.addEventListener("click", logoutAccount);
useCurrentPageButton.addEventListener("click", async () => {
  const currentTab = await getActiveTabInfo();
  const currentUrl = currentTab.url;
  urlInput.value = currentUrl;
  syncUrlHint();
  setStatus(isYouTubeUrl(currentUrl) ? "已填入当前页面链接。" : "当前页面不是 YouTube 视频页。", isYouTubeUrl(currentUrl) ? "success" : "error");
});
clearUrlButton.addEventListener("click", () => {
  urlInput.value = "";
  syncUrlHint();
  setStatus("链接已清空。", "success");
});
urlInput.addEventListener("input", syncUrlHint);
urlInput.addEventListener("keydown", event => {
  if (event.key !== "Enter") {
    return;
  }
  event.preventDefault();
  syncUrlHint();
  if (!resolveButton.disabled) {
    resolveCurrentUrl();
  }
});
qualityInput.addEventListener("change", () => {
  syncQualityPreset(qualityInput.value);
  updateSelectionState();
});
useBrowserCookiesInput.addEventListener("change", () => {
  localStorage.setItem(useBrowserCookiesStorageKey, String(useBrowserCookiesInput.checked));
  setStatus(useBrowserCookiesInput.checked ? "已启用浏览器登录状态。" : "已关闭浏览器登录状态。", "success");
});
qualityPresets.forEach(button => {
  button.addEventListener("click", () => {
    qualityInput.value = button.dataset.quality;
    syncQualityPreset(qualityInput.value);
    updateSelectionState();
    setStatus(`已切换为 ${qualityText(qualityInput.value)}。`, "success");
  });
});
