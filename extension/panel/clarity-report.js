// Clarity report: a short summary built only from what the other sections already found.
const clarityReportHint = document.getElementById("clarityReportHint");
const clarityReportText = document.getElementById("clarityReportText");
const dealPhrases = [
  "which is lower than similar cars",
  "which is about the same as similar cars",
  "which is a bit higher than similar cars",
  "which is much higher than similar cars"
];
const titleSentences = {
  rebuilt: "It has a rebuilt title, which lowers its value and can make it harder to insure.",
  salvage: "It has a salvage title, which lowers its value and can make it harder to insure.",
  lien: "There’s a lien on the title, so make sure the loan is paid off before you pay.",
  missing: "The seller doesn’t have the title, so you may not be able to register it in your name.",
  "parts only": "It has a parts-only title, so it likely can’t be registered to drive."
};
let activeReport = null;

function resetClarityReport() {
  activeReport = null;
  clarityReportHint.hidden = true;
  clarityReportText.textContent = "";
}

// "Air conditioning leak" reads better mid-sentence as "air conditioning leak"; "A/C leak" stays as is.
function midSentence(name) {
  return /^[A-Z][a-z]/.test(name) ? name[0].toLowerCase() + name.slice(1) : name;
}

// NHTSA can send makes in capitals ("HYUNDAI"). Short ones like "BMW" are kept as they are.
function displayMake(make) {
  return make.length > 3 && make === make.toUpperCase()
    ? make.toLowerCase().replace(/(^|[\s-])\p{L}/gu, (letter) => letter.toUpperCase())
    : make;
}

// A comma before the last "and" keeps names like "knocking and misfiring" from running together.
function listWords(items) {
  if (items.length < 2) return items.join("");
  const lastJoin = items.some((item) => / and /i.test(item)) ? ", and " : " and ";
  return items.slice(0, -1).join(", ") + lastJoin + items.at(-1);
}

function showClarityReport(vehicle, userIssues, issuesConfirmed) {
  const observations = userIssues.map((issue) => issue.name);
  const key = JSON.stringify([vehicle.listingUrl, vehicle.year, vehicle.make, vehicle.model,
    vehicle.mileageMiles, vehicle.askingPriceUsd, observations, issuesConfirmed]);
  if (activeReport?.key === key) return;
  resetClarityReport();
  const request = { key };
  activeReport = request;
  if (!issuesConfirmed) {
    clarityReportHint.hidden = false;
    return;
  }
  clarityReportText.textContent = "Putting your report together…";
  buildClarityReport(request, vehicle, observations);
}

async function buildClarityReport(request, vehicle, observations) {
  // Waits for the repair estimates, which also wait for the Vehicle issues result.
  const result = await currentRepairResult();
  if (activeReport !== request || !result) return;
  const { concerns, estimates } = result;
  const sentences = [];

  const car = [vehicle.year, displayMake(vehicle.make), vehicle.model].join(" ");
  const miles = vehicle.mileageMiles == null ? "" : " with " + vehicle.mileageMiles.toLocaleString("en-US") + " miles";
  const price = Number.isFinite(vehicle.askingPriceUsd) && vehicle.askingPriceUsd > 0 ? vehicle.askingPriceUsd : null;
  if (price === null) {
    sentences.push("This " + car + miles + " doesn’t list a price, so we can’t compare it with similar cars.");
  } else if (currentDealSummary) {
    const { zone, lowConfidence } = currentDealSummary;
    sentences.push("This " + car + miles + " is listed for " + formatUsd(price) + ", " + dealPhrases[zone] +
      (lowConfidence ? " (this comparison is less certain)." : "."));
  } else {
    sentences.push("This " + car + miles + " is listed for " + formatUsd(price) +
      ". We don’t have price data to compare it with similar cars.");
  }

  const sellerNames = (concerns || []).map((issue) => midSentence(issue.name));
  if (concerns === null) {
    sentences.push("We couldn’t read the seller’s description.");
  } else if (sellerNames.length) {
    sentences.push("The seller mentions " + sellerNames.length +
      (sellerNames.length === 1 ? " thing" : " things") + " worth checking: " + listWords(sellerNames) + ".");
  } else {
    sentences.push("The seller doesn’t mention any problems.");
  }
  if (observations.length) {
    sentences.push("You also noted " + listWords(observations.map(midSentence)) + ".");
  }

  // Worded so it reads right whether a name is singular or plural ("fuel pump issues").
  const serious = (concerns || []).filter((issue) => issue.severity === "serious").map((issue) => midSentence(issue.name));
  if (serious.length) {
    sentences.push((serious.length === 1 ? "Start with the serious one: " : "Start with the serious ones: ") +
      listWords(serious) + ".");
  }

  const title = (vehicle.sellerSpecs?.titleStatus || "").trim().toLowerCase();
  if (Object.hasOwn(titleSentences, title)) sentences.push(titleSentences[title]);

  if (estimates === null) {
    sentences.push("Repair costs couldn’t be estimated right now.");
  } else {
    const priced = estimates.filter((estimate) => estimate.lowUsd != null && estimate.highUsd != null);
    if (priced.length) {
      const low = priced.reduce((sum, estimate) => sum + estimate.lowUsd, 0);
      const high = priced.reduce((sum, estimate) => sum + estimate.highUsd, 0);
      sentences.push("Possible repairs could add " + formatUsd(low) + "–" + formatUsd(high) + (price === null
        ? "."
        : ", making the total cost about " + formatUsd(price + low) + "–" + formatUsd(price + high) + "."));
    }
  }

  sentences.push("Have a mechanic inspect it before you buy.");
  clarityReportText.textContent = sentences.join(" ");
}
