let latestRequest = 0;
let displayedTabId;
let displayedSearchUrl;
let lastVin;
let lastDecode;
let activeListing = null;
let activeVinData = null;
const confirmedByTab = new Map();
const vehicleForm = document.getElementById("vehicleForm");
const vehicleFields = document.getElementById("vehicleFields");
const confirmVehicle = document.getElementById("confirmVehicle");
const editVehicle = document.getElementById("editVehicle");
const yearInput = document.getElementById("year");
const makeInput = document.getElementById("make");
const modelInput = document.getElementById("model");
const trimInput = document.getElementById("trim");
const vehicleModels = document.getElementById("vehicleModels");
const mileageInput = document.getElementById("mileage");
const verificationStatus = document.getElementById("verificationStatus");
const sellerPost = document.getElementById("sellerPost");
const listingJson = document.getElementById("listingJson");
const reportSections = document.getElementById("reportSections");
const reportPending = document.getElementById("reportPending");
const clarityReportStatus = document.getElementById("clarityReportStatus");
const clarityChecklist = document.getElementById("clarityChecklist");
const generateReport = document.getElementById("generateReport");
generateReport.addEventListener("click", () => {
  if (activeListing) showListingJson(activeListing, true);
});
const clarityVehicleStatus = document.getElementById("clarityVehicleStatus");
const clarityIssuesStatus = document.getElementById("clarityIssuesStatus");
const issueReview = setupIssueReview(
  () => activeListing && getConfirmations(activeListing),
  saveConfirmation,
  setStatus
);

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

function showListingJson(listing, generate = false) {
  const output = { ...listing };
  const { vehicle: confirmed, post, userIssues = [] } = getConfirmations(listing);
  // The report sections are built from the confirmed vehicle, so they wait for confirmation.
  reportSections.hidden = !confirmed;
  reportPending.hidden = Boolean(confirmed);
  const issuesConfirmed = Boolean(post?.issuesVerified);
  clarityVehicleStatus.textContent = confirmed ? "✓" : "(Pending)";
  clarityIssuesStatus.textContent = issuesConfirmed ? "✓" : "(Pending)";
  const reportReady = Boolean(confirmed && issuesConfirmed);
  if (!reportReady) {
    clarityChecklist.hidden = false;
    resetClarityReport();
  } else if (generate) {
    clarityChecklist.hidden = true;
  }
  generateReport.hidden = !reportReady || clarityChecklist.hidden;
  clarityVehicleStatus.classList.toggle("confirmation-complete", Boolean(confirmed));
  clarityIssuesStatus.classList.toggle("confirmation-complete", issuesConfirmed);
  clarityReportStatus.classList.toggle("confirmation-complete", reportReady);
  clarityReportStatus.textContent = clarityChecklist.hidden ? "" : reportReady
    ? "Ready for your report."
    : "Confirm both to continue.";
  showSimilarListings(confirmed);
  let identityChanged = false;
  if (confirmed) {
    identityChanged = confirmed.year !== listing.year ||
      identityKey(confirmed.make) !== identityKey(listing.make) ||
      identityKey(confirmed.model) !== identityKey(listing.model);
    output.year = confirmed.year;
    output.make = confirmed.make;
    output.model = confirmed.model;
    output.trim = confirmed.trim ?? null;
    output.mileageMiles = confirmed.mileageMiles;
    output.userVerified = true;
    if (identityChanged || output.trim !== listing.trim) {
      output.vehicleTitle = [output.year, output.make, output.model, output.trim].filter(Boolean).join(" ");
    }
  }
  const matchingVin = activeVinData && activeVinData.year === output.year &&
    identityKey(activeVinData.make) === identityKey(output.make) &&
    identityKey(activeVinData.model) === identityKey(output.model);
  const vinDrive = matchingVin
    ? normalizeDrivetrain(activeVinData.specs?.drivetrain) ||
      (mercedesVariant(output, activeVinData)?.fourMatic ? "AWD" : null)
    : null;
  const sellerDrive = identityChanged ? null : normalizeDrivetrain(listing.sellerSpecs?.drivetrain);
  output.drivetrain = vinDrive || sellerDrive;
  output.drivetrainSource = vinDrive ? "NHTSA VIN decode" : sellerDrive ? "Craigslist seller" : null;

  if (confirmed) {
    // A VIN that decodes to a different car cannot supply this report's specs.
    const researchInput = activeVinData && !matchingVin ? { ...output, vin: null } : output;
    showVehicleResearch(researchInput, matchingVin ? activeVinData : null);
    showDealBenchmark(output);
    showListingIssues(output);
    showRepairCosts(output, userIssues, issuesConfirmed);
    if (reportReady && generate) showClarityReport(output, userIssues);
  } else {
    resetResearch();
    resetDealBenchmark();
    resetListingIssues();
    resetRepairCosts();
  }
  if (post) {
    output.sellerIssues = post.issuesVerified
      ? post.issues.map((issue) => ({ ...issue, reviewed: true, status: "reviewed" }))
      : post.issues;
  }
  output.issuesVerified = issuesConfirmed;
  output.userAddedIssues = userIssues;
  issueReview.show(confirmed ? post : null, userIssues);
  listingJson.textContent = JSON.stringify(output, null, 2);
}

