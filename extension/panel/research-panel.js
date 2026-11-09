let activeResearch = null;
const researchStatus = document.getElementById("researchStatus");
const researchSpecs = document.getElementById("researchSpecs");
const researchFuelEconomy = document.getElementById("researchFuelEconomy");
const researchSpecGuide = document.getElementById("researchSpecGuide");
const researchExtraSpecs = document.getElementById("researchExtraSpecs");
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
  researchSpecs.hidden = true;
  researchFuelEconomy.hidden = true;
  researchSpecGuide.hidden = true;
  researchSpecGuide.open = false;
  researchComplaintsSection.hidden = true;
  complaintDebug.hidden = true;
  complaintDebugStatus.textContent = "";
  researchRecallsSection.hidden = true;
  researchRecallsSection.open = false;
  researchSourcesDetails.hidden = true;
  researchJsonPreview.textContent = "";
  showUnavailableElements("Vehicle research");
  for (const section of [researchSpecs, researchFuelEconomy, researchExtraSpecs, researchComplaints,
    complaintDebugRows, researchRecalls, researchSources, vinRecallCheck]) {
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
  return [["combined", combined], ["city", city], ["highway", highway]]
    .filter(([, value]) => Number.isFinite(value))
    .map(([label, value]) => value + " " + unit + " " + label)
    .join(" · ");
}

let fuelBenchmarksRequest;

async function loadFuelBenchmarks() {
  const response = await fetch(chrome.runtime.getURL("data/fuel-class-benchmarks.json"));
  if (!response.ok) throw new Error("Fuel class benchmarks could not be loaded.");
  const records = await response.json();
  return new Map(records.map(([year, vehicleClass, fuel, mpg, count]) =>
    [JSON.stringify([year, vehicleClass, fuel]), { mpg, count }]));
}

function fuelUseComparison(combined, referenceMpg) {
  const label = combined <= referenceMpg * 0.8 ? "Below typical for its class" :
    combined >= referenceMpg * 1.2 ? "Above typical for its class" : "Typical for its class";
  const difference = Math.round(1000 / combined - 1000 / referenceMpg);
  const gallons = Math.abs(difference);
  const impact = difference ? " About " + gallons + (gallons === 1 ? " gallon " : " gallons ") +
    (difference > 0 ? "more" : "fewer") + " per 1,000 miles." : "";
  return { label, impact };
}

async function showFuelClassComparison(row, combined, unit, { year, vehicleClass, fuelType, electrification }) {
  const fuel = fuelType?.trim().toLowerCase();
  if (unit !== "MPG" || !Number.isFinite(combined) || combined <= 0 ||
      !vehicleClass || !fuel || fuelKind(electrification) === "plug-in hybrid") return;
  try {
    fuelBenchmarksRequest ??= loadFuelBenchmarks();
    const benchmarks = await fuelBenchmarksRequest;
    const match = benchmarks.get(JSON.stringify([year, vehicleClass, fuel]));
    if (!row.isConnected || !match) return;
    const { label, impact } = fuelUseComparison(combined, match.mpg);
    researchText(row, "strong", label);
    researchText(row, "span", " · " + match.mpg + " MPG median for this model year and EPA class." + impact);
    researchLink(researchText(row, "small", ""), "FuelEconomy.gov class data (" + match.count + " configurations)",
      "https://www.fueleconomy.gov/feg/download.shtml");
    row.hidden = false;
  } catch {
    fuelBenchmarksRequest = null;
  }
}

