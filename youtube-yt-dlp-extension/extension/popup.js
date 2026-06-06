const defaultDownloadDir = "%USERPROFILE%\\Desktop\\youtube videos";
const downloadDirStorageKey = "ytDlpDownloadDir";

const urlInput = document.getElementById("url");
const downloadDirInput = document.getElementById("downloadDir");
const qualityInput = document.getElementById("quality");
const statusText = document.getElementById("status");
const resolveButton = document.getElementById("resolve");
const downloadSelectedButton = document.getElementById("downloadSelected");
const refreshButton = document.getElementById("refresh");
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

const previewVideos = [
  {
    id: "dQw4w9WgXcQ",
    url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    title: "示例视频：准备下载",
    uploader: "示例频道",
    duration: "3:33",
    index: 1
  },
  {
    id: "KpcaZCkYFv4",
    url: "https://www.youtube.com/watch?v=KpcaZCkYFv4",
    title: "合集视频：可选 1080p 画质",
    uploader: "示例频道",
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
const previewAccount = {
  channel: {
    title: "fengjunda888",
    thumbnail: "icons/icon-48.png"
  },
  recentHistory: previewVideos.map(video => ({
    url: video.url,
    title: video.title,
    lastVisitTime: Date.now(),
    visitCount: 3
  })),
  likedVideos: previewVideos,
  playlists: [
    { id: "PLdemo", title: "收藏的教程合集", count: 18, thumbnail: "icons/icon-48.png" }
  ]
};

let pollTimer;
let resolvedVideos = [];
let previewMode = "";
let oauthConfigured = true;

function setStatus(message, state = "") {
  statusText.textContent = message;
  statusText.dataset.state = state;
}

function setButtonBusy(button, busy, label = "") {
  if (busy) {
    button.dataset.previousLabel = button.textContent;
  }
  button.classList.toggle("isBusy", busy);
  button.disabled = busy;
  button.textContent = busy ? label : button.dataset.previousLabel || button.textContent;
  if (!busy) {
    delete button.dataset.previousLabel;
  }
}

function setView(name) {
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
  if (name === "tasks") {
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

async function getActiveTabUrl() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab?.url || "";
}

function isYouTubeUrl(value) {
  try {
    const url = new URL(value);
    return ["youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be"].includes(url.hostname);
  } catch {
    return false;
  }
}

function getDownloadDir() {
  return downloadDirInput.value.trim() || defaultDownloadDir;
}

function syncQualityPreset(value) {
  qualityPresets.forEach(button => {
    button.classList.toggle("active", button.dataset.quality === value);
  });
}

async function resolveCurrentUrl() {
  const url = urlInput.value.trim();
  if (!isYouTubeUrl(url)) {
    setStatus("这不是 YouTube 链接。", "error");
    return;
  }

  localStorage.setItem(downloadDirStorageKey, getDownloadDir());
  setButtonBusy(resolveButton, true, "正在解析...");
  setStatus("正在解析链接...", "busy");
  renderVideos([]);

  try {
    const response = await sendNative({ action: "resolve", url });
    resolvedVideos = response.videos || [];
    renderVideos(resolvedVideos);
    setStatus(`解析完成：找到 ${resolvedVideos.length} 个视频。`, "success");
  } catch (error) {
    resolvedVideos = [];
    renderVideos([]);
    setStatus(`解析失败：${friendlyError(error)}`, "error");
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
  setButtonBusy(downloadSelectedButton, true, `正在加入（${selected.length}）...`);
  setStatus(`正在加入 ${selected.length} 个下载任务...`, "busy");

  let successCount = 0;
  let lastError = "";
  for (const video of selected) {
    try {
      await sendNative({
        action: "start",
        url: video.url,
        downloadDir,
        quality: qualityInput.value,
        playlistMode: "single"
      });
      successCount += 1;
    } catch (error) {
      lastError = friendlyError(error);
    }
  }

  setStatus(lastError ? `已加入 ${successCount} 个任务，部分失败：${lastError}` : `已加入 ${successCount} 个下载任务。`, lastError ? "error" : "success");
  setButtonBusy(downloadSelectedButton, false);
  updateSelectionState();
  await refreshTasks({ silent: true });
  setView("tasks");
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
    tasksList.innerHTML = emptyState("下载助手未连接", friendlyError(error), "error", {
      label: "重试",
      action: "refresh-tasks"
    });
    bindEmptyActions(tasksList);
  } finally {
    if (!silent) {
      setButtonBusy(refreshButton, false);
    }
  }
}

async function cancelTask(id) {
  try {
    await sendNative({ action: "cancel", id });
    await refreshTasks();
  } catch (error) {
    setStatus(`取消失败：${friendlyError(error)}`, "error");
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

  loginAccountButton.disabled = true;
  loadAccountButton.disabled = true;
  accountStatus.textContent = "正在读取 YouTube 账号数据...";

  try {
    const data = previewMode ? previewAccount : await sendAccount({ action: "load" });
    renderAccount(data);
    accountStatus.textContent = "账号数据已读取。";
  } catch (error) {
    accountStatus.textContent = `读取失败：${friendlyError(error)}`;
    renderAccount({});
  } finally {
    loginAccountButton.disabled = false;
    loadAccountButton.disabled = false;
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
    resolveSummary.textContent = "还没有解析视频。";
    resolveChips.innerHTML = "";
    selectionMeta.textContent = "未选择视频";
    videoList.innerHTML = emptyState("等待解析", "粘贴 YouTube 视频或合集链接，然后点击解析。", "", {
      label: "开始解析",
      action: "resolve"
    });
    bindEmptyActions(videoList);
    updateSelectionState();
    return;
  }

  resolveSummary.textContent = `共 ${videos.length} 个视频，可选择一个或多个下载。`;
  resolveChips.innerHTML = `
    <span>${videos.length} 个视频</span>
    <span>${escapeHtml(qualityText(qualityInput.value))}</span>
    <span>路径已设置</span>
  `;
  videoList.innerHTML = videos.map((video, index) => `
    <label class="videoItem checked">
      <input type="checkbox" data-video-index="${index}" checked>
      <span class="videoThumbWrap">
        <span class="videoThumb" aria-hidden="true"></span>
        <span class="thumbBadge">${escapeHtml(video.duration || "视频")}</span>
      </span>
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

function renderTasks(tasks) {
  if (!tasks.length) {
    taskSummary.innerHTML = "";
    taskOverview.hidden = true;
    taskOverview.innerHTML = "";
    tasksList.innerHTML = emptyState("暂无下载任务", "解析视频后，选中的下载会显示在这里。", "", {
      label: "去解析视频",
      action: "resolve-view"
    });
    bindEmptyActions(tasksList);
    return;
  }

  const runningCount = tasks.filter(task => ["running", "starting"].includes(task.Status || task.status)).length;
  const doneCount = tasks.filter(task => (task.Status || task.status) === "done").length;
  const averageProgress = tasks.reduce((sum, task) => sum + Math.max(0, Math.min(100, Number(task.Percent || task.percent || 0))), 0) / tasks.length;
  const latestTask = tasks.find(task => ["running", "starting"].includes(task.Status || task.status)) || tasks[0];
  const latestLine = latestTask?.LastLine || latestTask?.lastLine || latestTask?.Message || latestTask?.message || "等待新的下载任务。";
  const latestSpeed = latestTask?.Speed || latestTask?.speed || "";
  const latestEta = latestTask?.Eta || latestTask?.eta || "";
  taskSummary.innerHTML = `
    <span>${tasks.length} 个任务</span>
    <span>${runningCount} 个进行中</span>
    <span>${doneCount} 个已完成</span>
  `;
  taskOverview.hidden = false;
  taskOverview.innerHTML = `
    <div class="overviewHead">
      <strong>下载概览</strong>
      <span>总进度 ${averageProgress.toFixed(averageProgress ? 1 : 0)}%</span>
    </div>
    <div class="bar"><span style="width:${averageProgress}%"></span></div>
    <div class="overviewMeta">
      <span>${runningCount ? `当前 ${runningCount} 个任务处理中` : "当前没有进行中的任务"}</span>
      <span>${latestSpeed ? `速度 ${escapeHtml(latestSpeed)}` : "等待速度信息"}</span>
      <span>${latestEta ? `剩余 ${escapeHtml(latestEta)}` : "等待剩余时间"}</span>
    </div>
    <p class="fieldHint">${escapeHtml(latestLine)}</p>
  `;

  tasksList.innerHTML = tasks.map(task => {
    const percent = Math.max(0, Math.min(100, Number(task.Percent || task.percent || 0)));
    const status = task.Status || task.status || "unknown";
    const id = task.Id || task.id;
    const line = task.LastLine || task.lastLine || task.Message || task.message || "";
    const eta = task.Eta || task.eta || "";
    const speed = task.Speed || task.speed || "";
    const quality = task.Quality || task.quality || "";
    const canCancel = status === "running" || status === "starting";
    const phase = taskPhaseText(status, percent);

    return `
      <article class="task task-${escapeHtml(status)}">
        <div class="taskTop">
          <strong><span class="statusPill ${escapeHtml(status)}">${escapeHtml(statusTextFor(status))}</span></strong>
          <span class="taskPercent">${percent.toFixed(percent ? 1 : 0)}%</span>
        </div>
        <div class="taskPhase">
          <span>${escapeHtml(phase)}</span>
          <span>${escapeHtml(progressText(status, percent))}</span>
        </div>
        <div class="bar"><span style="width:${percent}%"></span></div>
        <div class="taskMetaRow">
          <span class="metaChip">${escapeHtml(qualityText(quality))}</span>
          ${speed ? `<span class="metaChip subtle">${escapeHtml(speed)}</span>` : ""}
          ${eta ? `<span class="metaChip subtle">ETA ${escapeHtml(eta)}</span>` : ""}
        </div>
        <div class="line">${escapeHtml(line)}</div>
        <div class="taskActions">
          <button class="ghost small" data-cancel="${escapeHtml(id)}" ${canCancel ? "" : "disabled"}>取消</button>
        </div>
      </article>
    `;
  }).join("");

  tasksList.querySelectorAll("[data-cancel]").forEach(button => {
    button.addEventListener("click", () => cancelTask(button.dataset.cancel));
  });
}

function renderAccount(data) {
  const channel = data.channel;
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
    url: item.url
  }));
  renderLinkList(likedList, data.likedVideos || [], item => ({
    title: item.title,
    kind: "喜欢",
    meta: item.duration || "已喜欢",
    subtitle: item.channelTitle || item.uploader || item.url,
    url: item.url
  }));
  renderLinkList(playlistList, data.playlists || [], item => ({
    title: item.title,
    kind: "列表",
    meta: `列表 ${item.id || ""}`.trim(),
    subtitle: `${item.count || 0} 个视频`,
    url: `https://www.youtube.com/playlist?list=${item.id}`
  }));
}

function renderLinkList(container, items, mapItem) {
  if (!items.length) {
    container.innerHTML = emptyState("暂无内容", "登录或刷新后，这里会显示可解析的 YouTube 项目。", "", {
      label: "刷新",
      action: "load-account"
    });
    bindEmptyActions(container);
    return;
  }

  container.innerHTML = items.map(item => {
    const mapped = mapItem(item);
    return `
      <article class="compactItem">
        <span class="miniThumbWrap">
          <span class="miniThumb" aria-hidden="true"></span>
        </span>
        <div>
          <span class="compactTitleRow">
            <strong>${escapeHtml(mapped.title || mapped.url)}</strong>
            ${mapped.kind ? `<span class="itemTypeBadge">${escapeHtml(mapped.kind)}</span>` : ""}
          </span>
          ${mapped.meta ? `<span class="videoMetaRow"><span class="metaChip subtle">${escapeHtml(mapped.meta)}</span></span>` : ""}
          <span>${escapeHtml(mapped.subtitle || "")}</span>
        </div>
        <button class="ghost small" data-use-url="${escapeHtml(mapped.url)}">解析</button>
      </article>
    `;
  }).join("");

  container.querySelectorAll("[data-use-url]").forEach(button => {
    button.addEventListener("click", () => {
      urlInput.value = button.dataset.useUrl;
      setView("resolve");
      setStatus("已填入链接，可以开始解析。", "success");
    });
  });
}

function updateSelectionState() {
  const checkboxes = [...videoList.querySelectorAll("input[type='checkbox']")];
  const selectedCount = checkboxes.filter(input => input.checked).length;
  downloadSelectedButton.disabled = selectedCount === 0;
  downloadSelectedButton.textContent = selectedCount ? `下载选中视频（${selectedCount}）` : "下载选中视频";
  selectAllInput.disabled = checkboxes.length === 0;
  selectAllInput.checked = checkboxes.length > 0 && selectedCount === checkboxes.length;
  selectAllInput.indeterminate = selectedCount > 0 && selectedCount < checkboxes.length;
  selectionMeta.textContent = checkboxes.length ? `已选 ${selectedCount} / ${checkboxes.length}` : "未选择视频";
  checkboxes.forEach(input => {
    input.closest(".videoItem")?.classList.toggle("checked", input.checked);
  });
}

function emptyState(title, description, tone = "", action = null) {
  return `
    <div class="empty ${escapeHtml(tone)}">
      <span class="emptyIcon" aria-hidden="true"></span>
      <div>
        <strong>${escapeHtml(title)}</strong>
        <span>${escapeHtml(description)}</span>
        ${action ? `<button class="ghost small emptyAction" type="button" data-empty-action="${escapeHtml(action.action)}">${escapeHtml(action.label)}</button>` : ""}
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

function taskPhaseText(status, percent) {
  if (status === "done") return "已保存到本地";
  if (status === "error") return "下载失败";
  if (status === "canceled") return "已取消任务";
  if (status === "starting") return "正在启动 native host";
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
  if (/Native host|native host|disconnected|did not respond|rejected/i.test(message)) {
    return "下载助手未连接。请确认 native host 已安装并保持运行。";
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
  syncQualityPreset(qualityInput.value);

  if (previewMode) {
    urlInput.value = "https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PLdemo";
    resolvedVideos = previewMode === "empty" ? [] : previewVideos;
    renderVideos(["tasks", "empty"].includes(previewMode) ? [] : previewVideos);
    renderTasks(previewMode === "tasks" ? previewTasks : []);
    renderAccount(previewMode === "account" ? previewAccount : {});
    setStatus("准备好了。", "success");
    setView(["tasks", "account"].includes(previewMode) ? previewMode : "resolve");
    return;
  }

  const currentUrl = await getActiveTabUrl();
  urlInput.value = currentUrl;
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
loginAccountButton.addEventListener("click", loadAccountData);
loadAccountButton.addEventListener("click", loadAccountData);
logoutAccountButton.addEventListener("click", logoutAccount);
useCurrentPageButton.addEventListener("click", async () => {
  const currentUrl = await getActiveTabUrl();
  urlInput.value = currentUrl;
  setStatus(isYouTubeUrl(currentUrl) ? "已填入当前页面链接。" : "当前页面不是 YouTube 视频页。", isYouTubeUrl(currentUrl) ? "success" : "error");
});
clearUrlButton.addEventListener("click", () => {
  urlInput.value = "";
  setStatus("链接已清空。", "success");
});
qualityInput.addEventListener("change", () => syncQualityPreset(qualityInput.value));
qualityPresets.forEach(button => {
  button.addEventListener("click", () => {
    qualityInput.value = button.dataset.quality;
    syncQualityPreset(qualityInput.value);
    setStatus(`已切换为 ${qualityText(qualityInput.value)}。`, "success");
  });
});
