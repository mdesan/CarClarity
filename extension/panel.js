let latestRequest = 0;

async function showListing() {
  const request = ++latestRequest;
  const urlCheck = document.getElementById("urlCheck");
  const description = document.getElementById("description");
  const details = document.getElementById("details");
  details.replaceChildren();
  description.textContent = "";
  urlCheck.textContent = "Checking current tab...";

  let tab;
  let url;
  try {
    [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (request !== latestRequest) return;
    if (!tab?.url) {
      urlCheck.textContent = "Open a Craigslist Cars & Trucks listing.";
      return;
    }
    url = new URL(tab.url);
    urlCheck.textContent = "Currently viewing: " + url.hostname;
  } catch {
    if (request !== latestRequest) return;
    urlCheck.textContent = "Could not read the current tab.";
    return;
  }

  const isCraigslist = url.hostname === "craigslist.org" || url.hostname.endsWith(".craigslist.org");
  const isCarListing = /\/(cto|ctd)\/d\/.+\/\d+\.html$/.test(url.pathname);
  const isViewListing = /^\/view\/d\/[^/]+\/[\w-]+\/?$/.test(url.pathname);
  if (!isCraigslist) {
    description.textContent = "CarClarity currently supports Craigslist only.";
    return;
  }
  if (url.pathname.includes("/search/")) {
    description.textContent = "Open a Cars & Trucks listing from the search results.";
    return;
  }
  if (!isCarListing && !isViewListing) {
    description.textContent = "Open a Craigslist Cars & Trucks listing.";
    return;
  }

  try {
    const [{ result: listing }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: readCraigslistListing
    });
    if (request !== latestRequest) return;

    if (!listing) {
      description.textContent = "This page could not be verified as a Cars & Trucks listing.";
      return;
    }

    for (const detail of listing.details) {
      const row = document.createElement("li");
      row.textContent = detail;
      details.append(row);
    }
    description.textContent = listing.description || "No listing description found.";
  } catch {
    if (request !== latestRequest) return;
    description.textContent = "Could not read the listing details.";
  }
}

chrome.tabs.onActivated.addListener(showListing);
chrome.tabs.onUpdated.addListener((tabId, change, tab) => {
  if (tab.active && (change.url || change.status)) showListing();
});
showListing();