function setStatus(element, message, error = false) {
  element.textContent = message;
  element.classList.toggle("error", error);
}

// Mileage is optional: blank returns null, anything else must be a whole number (commas allowed).
function parseMileage(value) {
  const text = value.trim();
  if (!text) return null;
  if (!/^(?:\d{1,3}(?:,\d{3})+|\d+)$/.test(text)) return NaN;
  const miles = Number(text.replaceAll(",", ""));
  return Number.isSafeInteger(miles) ? miles : NaN;
}

function vehicleConfirmedMessage(vehicle) {
  const message = "Vehicle found in the NHTSA database.";
  const miles = vehicle.mileageMiles;
  if (miles === null || miles === undefined) return message;
  const formatted = miles.toLocaleString("en-US") + (miles === 1 ? " mile" : " miles");
  if (miles > 500000) {
    return message + " Double-check the mileage: " + formatted + " is unusually high.";
  }
  if (miles < 100 && vehicle.year <= new Date().getFullYear() - 2) {
    return message + " Double-check the mileage: " + formatted + " is unusually low for a " + vehicle.year + " car.";
  }
  return message;
}

function showVehicleMode(editing, confirmed = false) {
  document.getElementById("vehiclePreview").hidden = editing;
  const miles = parseMileage(mileageInput.value);
  const preview = {
    Year: yearInput.value,
    Make: makeInput.value,
    Model: modelInput.value,
    Trim: trimInput.value,
    Mileage: Number.isFinite(miles) ? miles.toLocaleString("en-US") + " mi" : mileageInput.value.trim()
  };
  const missing = [];
  for (const [label, value] of Object.entries(preview)) {
    const detail = document.getElementById("preview" + label);
    detail.textContent = value;
    detail.hidden = !value;
    detail.previousElementSibling.hidden = !value;
    if (!value) missing.push(label + " was not provided or detected.");
  }
  showUnavailableElements("Vehicle details", missing);
  vehicleFields.hidden = !editing;
  vehicleFields.disabled = !editing;
  confirmVehicle.hidden = confirmed;
  confirmVehicle.disabled = false;
  editVehicle.hidden = editing;
  editVehicle.disabled = false;
}

vehicleForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const listing = activeListing;
  if (!listing || confirmVehicle.disabled || confirmVehicle.hidden) return;

  const year = Number(yearInput.value);
  const make = makeInput.value.trim();
  const model = modelInput.value.trim();
  const trimText = trimInput.value.trim();
  const trim = !trimText || /^n\/a$/i.test(trimText) ? null : trimText;
  if (!/^\d{4}$/.test(yearInput.value.trim()) || year < 1984 || year > new Date().getFullYear() + 1) {
    setStatus(verificationStatus, "Enter a four-digit model year from 1984 through next year.", true);
    return;
  }
  if (!make || !model) {
    setStatus(verificationStatus, "Enter both a make and a model.", true);
    return;
  }
  const mileageMiles = parseMileage(mileageInput.value);
  if (Number.isNaN(mileageMiles)) {
    setStatus(verificationStatus, "Enter mileage as a whole number, like 85000.", true);
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
    trimInput.value = trim || "";
    mileageInput.value = mileageMiles === null ? "" : String(mileageMiles);
    const confirmed = { ...result, trim, mileageMiles };
    saveConfirmation("vehicle", confirmed);
    showVehicleMode(false, true);
    setStatus(verificationStatus, vehicleConfirmedMessage(confirmed));
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

async function showListing() {
  const request = ++latestRequest;
  displayedSearchUrl = null;
  activeListing = null;
  activeVinData = null;
  showUnavailableElements("Vehicle details");
  vehicleModels.replaceChildren();
  resetResearch();
  resetDealBenchmark();
  resetListingIssues();
  resetRepairCosts();
  resetClarityReport();
  vehicleForm.hidden = true;
  reportSections.hidden = true;
  reportPending.hidden = true;
  clarityChecklist.hidden = false;
  sellerPost.hidden = true;
  issueReview.reset();
  setStatus(verificationStatus, "");
  const urlCheck = document.getElementById("urlCheck");
  const description = document.getElementById("description");
  const previewLink = document.getElementById("previewLink");
  const details = document.getElementById("details");
  const scrapedDetails = document.getElementById("scrapedDetails");
  const formatted = document.getElementById("formatted");
  details.replaceChildren();
  scrapedDetails.hidden = true;
  formatted.hidden = true;
  updateDebugVisibility();
  listingJson.textContent = "";
  description.textContent = "";
  previewLink.hidden = true;
  showPreviewTimer(false);
  urlCheck.textContent = "Checking current tab...";

  let tab;
  let url;
  try {
    [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (request !== latestRequest) return;
    displayedTabId = tab?.id;
    if (!tab?.url) {
      urlCheck.textContent = "Open a Craigslist Cars & Trucks listing.";
      return;
    }
    url = new URL(tab.url);
    urlCheck.textContent = "";
  } catch {
    if (request !== latestRequest) return;
    urlCheck.textContent = "Could not read the current tab.";
    return;
  }

  const isCraigslist = url.hostname === "craigslist.org" || url.hostname.endsWith(".craigslist.org");
  const isSearch = url.pathname.includes("/search/");
  const isCarListing = /\/(cto|ctd)\/d\/.+\/\d+\.html$/.test(url.pathname);
  const isViewListing = /^\/view\/d\/[^/]+\/[\w-]+\/?$/.test(url.pathname);
  if (!isCraigslist) {
    description.textContent = "CarClarity currently supports Craigslist only.";
    return;
  }
  if (!isSearch && !isCarListing && !isViewListing) {
    description.textContent = "Open a Craigslist Cars & Trucks listing.";
    return;
  }

  try {
    let listing;
    if (isSearch) {
      displayedSearchUrl = tab.url;
      showPreviewTimer(true);
      const selection = await getPreviewSelection(tab);
      if (request !== latestRequest) return;
      if (!selection) {
        description.textContent = "Right-click a car listing and choose Analyze with CarClarity, or open the listing normally.";
        return;
      }
      previewLink.href = selection.listingUrl;
      previewLink.hidden = false;
      description.textContent = "Reading selected listing…";
      const preview = await readPreviewListing(tab.id, selection);
      if (request !== latestRequest) return;
      if (preview.error) {
        description.textContent = preview.error;
        return;
      }
      listing = preview.listing;
    } else {
      const [result] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: readCraigslistListing,
        args: [tab.id]
      });
      listing = result.result;
    }
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
      if (decoded) {
        activeVinData = decoded;
        const { specs, ...identity } = decoded;
        Object.assign(listingData, identity);
      }
    }

    if (listingData.year !== null && listingData.year < 1984) {
      details.replaceChildren();
      description.textContent = "CarClarity supports model years 1984 and newer.";
      return;
    }

    const identitySource = document.getElementById("identitySource");
    if (decoded) {
      identitySource.textContent = "Vehicle identity from NHTSA VIN decode.";
    } else {
      identitySource.textContent = "Check the vehicle details from Craigslist.";
      if (listingData.year && listingData.make) {
        description.textContent = "Checking the NHTSA model list…";
        try {
          const models = await getVehicleModels(listingData.year, listingData.make);
          if (request !== latestRequest) return;
          for (const name of new Set(models.map((item) => item.Model_Name))) {
            const option = document.createElement("option");
            option.value = name;
            vehicleModels.append(option);
          }
          const match = matchCatalogModel(listing.listedModel || "", models);
          if (match) {
            Object.assign(listingData, match, { vehicleTitle: catalogVehicleTitle(listingData, match) });
            identitySource.textContent = "Craigslist vehicle details matched to the NHTSA model list.";
          } else {
            identitySource.textContent = "No clear NHTSA model match. Choose a model under Edit vehicle.";
          }
        } catch {
          if (request !== latestRequest) return;
          identitySource.textContent = "NHTSA’s model list is unavailable. Enter the model under Edit vehicle.";
        }
      }
    }
    description.textContent = "";
    activeListing = listingData;
    setLookupStatus("listing", isSearch ? "Right-click preview" : "Open listing");
    const saved = getConfirmations(listingData);
    if (isSearch) saved.sourceTabUrl = tab.url;
    const postDescription = listingData.sellerDescription || "";
    if (saved.post?.description !== postDescription) {
      saved.post = { description: postDescription, issues: findSellerIssues(postDescription) };
      confirmedByTab.set(listingData.tabId, saved);
    }
    const { vehicle } = saved;
    const fields = vehicle || listingData;
    yearInput.value = String(fields.year ?? "");
    makeInput.value = fields.make || "";
    modelInput.value = fields.model || "";
    trimInput.value = fields.trim || "";
    mileageInput.value = fields.mileageMiles == null ? "" : String(fields.mileageMiles);
    document.getElementById("previewPostTitle").textContent = listingData.postTitle || "No title found.";
    document.getElementById("previewPostDescription").textContent = postDescription || "No description found.";
    showVehicleMode(false, Boolean(vehicle));
    if (vehicle) setStatus(verificationStatus, vehicleConfirmedMessage(vehicle));
    showListingJson(listingData);
    vehicleForm.hidden = false;
    sellerPost.hidden = false;
    scrapedDetails.hidden = false;
    formatted.hidden = false;
    updateDebugVisibility();
  } catch {
    if (request !== latestRequest) return;
    description.textContent = "Could not read the listing details.";
  }
}

chrome.tabs.onActivated.addListener(showListing);
chrome.tabs.onUpdated.addListener((tabId, change, tab) => {
  if (change.url) clearPreviewAfterLeaving(tabId, change.url).catch(console.error);
  const saved = confirmedByTab.get(tabId);
  const sameListingPage = saved?.sourceTabUrl
    ? samePreviewSearch(saved.sourceTabUrl, tab.url)
    : saved?.listingUrl === tab.url;
  if (saved && (change.url || change.status) && !sameListingPage) {
    confirmedByTab.delete(tabId);
  }
  if (tab.active && tabId === displayedTabId && (change.url || change.status) &&
      !samePreviewSearch(displayedSearchUrl, tab.url)) showListing();
});
chrome.tabs.onRemoved.addListener((tabId) => confirmedByTab.delete(tabId));
watchPreviewSelections(showListing);
showListing();
