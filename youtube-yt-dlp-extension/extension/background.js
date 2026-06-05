const nativeHostName = "com.fengj.youtube_ytdlp";
let nativePort;
let nextRequestId = 1;
const pendingRequests = new Map();

function connectNativeHost() {
  if (nativePort) {
    return nativePort;
  }

  nativePort = chrome.runtime.connectNative(nativeHostName);
  nativePort.onMessage.addListener(message => {
    const requestId = message?.requestId;
    if (!requestId || !pendingRequests.has(requestId)) {
      return;
    }
    pendingRequests.get(requestId).resolve(message);
    pendingRequests.delete(requestId);
  });

  nativePort.onDisconnect.addListener(() => {
    const error = chrome.runtime.lastError?.message || "Native host disconnected.";
    for (const request of pendingRequests.values()) {
      request.reject(new Error(error));
    }
    pendingRequests.clear();
    nativePort = undefined;
  });

  return nativePort;
}

function sendNativeMessage(payload) {
  const requestId = String(nextRequestId++);
  const port = connectNativeHost();
  return new Promise((resolve, reject) => {
    pendingRequests.set(requestId, { resolve, reject });
    port.postMessage({ ...payload, requestId });
  });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message) {
    return false;
  }

  if (message.type === "native-request") {
    sendNativeMessage(message.payload)
      .then(response => sendResponse({ ok: true, response }))
      .catch(error => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message.type === "account-request") {
    handleAccountRequest(message.payload)
      .then(response => sendResponse({ ok: true, response }))
      .catch(error => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  return false;
});

async function handleAccountRequest(payload) {
  switch (payload?.action) {
    case "load":
      return loadAccountData();
    case "logout":
      return logoutAccount();
    default:
      throw new Error("Unknown account action.");
  }
}

async function getAuthToken(interactive = true) {
  const manifest = chrome.runtime.getManifest();
  if (manifest.oauth2?.client_id?.startsWith("REPLACE_WITH_")) {
    throw new Error("Google OAuth Client ID is not configured.");
  }

  return await chrome.identity.getAuthToken({ interactive });
}

async function logoutAccount() {
  const token = await getAuthToken(false).catch(() => "");
  if (token) {
    await chrome.identity.removeCachedAuthToken({ token });
  }
  return { ok: true };
}

async function loadAccountData() {
  const token = await getAuthToken(true);
  const [channel, playlists, likedVideos, recentHistory] = await Promise.all([
    fetchMyChannel(token),
    fetchMyPlaylists(token),
    fetchLikedVideos(token),
    fetchRecentYouTubeHistory()
  ]);

  return {
    ok: true,
    channel,
    playlists,
    likedVideos,
    recentHistory
  };
}

async function youtubeFetch(token, path) {
  const response = await fetch(`https://www.googleapis.com/youtube/v3/${path}`, {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`YouTube API failed: ${response.status} ${text}`);
  }

  return await response.json();
}

async function fetchMyChannel(token) {
  const data = await youtubeFetch(token, "channels?part=snippet,contentDetails&mine=true&maxResults=1");
  const item = data.items?.[0];
  if (!item) {
    return null;
  }

  return {
    id: item.id,
    title: item.snippet?.title || "",
    thumbnail: item.snippet?.thumbnails?.default?.url || "",
    uploadsPlaylistId: item.contentDetails?.relatedPlaylists?.uploads || "",
    likesPlaylistId: item.contentDetails?.relatedPlaylists?.likes || ""
  };
}

async function fetchMyPlaylists(token) {
  const data = await youtubeFetch(token, "playlists?part=snippet,contentDetails&mine=true&maxResults=25");
  return (data.items || []).map(item => ({
    id: item.id,
    title: item.snippet?.title || "",
    thumbnail: item.snippet?.thumbnails?.default?.url || "",
    count: item.contentDetails?.itemCount || 0
  }));
}

async function fetchLikedVideos(token) {
  const data = await youtubeFetch(token, "videos?part=snippet,contentDetails&myRating=like&maxResults=25");
  return (data.items || []).map(item => ({
    id: item.id,
    url: `https://www.youtube.com/watch?v=${item.id}`,
    title: item.snippet?.title || "",
    channelTitle: item.snippet?.channelTitle || "",
    thumbnail: item.snippet?.thumbnails?.default?.url || "",
    duration: item.contentDetails?.duration || ""
  }));
}

async function fetchRecentYouTubeHistory() {
  const oneMonthAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const items = await chrome.history.search({
    text: "youtube.com/watch",
    startTime: oneMonthAgo,
    maxResults: 50
  });

  return items
    .filter(item => item.url && isWatchUrl(item.url))
    .map(item => ({
      url: item.url,
      title: item.title || item.url,
      lastVisitTime: item.lastVisitTime || 0,
      visitCount: item.visitCount || 0
    }));
}

function isWatchUrl(value) {
  try {
    const url = new URL(value);
    return ["youtube.com", "www.youtube.com", "m.youtube.com"].includes(url.hostname) && url.pathname === "/watch";
  } catch {
    return false;
  }
}
