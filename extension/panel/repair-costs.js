const repairCostsHint = document.getElementById("repairCostsHint");
const repairCosts = document.getElementById("repairCosts");
const repairCostsStatus = document.getElementById("repairCostsStatus");
const repairCostsList = document.getElementById("repairCostsList");
const repairCostsTotal = document.getElementById("repairCostsTotal");
const repairCostsNote = document.getElementById("repairCostsNote");
// Keeps each estimate for this session so the numbers stay the same while switching tabs.
const repairResults = new Map();
let activeRepair = null;

function resetRepairCosts() {
  activeRepair = null;
  repairCostsHint.hidden = true;
  repairCosts.hidden = true;
  repairCostsStatus.textContent = "";
  repairCostsList.replaceChildren();
  repairCostsTotal.hidden = true;
  repairCostsNote.hidden = true;
}

function repairCard(estimate) {
  const card = document.createElement("li");
  card.className = "issue-card";
  const priced = estimate.lowUsd != null && estimate.highUsd != null;
  for (const [className, text] of [
    ["issue-name", estimate.name],
    ["repair-price", priced ? formatUsd(estimate.lowUsd) + "–" + formatUsd(estimate.highUsd) : "Ask a mechanic for a price"],
    ["", estimate.note]
  ]) {
    const line = document.createElement("p");
    line.className = className;
    line.textContent = text;
    card.append(line);
  }
  return card;
}

function showRepairTotal(estimates) {
  const priced = estimates.filter((estimate) => estimate.lowUsd != null && estimate.highUsd != null);
  const unpriced = estimates.length - priced.length;
  let text = "";
  if (priced.length) {
    const low = priced.reduce((sum, estimate) => sum + estimate.lowUsd, 0);
    const high = priced.reduce((sum, estimate) => sum + estimate.highUsd, 0);
    text = "Possible repairs: " + formatUsd(low) + "–" + formatUsd(high);
    if (unpriced) text += ", plus " + unpriced + (unpriced === 1 ? " item" : " items") + " a mechanic needs to price";
  } else {
    text = "A mechanic needs to look at " + (unpriced === 1 ? "this item" : "these items") + " to give a price";
  }
  repairCostsTotal.textContent = text + ".";
  repairCostsTotal.hidden = false;
}

function formatUsd(amount) {
  return "$" + amount.toLocaleString("en-US");
}

async function requestRepairCosts(car, problems) {
  const response = await fetch(issuesWorkerUrl + "/repair-costs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...car, problems }),
    signal: AbortSignal.timeout(35000)
  });
  if (!response.ok) throw new Error("Worker returned " + response.status);
  return (await response.json()).estimates;
}

// Estimates start only after the buyer clicks Confirm issues.
function showRepairCosts(vehicle, userIssues, issuesConfirmed) {
  const car = {
    year: vehicle.year,
    make: vehicle.make,
    model: vehicle.model,
    mileageMiles: vehicle.mileageMiles ?? null
  };
  const observations = userIssues.map((issue) => issue.name);
  const key = JSON.stringify([vehicle.listingUrl, car, observations, issuesConfirmed]);
  if (activeRepair?.key === key) return;
  resetRepairCosts();
  const request = { key };
  activeRepair = request;
  if (!issuesConfirmed) {
    repairCostsHint.hidden = false;
    return;
  }
  request.result = loadRepairCosts(request, car, observations);
}

// Used by the Clarity report. Resolves to { concerns, estimates }; estimates is null if pricing failed.
function currentRepairResult() {
  return activeRepair?.result ?? Promise.resolve(null);
}

async function loadRepairCosts(request, car, observations) {
  repairCosts.hidden = false;
  repairCostsStatus.textContent = "Estimating repair costs…";
  const concerns = await currentSellerConcerns();
  if (activeRepair !== request) return null;
  // Only problems the car has now get a price, not past repairs.
  const problems = [
    ...(concerns || []).filter((issue) => issue.status === "current")
      .map((issue) => ({ name: issue.name, detail: issue.quote })),
    ...observations.map((name) => ({ name }))
  ];
  if (!problems.length) {
    repairCostsStatus.textContent = concerns === null
      ? "We couldn’t read the seller’s description, and you didn’t add any issues, so there’s nothing to price yet."
      : "Nothing to price. The seller didn’t mention any current problems, and you didn’t add any issues.";
    return { concerns, estimates: [] };
  }

  const resultKey = JSON.stringify([car, problems]);
  try {
    if (!repairResults.has(resultKey)) {
      repairResults.set(resultKey, requestRepairCosts(car, problems).catch((error) => {
        repairResults.delete(resultKey);
        throw error;
      }));
    }
    // Things like "sold as is" matter, but they aren't repairs, so they don't get a price card.
    const estimates = (await repairResults.get(resultKey)).filter((estimate) => estimate.isRepair !== false);
    if (activeRepair !== request) return null;
    repairCostsStatus.textContent = concerns === null
      ? "We couldn’t read the seller’s description, so only your observations are priced."
      : "";
    if (!estimates.length) {
      repairCostsStatus.textContent = "Nothing to price. None of the problems found are things a repair can fix.";
      return { concerns, estimates };
    }
    repairCostsList.append(...estimates.map(repairCard));
    showRepairTotal(estimates);
    repairCostsNote.hidden = false;
    return { concerns, estimates };
  } catch {
    if (activeRepair !== request) return null;
    repairCostsStatus.textContent = "We couldn’t estimate repair costs right now. Click Edit issues, then Confirm issues to try again.";
    return { concerns, estimates: null };
  }
}
