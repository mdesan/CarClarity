function identityKey(value) {
  return (value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
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