function showFuelEstimate(parent, city, highway, combined, unit, comparisonSpecs, fiveYearFuelSavingsUsd) {
  researchText(parent, "strong", fuelRatingText(null, null, combined, unit) ||
    fuelRatingText(city, highway, null, unit));
  const breakdown = fuelRatingText(city, highway, null, unit);
  if (Number.isFinite(combined) && breakdown) researchText(parent, "span", " · " + breakdown);
  researchText(parent, "small", "EPA estimate for this configuration");
  const comparison = researchText(parent, "p", "");
  comparison.hidden = true;
  showFuelClassComparison(comparison, combined, unit, comparisonSpecs);
  if (Number.isFinite(fiveYearFuelSavingsUsd) && fiveYearFuelSavingsUsd !== 0) {
    const saves = fiveYearFuelSavingsUsd > 0;
    const amount = Math.abs(fiveYearFuelSavingsUsd).toLocaleString("en-US", {
      style: "currency", currency: "USD", maximumFractionDigits: 0
    });
    const estimate = researchText(parent, "p", "EPA estimates " + amount +
      (saves ? " less" : " more") + " in fuel costs over 5 years compared with its average vehicle.");
    estimate.className = saves ? "fuel-cost-savings" : "fuel-cost-extra";
  }
}

function renderFuelEconomy(data) {
  researchFuelEconomy.hidden = false;
  researchText(researchFuelEconomy, "h3", "Fuel economy");
  const row = researchText(researchFuelEconomy, "div", "");
  if (data.fuelEconomyStatus === "available") {
    showFuelEstimate(row, data.cityMpg, data.highwayMpg, data.combinedMpg,
      data.fuelEconomyUnit, { year: data.year, vehicleClass: data.fuelEconomyClass,
        fuelType: data.fuelEconomyFuelType, electrification: data.fuelEconomyElectrification },
      data.fiveYearFuelSavingsUsd);
    return;
  }
  const select = researchText(row, "select", "");
  select.setAttribute("aria-label", "Fuel economy configuration");
  researchText(select, "option", "Choose a configuration").value = "";
  for (const option of data.fuelEconomyOptions) {
    researchText(select, "option", option.label).value = option.id;
  }
  const selected = researchText(row, "div", "");
  select.addEventListener("change", () => {
    if (activeResearch?.data !== data) return;
    const option = data.fuelEconomyOptions.find((item) => String(item.id) === select.value);
    activeResearch.selectedFuelOption = option || null;
    selected.replaceChildren();
    if (!option) {
      researchJsonPreview.textContent = JSON.stringify(data, null, 2);
      return;
    }
    showFuelEstimate(selected, option.cityMpg, option.highwayMpg, option.combinedMpg,
      option.unit, { year: data.year, vehicleClass: option.specs?.epaClass,
        fuelType: option.specs?.comparisonFuel, electrification: option.specs?.electrification },
      option.fiveYearFuelSavingsUsd);
    researchLink(selected, "FuelEconomy.gov", option.source.url);
    researchJsonPreview.textContent = JSON.stringify({
      ...data,
      cityMpg: option.cityMpg, highwayMpg: option.highwayMpg, combinedMpg: option.combinedMpg,
      fuelEconomyUnit: option.unit, fuelEconomyStatus: "available",
      fiveYearFuelSavingsUsd: option.fiveYearFuelSavingsUsd,
      fuelEconomyClass: option.specs?.epaClass ?? null,
      fuelEconomyFuelType: option.specs?.comparisonFuel ?? null,
      fuelEconomyElectrification: option.specs?.electrification ?? null,
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

function vehicleSynopsis(data, specs) {
  const name = [data.year, data.make, data.model].filter(Boolean).join(" ") || "vehicle";
  const { bodyStyle, transmission, drivetrain, seats } = specs;
  const features = [transmission, drivetrain].filter(Boolean);
  const sentences = [];
  if (bodyStyle) {
    const article = /^(SUV\b|[aeiou])/i.test(bodyStyle) ? "an" : "a";
    sentences.push("This " + name + " is " + article + " " + bodyStyle +
      (features.length ? " with " + features.join(" and ") : "") + ".");
  } else if (features.length) {
    sentences.push("This " + name + " has " + features.join(" and ") + ".");
  }
  if (seats) sentences.push((sentences.length ? "It" : "This " + name) + " seats " + seats + ".");
  const listedType = fuelKind([data.model, data.trim].filter(Boolean).join(" "));
  const fuel = fuelKind(data.electrification) ||
    (listedType === "hybrid" || listedType === "plug-in hybrid" ? listedType : null) ||
    fuelKind(data.fuelType || specs.fuelType);
  const fuelNotes = {
    electric: "An all-electric car skips gas stops. Check battery health and where you can charge.",
    gas: "A gas car is quick to refuel. Use the MPG rating to compare fuel costs when available.",
    hybrid: "A hybrid can use less gas, especially around town. Ask about the battery’s condition.",
    "plug-in hybrid": "A plug-in hybrid can use less gas if you charge it regularly. Check its electric range and battery condition."
  };
  if (fuelNotes[fuel]) sentences.push(fuelNotes[fuel]);
  return sentences.join(" ");
}

function renderResearch(data, sellerSpecs) {
  researchStatus.textContent = "";
  const missing = [];
  const fields = {
    bodyStyle: "Body style", engine: "Engine", transmission: "Transmission",
    drivetrain: "Drivetrain", fuelType: "Fuel type", seats: "Seating"
  };
  const synopsisSpecs = {};
  const driveLabels = {
    AWD: "All-wheel drive", FWD: "Front-wheel drive", RWD: "Rear-wheel drive",
    "4WD": "Four-wheel drive", "2WD": "Two-wheel drive"
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
    if (field === "seats") {
      synopsisSpecs.seats = value;
      continue;
    }
    const label = (field === "drivetrain" && driveLabels[normalizeDrivetrain(value)]) ||
      value.charAt(0).toUpperCase() + value.slice(1);
    if (field === "engine" || field === "fuelType") {
      if (field === "fuelType") synopsisSpecs.fuelType = value;
      researchText(researchExtraSpecs, "dt", name);
      const row = researchText(researchExtraSpecs, "dd", label);
      if (source) researchText(row, "small", source);
    } else {
      let phrase = /^(SUV|MPV)\b/.test(label) ? label : label.toLowerCase();
      if (field === "bodyStyle" && /sport utility/i.test(phrase)) phrase = "SUV";
      if (field === "transmission") {
        if (/^auto/i.test(phrase)) phrase = "an automatic transmission";
        else if (/^manual/i.test(phrase)) phrase = "a manual transmission";
        else if (/\bcvt\b|continuously variable/.test(phrase)) phrase = "a continuously variable transmission (CVT)";
        else phrase = "a " + (phrase.includes("transmission") ? phrase : phrase + " transmission");
      }
      synopsisSpecs[field] = phrase + (source === "Seller-reported" ? " (seller-reported)" : "");
    }
  }
  if (data.fuelEconomyStatus === "available" || data.fuelEconomyOptions?.length) {
    renderFuelEconomy(data);
  } else {
    missing.push("Fuel economy — " + (data.fuelEconomyNote || "No rating was returned."));
  }
  researchSpecs.textContent = vehicleSynopsis(data, synopsisSpecs);
  researchSpecs.hidden = !researchSpecs.textContent;
  researchOverview.hidden = researchSpecs.hidden && researchFuelEconomy.hidden && !researchExtraSpecs.childElementCount;
  researchSpecGuide.hidden = researchOverview.hidden;
  if (researchOverview.hidden) missing.push("Vehicle overview — no specs to display.");
  researchRecallsSection.hidden = data.recallStatus !== "available";
  researchRecallsSummary.textContent = "Possible model recall campaigns" +
    (data.recallStatus === "available" ? " (" + data.recalls.length + ")" : "");

  if (data.complaintStatus !== "available") {
    missing.push("Owner complaints for this model — NHTSA data unavailable.");
  } else {
    renderOwnerComplaints(data);
  }

  if (data.recallStatus !== "available") {
    missing.push("Possible model recall campaigns — NHTSA data unavailable.");
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
