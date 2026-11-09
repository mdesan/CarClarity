let activeResearch = null;
const researchStatus = document.getElementById("researchStatus");
const researchSpecs = document.getElementById("researchSpecs");
const researchComplaints = document.getElementById("researchComplaints");
const complaintDebug = document.getElementById("complaintDebug");
const complaintDebugStatus = document.getElementById("complaintDebugStatus");
const complaintDebugRows = document.getElementById("complaintDebugRows");
const researchRecalls = document.getElementById("researchRecalls");
const researchSources = document.getElementById("researchSources");
const researchSourcesDetails = document.getElementById("researchSourcesDetails");
const researchDebug = document.getElementById("researchDebug");
const researchJsonPreview = document.getElementById("researchJson");
const researchOverview = document.getElementById("researchOverview");
const researchComplaintsSection = document.getElementById("researchComplaintsSection");
const researchRecallsSection = document.getElementById("researchRecallsSection");
const researchRecallsSummary = document.getElementById("researchRecallsSummary");
const vinRecallCheck = document.getElementById("vinRecallCheck");

function resetResearch() {
  activeResearch = null;
  researchStatus.textContent = "";
  researchDebug.hidden = true;
  researchOverview.hidden = true;
  researchComplaintsSection.hidden = true;
  complaintDebug.hidden = true;
  complaintDebugStatus.textContent = "";
  researchRecallsSection.hidden = true;
  researchRecallsSection.open = false;
  researchSourcesDetails.hidden = true;
  researchJsonPreview.textContent = "";
  showUnavailableElements("Vehicle research");
  for (const section of [researchSpecs, researchComplaints, complaintDebugRows, researchRecalls, researchSources, vinRecallCheck]) {
    section.replaceChildren();
  }
}

function researchText(parent, tag, text) {
  const element = document.createElement(tag);
  element.textContent = text;
  parent.append(element);
  return element;
}

function researchLink(parent, name, url) {
  const link = researchText(parent, "a", name);
  link.href = url;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
}

