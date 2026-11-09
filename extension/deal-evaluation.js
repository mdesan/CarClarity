/** 
 * Deal Valuation & Rating Module for CarClarity (F4)
 * Compares an asking price from seller against baseline market pricing data 
 * to determine if a listing is a good, fair, or overpriced deal.
 * Evaluates the listing deal rating based on asking price and market range
 * @param {number} askingPrice 
 * @param {number} marketAvgPrice
 * @param {number} mileage
 * @returns {Object} 
 */
function calculateDealRating(askingPrice, marketAvgPrice, mileage = null) {
  if (!askingPrice || !marketAvgPrice || askingPrice <= 0 || marketAvgPrice <= 0) {
    return {
      rating: "Unavailable",
      color: "gray",
      message: "Insufficient pricing data to generate deal rating.",
      estimatedRange: null
    };
  }
  // Define market value range (+/- 10% of market average)
  const lowerBound = Math.round(marketAvgPrice * 0.90);
  const upperBound = Math.round(marketAvgPrice * 1.10);
  let rating = "Fair Deal";
  let color = "yellow";
  let explanation = "";
  if (askingPrice < lowerBound) {
    rating = "Good Deal";
    color = "green";
    explanation = `Asking price ($${askingPrice.toLocaleString()}) is below the market range ($${lowerBound.toLocaleString()} - $${upperBound.toLocaleString()}).`;
  } else if (askingPrice > upperBound) {
    rating = "Overpriced";
    color = "red";
    explanation = `Asking price ($${askingPrice.toLocaleString()}) is above the market range ($${lowerBound.toLocaleString()} - $${upperBound.toLocaleString()}).`;
  } else {
    rating = "Fair Deal";
    color = "yellow";
    explanation = `Asking price ($${askingPrice.toLocaleString()}) is within expected market range ($${lowerBound.toLocaleString()} - $${upperBound.toLocaleString()}).`;
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