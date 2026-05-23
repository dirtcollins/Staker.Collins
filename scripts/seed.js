import "dotenv/config";
import { readFile } from "node:fs/promises";
import pg from "pg";
import { calculateDealScore } from "../lib/deal-scoring.js";

const { Pool } = pg;

const priorityAddresses = new Set(["1301 Sycamore Dr", "311 Madison St", "131 Lake Rd", "608 Polk St"]);

const propertyId = (property) => `${property.address}-${property.zip}`
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, "-")
  .replace(/(^-|-$)/g, "");

const fallbackAssumptions = (property) => ({
  arv: property.arv || Math.round((property.listPrice || 0) * (priorityAddresses.has(property.address) ? 1.22 : 1.16) / 1000) * 1000,
  rehab: property.rehab || (priorityAddresses.has(property.address) ? 55000 : 35000)
});

const dollarsToCents = (value) => Math.round(Number(value || 0) * 100);

const scoreProperty = (property) => {
  const scoring = calculateDealScore({ ...property, ...fallbackAssumptions(property) });
  const category = (key) => scoring.categories.find((item) => item.key === key)?.score || 0;
  return {
    score: scoring.total,
    profitMarginScore: category("profitMargin"),
    rehabRiskScore: category("rehabRisk"),
    arvConfidenceScore: category("arvConfidence"),
    marketMomentumScore: category("marketMomentum"),
    sellerMotivationScore: category("sellerMotivation"),
    scoreBreakdown: scoring.categories
  };
};

const stageFor = (property) => {
  if (property.acquisitionStatus || property.stage) return property.acquisitionStatus || property.stage;
  if (priorityAddresses.has(property.address)) return "Needs Review";
  if (property.rank <= 5) return "New Lead";
  if (property.rank <= 15) return "Underwriting";
  return "Negotiation";
};

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required to seed PostgreSQL.");
}

const isProduction = process.env.NODE_ENV === "production";
const allowOverwrite = process.env.SEED_ALLOW_OVERWRITE === "1";
if (isProduction && !allowOverwrite) {
  throw new Error(
    "Refusing to run seed against NODE_ENV=production without " +
    "SEED_ALLOW_OVERWRITE=1. Seeding overwrites rank, prices, offers, " +
    "verification_status, source JSONB, and deal_scores rows for every " +
    "address in flip-targets.json — including manual team edits."
  );
}
if (allowOverwrite) {
  console.warn("[seed] SEED_ALLOW_OVERWRITE=1 — running destructive upsert.");
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const seed = JSON.parse(await readFile(new URL("../data/flip-targets.json", import.meta.url), "utf8"));

try {
  for (const property of seed.targets) {
    const id = propertyId(property);
    const stage = stageFor(property);
    const mainPhoto = property.mainPhoto || (property.address === "1301 Sycamore Dr" ? "assets/1301-sycamore-main.jpg" : null);
    const score = scoreProperty(property);

    await pool.query(`
      INSERT INTO properties (
        id, rank, address, city, state, zip, list_price_cents, target_offer_low_cents, target_offer_high_cents,
        listing_agent, brokerage, phone, why, priority, verification_status, acquisition_status,
        property_phase, main_photo, source
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,'acquisition',$17,$18)
      ON CONFLICT (id) DO UPDATE SET
        rank = EXCLUDED.rank,
        address = EXCLUDED.address,
        city = EXCLUDED.city,
        state = EXCLUDED.state,
        zip = EXCLUDED.zip,
        list_price_cents = EXCLUDED.list_price_cents,
        target_offer_low_cents = EXCLUDED.target_offer_low_cents,
        target_offer_high_cents = EXCLUDED.target_offer_high_cents,
        listing_agent = EXCLUDED.listing_agent,
        brokerage = EXCLUDED.brokerage,
        phone = EXCLUDED.phone,
        why = EXCLUDED.why,
        priority = EXCLUDED.priority,
        verification_status = EXCLUDED.verification_status,
        main_photo = COALESCE(properties.main_photo, EXCLUDED.main_photo),
        source = EXCLUDED.source,
        updated_at = now()
    `, [
      id,
      property.rank,
      property.address,
      property.city,
      property.state,
      property.zip,
      dollarsToCents(property.listPrice),
      dollarsToCents(property.targetOfferLow),
      dollarsToCents(property.targetOfferHigh),
      property.listingAgent,
      property.brokerage,
      property.phone,
      property.why,
      property.priority,
      property.status,
      stage,
      mainPhoto,
      property
    ]);

    await pool.query(`
      INSERT INTO pipeline_stages (property_id, stage)
      VALUES ($1, $2)
      ON CONFLICT (property_id) DO UPDATE SET stage = EXCLUDED.stage, updated_at = now()
    `, [id, stage]);

    await pool.query(`
      INSERT INTO deal_scores (
        property_id, score, profit_margin_score, rehab_risk_score, arv_confidence_score,
        market_momentum_score, seller_motivation_score, score_breakdown
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
      ON CONFLICT (property_id) DO UPDATE SET
        score = EXCLUDED.score,
        profit_margin_score = EXCLUDED.profit_margin_score,
        rehab_risk_score = EXCLUDED.rehab_risk_score,
        arv_confidence_score = EXCLUDED.arv_confidence_score,
        market_momentum_score = EXCLUDED.market_momentum_score,
        seller_motivation_score = EXCLUDED.seller_motivation_score,
        score_breakdown = EXCLUDED.score_breakdown,
        updated_at = now()
    `, [
      id,
      score.score,
      score.profitMarginScore,
      score.rehabRiskScore,
      score.arvConfidenceScore,
      score.marketMomentumScore,
      score.sellerMotivationScore,
      JSON.stringify(score.scoreBreakdown)
    ]);
  }

  console.log(`Seeded ${seed.targets.length} properties.`);
} finally {
  await pool.end();
}
