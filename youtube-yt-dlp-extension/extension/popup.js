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
const videoList = document.getElementById("videoList");
const resolveSummary = document.getElementById("resolveSummary");
const selectAllInput = document.getElementById("selectAll");
const versionText = document.getElementById("version");
const views = {
  resolve: document.getElementById("resolveView"),
  tasks: document.getElementById("tasksView")
};
const tabs = [...document.querySelectorAll(".tab")];

const previewVideos = [
  {
    id: "dQw4w9WgXcQ",
    url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    title: "Sample video ready to download",
    uploader: "Demo Channel",
    duration: "3:33",
    index: 1
  },
  {
    id: "KpcaZCkYFv4",
    url: "https://www.youtube.com/watch?v=KpcaZCkYFv4",
    title: "Playlist item with 1080p option",
    uploader: "Demo Channel",
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

let pollTimer;
let resolvedVideos = [];
let previewMode = "";

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
    tasksList.innerHTML = `<div class="empty">无法读取任务：${escapeHtml(error.message)}</div>`;
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

function renderVideos(videos) {
  selectAllInput.checked = false;
  selectAllInput.indeterminate = false;
  if (!videos.length) {
    resolveSummary.textContent = "还没有解析视频。";
    videoList.innerHTML = '<div class="empty">粘贴 YouTube 视频或合集链接，然后点击解析。</div>';
    updateSelectionState();
    return;
  }

  resolveSummary.textContent = `共 ${videos.length} 个视频，可选择一个或多个下载。`;
  videoList.innerHTML = videos.map((video, index) => `
    <label class="videoItem">
      <input type="checkbox" data-video-index="${index}" checked>
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
    tasksList.innerHTML = '<div class="empty">还没有下载任务。</div>';
    return;
  }

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
          <strong>${escapeHtml(statusTextFor(status))}</strong>
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

function updateSelectionState() {
  const checkboxes = [...videoList.querySelectorAll("input[type='checkbox']")];
  const selectedCount = checkboxes.filter(input => input.checked).length;
  downloadSelectedButton.disabled = selectedCount === 0;
  downloadSelectedButton.textContent = selectedCount ? `下载选中视频（${selectedCount}）` : "下载选中视频";
  selectAllInput.disabled = checkboxes.length === 0;
  selectAllInput.checked = checkboxes.length > 0 && selectedCount === checkboxes.length;
  selectAllInput.indeterminate = selectedCount > 0 && selectedCount < checkboxes.length;
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
  versionText.textContent = `v${chrome?.runtime?.getManifest?.().version || "0.1.0"}`;

  const savedDir = localStorage.getItem(downloadDirStorageKey);
  downloadDirInput.value = savedDir || defaultDownloadDir;

  if (previewMode) {
    urlInput.value = "https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PLdemo";
    resolvedVideos = previewVideos;
    renderVideos(previewMode === "tasks" ? [] : previewVideos);
    renderTasks(previewMode === "tasks" ? previewTasks : []);
    setStatus("准备好了。", "success");
    setView(previewMode === "tasks" ? "tasks" : "resolve");
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
