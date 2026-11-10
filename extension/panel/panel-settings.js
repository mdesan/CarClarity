const debugMode = document.getElementById("debugMode");
const debugSections = document.getElementById("debugSections");
const debugModeKey = "carclarity.debugMode";
const unavailableElements = document.getElementById("unavailableElements");
const noUnavailableElements = document.getElementById("noUnavailableElements");
const unavailableBySection = new Map();

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
