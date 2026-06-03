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
  if (!message || message.type !== "native-request") {
    return false;
  }

  sendNativeMessage(message.payload)
    .then(response => sendResponse({ ok: true, response }))
    .catch(error => sendResponse({ ok: false, error: error.message }));

  return true;
});
