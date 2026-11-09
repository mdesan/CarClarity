function identityKey(value) {
  return (value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

const modelCatalog = new Map();

function getVehicleModels(year, make) {
  const key = year + ":" + make.toLowerCase();
  if (!modelCatalog.has(key)) {
    const request = fetchVehicleModels(year, make).catch((error) => {
      modelCatalog.delete(key);
      throw error;
    });
    modelCatalog.set(key, request);
  }
  return modelCatalog.get(key);
}

async function fetchVehicleModels(year, make) {
  const url = "https://vpic.nhtsa.dot.gov/api/vehicles/GetModelsForMakeYear/make/" +
    encodeURIComponent(make) + "/modelyear/" + year + "?format=json";
  const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
  if (!response.ok) throw new Error("NHTSA lookup failed");
  const data = await response.json();
  return data.Results.filter((item) => item.Model_Name && identityKey(item.Make_Name) === identityKey(make));
}

function matchCatalogModel(listedModel, models) {
  let best = [];
  let prefix = "";
  let end = 0;
  for (const word of listedModel.matchAll(/[a-z0-9]+/gi)) {
    prefix += word[0].toLowerCase();
    const exact = models.filter((item) => identityKey(item.Model_Name) === prefix);
    const matches = exact.length ? exact : models.filter((item) => {
      // Some sellers omit a catalog prefix such as "Model" or a suffix such as "-Class".
      const shortName = item.Model_Name.replace(/^Model\s+(?=[a-z0-9]{1,2}$)/i, "").replace(/[-\s]+Class$/i, "");
      return identityKey(shortName) === prefix;
    });
    if (matches.length) {
      best = matches;
      end = word.index + word[0].length;
    }
  }
  if (new Set(best.map((item) => identityKey(item.Model_Name))).size !== 1) return null;

  const remainder = listedModel.slice(end).replace(/["“”]/g, "").trim();
  const trimText = remainder.replace(/(?:^|\s+)(?:(?:AWD|FWD|RWD|4WD|2WD|4MATIC|hybrid)(?:\s+|$))+$/i, "").trim();
  // Keep a short trim candidate from the vehicle field, never from the sales headline.
  const trim = /^[a-z0-9]+(?:-[a-z0-9]+)*(?:\s+[a-z0-9]+(?:-[a-z0-9]+)*){0,2}$/i.test(trimText) &&
    !/\b(?:sale|title|miles|warranty|clean|runs|work)\b/i.test(trimText) ? trimText.toUpperCase() : null;
  return { make: best[0].Make_Name, model: best[0].Model_Name, trim };
}

function catalogVehicleTitle(listing, match) {
  const parts = (listing.postTitle || "").split(/\s+[|*•]\s*/);
  const headline = parts[0].replace(/^[^\p{L}\p{N}]+/u, "").trim();
  const vehicle = [listing.year, match.make, match.model].join(" ");
  if (parts.length > 1 && identityKey(headline).startsWith(identityKey(vehicle))) return headline;
  return match.trim ? vehicle + " " + match.trim : vehicle;
}

async function findVehicle(year, make, model) {
  const models = await getVehicleModels(year, make);
  if (!models.length) {
    return { error: "NHTSA couldn’t find that make for " + year + ". Check the year and make spelling." };
  }
  const match = models.find((item) => identityKey(item.Model_Name) === identityKey(model));
  if (!match) {
    return { error: "NHTSA couldn’t find that model for " + year + " " + models[0].Make_Name + ". Check the model name." };
  }
  return { year, make: match.Make_Name, model: match.Model_Name };
}

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
      vehicleTitle: [year, make, model, trim].filter(Boolean).join(" "),
      specs: {
        bodyStyle: decoded.BodyClass?.trim() || null,
        engine: engineLabel(decoded.DisplacementL, decoded.EngineCylinders),
        transmission: decoded.TransmissionStyle?.trim() || null,
        drivetrain: decoded.DriveType?.trim() || null,
        fuelType: decoded.FuelTypePrimary?.trim() || null
      }
    };
  } catch {
    return null;
  }
}
