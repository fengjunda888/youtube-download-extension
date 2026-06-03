const defaultDownloadDir = "%USERPROFILE%\\Desktop\\youtube videos";
const downloadDirStorageKey = "ytDlpDownloadDir";

const urlInput = document.getElementById("url");
const downloadDirInput = document.getElementById("downloadDir");
const qualityInput = document.getElementById("quality");
const playlistModeInput = document.getElementById("playlistMode");
const statusText = document.getElementById("status");
const downloadButton = document.getElementById("download");
const refreshButton = document.getElementById("refresh");
const tasksList = document.getElementById("tasksList");

let pollTimer;

function setStatus(message, state = "") {
  statusText.textContent = message;
  statusText.dataset.state = state;
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

async function downloadCurrentUrl() {
  const url = urlInput.value.trim();
  const downloadDir = getDownloadDir();

  if (!isYouTubeUrl(url)) {
    setStatus("这不是 YouTube 链接。", "error");
    return;
  }

  localStorage.setItem(downloadDirStorageKey, downloadDir);
  downloadButton.disabled = true;
  setStatus("正在加入下载任务...", "busy");

  try {
    const response = await sendNative({
      action: "start",
      url,
      downloadDir,
      quality: qualityInput.value,
      playlistMode: playlistModeInput.value
    });
    setStatus(`已加入任务：${response.task?.id || ""}`, "success");
    await refreshTasks();
    startPolling();
  } catch (error) {
    setStatus(`启动失败：${error.message}`, "error");
  } finally {
    downloadButton.disabled = false;
  }
}

async function refreshTasks() {
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
    const mode = task.PlaylistMode || task.playlistMode || "";
    const canCancel = status === "running" || status === "starting";

    return `
      <article class="task">
        <div class="taskTop">
          <strong>${escapeHtml(statusTextFor(status))}</strong>
          <span>${percent.toFixed(percent ? 1 : 0)}%</span>
        </div>
        <div class="bar"><span style="width:${percent}%"></span></div>
        <div class="meta">${escapeHtml(qualityText(quality))} · ${escapeHtml(modeText(mode))}${speed ? ` · ${escapeHtml(speed)}` : ""}${eta ? ` · ETA ${escapeHtml(eta)}` : ""}</div>
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

function modeText(value) {
  return value === "playlist" ? "整个合集" : "当前视频";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

document.addEventListener("DOMContentLoaded", async () => {
  const currentUrl = await getActiveTabUrl();
  const savedDir = localStorage.getItem(downloadDirStorageKey);
  urlInput.value = currentUrl;
  downloadDirInput.value = savedDir || defaultDownloadDir;
  setStatus(isYouTubeUrl(currentUrl) ? "准备好了。" : "请打开一个 YouTube 视频页。");
  await refreshTasks();
  startPolling();
});

downloadButton.addEventListener("click", downloadCurrentUrl);
refreshButton.addEventListener("click", refreshTasks);
