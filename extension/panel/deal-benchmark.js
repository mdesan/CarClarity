const dealBenchmark = document.getElementById("dealAnalysis");
const dealBenchmarkStatus = document.getElementById("dealBenchmarkStatus");
const dealBenchmarkRows = document.getElementById("dealBenchmarkRows");
const forcarDebug = document.getElementById("forcarDebug");
const forcarCalculation = document.getElementById("forcarCalculation");
const dealRating = document.getElementById("dealRating");
const showDealRating = document.getElementById("showDealRating");
const dealRatingLabel = document.getElementById("dealRatingLabel");
const dealScale = document.getElementById("dealScale");
const dealNeedle = document.getElementById("dealNeedle");
const dealGaugePrice = document.getElementById("dealGaugePrice");
const dealConfidence = document.getElementById("dealConfidence");
const dealRange = document.getElementById("dealRange");
const dealMileageAdjustment = document.getElementById("dealMileageAdjustment");
const dealTakeaway = document.getElementById("dealTakeaway");
const dealCaution = document.getElementById("dealCaution");
const dealDetails = document.getElementById("dealDetails");
const dealWarnings = document.getElementById("dealWarnings");
let marketIndexRequest;
let dealRequest = 0;
let activeDealKey = null;

showDealRating.addEventListener("click", () => {
  setDealRatingVisible(dealRating.hidden);
});

function setDealRatingVisible(visible) {
  dealRating.hidden = !visible;
  showDealRating.textContent = visible ? "Hide rating" : "Show me anyway";
  showDealRating.setAttribute("aria-expanded", String(visible));
}

function marketKey(year, make, model) {
  return [year, identityKey(make), identityKey(model)].join(":");
}

async function loadMarketIndex() {
  const response = await fetch(chrome.runtime.getURL("data/forcar-market.json"));
  if (!response.ok) throw new Error("Local ForCar data is unavailable.");
  const data = await response.json();
  const index = new Map();
  for (const row of data.records) {
    const [year, make, model, averagePriceUsd, averageMileageMiles, listingCount] = row;
    if (!Number.isFinite(averagePriceUsd) || averagePriceUsd <= 0) continue;
    const key = marketKey(year, make, model);
    // Conflicting rows do not make a single trustworthy benchmark.
    index.set(key, index.has(key) ? null : { year, make, model, averagePriceUsd, averageMileageMiles, listingCount });
  }
  return index;
}

function findMarketMatch(index, vehicle) {
  const { year, make, model } = vehicle;
  const exact = index.get(marketKey(year, make, model));
  if (exact) return exact;
  for (const gap of [1, 2]) {
    const older = index.get(marketKey(year - gap, make, model));
    const newer = index.get(marketKey(year + gap, make, model));
    if (older && newer) return (newer.listingCount ?? 0) > (older.listingCount ?? 0) ? newer : older;
    if (older || newer) return older || newer;
  }
  return null;
}

function renderDealRating(result, usd, lowConfidence) {
  const { rating, askingPrice, comparisonPrice, estimatedRange, highPriceCutoff, mileageDiscount, mileageGap } = result;
  const { min, max } = estimatedRange;
  const edges = [min - comparisonPrice * 0.1, min, max, highPriceCutoff, highPriceCutoff + comparisonPrice * 0.1];
  const zone = ["Below band", "Within band", "Above band", "Well above band"].indexOf(rating);
  let label = [lowConfidence ? "Low price · Worth a closer look" : "Low asking price",
    "Fair deal", "A little pricey", "Overpriced"][zone];
  let takeaway = [
    "Proceed with caution. Ask why the price is low and check the car’s condition before buying.",
    "Priced about the same as similar cars.",
    "Priced a bit higher than similar cars.",
    "Priced much higher than similar cars."
  ][zone];
  const edgeMargin = 0.02;
  const fairEdge = zone === 0 ? min : max;
  const fairGap = Math.abs(askingPrice - fairEdge);
  const highGap = Math.abs(askingPrice - highPriceCutoff);
  const nearFairRange = (zone === 0 || zone === 2) && fairGap <= fairEdge * edgeMargin;
  if (nearFairRange) {
    label = "Close to a fair price";
    takeaway = "Only " + usd.format(fairGap) + (zone === 0 ? " below" : " above") +
      " the estimated range.";
  } else if (zone === 1 && askingPrice - min <= min * edgeMargin) {
    takeaway = "Near the low end of the estimated range.";
  } else if (zone === 1 && max - askingPrice <= max * edgeMargin) {
    takeaway = "Near the high end of the estimated range.";
  } else if ((zone === 2 || zone === 3) && highGap <= highPriceCutoff * edgeMargin) {
    label = "On the edge of overpriced";
    takeaway = askingPrice === highPriceCutoff ? "Right at the overpriced cutoff." :
      "Only " + usd.format(highGap) + (zone === 2 ? " below" : " above") + " the overpriced cutoff.";
  }
  const width = edges[zone + 1] - edges[zone];
  const progress = width > 0 ? (askingPrice - edges[zone]) / width : 0.5;
  const angle = -90 + 45 * (zone + Math.max(0.02, Math.min(0.98, progress)));
  dealNeedle.setAttribute("transform", "rotate(" + angle + " 110 104)");
  dealGaugePrice.textContent = usd.format(askingPrice);
  dealScale.setAttribute("aria-label", dealGaugePrice.textContent + " asking price. " + label + ".");
  dealRatingLabel.textContent = label;
  dealTakeaway.textContent = takeaway;
  dealCaution.hidden = !nearFairRange;
  dealConfidence.hidden = !lowConfidence;
  dealRange.textContent = "Estimated price range " + usd.format(min) + "–" + usd.format(max);
  dealMileageAdjustment.hidden = !mileageDiscount;
  if (mileageDiscount) {
    dealMileageAdjustment.textContent = "The listing has " + Math.round(mileageGap).toLocaleString("en-US") +
      " more miles than average, so we lowered the estimate by " +
      (mileageDiscount * 100).toLocaleString("en-US", { maximumFractionDigits: 1 }) + "%.";
  }
  showDealRating.hidden = !lowConfidence;
  setDealRatingVisible(!lowConfidence);
}

