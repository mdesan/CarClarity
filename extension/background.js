function isCraigslist(url) {
  return /^https?:\/\/(?:[^/]+\.)?craigslist\.org\//i.test(url || "");
}

chrome.action.onClicked.addListener((tab) => {
  if (isCraigslist(tab.url)) {
    chrome.sidePanel.open({ tabId: tab.id }).catch(console.error);
  }
});

async function updateAction(tab) {
  const onCraigslist = isCraigslist(tab.url);
  const path = onCraigslist ? "car-blue.png" : "car-gray.png";
  const popup = onCraigslist ? "" : "unsupported.html";
  await Promise.all([
    chrome.sidePanel.setOptions({ tabId: tab.id, path: "panel.html", enabled: onCraigslist }),
    chrome.action.setIcon({ tabId: tab.id, path }),
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
