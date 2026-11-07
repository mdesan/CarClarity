let latestRequest = 0;
let lastVin;
let lastDecode;
let activeListing = null;
const confirmedByTab = new Map();
const vehicleForm = document.getElementById("vehicleForm");
const vehicleFields = document.getElementById("vehicleFields");
const confirmVehicle = document.getElementById("confirmVehicle");
const editVehicle = document.getElementById("editVehicle");
const yearInput = document.getElementById("year");
const makeInput = document.getElementById("make");
const modelInput = document.getElementById("model");
const verificationStatus = document.getElementById("verificationStatus");
const postForm = document.getElementById("postForm");
const postFields = document.getElementById("postFields");
const confirmPost = document.getElementById("confirmPost");
const editPost = document.getElementById("editPost");
const postTitleInput = document.getElementById("postTitle");
const postDescriptionInput = document.getElementById("postDescription");
const postStatus = document.getElementById("postStatus");
const listingJson = document.getElementById("listingJson");

function getConfirmations(listing) {
  const saved = confirmedByTab.get(listing.tabId);
  return saved?.listingUrl === listing.listingUrl ? saved : { listingUrl: listing.listingUrl };
}

function saveConfirmation(section, value) {
  const saved = getConfirmations(activeListing);
  saved[section] = value;
  confirmedByTab.set(activeListing.tabId, saved);
  showListingJson(activeListing);
}

function identityKey(value) {
  return (value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function showListingJson(listing) {
  const output = { ...listing };
  const { vehicle: confirmed, post } = getConfirmations(listing);
  if (confirmed) {
    const changed = confirmed.year !== listing.year ||
      identityKey(confirmed.make) !== identityKey(listing.make) ||
      identityKey(confirmed.model) !== identityKey(listing.model);
    output.year = confirmed.year;
    output.make = confirmed.make;
    output.model = confirmed.model;
    output.userVerified = true;
    if (changed) {
      output.trim = null;
      output.vehicleTitle = [output.year, output.make, output.model].join(" ");
    }
  }
  if (post) {
    output.postTitle = post.title;
    output.sellerDescription = post.description;
    output.postVerified = true;
  }
  listingJson.textContent = JSON.stringify(output, null, 2);
}

function setStatus(element, message, error = false) {
  element.textContent = message;
  element.classList.toggle("error", error);
}

function showVehicleMode(editing, confirmed = false) {
  document.getElementById("vehiclePreview").hidden = editing;
  document.getElementById("previewYear").textContent = yearInput.value || "Unavailable";
  document.getElementById("previewMake").textContent = makeInput.value || "Unavailable";
  document.getElementById("previewModel").textContent = modelInput.value || "Unavailable";
  vehicleFields.hidden = !editing;
  vehicleFields.disabled = !editing;
  confirmVehicle.hidden = confirmed;
  confirmVehicle.disabled = false;
  editVehicle.hidden = editing;
  editVehicle.disabled = false;
}

function showPostMode(editing, confirmed = false) {
  document.getElementById("postPreview").hidden = editing;
  document.getElementById("previewPostTitle").textContent = postTitleInput.value || "No title found.";
  document.getElementById("previewPostDescription").textContent = postDescriptionInput.value || "No description found.";
  postFields.hidden = !editing;
  postFields.disabled = !editing;
  confirmPost.hidden = confirmed;
  editPost.hidden = editing;
}

async function findVehicle(year, make, model) {
  const url = "https://vpic.nhtsa.dot.gov/api/vehicles/GetModelsForMakeYear/make/" +
    encodeURIComponent(make) + "/modelyear/" + year + "?format=json";
  const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
  if (!response.ok) throw new Error("NHTSA lookup failed");
  const data = await response.json();
  const models = data.Results.filter((item) => identityKey(item.Make_Name) === identityKey(make));
  if (!models.length) {
    return { error: "NHTSA couldn’t find that make for " + year + ". Check the year and make spelling." };
  }
  const match = models.find((item) => identityKey(item.Model_Name) === identityKey(model));
  if (!match) {
    return { error: "NHTSA couldn’t find that model for " + year + " " + models[0].Make_Name + ". Check the model name." };
  }
  return { year, make: match.Make_Name, model: match.Model_Name };
}

vehicleForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const listing = activeListing;
  if (!listing || confirmVehicle.disabled || confirmVehicle.hidden) return;

  const year = Number(yearInput.value);
  const make = makeInput.value.trim();
  const model = modelInput.value.trim();
  if (!/^\d{4}$/.test(yearInput.value.trim()) || year < 1984 || year > new Date().getFullYear() + 1) {
    setStatus(verificationStatus, "Enter a four-digit model year from 1984 through next year.", true);
    return;
  }
  if (!make || !model) {
    setStatus(verificationStatus, "Enter both a make and a model.", true);
    return;
  }

  vehicleFields.disabled = true;
  confirmVehicle.disabled = true;
  editVehicle.disabled = true;
  setStatus(verificationStatus, "Checking NHTSA…");
  try {
    const result = await findVehicle(year, make, model);
    if (activeListing !== listing) return;
    if (result.error) {
      showVehicleMode(!vehicleFields.hidden);
      setStatus(verificationStatus, result.error, true);
      return;
    }
    makeInput.value = result.make;
    modelInput.value = result.model;
    saveConfirmation("vehicle", result);
    showVehicleMode(false, true);
    setStatus(verificationStatus, "Vehicle confirmed with NHTSA.");
  } catch {
    if (activeListing !== listing) return;
    showVehicleMode(!vehicleFields.hidden);
    setStatus(verificationStatus, "Couldn’t reach NHTSA to check this vehicle. Try again in a moment.", true);
  }
});

