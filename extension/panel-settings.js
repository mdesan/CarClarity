const debugMode = document.getElementById("debugMode");
const debugSections = document.getElementById("debugSections");
const debugModeKey = "carclarity.debugMode";

function showDebugSections(enabled) {
  debugMode.checked = enabled;
  debugSections.hidden = !enabled;
}

showDebugSections(localStorage.getItem(debugModeKey) === "true");

debugMode.addEventListener("change", () => {
  showDebugSections(debugMode.checked);
  localStorage.setItem(debugModeKey, String(debugMode.checked));
});
