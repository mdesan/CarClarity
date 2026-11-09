let activeResearch = null;
const researchStatus = document.getElementById("researchStatus");
const researchSpecs = document.getElementById("researchSpecs");
const researchComplaints = document.getElementById("researchComplaints");
const researchRecalls = document.getElementById("researchRecalls");
const researchSources = document.getElementById("researchSources");
const researchDebug = document.getElementById("researchDebug");
const researchJsonPreview = document.getElementById("researchJson");

function resetResearch() {
  activeResearch = null;
  researchStatus.textContent = "";
  researchDebug.hidden = true;
  researchJsonPreview.textContent = "";
  for (const section of [researchSpecs, researchComplaints, researchRecalls, researchSources]) {
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

function renderResearch(data, sellerSpecs) {
  researchStatus.textContent = data.status === "unavailable" ? "External research unavailable." : "";
  const fields = {
    bodyStyle: "Body style", engine: "Engine", transmission: "Transmission",
    drivetrain: "Drivetrain", fuelType: "Fuel type"
  };
  for (const [field, name] of Object.entries(fields)) {
    researchText(researchSpecs, "dt", name);
    const sellerValue = field === "engine"
      ? engineLabel(null, sellerSpecs?.cylinders) : sellerSpecs?.[field];
    const source = data[field] ? data.specSources[field] : sellerValue ? "Seller-reported" : "";
    const value = data[field] || sellerValue || "Unavailable";
    const row = researchText(researchSpecs, "dd", value);
    if (source) researchText(row, "small", source);
  }
  researchText(researchSpecs, "dt", "Fuel economy");
  if (data.fuelEconomyStatus === "available") {
    const ratings = [["city", data.cityMpg], ["highway", data.highwayMpg], ["combined", data.combinedMpg]];
    const text = ratings.filter(([, value]) => value !== null).map(([label, value]) => value + " " + label).join(", ");
    researchText(researchSpecs, "dd", text + " " + data.fuelEconomyUnit + " · FuelEconomy.gov");
  } else {
    researchText(researchSpecs, "dd", data.fuelEconomyNote);
  }

  if (data.complaintStatus !== "available") {
    researchText(researchComplaints, "p", "NHTSA complaint data is unavailable for this model.");
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
    researchText(researchRecalls, "p", "NHTSA model recall data is unavailable.");
  } else if (!data.recalls.length) {
    researchText(researchRecalls, "p", "NHTSA returned no campaigns for the model name checked.");
  } else {
    for (const recall of data.recalls) {
      const row = document.createElement("details");
      researchText(row, "summary", safetyLabel(recall.component || "Component unavailable"));
      researchText(row, "p", "Campaign ID: " + recall.campaignId);
      if (recall.model) researchText(row, "p", "NHTSA model: " + recall.model);
      if (recall.summary) researchText(row, "p", recall.summary);
      if (recall.remedy) researchText(row, "p", "Remedy: " + recall.remedy);
      researchRecalls.append(row);
    }
  }
  if (data.vinRecallUrl) {
    researchLink(researchText(researchRecalls, "p", ""), "Check this listing’s VIN for unrepaired recalls on NHTSA", data.vinRecallUrl);
  } else {
    researchText(researchRecalls, "p", "Ask for the VIN to check for unrepaired recalls.");
  }
  for (const source of data.sources) {
    researchLink(researchText(researchSources, "li", ""), source.name, source.url);
  }
  researchJsonPreview.textContent = JSON.stringify(data, null, 2);
  researchDebug.hidden = false;
}

async function showVehicleResearch(vehicle, vinData) {
  const key = JSON.stringify([vehicle.tabId, vehicle.listingUrl, vehicle.year, vehicle.make, vehicle.model, vehicle.vin]);
  if (activeResearch?.key === key) return;
  resetResearch();
  const request = { key };
  activeResearch = request;
  researchStatus.textContent = "Looking up vehicle specs and safety information…";
  try {
    const data = await researchVehicle(vehicle, vinData);
    if (activeResearch !== request) return;
    request.data = data;
    renderResearch(data, vehicle.sellerSpecs);
  } catch {
    if (activeResearch === request) researchStatus.textContent = "Vehicle research is unavailable right now.";
  }
}
