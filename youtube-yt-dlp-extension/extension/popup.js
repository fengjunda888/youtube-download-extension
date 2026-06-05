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
const videoList = document.getElementById("videoList");
const resolveSummary = document.getElementById("resolveSummary");
const resolveChips = document.getElementById("resolveChips");
const selectAllInput = document.getElementById("selectAll");
const versionText = document.getElementById("version");
const loginAccountButton = document.getElementById("loginAccount");
const logoutAccountButton = document.getElementById("logoutAccount");
const loadAccountButton = document.getElementById("loadAccount");
const accountStatus = document.getElementById("accountStatus");
const accountSummary = document.getElementById("accountSummary");
const recentList = document.getElementById("recentList");
const likedList = document.getElementById("likedList");
const playlistList = document.getElementById("playlistList");
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

function setView(name) {
  for (const [viewName, element] of Object.entries(views)) {
    element.classList.toggle("active", viewName === name);
  }
  tabs.forEach(tab => tab.classList.toggle("active", tab.dataset.view === name));
  if (name === "tasks") {
    refreshTasks();
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

async function resolveCurrentUrl() {
  const url = urlInput.value.trim();
  if (!isYouTubeUrl(url)) {
    setStatus("这不是 YouTube 链接。", "error");
    return;
  }

  localStorage.setItem(downloadDirStorageKey, getDownloadDir());
  resolveButton.disabled = true;
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
    setStatus(`解析失败：${error.message}`, "error");
  } finally {
    resolveButton.disabled = false;
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
  downloadSelectedButton.disabled = true;
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
      lastError = error.message;
    }
  }

  setStatus(lastError ? `已加入 ${successCount} 个任务，部分失败：${lastError}` : `已加入 ${successCount} 个下载任务。`, lastError ? "error" : "success");
  downloadSelectedButton.disabled = false;
  await refreshTasks();
  setView("tasks");
}

async function refreshTasks() {
  if (previewMode) {
    renderTasks(previewMode === "tasks" ? previewTasks : []);
    return;
  }

  try {
    const response = await sendNative({ action: "list" });
    renderTasks(response.tasks || []);
  } catch (error) {
    tasksList.innerHTML = emptyState("无法读取任务", error.message, "error");
  }
}

async function cancelTask(id) {
  try {
    await sendNative({ action: "cancel", id });
    await refreshTasks();
  } catch (error) {
    setStatus(`取消失败：${error.message}`, "error");
  }
}

function startPolling() {
  if (pollTimer) {
    clearInterval(pollTimer);
  }
  pollTimer = setInterval(refreshTasks, 1500);
}

async function loadAccountData() {
  if (!oauthConfigured && !previewMode) {
    accountStatus.textContent = "账号功能暂未启用：发布者需要先在 manifest.json 配置 Google OAuth Client ID。下载功能不受影响。";
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
    accountStatus.textContent = `读取失败：${error.message}`;
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
    accountStatus.textContent = `退出失败：${error.message}`;
  }
}

function renderVideos(videos) {
  selectAllInput.checked = false;
  selectAllInput.indeterminate = false;
  if (!videos.length) {
    resolveSummary.textContent = "还没有解析视频。";
    resolveChips.innerHTML = "";
    videoList.innerHTML = emptyState("等待解析", "粘贴 YouTube 视频或合集链接，然后点击解析。");
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
    <label class="videoItem">
      <input type="checkbox" data-video-index="${index}" checked>
      <span class="videoThumb" aria-hidden="true"></span>
      <span class="videoBody">
        <strong>${escapeHtml(video.index ? `${video.index}. ${video.title}` : video.title)}</strong>
        <span>${escapeHtml([video.uploader, video.duration].filter(Boolean).join(" · ") || video.url)}</span>
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
    tasksList.innerHTML = emptyState("暂无下载任务", "解析视频后，选中的下载会显示在这里。");
    return;
  }

  const runningCount = tasks.filter(task => ["running", "starting"].includes(task.Status || task.status)).length;
  const doneCount = tasks.filter(task => (task.Status || task.status) === "done").length;
  taskSummary.innerHTML = `
    <span>${tasks.length} 个任务</span>
    <span>${runningCount} 个进行中</span>
    <span>${doneCount} 个已完成</span>
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

    return `
      <article class="task">
        <div class="taskTop">
          <strong><span class="statusPill ${escapeHtml(status)}">${escapeHtml(statusTextFor(status))}</span></strong>
          <span>${percent.toFixed(percent ? 1 : 0)}%</span>
        </div>
        <div class="bar"><span style="width:${percent}%"></span></div>
        <div class="meta">${escapeHtml(qualityText(quality))}${speed ? ` · ${escapeHtml(speed)}` : ""}${eta ? ` · ETA ${escapeHtml(eta)}` : ""}</div>
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
    accountSummary.innerHTML = emptyState("未连接账号", "登录后可以读取播放列表、喜欢视频和最近浏览。");
  }

  renderLinkList(recentList, data.recentHistory || [], item => ({
    title: item.title,
    subtitle: item.lastVisitTime ? `最近访问：${new Date(item.lastVisitTime).toLocaleString()}` : item.url,
    url: item.url
  }));
  renderLinkList(likedList, data.likedVideos || [], item => ({
    title: item.title,
    subtitle: item.channelTitle || item.uploader || item.url,
    url: item.url
  }));
  renderLinkList(playlistList, data.playlists || [], item => ({
    title: item.title,
    subtitle: `${item.count || 0} 个视频`,
    url: `https://www.youtube.com/playlist?list=${item.id}`
  }));
}

function renderLinkList(container, items, mapItem) {
  if (!items.length) {
    container.innerHTML = emptyState("暂无内容", "登录或刷新后，这里会显示可解析的 YouTube 项目。");
    return;
  }

  container.innerHTML = items.map(item => {
    const mapped = mapItem(item);
    return `
      <article class="compactItem">
        <span class="miniThumb" aria-hidden="true"></span>
        <div>
          <strong>${escapeHtml(mapped.title || mapped.url)}</strong>
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
}

function emptyState(title, description, tone = "") {
  return `
    <div class="empty ${escapeHtml(tone)}">
      <span class="emptyIcon" aria-hidden="true"></span>
      <div>
        <strong>${escapeHtml(title)}</strong>
        <span>${escapeHtml(description)}</span>
      </div>
    </div>
  `;
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

  if (previewMode) {
    urlInput.value = "https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PLdemo";
    resolvedVideos = previewVideos;
    renderVideos(previewMode === "tasks" ? [] : previewVideos);
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

tabs.forEach(tab => tab.addEventListener("click", () => setView(tab.dataset.view)));
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
