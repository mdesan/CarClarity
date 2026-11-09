async function showUnsupportedSite() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.url) {
    document.getElementById("message").textContent = "CarClarity doesn’t support: " + tab.url;
  }
}

showUnsupportedSite().catch(console.error);
