const listingIssues = document.getElementById("listingIssues");
const listingIssuesStatus = document.getElementById("listingIssuesStatus");
const listingIssuesList = document.getElementById("listingIssuesList");
const listingGoodSigns = document.getElementById("listingGoodSigns");
const listingGoodSignsList = document.getElementById("listingGoodSignsList");
const listingIssuesNote = document.getElementById("listingIssuesNote");
const issueSeverities = {
  serious: { rank: 0, label: "Serious" },
  check: { rank: 1, label: "Check before buying" },
  minor: { rank: 2, label: "Minor" }
};
// Written ahead of time because a title problem can appear only in Craigslist's specs, where Gemini's quotes can't show it.
const titleProblems = {
  rebuilt: {
    name: "Rebuilt title",
    severity: "serious",
    meaning: "An insurance company once decided this car was too damaged to be worth fixing. It was later repaired and passed a state inspection.",
    whyItMatters: "It’s usually worth much less, can be harder to insure, and the repairs may not have been done well.",
    whatToDo: "Ask what happened and for the repair records, and have a mechanic inspect it before paying."
  },
  salvage: {
    name: "Salvage title",
    severity: "serious",
    meaning: "An insurance company decided this car was too damaged to be worth fixing.",
    whyItMatters: "In many states it can’t be driven until it’s repaired and inspected. It can also be hard to insure, and the damage may not be fully fixed.",
    whatToDo: "Ask what happened to it and have a mechanic inspect it before paying."
  },
  lien: {
    name: "Lien on the title",
    severity: "check",
    meaning: "A lender still has a legal claim on this car, usually because a loan isn’t paid off.",
    whyItMatters: "The seller may not be able to give you the title until the loan is paid, so you could pay for a car you don’t legally own yet.",
    whatToDo: "Ask for proof that the loan will be paid off, and don’t pay until you know you’ll get the title."
  },
  missing: {
    name: "Missing title",
    severity: "serious",
    meaning: "The seller doesn’t have the title, the document that proves who owns the car.",
    whyItMatters: "Without it, you may not be able to register the car in your name.",
    whatToDo: "Ask the seller to get a replacement title from the state before you pay."
  },
  "parts only": {
    name: "Parts-only title",
    severity: "serious",
    meaning: "This car is being sold for its parts and isn’t meant to be driven.",
    whyItMatters: "In most states it can’t be registered for the road, even if it looks fine.",
    whatToDo: "Only buy it if you want it for parts, not as a car to drive."
  }
};
const issuesWorkerUrl = "https://carclarity-worker.mdesan.workers.dev";
const maxDescriptionLength = 6000;
// Keeps each listing's result for this session so Gemini's free quota isn't used twice.
const issueResults = new Map();
let activeIssues = null;

function resetListingIssues() {
  activeIssues = null;
  listingIssues.hidden = true;
  listingIssuesStatus.textContent = "";
  listingIssuesList.replaceChildren();
  listingGoodSigns.hidden = true;
  listingGoodSignsList.replaceChildren();
  listingIssuesNote.hidden = true;
}

function comparableText(text) {
  return text.replace(/\s+/g, " ").trim().toLowerCase();
}

function addIssueText(card, className, text) {
  const line = document.createElement("p");
  line.className = className;
  line.textContent = text;
  card.append(line);
}

function addIssueDetail(card, label, text) {
  const line = document.createElement("p");
  const name = document.createElement("strong");
  name.textContent = label + " ";
  line.append(name, text);
  card.append(line);
}

function issueCard(issue) {
  const card = document.createElement("li");
  card.className = "issue-card";
  card.dataset.severity = issue.severity;
  addIssueText(card, "issue-name", issue.name);
  addIssueText(card, "issue-severity", issueSeverities[issue.severity].label);
  addIssueText(card, "issue-quote", issue.source ?? "“" + issue.quote + "”");
  addIssueDetail(card, "What it means:", issue.meaning);
  addIssueDetail(card, "Why it matters:", issue.whyItMatters);
  addIssueDetail(card, "What to do:", issue.whatToDo);
  return card;
}

