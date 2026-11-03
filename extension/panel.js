async function showDomain() {
  const urlCheck = document.getElementById("urlCheck");

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const url = new URL(tab.url);

    urlCheck.textContent = "Currently viewing: " + url.hostname;
  } catch {
    urlCheck.textContent = "url grabbing failed";
  }
}

showDomain();
