# CarClarity Milestones Checklist

Change `[ ]` to `[x]` after completing a task. If a check needs context, just add a short note to it please.

## M1 · Extension setup and listing detection

- [x] Load the Manifest V3 extension unpacked in Chrome and show the current domain.
- [x] Recognize classic Craigslist car listing URLs and the newer `/view/d/` format.
- [x] Confirm the listing is in Cars & Trucks, including when the URL does not include a category.
- [x] Different indicators for CL search results, non-car listings, and unrelated sites.
- [ ] Verify supported and unsupported pages in Chrome and Edge.

## M2 · Craigslist listing extraction

- [x] Add a first pass that reads and displays the listing title, asking price, visible specs, seller description, and post ID.
- [x] Return structured year, make, model, optional trim, price in USD, mileage in miles, optional VIN, source, listing URL, and tab ID.
- [x] Normalize price and mileage formats and leave missing values blank.
- [ ] Make sure extraction works across complete, incomplete, and ambiguous listings.

## M3 · Seller issues and user verification

- [x] Let the buyer review and edit year, make, and model. Check all three with NHTSA before confirming the vehicle.
- [x] Let the buyer review, edit, and separately confirm the post title and seller description.
- [x] Identify a small set of seller-disclosed issues and distinguish active problems, negations, and past repairs.
- [x] Let the buyer add or remove their own observations before generating the report.
- [x] Keep detected seller phrases visible for review alongside buyer observations.
- [x] Let the buyer confirm and lock the issue list, then reopen it to make changes.
- [ ] Verify the full M3 confirmation flow in the browser.

## M4 · Vehicle research

- [ ] Verify the NHTSA and FuelEconomy.gov endpoints and retrieve available specs, fuel economy, complaints, and recalls.
- [ ] Separate model-wide complaints and recalls from evidence about the specific car. Verify VIN-specific recall status before claiming an open recall.
- [ ] Show sources and be able to handle missing data and request failures.

## M5 · ForCar pricing data

- [ ] Clean the CSV and format it into JSON.
- [ ] Match by exact year, make, and model. Show the benchmark, count, and source when available.
- [ ] Make sure lookup handles missing matches and small sample size well.

## M6 · Deal analysis

- [ ] Method created for estimating a credible price range.
- [ ] Compare the asking price with that range and explain the Good Deal, Fair Deal, or Overpriced rating.
- [ ] Show Unavailable when evidence is insufficient. Test cases with large range boundaries and missing-data.

## M7 · Clarity Report

- [ ] Show vehicle details, seller issues, model complaints, recalls, pricing, sources, and a short summary.
- [ ] Keep available sections visible when an outside source fails.
- [ ] Verify that switching tabs or navigating to another listing never mixes report data.
  - If we save listing data or reports later, key them by both `tabId` and `listingUrl`. Test switching tabs and opening a different listing in the same tab, including while a lookup is still running.
- [ ] Run the end-to-end demo in Chrome and Edge.
