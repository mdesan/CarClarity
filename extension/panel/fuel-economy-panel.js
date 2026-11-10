const researchFuelEconomy = document.getElementById("researchFuelEconomy");
const fuelComparisonDebug = document.getElementById("fuelComparisonDebug");

function resetFuelEconomy() {
  setLookupStatus("fuel");
  researchFuelEconomy.hidden = true;
  researchFuelEconomy.replaceChildren();
  fuelComparisonDebug.textContent = "";
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

async function showFuelClassComparison(row, combined, unit, { id, year, vehicleClass, fuelType, electrification }) {
  const fuel = fuelType?.trim().toLowerCase();
  const key = JSON.stringify([year, vehicleClass ?? null, fuel ?? null]);
  const lookup = "EPA configuration ID: " + (id ?? "No single configuration ID") + "\nClass lookup key: " + key;
  if (unit !== "MPG" || !Number.isFinite(combined) || combined <= 0 ||
      fuelKind(electrification) === "plug-in hybrid") {
    fuelComparisonDebug.textContent = lookup + "\nNo eligible combined MPG for this comparison.";
    return;
  }
  if (!vehicleClass || !fuel) {
    fuelComparisonDebug.textContent = lookup + "\nEPA class or eligible fuel grade unavailable.";
    return;
  }
  fuelComparisonDebug.textContent = lookup + "\nLooking up the class benchmark…";
  try {
    fuelBenchmarksRequest ??= loadFuelBenchmarks();
    const benchmarks = await fuelBenchmarksRequest;
    if (!row.isConnected) return;
    const match = benchmarks.get(key);
    if (!match) {
      fuelComparisonDebug.textContent = lookup + "\nNo benchmark for this group in the bundle (at least five configurations required).";
      return;
    }
    const { label, impact } = fuelUseComparison(combined, match.mpg);
    fuelComparisonDebug.textContent = lookup + "\nMedian combined MPG: " + match.mpg +
      "\nConfigurations in sample: " + match.count;
    researchText(row, "strong", label);
    researchText(row, "span", " · " + match.mpg + " MPG median for this model year and EPA class." + impact);
    researchLink(researchText(row, "small", ""), "FuelEconomy.gov class data (" + match.count + " configurations)",
      "https://www.fueleconomy.gov/feg/download.shtml");
    row.hidden = false;
  } catch {
    fuelBenchmarksRequest = null;
    if (row.isConnected) fuelComparisonDebug.textContent = lookup + "\nCould not load the class benchmark bundle.";
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

function renderFuelEconomy(data, isCurrent) {
  researchFuelEconomy.hidden = false;
  researchText(researchFuelEconomy, "h3", "Fuel economy");
  const row = researchText(researchFuelEconomy, "div", "");
  if (data.fuelEconomyStatus === "available") {
    showFuelEstimate(row, data.cityMpg, data.highwayMpg, data.combinedMpg,
      data.fuelEconomyUnit, { id: data.fuelEconomyVehicleId, year: data.year, vehicleClass: data.fuelEconomyClass,
        fuelType: data.fuelEconomyFuelType, electrification: data.fuelEconomyElectrification },
      data.fiveYearFuelSavingsUsd);
    return;
  }
  const select = researchText(row, "select", "");
  fuelComparisonDebug.textContent = "Choose an EPA configuration to see the class lookup.";
  select.setAttribute("aria-label", "Fuel economy configuration");
  researchText(select, "option", "Choose a configuration").value = "";
  for (const option of data.fuelEconomyOptions) {
    researchText(select, "option", option.label).value = option.id;
  }
  const selected = researchText(row, "div", "");
  select.addEventListener("change", () => {
    if (!isCurrent()) return;
    const option = data.fuelEconomyOptions.find((item) => String(item.id) === select.value);
    selected.replaceChildren();
    if (!option) {
      setLookupStatus("fuel", "Waiting for configuration selection");
      fuelComparisonDebug.textContent = "Choose an EPA configuration to see the class lookup.";
      researchJsonPreview.textContent = JSON.stringify(data, null, 2);
      return;
    }
    setLookupStatus("fuel", "Loaded selected configuration");
    showFuelEstimate(selected, option.cityMpg, option.highwayMpg, option.combinedMpg,
      option.unit, { id: option.id, year: data.year, vehicleClass: option.specs?.epaClass,
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
