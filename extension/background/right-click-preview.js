const menuId = "carclarity-preview-listing";
const previewPanelUrl = chrome.runtime.getURL("panel/panel.html");
const cooldownMs = 3000;
const requestTimeoutMs = 8000;
const maxHtmlBytes = 1024 * 1024;
const activePreviews = new Map();
const previewResultKey = "rightClickLastResult";
let busy = false;
let stopped = false;

function isListingUrl(value) {
  try {
    const url = new URL(value);
    const isCraigslist = url.hostname === "craigslist.org" || url.hostname.endsWith(".craigslist.org");
    const isListing = /^\/view\/d\/[^/]+\/[\w-]+\/?$/.test(url.pathname) ||
      /^\/(?:[^/]+\/)?(?:cto|ctd)\/d\/[^/]+\/\d+\.html$/.test(url.pathname);
    return url.protocol === "https:" && isCraigslist && !url.username && !url.password &&
      !url.port && isListing;
  } catch {
    return false;
  }
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: menuId,
    title: "Analyze with CarClarity",
    contexts: ["link"],
    documentUrlPatterns: ["https://*.craigslist.org/search/*", "https://*.craigslist.org/*/search/*"],
    targetUrlPatterns: [
      "https://*.craigslist.org/view/d/*",
      "https://*.craigslist.org/cto/d/*",
      "https://*.craigslist.org/ctd/d/*",
      "https://*.craigslist.org/*/cto/d/*",
      "https://*.craigslist.org/*/ctd/d/*"
    ]
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== menuId || !tab?.url || !isListingUrl(info.linkUrl)) return;
  const now = Date.now();
  const listingUrl = new URL(info.linkUrl);
  listingUrl.search = "";
  listingUrl.hash = "";
  const token = crypto.randomUUID();
  const job = { token, listingUrl: listingUrl.href, sourceUrl: tab.url, expires: now + 60000 };
  const saved = chrome.storage.session.set({ ["rightClickPreview:" + tab.id]: job });
  // Call open directly from the menu gesture, without awaiting storage.
  const open = chrome.sidePanel.open({ tabId: tab.id });
  await Promise.allSettled([saved, open]);
});

async function readHtml(response) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let size = 0;
  let html = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) return html + decoder.decode();
      size += value.byteLength;
      if (size > maxHtmlBytes) {
        await reader.cancel();
        return null;
      }
      html += decoder.decode(value, { stream: true });
    }
  } finally {
    reader.releaseLock();
  }
}

async function stopForSession(listingUrl) {
  stopped = true;
  await chrome.storage.session.set({ previewBlocked: true }).catch(() => {});
  return {
    listingUrl,
    error: "Craigslist blocked or challenged the request. Previews are paused for this browser session."
  };
}

async function fetchListing(listingUrl) {
  if (busy) return { listingUrl, error: "Another listing preview is still loading." };
  if (stopped) return { listingUrl, error: "Previews are paused for this browser session." };
  busy = true;
  let started = false;
  try {
    const { nextPreviewAt = 0, previewBusyUntil = 0, previewBlocked } =
      await chrome.storage.session.get(["nextPreviewAt", "previewBusyUntil", "previewBlocked"]);
    if (previewBlocked) return { listingUrl, error: "Previews are paused for this browser session." };
    if (previewBusyUntil > Date.now()) return { listingUrl, error: "Another listing preview is still loading." };
    const wait = Math.ceil((nextPreviewAt - Date.now()) / 1000);
    if (wait > 0) return { listingUrl, error: "Wait " + wait + " seconds before requesting another preview." };
    const now = Date.now();
    await chrome.storage.session.set({
      nextPreviewAt: now + cooldownMs,
      previewBusyUntil: now + requestTimeoutMs + 1000
    });
    started = true;

    const response = await fetch(listingUrl, {
      credentials: "omit",
      redirect: "manual",
      signal: AbortSignal.timeout(requestTimeoutMs)
    });
    if ([401, 403, 429].includes(response.status) || response.headers.get("cf-mitigated") === "challenge") {
      return await stopForSession(listingUrl);
    }
    if (response.type === "opaqueredirect" || (response.status >= 300 && response.status < 400)) {
      return { listingUrl, error: "Craigslist redirected this listing. The preview did not follow the redirect." };
    }
    if ([404, 410].includes(response.status)) return { listingUrl, error: "This listing is unavailable or expired." };
    if (!response.ok) return { listingUrl, error: "Craigslist returned HTTP " + response.status + "." };
    if (!response.body || !response.headers.get("content-type")?.includes("text/html")) {
      return { listingUrl, error: "Craigslist did not return a listing page." };
    }
    const html = await readHtml(response);
    if (html === null) return { listingUrl, error: "The listing page was too large to preview." };
    if (/id=["']challenge-form["']|\/cdn-cgi\/challenge-platform\/|<title>\s*(?:Just a moment|Access Denied|Request Blocked)/i.test(html)) {
      return await stopForSession(listingUrl);
    }
    return { listingUrl, html };
  } catch (error) {
    const message = error.name === "TimeoutError" ? "The listing request timed out." : "The preview could not load.";
    return { listingUrl, error: message };
  } finally {
    if (started) await chrome.storage.session.remove("previewBusyUntil").catch(() => {});
    busy = false;
  }
}

async function runPreview(tabId, token) {
  const selectionKey = "rightClickPreview:" + tabId;
  const attemptKey = "rightClickAttempt:" + tabId;
  const data = await chrome.storage.session.get([selectionKey, attemptKey, previewResultKey]);
  const job = data[selectionKey];
  if (job?.token !== token || !isListingUrl(job.listingUrl)) {
    return { error: "This preview is no longer selected. Right-click the listing again." };
  }
  const cached = data[previewResultKey];
  if (cached?.token === token) return cached.result;
  if (job.expires <= Date.now() || data[attemptKey] === token) {
    return { error: "This preview is no longer available. Right-click the listing again." };
  }

  // Record the attempt before fetching so a worker restart cannot repeat it.
  await chrome.storage.session.set({ [attemptKey]: token });
  const result = await fetchListing(job.listingUrl);
  // Keep only one bounded HTML response in session storage for a reopened panel.
  await chrome.storage.session.set({ [previewResultKey]: { token, result } }).catch(() => {});
  return result;
}

chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (message?.type !== "preview-listing" || sender.url?.split("#")[0] !== previewPanelUrl ||
      !Number.isInteger(message.tabId) || typeof message.token !== "string") return;
  const key = message.tabId + ":" + message.token;
  if (!activePreviews.has(key)) {
    const request = runPreview(message.tabId, message.token)
      .catch(() => ({ error: "Could not load the listing preview." }))
      .finally(() => activePreviews.delete(key));
    activePreviews.set(key, request);
  }
  activePreviews.get(key).then(respond);
  return true;
});

chrome.tabs.onRemoved.addListener((tabId) => {
  chrome.storage.session.remove(["rightClickPreview:" + tabId, "rightClickAttempt:" + tabId]).catch(() => {});
});
