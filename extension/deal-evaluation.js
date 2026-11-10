/** 
 * Deal Valuation & Rating Module for CarClarity (F4)
 * Compares an asking price with a mileage-adjusted listing benchmark.
 * Evaluates the listing deal rating based on asking price and market range
 * @param {number} askingPrice 
 * @param {number} marketAvgPrice
 * @returns {Object} 
 */
const mileageDiscountPer10k = 0.05;
const maxMileageDiscount = 0.30;
const fairPriceMargin = 0.125;

function calculateDealRating(askingPrice, marketAvgPrice, mileageMiles, averageMileageMiles) {
  if (!Number.isFinite(askingPrice) || !Number.isFinite(marketAvgPrice) ||
      askingPrice <= 0 || marketAvgPrice <= 0) {
    return {
      rating: "Unavailable",
      color: "gray",
      message: "Insufficient pricing data to generate deal rating.",
      estimatedRange: null
    };
  }
  const hasMileage = Number.isFinite(mileageMiles) && mileageMiles >= 0 &&
    Number.isFinite(averageMileageMiles) && averageMileageMiles > 0;
  const mileageGap = hasMileage ? mileageMiles - averageMileageMiles : null;
  const substantialGap = hasMileage &&
    Math.abs(mileageGap) >= Math.max(20000, averageMileageMiles * 0.4);
  // Use a bounded heuristic until comparable listings can supply a mileage curve.
  const mileageDiscount = Math.min(maxMileageDiscount,
    Math.max(0, mileageGap ?? 0) / 10000 * mileageDiscountPer10k);
  const comparisonPrice = marketAvgPrice * (1 - mileageDiscount);
  const lowerBound = Math.round(comparisonPrice * (1 - fairPriceMargin));
  const upperBound = Math.round(comparisonPrice * (1 + fairPriceMargin));
  const highPriceCutoff = Math.round(comparisonPrice * 1.20);
  let rating = "Within band";
  if (askingPrice < lowerBound) {
    rating = "Below band";
  } else if (askingPrice > upperBound) {
    rating = askingPrice > highPriceCutoff ? "Well above band" : "Above band";
  }
  return {
    rating,
    askingPrice,
    marketAvgPrice,
    comparisonPrice,
    mileageGap,
    mileageDiscount,
    substantialGap,
    highPriceCutoff,
    estimatedRange: {
      min: lowerBound,
      max: upperBound
    }
  };
}
