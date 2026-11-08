const fuelEconomyBase = "https://www.fueleconomy.gov/ws/rest/vehicle";
const safetyBase = "https://api.nhtsa.gov";

function positiveNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function normalizeDrivetrain(value) {
  const text = (value || "").toLowerCase().replace(/[-–—]/g, " ");
  const types = [
    ["AWD", /\b(?:awd|all\s+wheel\s+drive|4matic)\b/],
    ["4WD", /\b(?:4wd|4\s*x\s*4|(?:4|four)\s+wheel\s+drive)\b/],
    ["FWD", /\b(?:fwd|front\s+wheel\s+drive)\b/],
    ["RWD", /\b(?:rwd|rear\s+wheel\s+drive)\b/],
    ["2WD", /\b(?:2wd|4\s*x\s*2|(?:2|two)\s+wheel\s+drive)\b/]
  ];
  const matches = types.filter(([, pattern]) => pattern.test(text));
  return matches.length === 1 ? matches[0][0] : null;
}

function engineLabel(displacement, cylinderCount) {
  const liters = positiveNumber(displacement);
  const cylinders = positiveNumber(cylinderCount);
  const parts = [];
  if (liters) parts.push(liters + " L");
  if (cylinders) parts.push(cylinders + " cylinders");
  return parts.join(", ") || null;
}

