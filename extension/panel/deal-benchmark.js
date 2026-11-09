const dealBenchmark = document.getElementById("dealAnalysis");
const dealBenchmarkStatus = document.getElementById("dealBenchmarkStatus");
const dealBenchmarkRows = document.getElementById("dealBenchmarkRows");
const forcarDebug = document.getElementById("forcarDebug");
const forcarCalculation = document.getElementById("forcarCalculation");
let marketIndexRequest;
let dealRequest = 0;

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
    const key = marketKey(year, make, model);
    // Conflicting rows do not make a single trustworthy benchmark.
    index.set(key, index.has(key) ? null : { year, make, model, averagePriceUsd, averageMileageMiles, listingCount });
  }
  return index;
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
  dealBenchmark.hidden = true;
  forcarDebug.hidden = true;
  forcarCalculation.textContent = "";
  dealBenchmarkStatus.textContent = "";
  dealBenchmarkRows.replaceChildren();
}

async function showDealBenchmark(vehicle) {
  resetDealBenchmark();
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
    const match = index.get(key);
    if (!match) {
      dealBenchmark.hidden = true;
      forcarCalculation.textContent = lookup + "\nNo unambiguous ForCar benchmark for this year, make, and model.";
      return;
    }
    if (Number.isFinite(ask)) addBenchmarkRow("Asking price", usd.format(ask));
    addBenchmarkRow("ForCar average ask", usd.format(match.averagePriceUsd));
    if (match.listingCount != null) addBenchmarkRow("Listings in sample", match.listingCount.toLocaleString("en-US"));
    if (match.averageMileageMiles != null) addBenchmarkRow("Average mileage", match.averageMileageMiles.toLocaleString("en-US") + " mi");
    const difference = Number.isFinite(ask) ? ask - match.averagePriceUsd : null;
    if (difference !== null) {
      addBenchmarkRow("Compared with average", difference === 0
        ? "Same as average" : usd.format(Math.abs(difference)) + (difference < 0 ? " below" : " above"));
    }
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
      "Deal rating: Unavailable. This benchmark does not calculate a comparable price range."
    ].join("\n");
    dealBenchmarkStatus.textContent = "";
  } catch {
    if (request !== dealRequest) return;
    dealBenchmark.hidden = true;
    forcarCalculation.textContent = lookup + "\nThe bundled ForCar data could not be read.";
  }
}
