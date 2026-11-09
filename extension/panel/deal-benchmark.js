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
  const { rating, askingPrice, comparisonPrice, estimatedRange, highPriceCutoff, explanation, mileageDiscount, mileageGap } = result;
  const { min, max } = estimatedRange;
  const edges = [min - comparisonPrice * 0.1, min, max, highPriceCutoff, highPriceCutoff + comparisonPrice * 0.1];
  const zone = ["Below band", "Within band", "Above band", "Well above band"].indexOf(rating);
  const width = edges[zone + 1] - edges[zone];
  const progress = width > 0 ? (askingPrice - edges[zone]) / width : 0.5;
  const angle = -90 + 45 * (zone + Math.max(0.02, Math.min(0.98, progress)));
  dealNeedle.setAttribute("transform", "rotate(" + angle + " 110 104)");
  dealGaugePrice.textContent = usd.format(askingPrice);
  dealScale.setAttribute("aria-label", dealGaugePrice.textContent + " asking price. " + rating + ".");
  dealRatingLabel.textContent = rating;
  dealConfidence.hidden = !lowConfidence;
  dealRange.textContent = explanation + " Comparison band: " +
    usd.format(estimatedRange.min) + "–" + usd.format(estimatedRange.max) +
    (mileageDiscount ? " (10% either side of the mileage-adjusted benchmark)." :
      " (10% either side of the ForCar average).");
  if (mileageDiscount) {
    dealRange.textContent += " The listing has " + Math.round(mileageGap).toLocaleString("en-US") +
      " more miles than average, so the benchmark was lowered by " +
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
  dealRequest++;
  activeDealKey = null;
  showUnavailableElements("Deal analysis");
  dealBenchmark.hidden = true;
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
  dealBenchmarkStatus.textContent = "Checking the bundled ForCar benchmark…";

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
      dealBenchmark.hidden = true;
      const reason = "No usable ForCar benchmark for this make and model within two model years.";
      showUnavailableElements("Deal analysis", [reason]);
      forcarCalculation.textContent = lookup + "\n" + reason;
      return;
    }
    const hasAsk = Number.isFinite(ask) && ask > 0;
    if (hasAsk) addBenchmarkRow("Asking price", usd.format(ask));
    if (match.year !== vehicle.year) addBenchmarkRow("Benchmark model year", String(match.year));
    addBenchmarkRow("ForCar average ask", usd.format(match.averagePriceUsd));
    if (match.listingCount != null) addBenchmarkRow("Listings in sample", match.listingCount.toLocaleString("en-US"));
    if (match.averageMileageMiles != null) addBenchmarkRow("Average mileage", match.averageMileageMiles.toLocaleString("en-US") + " mi");
    const difference = hasAsk ? ask - match.averagePriceUsd : null;
    const missing = [];
    if (difference === null) missing.push("Asking price and comparison — no asking price was captured.");
    if (match.listingCount == null) missing.push("Listings in sample — ForCar did not provide a count.");
    if (match.averageMileageMiles == null) missing.push("Average mileage — ForCar did not provide mileage.");
    const warnings = [];
    if (match.year !== vehicle.year) warnings.push("benchmark uses model year " + match.year);
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
      const adjustedDifference = Math.round(ask - rating.comparisonPrice);
      addBenchmarkRow(rating.mileageDiscount ? "Compared with adjusted benchmark" : "Compared with average",
        adjustedDifference === 0 ? "About the same" :
          usd.format(Math.abs(adjustedDifference)) + (adjustedDifference < 0 ? " below" : " above"));
      if (rating.mileageGap === null) warnings.push("mileage comparison unavailable");
      else if (rating.substantialGap) warnings.push("mileage differs substantially from the sample average");
      renderDealRating(rating, usd, warnings.length > 0);
      dealBenchmarkStatus.textContent = warnings.length ? "Insufficient data for a confident rating: " + warnings.join("; ") + "." : "";
    } else {
      missing.push("Deal rating — " + unavailable);
      dealBenchmarkStatus.textContent = "";
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
        "Adjusted comparison midpoint: " + usd.format(rating.comparisonPrice)
      ] : []),
      "Comparison band: " + (rating ? usd.format(rating.estimatedRange.min) + "–" + usd.format(rating.estimatedRange.max) : "Unavailable"),
      ...warnings
    ].join("\n");
  } catch {
    if (request !== dealRequest) return;
    activeDealKey = null;
    dealBenchmark.hidden = true;
    const reason = "The bundled ForCar data could not be read.";
    showUnavailableElements("Deal analysis", [reason]);
    forcarCalculation.textContent = lookup + "\n" + reason;
  }
}
