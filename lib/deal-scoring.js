const roundScore = (value) => Math.max(0, Math.min(100, Math.round(value || 0)));

const numberValue = (...values) => {
  for (const value of values) {
    if (value == null || value === "") continue;
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return numeric;
  }
  return 0;
};

const dateAgeDays = (value, now = new Date()) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return Math.max(0, Math.floor((now.getTime() - date.getTime()) / 86400000));
};

const readPath = (value, paths) => {
  for (const path of paths) {
    const found = path.split(".").reduce((current, key) => current?.[key], value);
    if (found != null) return found;
  }
  return null;
};

export const scoreBand = (score) => {
  if (score >= 70) return { label: "STRONG BUY", tone: "green" };
  if (score >= 40) return { label: "WORTH A LOOK", tone: "yellow" };
  return { label: "PASS", tone: "red" };
};

export const normalizedRentCast = (property = {}) => property.rentcastData || property.rentcast_data || null;

export function dealInputs(property = {}) {
  const rentcast = normalizedRentCast(property);
  const avm = rentcast?.avm || {};
  const details = rentcast?.propertyDetails?.[0] || rentcast?.propertyDetails || {};
  const listing = Array.isArray(rentcast?.saleListing) ? rentcast.saleListing[0] : rentcast?.saleListing;

  const arv = numberValue(
    property.arv,
    property.afterRepairValue,
    property.estimatedMarketValue,
    avm.price,
    avm.value,
    avm.estimate,
    avm.estimatedValue,
    avm.valueEstimate,
    property.listPrice ? Math.round(property.listPrice * 1.16 / 1000) * 1000 : 0
  );
  const rehab = numberValue(property.rehab, property.rehabEstimate, property.rehab_estimate);
  const purchasePrice = numberValue(property.purchasePrice, property.purchase_price, property.targetOfferHigh, property.listPrice);
  const closingCosts = numberValue(property.closingCosts, property.closing_costs);
  const holdingCosts = numberValue(property.holdingCosts, property.holding_costs);
  const financingCost = numberValue(property.financingCost, property.financing_cost);
  const sellingCost = numberValue(property.sellingCost, property.selling_cost);
  const netProfit = arv - purchasePrice - closingCosts - holdingCosts - rehab - financingCost - sellingCost;
  const comps = avm.comparables || avm.comps || [];
  const market = rentcast?.market || {};
  const saleData = market.saleData || market.sale_data || {};
  const avgDaysOnMarket = numberValue(
    property.avgDaysOnMarket,
    property.averageDaysOnMarket,
    saleData.averageDaysOnMarket,
    saleData.avgDaysOnMarket,
    saleData.daysOnMarket?.average,
    market.averageDaysOnMarket
  );
  const daysListed = numberValue(
    property.daysListed,
    property.daysOnMarket,
    listing?.daysOnMarket,
    listing?.daysOld,
    dateAgeDays(listing?.listedDate || listing?.createdDate || listing?.firstSeenDate)
  );
  const history = listing?.history || details?.history || property.priceHistory || [];
  const hasPriceReduction = Boolean(
    property.priceReduced ||
    property.hasPriceReduction ||
    listing?.priceReduced ||
    listing?.priceChangeDate ||
    (Array.isArray(history) && history.some((event, index) => {
      const price = numberValue(event.price, event.listPrice);
      const prior = numberValue(history[index + 1]?.price, history[index + 1]?.listPrice);
      return price > 0 && prior > 0 && price < prior;
    }))
  );

  return { arv, rehab, purchasePrice, closingCosts, holdingCosts, financingCost, sellingCost, netProfit, comps, avgDaysOnMarket, daysListed, hasPriceReduction };
}

function compAgeDays(comp) {
  return numberValue(
    comp.daysOld,
    comp.daysSinceSale,
    dateAgeDays(comp.soldDate || comp.saleDate || comp.lastSaleDate || comp.removedDate || comp.lastSeenDate)
  );
}

function compDistance(comp) {
  return numberValue(comp.distance, comp.distanceMiles, comp.distanceFromSubject, readPath(comp, ["location.distance"]));
}

export function calculateDealScore(property = {}) {
  const inputs = dealInputs(property);
  const profitMargin = inputs.arv > 0 ? inputs.netProfit / inputs.arv : 0;
  const rehabRatio = inputs.arv > 0 ? inputs.rehab / inputs.arv : 1;

  const profitMarginScore = profitMargin > 0.25 ? 30 : profitMargin >= 0.20 ? 24 : profitMargin >= 0.15 ? 16 : profitMargin >= 0.10 ? 8 : 0;
  const rehabRiskScore = rehabRatio < 0.15 ? 20 : rehabRatio <= 0.25 ? 13 : rehabRatio <= 0.35 ? 6 : 0;

  const comps = Array.isArray(inputs.comps) ? inputs.comps : [];
  const closeRecentComps = comps.filter((comp) => compDistance(comp) <= 0.5 && compAgeDays(comp) <= 90).length;
  const goodComps = comps.filter((comp) => compDistance(comp) <= 1 && compAgeDays(comp) <= 180).length;
  const arvConfidenceScore = closeRecentComps >= 3 ? 20 : goodComps >= 2 ? 12 : comps.length >= 1 ? 5 : 0;

  const dom = inputs.avgDaysOnMarket;
  const marketMomentumScore = dom > 0 && dom < 20 ? 15 : dom >= 20 && dom <= 45 ? 10 : dom > 45 && dom <= 90 ? 5 : 0;

  const listed = inputs.daysListed;
  const listedScore = listed > 60 ? 15 : listed >= 30 ? 10 : listed >= 7 ? 5 : listed > 0 ? 2 : 0;
  const sellerMotivationScore = Math.min(15, listedScore + (inputs.hasPriceReduction ? 5 : 0));

  const total = profitMarginScore + rehabRiskScore + arvConfidenceScore + marketMomentumScore + sellerMotivationScore;

  return {
    total: roundScore(total),
    score: roundScore(total),
    band: scoreBand(total),
    inputs,
    categories: [
      { key: "profitMargin", label: "Profit Margin", score: profitMarginScore, max: 30 },
      { key: "rehabRisk", label: "Rehab Risk", score: rehabRiskScore, max: 20 },
      { key: "arvConfidence", label: "ARV Confidence", score: arvConfidenceScore, max: 20 },
      { key: "marketMomentum", label: "Market Momentum", score: marketMomentumScore, max: 15 },
      { key: "sellerMotivation", label: "Seller Motivation", score: sellerMotivationScore, max: 15 }
    ]
  };
}