async function researchJson(url, signal) {
  const response = await fetch(url, { signal, headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error("HTTP " + response.status);
  return response.json();
}

function menuValues(data) {
  const items = data?.menuItem;
  if (!items) return [];
  return (Array.isArray(items) ? items : [items]).map((item) => item.value).filter(Boolean);
}

function mercedesVariant(vehicle, vinData) {
  if (identityKey(vehicle.make) !== "mercedesbenz" || !vinData?.trim) return null;
  const base = vehicle.model.replace(/-class$/i, "");
  const trim = identityKey(vinData.trim);
  if (!trim.startsWith(identityKey(base))) return null;
  const match = trim.slice(identityKey(base).length).match(/^(\d{3})(4m|4matic)?$/);
  if (!match) return null;
  return { compact: base + match[1], spaced: base + " " + match[1], fourMatic: Boolean(match[2]) };
}

async function lookUpFuelEconomy(vehicle, variant, signal) {
  const params = new URLSearchParams({ year: vehicle.year, make: vehicle.make });
  const menu = await researchJson(fuelEconomyBase + "/menu/model?" + params, signal);
  const base = identityKey(vehicle.model.replace(/-class$/i, ""));
  const exactVariant = variant?.fourMatic ? identityKey(variant.compact + " 4matic") : null;
  const candidates = [...new Set(menuValues(menu))].filter((name) => {
    const key = identityKey(name);
    return exactVariant ? key === exactVariant : key.startsWith(base);
  });
  if (!candidates.length) return { status: "unavailable", reason: "No matching fuel economy entry was found." };
  const ambiguous = { status: "ambiguous", reason: "Unavailable · exact configuration unclear." };
  // Limit the number of lookups for models with many configurations.
  if (candidates.length > 8) return ambiguous;
  const exactModel = candidates.length === 1 && (exactVariant || identityKey(candidates[0]) === base);
  if (candidates.length === 1 && !exactModel) return ambiguous;
  try {
    const options = await Promise.all(candidates.map(async (model) => {
      const query = new URLSearchParams(params);
      query.set("model", model);
      const menu = await researchJson(fuelEconomyBase + "/menu/options?" + query, signal);
      return [...new Set(menuValues(menu))].map((id) => ({ id, model }));
    }));
    const entries = options.flat();
    if (!entries.length || options.some((group) => !group.length)) {
      return { status: "unavailable", reason: "No complete fuel economy data was found." };
    }
    if (entries.length > 12) return ambiguous;
    const records = await Promise.all(entries.map(async ({ id, model }) => {
      const record = await researchJson(fuelEconomyBase + "/" + encodeURIComponent(id), signal);
      if (Number(record.year) !== vehicle.year || identityKey(record.make) !== identityKey(vehicle.make) ||
          identityKey(record.model) !== identityKey(model)) throw new Error("Fuel economy record mismatch");
      return record;
    }));
    if (!exactModel || records.length > 1) {
      const specs = fuelSpecs(records[0], true);
      for (const record of records.slice(1)) {
        const next = fuelSpecs(record, true);
        for (const field of Object.keys(specs)) {
          if (specs[field] !== next[field]) specs[field] = null;
        }
      }
      return {
        ...ambiguous, specs,
        source: { name: "FuelEconomy.gov (shared model specs)", url: "https://www.fueleconomy.gov/feg/findacar.shtml" }
      };
    }
    return fuelRatings(records[0], entries[0].id);
  } catch (error) {
    if (!exactModel) return ambiguous;
    throw error;
  }
}

function fuelSpecs(record, commonOnly = false) {
  const vehicleClass = record.VClass || "";
  let bodyStyle = null;
  if (/sport utility/i.test(vehicleClass)) bodyStyle = "SUV";
  else if (/wagon|minivan|pickup|passenger van/i.test(vehicleClass)) {
    bodyStyle = vehicleClass.replace(/\s+(?:2WD|4WD|AWD)$/i, "");
  }
  let transmission = record.trany || null;
  if (commonOnly && transmission?.startsWith("Auto")) transmission = "Automatic";
  return {
    bodyStyle,
    engine: engineLabel(record.displ, record.cylinders),
    transmission,
    drivetrain: record.drive || null,
    fuelType: record.fuelType1 || null
  };
}

function fuelRatings(record, id) {
  const cityMpg = positiveNumber(record.city08);
  const highwayMpg = positiveNumber(record.highway08);
  const combinedMpg = positiveNumber(record.comb08);
  return {
    status: cityMpg || highwayMpg || combinedMpg ? "available" : "unavailable",
    reason: "No fuel economy ratings were returned for this configuration.",
    cityMpg, highwayMpg, combinedMpg,
    unit: record.fuelType1 === "Electricity" ? "MPGe" : "MPG",
    specs: fuelSpecs(record),
    source: { name: "FuelEconomy.gov", url: "https://www.fueleconomy.gov/feg/noframes/" + encodeURIComponent(id) + ".shtml" }
  };
}

async function lookUpSafety(kind, vehicle, modelNames, signal) {
  const requests = modelNames.map(async (model) => {
    const params = new URLSearchParams({ make: vehicle.make, model, modelYear: vehicle.year });
    const url = safetyBase + "/" + kind + "/" + kind + "ByVehicle?" + params;
    const data = await researchJson(url, signal);
    if (!Array.isArray(data.results)) throw new Error("Unexpected safety response");
    return { url, model, rows: data.results };
  });
  const results = await Promise.allSettled(requests);
  const records = new Map();
  const sources = [];
  const matchedModels = [];
  for (const result of results) {
    if (result.status !== "fulfilled") continue;
    sources.push({ name: "NHTSA " + kind + " (" + result.value.model + ")", url: result.value.url });
    matchedModels.push(result.value.model);
    for (const row of result.value.rows) {
      const id = kind === "recalls" ? row.NHTSACampaignNumber : row.odiNumber;
      if (id && !records.has(id)) records.set(id, row);
    }
  }
  return { status: sources.length ? "available" : "unavailable", rows: [...records.values()], sources, matchedModels };
}

function complaintGroups(rows) {
  const counts = new Map();
  for (const row of rows) {
    const components = new Set((row.components || "Unspecified").split(/[,;]/).map((part) => part.trim()).filter(Boolean));
    for (const component of components) counts.set(component, (counts.get(component) || 0) + 1);
  }
  return [...counts].map(([component, count]) => ({ component, count })).sort((a, b) => b.count - a.count);
}

async function researchVehicle(vehicle, vinData) {
  const signal = AbortSignal.timeout(8000);
  const variant = mercedesVariant(vehicle, vinData);
  const names = [...new Set([vehicle.model, variant?.compact, variant?.spaced].filter(Boolean))];
  const [fuel, complaints, recalls] = await Promise.all([
    lookUpFuelEconomy(vehicle, variant, signal).catch(() => ({ status: "unavailable", reason: "FuelEconomy.gov could not be reached or returned unusable data." })),
    lookUpSafety("complaints", vehicle, names, signal),
    lookUpSafety("recalls", vehicle, names, signal)
  ]);
  const specs = {};
  const specSources = {};
  for (const field of ["bodyStyle", "engine", "transmission", "drivetrain", "fuelType"]) {
    specs[field] = vinData?.specs?.[field] || fuel.specs?.[field] || null;
    specSources[field] = vinData?.specs?.[field] ? "NHTSA VIN decode" : fuel.specs?.[field] ? fuel.source.name : null;
  }
  const hasSpecs = Object.values(specs).some(Boolean);
  const availableCount = Number(hasSpecs) + [fuel, complaints, recalls].filter((part) => part.status === "available").length;
  const sources = [...complaints.sources, ...recalls.sources];
  if (vinData?.specs && Object.values(vinData.specs).some(Boolean)) {
    sources.push({ name: "NHTSA VIN decode", url: "https://vpic.nhtsa.dot.gov/decoder/" });
  }
  if (fuel.source) sources.push(fuel.source);
  return {
    year: vehicle.year, make: vehicle.make, model: vehicle.model,
    ...specs, specSources,
    cityMpg: fuel.cityMpg ?? null, highwayMpg: fuel.highwayMpg ?? null, combinedMpg: fuel.combinedMpg ?? null,
    fuelEconomyUnit: fuel.unit || "MPG", fuelEconomyStatus: fuel.status,
    fuelEconomyNote: fuel.status === "available" ? null : fuel.reason,
    configurationUncertain: fuel.status === "ambiguous",
    complaintStatus: complaints.status, complaintCount: complaints.rows.length,
    complaints: complaintGroups(complaints.rows),
    recallStatus: recalls.status,
    recalls: recalls.rows.map((row) => ({
      campaignId: row.NHTSACampaignNumber, component: row.Component || null,
      model: row.Model || null, summary: row.Summary || null, remedy: row.Remedy || null
    })),
    vinRecallStatus: "unverified",
    vinRecallUrl: vehicle.vin ? "https://www.nhtsa.gov/recalls?vin=" + encodeURIComponent(vehicle.vin) : null,
    sources,
    status: availableCount === 4 && Object.values(specs).every(Boolean)
      ? "complete" : availableCount ? "partial" : "unavailable"
  };
}
