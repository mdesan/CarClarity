function readCraigslistListing(tabId) {
  // Shared links leave the category out of the URL. Read it from the breadcrumb.
  if (location.pathname.startsWith("/view/d/")) {
    const categoryLink = document.querySelector(".breadcrumbs .category a");
    if (!categoryLink) return null;

    const category = new URL(categoryLink.href).searchParams.get("cat");
    if (category !== "cta" && category !== "cto" && category !== "ctd") return null;
  }

  function text(selector) {
    return document.querySelector(selector)?.innerText.trim();
  }

  const title = text("#titletextonly");
  const description = text("#postingbody");
  if (!title && !description) return null;

  function readNumber(value, pattern, allowK = false) {
    const match = value?.match(pattern);
    if (!match) return null;
    let number = Number(match[1].replaceAll(",", ""));
    if (allowK && match[2]) number *= 1000;
    return Number.isFinite(number) && number <= Number.MAX_SAFE_INTEGER ? number : null;
  }

  const legacyVehicle = text(".attrgroup span.postingtitle");
  const legacyYear = legacyVehicle?.match(/^(\d{4}|['’]?\d{2})(?=\s|$)/)?.[1];
  const yearText = text(".attrgroup .year") || legacyYear || "";
  const nextYear = new Date().getFullYear() + 1;
  let year = null;
  if (/^\d{4}$/.test(yearText)) {
    year = Number(yearText);
  } else if (/^['’]?\d{2}$/.test(yearText)) {
    const shortYear = Number(yearText.slice(-2));
    year = 2000 + shortYear;
    if (year > nextYear) year -= 100;
  }
  if (year !== null && (year < 1900 || year > nextYear)) year = null;
  const legacyMakeModel = legacyYear ? legacyVehicle.slice(legacyYear.length).trim() : legacyVehicle;
  const vehicle = (text(".attrgroup .makemodel") || legacyMakeModel)
    ?.replace(/\s+/g, " ");

  // FuelEconomy.gov vehicles.csv: makes from 1984+ car, wagon, SUV, pickup,
  // minivan, two-seater, and passenger van records.
  const makes = [
    "acura", "alfa romeo", "asc incorporated", "aston martin", "audi", "aurora cars ltd",
    "autokraft limited", "avanti motor corporation", "bentley", "bertone", "bill dovell motor car company",
    "bitter gmbh and co. kg", "bmw", "bmw alpina", "bugatti", "bugatti rimac", "buick", "byd",
    "cadillac", "ccc engineering", "chevrolet", "chrysler", "coda automotive", "consulier industries inc",
    "cx automotive", "dabryan coach builders inc", "dacia", "daewoo", "daihatsu", "dodge", "eagle",
    "environmental rsch and devp corp", "evans automobiles", "excalibur autos", "federal coach",
    "ferrari", "fiat", "fisker", "ford", "genesis", "geo", "gmc", "goldacre", "honda", "hummer",
    "hyundai", "import foreign auto sales inc", "import trade services", "ineos automotive", "infiniti",
    "isis imports ltd", "isuzu", "j.k. motors", "jaguar", "jba motorcars, inc.", "jeep", "kandi", "karma",
    "kenyon corporation of america", "kia", "koenigsegg", "lambda control systems", "lamborghini",
    "land rover", "lexus", "lincoln", "london coach co inc", "lordstown", "lotus", "lucid", "mahindra",
    "maserati", "maybach", "mazda", "mcevoy motors", "mclaren automotive", "mercedes-benz", "mercury",
    "merkur", "mini", "mitsubishi", "morgan", "nissan", "oldsmobile", "pagani", "panos",
    "panoz auto-development", "panther car company limited", "pas inc - gmc", "pas, inc", "peugeot",
    "pininfarina", "plymouth", "polestar", "pontiac", "porsche", "quantum technologies", "qvale", "ram",
    "red shift ltd.", "renault", "rivian", "rolls-royce", "roush performance", "ruf automobile",
    "ruf automobile gmbh", "saab", "saleen", "saleen performance", "saturn", "scion", "shelby", "smart",
    "spyker", "srt", "sterling", "sti", "subaru", "suzuki", "tecstar, lp", "tesla", "texas coach company",
    "toyota", "tvr engineering ltd", "vector", "vinfast", "volkswagen", "volvo", "wallace environmental", "yugo"
  ];
  const aliases = {
    "am general": "am general",
    "chevy": "chevrolet",
    "datsun": "datsun",
    "ineos": "ineos automotive",
    "mclaren": "mclaren automotive",
    "mercedes benz": "mercedes-benz",
    "panoz": "panoz auto-development",
    "rolls royce": "rolls-royce",
    "vw": "volkswagen"
  };
  // Check longer names first so BMW Alpina matches before BMW.
  const makeNames = [...makes, ...Object.keys(aliases)];
  makeNames.sort((a, b) => b.length - a.length);
  const lowerVehicle = vehicle?.toLowerCase() || "";
  const makeText = makeNames.find((name) => lowerVehicle === name || lowerVehicle.startsWith(name + " "));
  const make = makeText ? aliases[makeText] || makeText : null;
  const modelValue = makeText ? vehicle.slice(makeText.length).trim() : "";
  const ambiguousModel = /\s(?:or|\/)\s|[|*]|^(?:unknown|other|n\/?a)$/i.test(modelValue);
  const modelText = ambiguousModel ? "" : modelValue;
  const trimMatch = modelText.match(/(?:^|\s+)["“]?(EX-L|XLE|XLS|XLT|LTZ|SEL|TRD Pro)["”]?(?:\s+(?:AWD|FWD|RWD|4WD|hybrid))*$/i);
  let trim = trimMatch?.[1].toUpperCase() ?? null;
  const model = (trimMatch ? modelText.slice(0, trimMatch.index) : modelText) || null;

  const titleParts = title?.split(/\s+[|*•]\s*/) ?? [];
  const headline = titleParts[0]?.replace(/^[^\p{L}\p{N}]+/u, "").trim();
  let vehicleTitle = make && model ? [year, vehicle].filter(Boolean).join(" ") : null;
  const expectedHeadline = [year, makeText, model].join(" ").toLowerCase();
  const lowerHeadline = headline?.toLowerCase();
  const headlineMatches = lowerHeadline === expectedHeadline || lowerHeadline?.startsWith(expectedHeadline + " ");
  if (titleParts.length > 1 && year && make && model && headlineMatches) {
    vehicleTitle = headline;
  }

  // Mercedes listings can put the class in the specs and the variant in the title.
  if (make === "mercedes-benz" && year && model && /-class$/i.test(model)) {
    const shortModel = model.replace(/-class$/i, "");
    const firstPart = headline?.split("/")[0].trim() || "";
    const prefix = (year + " mercedes benz " + shortModel + " ").toLowerCase();
    const normalizedTitle = firstPart.toLowerCase().replace("mercedes-benz", "mercedes benz");
    if (normalizedTitle.startsWith(prefix)) {
      const variant = normalizedTitle.slice(prefix.length).match(/^(\d{3})(?: (4matic))?$/);
      if (variant) {
        trim = variant[1];
        vehicleTitle = [year, "Mercedes-Benz", shortModel, trim, variant[2]?.toUpperCase()].filter(Boolean).join(" ");
      }
    }
  }

  const details = [];
  const price = text(".postingtitletext .price");
  const askingPriceUsd = readNumber(price, /^\$?\s*((?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{2})?)$/);
  let mileageMiles = null;
  let vin = null;
  let bodyType = "";
  if (title) details.push(title);
  if (price) details.push("Price: " + price);

  const specs = document.querySelectorAll(".attrgroup .attr, p.attrgroup > span");
  for (const spec of specs) {
    const line = spec.innerText.trim().replace(/\s+/g, " ");
    const type = line.match(/^type\s*:\s*(.*)$/i);
    if (type) bodyType = type[1];
    if (/^(?:vin\s*:|show vin data\b)/i.test(line)) {
      const value = spec.querySelector(".valu")?.innerText.trim() || line;
      const foundVin = value.match(/\b[A-HJ-NPR-Z0-9]{17}\b/i);
      if (foundVin) vin = foundVin[0].toUpperCase();
      continue;
    }
    const odometer = line.match(/^odometer\s*:\s*(.+)$/i);
    if (odometer) {
      mileageMiles = readNumber(odometer[1], /^(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)\s*(k)?\s*(?:mi(?:les)?)?$/i, true);
    }
    if (line) details.push(line);
  }
  const excludedType = /^(?:motorcycle|moped|scooter|atv|rv|motorhome|bus|boat|aircraft|commercial truck|cargo van)$/i;
  const commercialBody = /\b(?:box truck|dump truck|tow truck|flatbed truck|semi[- ]truck|tractor[- ]trailer|commercial truck|cargo van|chassis cab|cab and chassis|motorhome|school bus)\b/i;
  const commercialMake = /^(?:freightliner|kenworth|peterbilt|mack|western star)\b/i;
  const advertisedVehicle = headline?.split(/\b(?:trade for|trades? welcome|will trade|swap for)\b/i)[0] || "";
  if (excludedType.test(bodyType) || commercialBody.test(vehicle || "") ||
      commercialBody.test(advertisedVehicle) || commercialMake.test(vehicle || "")) {
    return { unsupportedReason: "CarClarity supports passenger vehicles and pickup trucks only." };
  }
  if (!vin && year !== null && year < 1984) {
    return { unsupportedReason: "CarClarity supports model years 1984 and newer." };
  }
  details.push("VIN: " + (vin || "Unavailable"));

  const postId = text(".postinginfos")?.match(/\bpost id:\s*(\d+)/i)?.[1];
  if (postId) details.push("Post ID: " + postId);

  const listingData = {
    tabId,
    listingUrl: location.href,
    sourceSite: "Craigslist",
    vehicleTitle,
    year,
    make,
    model,
    trim,
    askingPriceUsd,
    mileageMiles,
    vin,
    sellerDescription: description || "",
    postId: postId ?? null,
    userVerified: false
  };
  return { listingData, details };
}
