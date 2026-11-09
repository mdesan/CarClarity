// Search links for the same year, make, and model on other sites.
// Built from the confirmed vehicle, so we never search with wrong data.
function showSimilarListings(vehicle) {
  const message = document.getElementById("similarListingsMessage");
  const list = document.getElementById("similarListingsLinks");
  list.replaceChildren();
  message.textContent = "";
  if (!vehicle) return;

  const name = [vehicle.year, vehicle.make, vehicle.model].join(" ");
  const query = encodeURIComponent(name);
  const sites = [
    ["Facebook Marketplace", "https://www.facebook.com/marketplace/search/?query=" + query],
    ["OfferUp", "https://offerup.com/search?q=" + query],
    ["Cars.com", "https://www.cars.com/shopping/results/?stock_type=used&keyword=" + query],
    ["CarMax", "https://www.carmax.com/cars?search=" + query],
    ["Google search", "https://www.google.com/search?q=" + encodeURIComponent(name + " for sale")]
  ];

  message.textContent = "Search for other " + name + " listings:";
  for (const [site, url] of sites) {
    const link = document.createElement("a");
    link.href = url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = site;
    const row = document.createElement("li");
    row.append(link);
    list.append(row);
  }
}
