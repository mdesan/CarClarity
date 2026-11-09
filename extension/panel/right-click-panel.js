const previewByTab = new Map();
const previewTimer = document.getElementById("previewTimer");
const previewSpinner = document.getElementById("previewSpinner");
const previewTimerText = document.getElementById("previewTimerText");
const previewTimerKeys = ["nextPreviewAt", "previewBusyUntil", "previewBlocked"];
let previewTimerTick;
let previewTimerRequest = 0;

function paintPreviewTimer(state) {
  const now = Date.now();
  const seconds = Math.ceil(((state.nextPreviewAt || 0) - now) / 1000);
  const busy = state.previewBusyUntil > now;
  let text = "Ready for another preview";
  if (state.previewBlocked) text = "Previews paused";
  else if (seconds > 0) text = "Next preview in " + seconds + "s";
  else if (busy) text = "Waiting for current preview…";
  if (previewTimerText.textContent !== text) previewTimerText.textContent = text;
  const waiting = !state.previewBlocked && (busy || seconds > 0);
  previewSpinner.hidden = Boolean(state.previewBlocked);
  previewSpinner.dataset.state = waiting ? "waiting" : "ready";
  if (waiting) previewTimerTick = setTimeout(() => paintPreviewTimer(state), 250);
}

async function showPreviewTimer(visible) {
  const request = ++previewTimerRequest;
  clearTimeout(previewTimerTick);
  previewTimer.hidden = !visible;
  if (!visible) return;

  try {
    const state = await chrome.storage.session.get(previewTimerKeys);
    if (request === previewTimerRequest) paintPreviewTimer(state);
  } catch {
    if (request === previewTimerRequest) previewTimer.hidden = true;
  }
}

function previewKey(tabId) {
  return "rightClickPreview:" + tabId;
}

function searchPageKey(address) {
  try {
    const url = new URL(address);
    if ((url.hostname !== "craigslist.org" && !url.hostname.endsWith(".craigslist.org")) ||
        !url.pathname.includes("/search/")) return null;
    // Craigslist can update its result offset and view hash as results scroll.
    url.searchParams.delete("s");
    url.searchParams.sort();
    url.hash = "";
    return url.href;
  } catch {
    return null;
  }
}

function samePreviewSearch(first, second) {
  const key = searchPageKey(first);
  return key !== null && key === searchPageKey(second);
}

async function getPreviewSelection(tab) {
  const key = previewKey(tab.id);
  const data = await chrome.storage.session.get(key);
  const selection = data[key];
  return samePreviewSearch(selection?.sourceUrl, tab.url) ? selection : null;
}

async function loadPreviewListing(tabId, selection) {
  const response = await chrome.runtime.sendMessage({ type: "preview-listing", tabId, token: selection.token });
  if (!response || response.error) {
    return { error: response?.error || "Could not load the listing preview." };
  }

  // Keep fetched markup in an inert template and render only the extracted fields.
  const template = document.createElement("template");
  template.innerHTML = response.html;
  const page = template.content;
  const description = page.querySelector("#postingbody");
  if (description) {
    for (const node of description.querySelectorAll(".print-information, script, style")) node.remove();
    for (const lineBreak of description.querySelectorAll("br")) lineBreak.replaceWith("\n");
  }
  return { listing: readCraigslistListing(tabId, page, selection.listingUrl) };
}

function readPreviewListing(tabId, selection) {
  let preview = previewByTab.get(tabId);
  if (preview?.token !== selection.token) {
    preview = {
      token: selection.token,
      sourceUrl: selection.sourceUrl,
      result: loadPreviewListing(tabId, selection).catch(() => ({ error: "Could not read the listing preview." }))
    };
    previewByTab.set(tabId, preview);
  }
  return preview.result;
}

async function clearPreviewAfterLeaving(tabId, url) {
  const preview = previewByTab.get(tabId);
  if (!preview || samePreviewSearch(preview.sourceUrl, url)) return;
  previewByTab.delete(tabId);
  const key = previewKey(tabId);
  const data = await chrome.storage.session.get(key);
  if (data[key]?.token === preview.token) await chrome.storage.session.remove(key);
}

function watchPreviewSelections(refresh) {
  chrome.storage.onChanged.addListener(async (changes, area) => {
    if (area !== "session") return;
    if (!previewTimer.hidden && previewTimerKeys.some((key) => Object.hasOwn(changes, key))) {
      showPreviewTimer(true);
    }
    if (!Object.keys(changes).some((key) => key.startsWith("rightClickPreview:"))) return;
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && changes[previewKey(tab.id)]?.newValue) refresh();
  });
  chrome.tabs.onRemoved.addListener((tabId) => previewByTab.delete(tabId));
}