function safetyLabel(component) {
  const labels = {
    "SERVICE BRAKES": "Brakes",
    "EXTERIOR LIGHTING": "Exterior lights",
    "EQUIPMENT:OTHER:LABELS": "Equipment labels",
    "TIRES:TEMPORARY/EMERGENCY SPARE TIRE": "Temporary spare tire",
    "ELECTRICAL SYSTEM:12V/24V/48V BATTERY": "Battery and electrical system"
  };
  const label = labels[component] || component.toLowerCase().replace(/\s*:\s*/g, " › ");
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function fuelRatingText(city, highway, combined, unit) {
  return [["city", city], ["highway", highway], ["combined", combined]]
    .filter(([, value]) => value !== null)
    .map(([label, value]) => value + " " + label)
    .join(", ") + " " + unit;
}

function renderFuelEconomy(data) {
  researchText(researchSpecs, "dt", "Fuel economy");
  const row = researchText(researchSpecs, "dd", "");
  if (data.fuelEconomyStatus === "available") {
    row.textContent = fuelRatingText(data.cityMpg, data.highwayMpg, data.combinedMpg, data.fuelEconomyUnit) + " · FuelEconomy.gov";
    return;
  }
  const select = researchText(row, "select", "");
  select.setAttribute("aria-label", "Fuel economy configuration");
  researchText(select, "option", "Select configuration").value = "";
  for (const option of data.fuelEconomyOptions) {
    const rating = fuelRatingText(option.cityMpg, option.highwayMpg, option.combinedMpg, option.unit);
    researchText(select, "option", option.label + " · " + rating).value = option.id;
  }
  const selected = researchText(row, "p", "");
  select.addEventListener("change", () => {
    if (activeResearch?.data !== data) return;
    const option = data.fuelEconomyOptions.find((item) => String(item.id) === select.value);
    activeResearch.selectedFuelOption = option || null;
    selected.replaceChildren();
    if (!option) {
      researchJsonPreview.textContent = JSON.stringify(data, null, 2);
      return;
    }
    const rating = fuelRatingText(option.cityMpg, option.highwayMpg, option.combinedMpg, option.unit);
    researchText(selected, "span", rating + " · ");
    researchLink(selected, "FuelEconomy.gov", option.source.url);
    researchJsonPreview.textContent = JSON.stringify({
      ...data,
      cityMpg: option.cityMpg, highwayMpg: option.highwayMpg, combinedMpg: option.combinedMpg,
      fuelEconomyUnit: option.unit, fuelEconomyStatus: "available",
      fuelEconomyVehicleId: option.id, fuelEconomySelection: "buyer-selected",
      fuelEconomyNote: null, configurationUncertain: false,
      sources: [...data.sources, option.source]
    }, null, 2);
  });
}

function renderOwnerComplaints(data) {
  const total = data.complaintCount;
  complaintDebug.hidden = false;
  for (const { component, count } of data.complaints) {
    const named = !/^(unknown or other|unspecified)$/i.test(component);
    const worthChecking = named && count >= 10 && count * 100 >= total * 15;
    const list = worthChecking ? researchComplaints : complaintDebugRows;
    researchText(list, "li", safetyLabel(component) + " — " + count + " of " + total + " reports");
  }
  researchComplaintsSection.hidden = !researchComplaints.childElementCount;
  const rule = "Highlights require at least 10 reports and at least 15% of reports for this model year.";
  complaintDebugStatus.textContent = total
    ? total + " distinct reports. " + rule +
      (complaintDebugRows.childElementCount ? "" : " All component counts qualified.")
    : "NHTSA returned no complaints for this model year.";
}

function renderResearch(data, sellerSpecs) {
  researchStatus.textContent = "";
  const missing = [];
  const fields = {
    bodyStyle: "Body style", engine: "Engine", transmission: "Transmission",
    drivetrain: "Drivetrain", fuelType: "Fuel type"
  };
  for (const [field, name] of Object.entries(fields)) {
    const sellerValue = field === "engine"
      ? engineLabel(null, sellerSpecs?.cylinders) : sellerSpecs?.[field];
    const source = data[field] ? data.specSources[field] : sellerValue ? "Seller-reported" : "";
    const value = data[field] || sellerValue;
    if (!value) {
      missing.push(name + " was not returned by research or listed by the seller.");
      continue;
    }
    researchText(researchSpecs, "dt", name);
    const row = researchText(researchSpecs, "dd", value);
    if (source) researchText(row, "small", source);
  }
  if (data.fuelEconomyStatus === "available" || data.fuelEconomyOptions?.length) {
    renderFuelEconomy(data);
  } else {
    missing.push("Fuel economy — " + (data.fuelEconomyNote || "No rating was returned."));
  }
  researchOverview.hidden = !researchSpecs.childElementCount;
  if (researchOverview.hidden) missing.push("Vehicle overview — no specs to display.");
  researchRecallsSection.hidden = data.recallStatus !== "available";
  researchRecallsSummary.textContent = "Model recall campaigns" +
    (data.recallStatus === "available" ? " (" + data.recalls.length + ")" : "");

  if (data.complaintStatus !== "available") {
    missing.push("Owner complaints for this model — NHTSA data unavailable.");
  } else {
    renderOwnerComplaints(data);
  }

  if (data.recallStatus !== "available") {
    missing.push("Model recall campaigns — NHTSA data unavailable.");
  } else if (!data.recalls.length) {
    researchText(researchRecalls, "p", "NHTSA returned no campaigns for the model name checked.");
  } else {
    for (const recall of data.recalls) {
      const row = document.createElement("details");
      researchText(row, "summary", recall.component ? safetyLabel(recall.component) : "Recall campaign");
      researchText(row, "p", "Campaign ID: " + recall.campaignId);
      if (recall.model) researchText(row, "p", "NHTSA model: " + recall.model);
      if (recall.summary) researchText(row, "p", recall.summary);
      if (recall.remedy) researchText(row, "p", "Remedy: " + recall.remedy);
      researchRecalls.append(row);
    }
  }
  if (data.vinRecallUrl) {
    researchLink(vinRecallCheck, "Check this listing’s VIN for unrepaired recalls on NHTSA", data.vinRecallUrl);
  } else {
    vinRecallCheck.textContent = "Ask for the VIN to check for unrepaired recalls.";
    missing.push("VIN recall lookup link — no matching VIN was available.");
  }
  for (const source of data.sources) {
    researchLink(researchText(researchSources, "li", ""), source.name, source.url);
  }
  researchSourcesDetails.hidden = !researchSources.childElementCount;
  if (researchSourcesDetails.hidden) missing.push("Research sources — no source links returned.");
  showUnavailableElements("Vehicle research", missing);
  researchJsonPreview.textContent = JSON.stringify(data, null, 2);
  researchDebug.hidden = false;
}

async function showVehicleResearch(vehicle, vinData) {
  const key = JSON.stringify([vehicle.tabId, vehicle.listingUrl, vehicle.year, vehicle.make, vehicle.model, vehicle.trim, vehicle.drivetrain, vehicle.vin]);
  if (activeResearch?.key === key) return;
  resetResearch();
  const request = { key };
  activeResearch = request;
  researchOverview.hidden = false;
  researchStatus.textContent = "Looking up vehicle specs and safety information…";
  try {
    const data = await researchVehicle(vehicle, vinData);
    if (activeResearch !== request) return;
    request.data = data;
    renderResearch(data, vehicle.sellerSpecs);
  } catch (error) {
    if (activeResearch !== request) return;
    resetResearch();
    showUnavailableElements("Vehicle research", ["Vehicle overview, owner complaints, and model recalls — lookup failed. " + error.message]);
  }
}