editVehicle.addEventListener("click", () => {
  if (!activeListing || editVehicle.disabled) return;
  saveConfirmation("vehicle", null);
  showVehicleMode(true);
  setStatus(verificationStatus, "Confirm again when you’re done editing.");
  yearInput.focus();
});

postForm.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!activeListing || confirmPost.hidden) return;
  const title = postTitleInput.value.trim();
  if (!title) {
    setStatus(postStatus, "Enter a post title before confirming.", true);
    return;
  }
  const description = postDescriptionInput.value.trim();
  postTitleInput.value = title;
  postDescriptionInput.value = description;
  saveConfirmation("post", { title, description });
  showPostMode(false, true);
  setStatus(postStatus, "Post confirmed.");
});

editPost.addEventListener("click", () => {
  if (!activeListing) return;
  saveConfirmation("post", null);
  showPostMode(true);
  setStatus(postStatus, "Confirm again when you’re done editing.");
  postTitleInput.focus();
});

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
  activeListing = null;
  vehicleForm.hidden = true;
  postForm.hidden = true;
  setStatus(verificationStatus, "");
  setStatus(postStatus, "");
  const urlCheck = document.getElementById("urlCheck");
  const description = document.getElementById("description");
  const details = document.getElementById("details");
  const scrapedDetails = document.getElementById("scrapedDetails");
  const formatted = document.getElementById("formatted");
  details.replaceChildren();
  scrapedDetails.hidden = true;
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
    description.textContent = "";
    activeListing = listingData;
    const { vehicle, post } = getConfirmations(listingData);
    const fields = vehicle || listingData;
    yearInput.value = String(fields.year ?? "");
    makeInput.value = fields.make || "";
    modelInput.value = fields.model || "";
    postTitleInput.value = post?.title ?? listingData.postTitle ?? "";
    postDescriptionInput.value = post?.description ?? listingData.sellerDescription ?? "";
    showVehicleMode(false, Boolean(vehicle));
    showPostMode(false, Boolean(post));
    if (vehicle) setStatus(verificationStatus, "Vehicle confirmed with NHTSA.");
    if (post) setStatus(postStatus, "Post confirmed.");
    showListingJson(listingData);
    vehicleForm.hidden = false;
    postForm.hidden = false;
    scrapedDetails.hidden = false;
    formatted.hidden = false;
  } catch {
    if (request !== latestRequest) return;
    description.textContent = "Could not read the listing details.";
  }
}

chrome.tabs.onActivated.addListener(showListing);
chrome.tabs.onUpdated.addListener((tabId, change, tab) => {
  const saved = confirmedByTab.get(tabId);
  if (saved && (change.url || change.status) && saved.listingUrl !== tab.url) {
    confirmedByTab.delete(tabId);
  }
  if (tab.active && (change.url || change.status)) showListing();
});
chrome.tabs.onRemoved.addListener((tabId) => confirmedByTab.delete(tabId));
showListing();