function goodSignCard(issue) {
  const card = document.createElement("li");
  card.className = "issue-card";
  card.dataset.severity = "good";
  addIssueText(card, "issue-name", issue.name);
  addIssueText(card, "issue-quote", "“" + issue.quote + "”");
  addIssueDetail(card, "What it means:", issue.meaning);
  addIssueDetail(card, "What to do:", issue.whatToDo);
  return card;
}

function renderIssues(allIssues, description, shownTitleProblem) {
  // A quote the seller never wrote means Gemini made it up, so that item is dropped.
  const seller = comparableText(description);
  const verified = allIssues.filter((issue) => {
    const quote = comparableText(issue.quote);
    return quote && seller.includes(quote);
  });
  // The title card is already on the page, so Gemini's version of the same problem would repeat it.
  const repeatsTitleCard = (issue) => {
    const text = (issue.name + " " + issue.quote).toLowerCase();
    return shownTitleProblem && text.includes("title") && text.includes(shownTitleProblem);
  };
  const issues = verified.filter((issue) => !repeatsTitleCard(issue));
  const isGoodSign = (issue) => issue.status !== "current" && issue.severity === "minor";
  const concerns = issues
    .filter((issue) => !isGoodSign(issue))
    .sort((a, b) => issueSeverities[a.severity].rank - issueSeverities[b.severity].rank);
  const goodSigns = issues.filter(isGoodSign);

  listingIssuesStatus.textContent = verified.length
    ? ""
    : "The seller’s description doesn’t mention the car’s condition or history.";
  listingIssuesList.append(...concerns.map(issueCard));
  listingGoodSignsList.append(...goodSigns.map(goodSignCard));
  listingGoodSigns.hidden = !goodSigns.length;
  if (issues.length) listingIssuesNote.hidden = false;
}

async function requestIssues(car, description) {
  const response = await fetch(issuesWorkerUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...car, description }),
    signal: AbortSignal.timeout(35000)
  });
  if (!response.ok) throw new Error("Worker returned " + response.status);
  return (await response.json()).issues;
}

async function showListingIssues(vehicle) {
  const description = (vehicle.sellerDescription || "").trim().slice(0, maxDescriptionLength);
  const car = {
    year: vehicle.year,
    make: vehicle.make,
    model: vehicle.model,
    mileageMiles: vehicle.mileageMiles ?? null,
    titleStatus: vehicle.sellerSpecs?.titleStatus ?? null
  };
  const key = JSON.stringify([vehicle.listingUrl, car, description]);
  // The panel refreshes on every confirmation change. Only a different car or listing needs new work.
  if (activeIssues?.key === key) return;
  resetListingIssues();
  const request = { key };
  activeIssues = request;
  listingIssues.hidden = false;

  // Shown right away and doesn't depend on Gemini.
  const titleStatus = (car.titleStatus || "").trim().toLowerCase();
  const titleProblem = Object.hasOwn(titleProblems, titleStatus) ? titleStatus : null;
  if (titleProblem) {
    listingIssuesList.append(issueCard({ ...titleProblems[titleProblem], source: "Listed in Craigslist’s title status" }));
    listingIssuesNote.hidden = false;
  }

  if (!description) {
    listingIssuesStatus.textContent = "The seller didn’t write a description to analyze.";
    return;
  }

  listingIssuesStatus.textContent = "Reading the seller’s description…";
  try {
    if (!issueResults.has(key)) {
      issueResults.set(key, requestIssues(car, description).catch((error) => {
        issueResults.delete(key);
        throw error;
      }));
    }
    const issues = await issueResults.get(key);
    if (activeIssues !== request) return;
    renderIssues(issues, description, titleProblem);
  } catch {
    if (activeIssues !== request) return;
    listingIssuesStatus.textContent = "We couldn’t analyze the seller’s description right now. Try again in a moment.";
  }
}
