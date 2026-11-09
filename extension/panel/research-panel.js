let activeResearch = null;
const researchStatus = document.getElementById("researchStatus");
const researchSpecs = document.getElementById("researchSpecs");
const researchComplaints = document.getElementById("researchComplaints");
const researchRecalls = document.getElementById("researchRecalls");
const researchSources = document.getElementById("researchSources");
const researchSourcesDetails = document.getElementById("researchSourcesDetails");
const researchDebug = document.getElementById("researchDebug");
const researchJsonPreview = document.getElementById("researchJson");
const researchOverview = document.getElementById("researchOverview");
const researchComplaintsSection = document.getElementById("researchComplaintsSection");
const researchRecallsSection = document.getElementById("researchRecallsSection");
const researchDiagnostics = document.getElementById("researchDiagnostics");
const vinRecallCheck = document.getElementById("vinRecallCheck");

function resetResearch() {
  activeResearch = null;
  researchStatus.textContent = "";
  researchDebug.hidden = true;
  researchOverview.hidden = true;
  researchComplaintsSection.hidden = true;
  researchRecallsSection.hidden = true;
  researchSourcesDetails.hidden = true;
  researchJsonPreview.textContent = "";
  for (const section of [researchSpecs, researchComplaints, researchRecalls, researchSources, researchDiagnostics, vinRecallCheck]) {
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
  if (data.fuelEconomyStatus !== "available") {
    researchText(researchDiagnostics, "li", data.fuelEconomyNote || "Fuel economy is unavailable.");
    if (!data.fuelEconomyOptions?.length) return;
  }
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

function renderResearch(data, sellerSpecs) {
  researchStatus.textContent = "";
  if (data.status === "unavailable") researchText(researchDiagnostics, "li", "External research unavailable.");
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
      researchText(researchDiagnostics, "li", name + " is unavailable.");
      continue;
    }
    researchText(researchSpecs, "dt", name);
    const row = researchText(researchSpecs, "dd", value);
    if (source) researchText(row, "small", source);
  }
  renderFuelEconomy(data);
  researchOverview.hidden = !researchSpecs.childElementCount;
  researchComplaintsSection.hidden = data.complaintStatus !== "available";
  researchRecallsSection.hidden = data.recallStatus !== "available";

  if (data.complaintStatus !== "available") {
    researchText(researchDiagnostics, "li", "NHTSA complaint data is unavailable for this model.");
  } else if (!data.complaintCount) {
    researchText(researchComplaints, "p", "NHTSA returned no complaints for the model name checked.");
  } else {
    researchText(researchComplaints, "p", data.complaintCount + " NHTSA owner reports. Counts can overlap.");
    const list = document.createElement("ul");
    const named = data.complaints.filter(({ component }) => !/^(unknown or other|unspecified)$/i.test(component));
    for (const { component, count } of named.slice(0, 5)) {
      researchText(list, "li", safetyLabel(component) + " (" + count + ")");
    }
    if (named.length) researchComplaints.append(list);
  }

  if (data.recallStatus !== "available") {
    researchText(researchDiagnostics, "li", "NHTSA model recall data is unavailable.");
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
  }
  for (const source of data.sources) {
    researchLink(researchText(researchSources, "li", ""), source.name, source.url);
  }
  researchSourcesDetails.hidden = !researchSources.childElementCount;
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
    researchText(researchDiagnostics, "li", "Vehicle research failed: " + error.message);
    researchDebug.hidden = false;
  }
}