function addBenchmarkRow(label, value) {
  const term = document.createElement("dt");
  const detail = document.createElement("dd");
  term.textContent = label;
  detail.textContent = value;
  dealBenchmarkRows.append(term, detail);
}

function resetDealBenchmark() {
  setLookupStatus("forcar");
  dealRequest++;
  activeDealKey = null;
  showUnavailableElements("Deal analysis");
  dealBenchmark.hidden = true;
  dealDetails.hidden = true;
  dealDetails.open = false;
  dealMileageAdjustment.hidden = true;
  dealWarnings.hidden = true;
  dealWarnings.textContent = "";
  setDealRatingVisible(false);
  showDealRating.hidden = true;
  forcarDebug.hidden = true;
  forcarCalculation.textContent = "";
  dealBenchmarkStatus.textContent = "";
  dealBenchmarkRows.replaceChildren();
}

async function showDealBenchmark(vehicle) {
  const dealKey = JSON.stringify([vehicle.tabId, vehicle.listingUrl, vehicle.year, vehicle.make,
    vehicle.model, vehicle.askingPriceUsd, vehicle.mileageMiles, vehicle.sellerSpecs?.titleStatus]);
  if (activeDealKey === dealKey) return;
  resetDealBenchmark();
  activeDealKey = dealKey;
  const request = dealRequest;
  dealBenchmark.hidden = false;
  const usd = new Intl.NumberFormat("en-US", {
    style: "currency", currency: "USD", maximumFractionDigits: 2, minimumFractionDigits: 0
  });
  const ask = vehicle.askingPriceUsd;
  const key = marketKey(vehicle.year, vehicle.make, vehicle.model);
  const lookup = "Lookup key: " + key + "\nAsking price: " + (Number.isFinite(ask) ? usd.format(ask) : "Unavailable");
  forcarDebug.hidden = false;
  forcarCalculation.textContent = lookup + "\nLoading bundled ForCar data…";
  dealBenchmarkStatus.textContent = "Checking prices for similar cars…";
  setLookupStatus("forcar", "Loading…");

  try {
    if (!marketIndexRequest) {
      marketIndexRequest = loadMarketIndex().catch((error) => {
        marketIndexRequest = null;
        throw error;
      });
    }
    const index = await marketIndexRequest;
    if (request !== dealRequest) return;
    const match = findMarketMatch(index, vehicle);
    if (!match) {
      dealBenchmarkStatus.textContent = "We couldn’t find enough similar cars to compare prices.";
      setLookupStatus("forcar", "No usable match");
      const reason = "No usable ForCar benchmark for this make and model within two model years.";
      showUnavailableElements("Deal analysis", [reason]);
      forcarCalculation.textContent = lookup + "\n" + reason;
      return;
    }
    const hasAsk = Number.isFinite(ask) && ask > 0;
    setLookupStatus("forcar", match.year === vehicle.year ? "Loaded" : "Loaded a nearby model year");
    if (hasAsk) addBenchmarkRow("Asking price", usd.format(ask));
    dealDetails.hidden = false;
    if (match.year !== vehicle.year) addBenchmarkRow("Model year used", String(match.year));
    addBenchmarkRow("Average asking price", usd.format(match.averagePriceUsd));
    if (match.listingCount != null) addBenchmarkRow("Listings in sample", match.listingCount.toLocaleString("en-US"));
    if (match.averageMileageMiles != null) addBenchmarkRow("Average mileage", match.averageMileageMiles.toLocaleString("en-US") + " mi");
    const difference = hasAsk ? ask - match.averagePriceUsd : null;
    const missing = [];
    if (difference === null) missing.push("Asking price and comparison — no asking price was captured.");
    if (match.listingCount == null) missing.push("Listings in sample — ForCar did not provide a count.");
    if (match.averageMileageMiles == null) missing.push("Average mileage — ForCar did not provide mileage.");
    const warnings = [];
    if (match.year !== vehicle.year) warnings.push("we used prices for the " + match.year + " model");
    if (!(match.listingCount >= 20)) warnings.push("fewer than 20 listings or unknown sample size");
    const title = vehicle.sellerSpecs?.titleStatus;
    if (title && title.toLowerCase() !== "clean") warnings.push("seller reports a " + title + " title");
    const ratio = ask / match.averagePriceUsd;
    const rating = hasAsk && ratio >= 0.1 && ratio <= 5
      ? calculateDealRating(ask, match.averagePriceUsd, vehicle.mileageMiles, match.averageMileageMiles) : null;
    const unavailable = hasAsk
      ? "The asking price is outside the usable comparison limits."
      : "A positive asking price is needed.";
    if (rating) {
      addBenchmarkRow("Fair price range", "±" + fairPriceMargin * 100 + "% around our estimate");
      if (rating.mileageGap === null) warnings.push("mileage comparison unavailable");
      else if (rating.substantialGap) warnings.push("mileage differs substantially from the sample average");
      renderDealRating(rating, usd, warnings.length > 0);
      dealBenchmarkStatus.textContent = warnings.length ? "This estimate is less certain." : "";
      dealWarnings.hidden = !warnings.length;
      dealWarnings.textContent = warnings.length ? "Why confidence is low: " + warnings.join("; ") + "." : "";
    } else {
      missing.push("Deal rating — " + unavailable);
      dealBenchmarkStatus.textContent = "We couldn’t compare the asking price for this listing.";
    }
    showUnavailableElements("Deal analysis", missing);
    const formula = difference === null
      ? "Not calculated (asking price missing)"
      : usd.format(ask) + " − " + usd.format(match.averagePriceUsd) + " = " + usd.format(difference);
    forcarCalculation.textContent = [
      lookup,
      "Matched ForCar row: " + [match.year, match.make, match.model].join(" "),
      "Average asking price: " + usd.format(match.averagePriceUsd),
      "Listing count: " + (match.listingCount ?? "Unavailable"),
      "Average mileage: " + (match.averageMileageMiles == null ? "Unavailable" : match.averageMileageMiles + " mi"),
      "",
      "Difference = asking price − ForCar average",
      formula,
      "",
      "Deal rating: " + (rating ? rating.rating + (warnings.length ? " (low confidence)" : "") : unavailable),
      ...(rating ? [
        "Mileage adjustment: " + mileageDiscountPer10k * 100 + "% per 10,000 excess miles, capped at " +
          maxMileageDiscount * 100 + "% (CarClarity heuristic).",
        "Adjusted comparison midpoint: " + usd.format(rating.comparisonPrice),
        "Asking price vs. adjusted midpoint: " + ((ask - rating.comparisonPrice) / rating.comparisonPrice)
          .toLocaleString("en-US", { style: "percent", maximumFractionDigits: 1, signDisplay: "exceptZero" }),
        "Red zone starts above: " + usd.format(rating.highPriceCutoff)
      ] : []),
      "Comparison band: " + (rating ? usd.format(rating.estimatedRange.min) + "–" + usd.format(rating.estimatedRange.max) : "Unavailable"),
      ...warnings
    ].join("\n");
  } catch {
    if (request !== dealRequest) return;
    activeDealKey = null;
    dealBenchmarkStatus.textContent = "Price data couldn’t load right now.";
    setLookupStatus("forcar", "Could not load price data");
    const reason = "The bundled ForCar data could not be read.";
    showUnavailableElements("Deal analysis", [reason]);
    forcarCalculation.textContent = lookup + "\n" + reason;
  }
}
