/** 
 * Deal Valuation & Rating Module for CarClarity (F4)
 * Compares an asking price from seller against baseline market pricing data 
 * to determine if a listing is a good, fair, or overpriced deal.
 * Evaluates the listing deal rating based on asking price and market range
 * @param {number} askingPrice 
 * @param {number} marketAvgPrice
 * @returns {Object} 
 */
function calculateDealRating(askingPrice, marketAvgPrice) {
  if (!Number.isFinite(askingPrice) || !Number.isFinite(marketAvgPrice) ||
      askingPrice <= 0 || marketAvgPrice <= 0) {
    return {
      rating: "Unavailable",
      color: "gray",
      message: "Insufficient pricing data to generate deal rating.",
      estimatedRange: null
    };
  }
  // A comparison band around the asking-price average, not a measured market range.
  const lowerBound = Math.round(marketAvgPrice * 0.90);
  const upperBound = Math.round(marketAvgPrice * 1.10);
  let rating = "Fair Deal";
  let color = "yellow";
  let explanation = "";
  if (askingPrice < lowerBound) {
    rating = "Good Deal";
    color = "green";
    explanation = "The asking price is below the comparison band.";
  } else if (askingPrice > upperBound) {
    rating = "Overpriced";
    color = "red";
    explanation = "The asking price is above the comparison band.";
  } else {
    rating = "Fair Deal";
    color = "yellow";
    explanation = "The asking price is within the comparison band.";
  }
  return {
    rating,
    color,
    askingPrice,
    marketAvgPrice,
    estimatedRange: {
      min: lowerBound,
      max: upperBound
    },
    explanation
  };
}
