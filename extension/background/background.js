importScripts("right-click-preview.js");

function isCraigslist(url) {
  return /^https?:\/\/(?:[^/]+\.)?craigslist\.org\//i.test(url || "");
}

const previewIconKeys = ["nextPreviewAt", "previewBusyUntil", "previewBlocked"];
let previewIconTimer;
let previewIconRefresh = 0;

function isCraigslistSearch(address) {
  return isCraigslist(address) && new URL(address).pathname.includes("/search/");
}

function previewWaitUntil(state) {
  return Math.max(state.nextPreviewAt || 0, state.previewBusyUntil || 0);
}

async function updateToolbarIcon(tab, state) {
  let path = "assets/icons/car-gray-offline.png";
  let title = "CarClarity · Unsupported site";
  if (isCraigslist(tab.url)) {
    path = "assets/icons/car-blue-ready.png";
    title = "CarClarity · Ready";
    if (isCraigslistSearch(tab.url)) {
      state = state || await chrome.storage.session.get(previewIconKeys);
      const current = await chrome.tabs.get(tab.id);
      if (!isCraigslistSearch(current.url)) return;
      if (state.previewBlocked) {
        path = "assets/icons/car-blue.png";
        title = "CarClarity · Link previews paused";
      } else if (previewWaitUntil(state) > Date.now()) {
        path = "assets/icons/car-blue-wait.png";
        title = "CarClarity · Waiting for link preview";
      }
    }
  }
  await Promise.all([
    chrome.action.setIcon({ tabId: tab.id, path: chrome.runtime.getURL(path) }),
    chrome.action.setTitle({ tabId: tab.id, title })
  ]);
}

async function refreshPreviewIcons() {
  const request = ++previewIconRefresh;
  clearTimeout(previewIconTimer);
  const state = await chrome.storage.session.get(previewIconKeys);
  if (request !== previewIconRefresh) return;
  const remaining = previewWaitUntil(state) - Date.now();
  if (!state.previewBlocked && remaining > 0) {
    previewIconTimer = setTimeout(() => refreshPreviewIcons().catch(console.error), remaining);
  }
  const tabs = await chrome.tabs.query({ url: "*://*.craigslist.org/*" });
  if (request !== previewIconRefresh) return;
  await Promise.allSettled(tabs.filter((tab) => isCraigslistSearch(tab.url)).map((tab) => updateToolbarIcon(tab, state)));
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "session" && previewIconKeys.some((key) => Object.hasOwn(changes, key))) {
    refreshPreviewIcons().catch(console.error);
  }
});

chrome.action.onClicked.addListener((tab) => {
  if (isCraigslist(tab.url)) {
    chrome.sidePanel.open({ tabId: tab.id }).catch(console.error);
  }
});

async function updateAction(tab) {
  const onCraigslist = isCraigslist(tab.url);
  const popup = onCraigslist ? "" : "popup/unsupported.html";
  await Promise.all([
    chrome.sidePanel.setOptions({ tabId: tab.id, path: "panel/panel.html", enabled: onCraigslist }),
    updateToolbarIcon(tab),
    chrome.action.setPopup({ tabId: tab.id, popup })
  ]);
}

async function refreshActions() {
  const tabs = await chrome.tabs.query({});
  await Promise.allSettled(tabs.map(updateAction));
}

chrome.runtime.onInstalled.addListener(() => {
  // Clear the old click behavior so the action listener above receives clicks.
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false }).catch(console.error);
  refreshActions().catch(console.error);
});
chrome.runtime.onStartup.addListener(() => refreshActions().catch(console.error));
chrome.tabs.onUpdated.addListener((tabId, change, tab) => {
  if (change.url || change.status) updateAction(tab).catch(console.error);
});
