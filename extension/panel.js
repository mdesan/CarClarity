let latestRequest = 0;
let lastVin;
let lastDecode;

async function decodeVin(vin) {
  try {
    const url = "https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/" + vin + "?format=json";
    const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!response.ok) return null;

    const data = await response.json();
    const decoded = data.Results?.[0];
    if (decoded?.ErrorCode !== "0") return null;

    const year = Number(decoded.ModelYear);
    const make = decoded.Make?.trim();
    const model = decoded.Model?.trim();
    const trim = decoded.Trim?.trim() || null;
    if (!Number.isInteger(year) || year < 1900 || year > new Date().getFullYear() + 1 || !make || !model) {
      return null;
    }

    return {
      year,
      make,
      model,
      trim,
      vehicleTitle: [year, make, model, trim].filter(Boolean).join(" ")
    };
  } catch {
    return null;
  }
}

async function showListing() {
  const request = ++latestRequest;
  const urlCheck = document.getElementById("urlCheck");
  const description = document.getElementById("description");
  const details = document.getElementById("details");
  const formatted = document.getElementById("formatted");
  const listingJson = document.getElementById("listingJson");
  details.replaceChildren();
  formatted.hidden = true;
  listingJson.textContent = "";
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
      func: readCraigslistListing,
      args: [tab.id]
    });
    if (request !== latestRequest) return;

    if (!listing) {
      description.textContent = "This page could not be verified as a Cars & Trucks listing.";
      return;
    }
    if (listing.unsupportedReason) {
      description.textContent = listing.unsupportedReason;
      return;
    }

    for (const detail of listing.details) {
      const row = document.createElement("li");
      row.textContent = detail;
      details.append(row);
    }
    const listingData = listing.listingData;
    const vin = listingData.vin;
    let decoded = null;
    if (vin) {
      description.textContent = "Checking VIN with NHTSA...";
      // The panel can refresh twice during navigation. Reuse the same VIN request.
      if (vin !== lastVin) {
        lastVin = vin;
        lastDecode = decodeVin(vin);
      }
      decoded = await lastDecode;
      if (request !== latestRequest) return;
      if (decoded) Object.assign(listingData, decoded);
    }

    if (listingData.year !== null && listingData.year < 1984) {
      details.replaceChildren();
      description.textContent = "CarClarity supports model years 1984 and newer.";
      return;
    }

    const identitySource = document.getElementById("identitySource");
    if (decoded) {
      identitySource.textContent = "Vehicle identity from NHTSA VIN decode.";
    } else if (vin) {
      identitySource.textContent = "VIN could not be validated. Vehicle identity from Craigslist.";
    } else {
      identitySource.textContent = "No VIN listed. Vehicle identity from Craigslist.";
    }
    description.textContent = listingData.sellerDescription || "No listing description found.";
    listingJson.textContent = JSON.stringify(listingData, null, 2);
    formatted.hidden = false;
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
