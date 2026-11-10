const debugMode = document.getElementById("debugMode");
const debugSections = document.getElementById("debugSections");
const debugModeKey = "carclarity.debugMode";
const unavailableElements = document.getElementById("unavailableElements");
const noUnavailableElements = document.getElementById("noUnavailableElements");
const unavailableBySection = new Map();

function setLookupStatus(source, status = "Waiting for vehicle confirmation") {
  document.getElementById("lookup-" + source).textContent = status;
}

function showUnavailableElements(section, messages = []) {
  if (messages.length) unavailableBySection.set(section, messages);
  else unavailableBySection.delete(section);

  unavailableElements.replaceChildren();
  for (const [name, entries] of unavailableBySection) {
    const group = document.createElement("li");
    group.textContent = name;
    const list = document.createElement("ul");
    for (const message of entries) {
      const item = document.createElement("li");
      item.textContent = message;
      list.append(item);
    }
    group.append(list);
    unavailableElements.append(group);
  }
  noUnavailableElements.hidden = unavailableBySection.size > 0;
}

function updateDebugVisibility() {
  debugSections.hidden = !debugMode.checked || document.getElementById("formatted").hidden;
}

debugMode.checked = localStorage.getItem(debugModeKey) === "true";
updateDebugVisibility();

debugMode.addEventListener("change", () => {
  updateDebugVisibility();
  localStorage.setItem(debugModeKey, String(debugMode.checked));
});

for (const card of document.querySelectorAll("#reportSections > .review-card")) {
  const title = card.querySelector(":scope > h2");
  if (!title) continue;

  const header = document.createElement("div");
  header.className = "review-card-header";
  const button = document.createElement("button");
  button.type = "button";
  button.className = "review-card-toggle";
  const sectionName = title.textContent;

  function updateToggle(collapsed) {
    button.textContent = collapsed ? "+" : "−";
    button.setAttribute("aria-expanded", String(!collapsed));
    button.setAttribute("aria-label", (collapsed ? "Expand " : "Minimize ") + sectionName);
  }

  title.before(header);
  header.append(title, button);
  card.classList.add("review-card-minimized");
  updateToggle(true);
  button.addEventListener("click", () => {
    updateToggle(card.classList.toggle("review-card-minimized"));
  });
}
