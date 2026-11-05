async function showListing() {
  const urlCheck = document.getElementById("urlCheck");
  const description = document.getElementById("description");

  let tab;
  let url;
  try {
    [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    url = new URL(tab.url);
    urlCheck.textContent = "Currently viewing: " + url.hostname;
  } catch {
    urlCheck.textContent = "Could not read the current tab.";
    return;
  }

  const isCraigslist = url.hostname === "craigslist.org" || url.hostname.endsWith(".craigslist.org");
  const isCarListing = /\/(cto|ctd)\/d\/.+\/\d+\.html$/.test(url.pathname);
  const isViewListing = /^\/view\/d\/[^/]+\/[\w-]+\/?$/.test(url.pathname);
  if (!isCraigslist || (!isCarListing && !isViewListing)) return;

  try {
    const [{ result: listing }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: readCraigslistListing
    });

    if (!listing) {
      description.textContent = "No listing details found.";
      return;
    }

    const details = document.getElementById("details");
    for (const detail of listing.details) {
      const row = document.createElement("li");
      row.textContent = detail;
      details.append(row);
    }
    description.textContent = listing.description || "No listing description found.";
  } catch {
    description.textContent = "Could not read the listing details.";
  }
}

showListing();
