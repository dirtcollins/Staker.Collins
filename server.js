import "dotenv/config";
import { createServer } from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createReadStream, existsSync } from "node:fs";
import { dirname, extname, join, normalize } from "node:path";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { calculateDealScore } from "./lib/deal-scoring.js";

const { Pool } = pg;
const root = process.cwd();
const port = Number(process.env.PORT || 3000);
const useMemory = process.env.MEMORY_DB === "1" || !process.env.DATABASE_URL;
const pool = useMemory ? null : new Pool({ connectionString: process.env.DATABASE_URL });
const runtimeChatPath = join(root, "data/runtime-chat-messages.json");
const runtimeProspectMediaPath = join(root, "data/runtime-prospect-media.json");
const mediaUploadDir = join(root, "uploads/media");
const isVercel = process.env.VERCEL === "1";

const TEAM = [
  { name: "Ashton Staker", phone: "9314502979", role: "owner" },
  { name: "Brent Staker", phone: "6618055729", role: "owner" },
  { name: "Nathan Staker", phone: "5625528311", role: "acquisition" },
  { name: "Nicole Staker", phone: "5628332046", role: "acquisition" },
  { name: "Brendan Collins", phone: "6614442857", role: "owner" }
];

const jsonHeaders = { "content-type": "application/json; charset=utf-8" };
const mime = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
  ".webm": "video/webm"
};

const memory = {
  properties: [],
  notes: [],
  tasks: [],
  documents: [],
  scope: [],
  featureRequests: [],
  chatMessages: [],
  prospectMedia: [],
  underwriting: [],
  activityLog: []
};
const chatPresence = new Map();
const chatPresenceTtlMs = 15_000;

const propertyId = (property) => `${property.address}-${property.zip}`
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, "-")
  .replace(/(^-|-$)/g, "");

const priorityAddresses = new Set(["1301 Sycamore Dr", "311 Madison St", "131 Lake Rd", "608 Polk St"]);
const pipelineStages = [
  "New Lead",
  "Needs Review",
  "Underwriting",
  "Offer Made",
  "Negotiation",
  "Under Contract",
  "Due Diligence",
  "Approved",
  "Closed",
  "Passed"
];
const staleRentCastMs = 7 * 24 * 60 * 60 * 1000;

const stageFor = (property) => {
  if (property.acquisitionStatus || property.stage) return normalizeStage(property.acquisitionStatus || property.stage);
  if (priorityAddresses.has(property.address)) return "Needs Review";
  return "New Lead";
};

const normalizeStage = (stage) => pipelineStages.includes(stage) ? stage : "New Lead";

function ownedDefaultsFor(row) {
  const source = row.source || {};
  const owned = source.owned || {};
  const timeline = source.timeline || {};
  const purchaseDate = timeline.purchaseDate || owned.purchaseCloseDate || new Date().toISOString().slice(0, 10);
  return {
    ...owned,
    ownedPhase: owned.ownedPhase || "Purchased / Not Started",
    purchaseCloseDate: purchaseDate,
    actualPurchasePrice: owned.actualPurchasePrice || row.target_offer_high || row.list_price || null,
    forecastArv: owned.forecastArv || source.arv || null,
    monthlyHoldingCost: owned.monthlyHoldingCost || 3000,
    nextAction: owned.nextAction || null
  };
}

function timelineDefaultsFor(row, owned) {
  const timeline = row.source?.timeline || {};
  return {
    ...timeline,
    purchaseDate: timeline.purchaseDate || owned.purchaseCloseDate || null,
    rehabEnd: timeline.rehabEnd || owned.targetRehabComplete || null,
    listDate: timeline.listDate || owned.listDate || null,
    saleDate: timeline.saleDate || owned.saleCloseDate || null
  };
}

function fallbackAssumptions(property) {
  const listPrice = property.listPrice ?? property.list_price ?? 0;
  return {
    arv: property.arv || Math.round(listPrice * (priorityAddresses.has(property.address) ? 1.22 : 1.16) / 1000) * 1000,
    rehab: property.rehab || (priorityAddresses.has(property.address) ? 55000 : 35000)
  };
}

const dollarsToCents = (value) => Math.round(Number(value || 0) * 100);
const centsToDollars = (value) => Math.round(Number(value || 0)) / 100;

function calculateUnderwriting(input) {
  const listPrice = Number(input.listPrice || 0);
  const arv = Number(input.arv || 0);
  const rehabEstimate = Number(input.rehabEstimate || 0);
  const proposedOffer = Number(input.proposedOffer || 0);
  const closingCosts = Number(input.closingCosts || 0);
  const holdingCosts = Number(input.holdingCosts || 0);
  const financingCost = 0;
  const sellingCost = Number(input.sellingCost || 0);
  const targetProfit = Number(input.targetProfit || 0);
  const contingency = Number(input.contingency || 0);
  const officialMao = (arv * 0.70) - rehabEstimate;
  const targetProfitOffer = arv - rehabEstimate - closingCosts - holdingCosts - financingCost - sellingCost - targetProfit - contingency;
  const recommendedMaxOffer = Math.min(officialMao, targetProfitOffer);
  const netProfit = arv - proposedOffer - closingCosts - holdingCosts - rehabEstimate - financingCost - sellingCost;
  const cashBasis = proposedOffer + rehabEstimate + closingCosts;
  const roi = cashBasis > 0 ? netProfit / cashBasis : 0;
  const profitMargin = arv > 0 ? netProfit / arv : 0;
  const listSpread = listPrice - proposedOffer;
  const maoSpread = officialMao - proposedOffer;
  const warnings = [];
  if (!arv) warnings.push("ARV is missing.");
  if (!rehabEstimate) warnings.push("Rehab estimate is missing.");
  if (!proposedOffer) warnings.push("Proposed offer is missing.");
  if (proposedOffer > officialMao) warnings.push("Proposed offer is above the official 70% MAO.");
  if (proposedOffer > targetProfitOffer) warnings.push("Proposed offer misses the target-profit offer.");
  const signal = proposedOffer <= recommendedMaxOffer && roi >= 0.18
    ? "Strong"
    : proposedOffer <= recommendedMaxOffer && roi >= 0.10
      ? "Workable"
      : "Review";
  return {
    officialMao,
    targetProfitOffer,
    recommendedMaxOffer,
    netProfit,
    roi,
    profitMargin,
    listSpread,
    maoSpread,
    signal,
    warnings
  };
}

function underwritingToClient(row) {
  if (!row) return null;
  return {
    propertyId: row.property_id,
    listPrice: centsToDollars(row.list_price_cents),
    arv: centsToDollars(row.arv_cents),
    rehabEstimate: centsToDollars(row.rehab_estimate_cents),
    proposedOffer: centsToDollars(row.proposed_offer_cents),
    closingCosts: centsToDollars(row.closing_costs_cents),
    holdingCosts: centsToDollars(row.holding_costs_cents),
    financingCost: centsToDollars(row.financing_cost_cents),
    sellingCost: centsToDollars(row.selling_cost_cents),
    targetProfit: centsToDollars(row.target_profit_cents),
    contingency: centsToDollars(row.contingency_cents),
    calculation: row.calculation || {},
    weeksAcquisition: row.calculation?.weeksAcquisition || null,
    weeksRehab: row.calculation?.weeksRehab || null,
    weeksSale: row.calculation?.weeksSale || null,
    notes: row.notes || "",
    updatedAt: row.updated_at || row.updatedAt || row.created_at || null,
    createdBy: row.created_by || row.createdBy || "Team"
  };
}

function normalizeUnderwriting(propertyIdValue, body) {
  const input = {
    propertyId: propertyIdValue,
    listPrice: Number(body.listPrice || 0),
    arv: Number(body.arv || 0),
    rehabEstimate: Number(body.rehabEstimate || body.rehab || 0),
    proposedOffer: Number(body.proposedOffer || body.purchasePrice || 0),
    closingCosts: Number(body.closingCosts || 0),
    holdingCosts: Number(body.holdingCosts || 0),
    financingCost: 0,
    sellingCost: Number(body.sellingCost || 0),
    targetProfit: Number(body.targetProfit || 0),
    contingency: Number(body.contingency || 0),
    notes: body.notes || "",
    createdBy: body.createdBy || body.actor || "Team"
  };
  const calculation = {
    ...calculateUnderwriting(input),
    weeksAcquisition: body.weeksAcquisition || null,
    weeksRehab: body.weeksRehab || null,
    weeksSale: body.weeksSale || null,
  };
  return {
    property_id: propertyIdValue,
    list_price_cents: dollarsToCents(input.listPrice),
    arv_cents: dollarsToCents(input.arv),
    rehab_estimate_cents: dollarsToCents(input.rehabEstimate),
    proposed_offer_cents: dollarsToCents(input.proposedOffer),
    closing_costs_cents: dollarsToCents(input.closingCosts),
    holding_costs_cents: dollarsToCents(input.holdingCosts),
    financing_cost_cents: dollarsToCents(input.financingCost),
    selling_cost_cents: dollarsToCents(input.sellingCost),
    target_profit_cents: dollarsToCents(input.targetProfit),
    contingency_cents: dollarsToCents(input.contingency),
    calculation,
    notes: input.notes,
    created_by: input.createdBy,
    updated_at: new Date().toISOString()
  };
}

function scoreColumns(scoring) {
  const category = (key) => scoring.categories.find((item) => item.key === key)?.score || 0;
  return {
    score: scoring.total,
    profit_margin_score: category("profitMargin"),
    rehab_risk_score: category("rehabRisk"),
    arv_confidence_score: category("arvConfidence"),
    market_momentum_score: category("marketMomentum"),
    seller_motivation_score: category("sellerMotivation"),
    score_breakdown: scoring.categories
  };
}

async function loadMemorySeed() {
  const data = JSON.parse(await readFile(join(root, "data/flip-targets.json"), "utf8"));
  memory.properties = data.targets.map((property) => {
    const id = propertyId(property);
    const scoring = scoreColumns(calculateDealScore({ ...property, ...fallbackAssumptions(property) }));
    return {
      id,
      rank: property.rank,
      address: property.address,
      city: property.city,
      state: property.state,
      zip: property.zip,
      list_price: property.listPrice,
      target_offer_low: property.targetOfferLow,
      target_offer_high: property.targetOfferHigh,
      listing_agent: property.listingAgent,
      brokerage: property.brokerage,
      phone: property.phone,
      why: property.why,
      priority: property.priority,
      verification_status: property.status,
      acquisition_status: stageFor(property),
      property_phase: "acquisition",
      main_photo: property.mainPhoto || (property.address === "1301 Sycamore Dr" ? "assets/1301-sycamore-main.jpg" : null),
      quick_summary: "",
      rentcast_data: property.rentcastData || null,
      rentcast_fetched_at: property.rentcastFetchedAt || null,
      source: property,
      ...scoring
    };
  });
  memory.chatMessages = await readRuntimeChatMessages();
  memory.prospectMedia = await readRuntimeProspectMedia();
}

async function readRuntimeChatMessages() {
  if (!useMemory) return [];
  try {
    const rows = JSON.parse(await readFile(runtimeChatPath, "utf8"));
    return Array.isArray(rows) ? rows.map((message) => ({
      id: message.id || randomUUID(),
      channel: normalizeChatChannel(message.channel),
      author: String(message.author || "Team"),
      author_role: String(message.author_role || message.authorRole || "team"),
      body: String(message.body || message.text || ""),
      property_id: message.property_id || message.propertyId || null,
      created_at: message.created_at || message.createdAt || new Date().toISOString(),
      deleted_at: message.deleted_at || null
    })).filter((message) => message.body.trim()) : [];
  } catch (error) {
    if (error.code !== "ENOENT") console.warn(`Could not read chat storage: ${error.message}`);
    return [];
  }
}

async function writeRuntimeChatMessages() {
  if (!useMemory) return;
  try {
    await mkdir(dirname(runtimeChatPath), { recursive: true });
    await writeFile(runtimeChatPath, JSON.stringify(memory.chatMessages, null, 2));
  } catch (error) {
    console.warn(`Could not write chat storage: ${error.message}`);
  }
}

function normalizeProspectMediaRow(item = {}) {
  const createdAt = item.created_at || item.createdAt || new Date().toISOString();
  const url = String(item.url || "").trim();
  return {
    id: item.id || randomUUID(),
    property_id: item.property_id || item.propertyId || null,
    url,
    type: String(item.type || (/(\.mp4|\.mov|\.webm)(\?|$)/i.test(url) ? "Video" : "Photo")),
    category: String(item.category || item.room || "General"),
    caption: item.caption ? String(item.caption) : null,
    mime_type: item.mime_type || item.mimeType || null,
    original_name: item.original_name || item.originalName || null,
    created_by: String(item.created_by || item.createdBy || "Team"),
    created_at: createdAt
  };
}

async function readRuntimeProspectMedia() {
  if (!useMemory) return [];
  try {
    const rows = JSON.parse(await readFile(runtimeProspectMediaPath, "utf8"));
    return Array.isArray(rows) ? rows.map(normalizeProspectMediaRow).filter((item) => item.url) : [];
  } catch (error) {
    if (error.code !== "ENOENT") console.warn(`Could not read prospect media storage: ${error.message}`);
    return [];
  }
}

async function writeRuntimeProspectMedia() {
  if (!useMemory) return;
  try {
    await mkdir(dirname(runtimeProspectMediaPath), { recursive: true });
    await writeFile(runtimeProspectMediaPath, JSON.stringify(memory.prospectMedia, null, 2));
  } catch (error) {
    console.warn(`Could not write prospect media storage: ${error.message}`);
  }
}

async function listProspectMedia() {
  if (!useMemory) {
    return await dbQuery("SELECT * FROM prospect_media ORDER BY created_at DESC");
  }
  return memory.prospectMedia.slice().sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
}

async function createProspectMedia(body = {}) {
  const row = normalizeProspectMediaRow({
    id: randomUUID(),
    ...body,
    created_at: new Date().toISOString()
  });
  if (!row.url) {
    const error = new Error("Choose a file or paste a media link.");
    error.status = 400;
    throw error;
  }
  if (!useMemory) {
    const rows = await dbQuery(`
      INSERT INTO prospect_media (
        id, property_id, url, type, category, caption, mime_type, original_name, created_by
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      RETURNING *
    `, [
      row.id,
      row.property_id,
      row.url,
      row.type,
      row.category,
      row.caption,
      row.mime_type,
      row.original_name,
      row.created_by
    ]);
    return rows[0];
  }
  memory.prospectMedia.unshift(row);
  await writeRuntimeProspectMedia();
  return row;
}

async function deleteProspectMedia(id) {
  if (!useMemory) {
    const rows = await dbQuery("DELETE FROM prospect_media WHERE id = $1 RETURNING id", [id]);
    return rows.length > 0;
  }
  const before = memory.prospectMedia.length;
  memory.prospectMedia = memory.prospectMedia.filter((item) => item.id !== id);
  if (before !== memory.prospectMedia.length) await writeRuntimeProspectMedia();
  return before !== memory.prospectMedia.length;
}

function toClientProperty(row) {
  const source = row.source || {};
  const underwriting = row.underwriting_snapshot
    ? underwritingToClient(row.underwriting_snapshot)
    : underwritingToClient(memory.underwriting.find((item) => item.property_id === row.id));
  const property = {
    ...source,
    id: row.id,
    rank: row.rank,
    address: row.address,
    city: row.city,
    state: row.state,
    zip: row.zip,
    listPrice: row.list_price,
    targetOfferLow: row.target_offer_low,
    targetOfferHigh: row.target_offer_high,
    listingAgent: row.listing_agent,
    brokerage: row.brokerage,
    phone: row.phone,
    why: row.why,
    priority: row.priority,
    status: row.verification_status,
    acquisitionStatus: normalizeStage(row.acquisition_status),
    stage: normalizeStage(row.acquisition_status),
    propertyPhase: row.property_phase,
    mainPhoto: row.main_photo || source.mainPhoto || null,
    quickSummary: row.quick_summary || "",
    rentcastData: row.rentcast_data || source.rentcastData || null,
    rentcastFetchedAt: row.rentcast_fetched_at || source.rentcastFetchedAt || null,
    score: row.deal_score ?? row.score ?? 0,
    underwriting
  };
  if (underwriting) {
    property.arv = underwriting.arv || property.arv;
    property.rehab = underwriting.rehabEstimate || property.rehab;
    property.purchasePrice = underwriting.proposedOffer || property.purchasePrice;
    property.closingCosts = underwriting.closingCosts;
    property.holdingCosts = underwriting.holdingCosts;
    property.financingCost = underwriting.financingCost;
    property.sellingCost = underwriting.sellingCost;
  }
  const scoreBreakdown = row.score_breakdown || [
    { key: "profitMargin", label: "Profit Margin", score: row.profit_margin_score || 0, max: 30 },
    { key: "rehabRisk", label: "Rehab Risk", score: row.rehab_risk_score || 0, max: 20 },
    { key: "arvConfidence", label: "ARV Confidence", score: row.arv_confidence_score || 0, max: 20 },
    { key: "marketMomentum", label: "Market Momentum", score: row.market_momentum_score || 0, max: 15 },
    { key: "sellerMotivation", label: "Seller Motivation", score: row.seller_motivation_score || 0, max: 15 }
  ];
  const calculated = scoreBreakdown.some((item) => item.score > 0)
    ? { total: property.score, categories: scoreBreakdown }
    : calculateDealScore({ ...property, ...fallbackAssumptions(property) });
  return {
    ...property,
    ...fallbackAssumptions(property),
    score: calculated.total,
    scoreBreakdown: calculated.categories
  };
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

async function readRawBody(req, maxBytes = 60 * 1024 * 1024) {
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > maxBytes) {
      const error = new Error("Upload is too large.");
      error.status = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function parseMultipartUpload(req) {
  const contentType = req.headers["content-type"] || "";
  const boundary = contentType.match(/boundary=([^;]+)/)?.[1];
  if (!boundary) {
    const error = new Error("Multipart boundary is missing.");
    error.status = 400;
    throw error;
  }
  const raw = (await readRawBody(req)).toString("binary");
  const parts = raw.split(`--${boundary}`).filter((part) => part.includes("Content-Disposition"));
  for (const part of parts) {
    const [headerBlock, ...bodyParts] = part.split("\r\n\r\n");
    const body = bodyParts.join("\r\n\r\n").replace(/\r\n--$/, "").replace(/\r\n$/, "");
    const name = headerBlock.match(/name="([^"]+)"/)?.[1];
    const filename = headerBlock.match(/filename="([^"]*)"/)?.[1];
    if (name !== "file" || !filename) continue;
    const mimeType = headerBlock.match(/Content-Type:\s*([^\r\n]+)/i)?.[1] || "application/octet-stream";
    return { filename, mimeType, buffer: Buffer.from(body, "binary") };
  }
  const error = new Error("No media file was uploaded.");
  error.status = 400;
  throw error;
}

async function saveUploadedMedia(req) {
  const file = await parseMultipartUpload(req);
  if (!file.mimeType.startsWith("image/") && !file.mimeType.startsWith("video/")) {
    const error = new Error("Only image and video uploads are supported.");
    error.status = 400;
    throw error;
  }
  const extensionFromMime = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/gif": ".gif",
    "video/mp4": ".mp4",
    "video/quicktime": ".mov",
    "video/webm": ".webm"
  };
  const ext = extensionFromMime[file.mimeType] || extname(file.filename).toLowerCase() || ".bin";
  const safeName = `${randomUUID()}${ext}`;
  if (isVercel) {
    return {
      url: `data:${file.mimeType};base64,${file.buffer.toString("base64")}`,
      filename: safeName,
      originalName: file.filename,
      mimeType: file.mimeType,
      size: file.buffer.length
    };
  }
  await mkdir(mediaUploadDir, { recursive: true });
  await writeFile(join(mediaUploadDir, safeName), file.buffer);
  return {
    url: `/uploads/media/${safeName}`,
    filename: safeName,
    originalName: file.filename,
    mimeType: file.mimeType,
    size: file.buffer.length
  };
}

function send(res, status, payload) {
  res.writeHead(status, jsonHeaders);
  res.end(JSON.stringify(payload));
}

function notFound(res) {
  send(res, 404, { error: "Not found" });
}

async function dbQuery(sql, params = []) {
  const result = await pool.query(sql, params);
  return result.rows;
}

function rentCastAddress(property) {
  return `${property.address}, ${property.city}, ${property.state}, ${property.zip}`;
}

function isRentCastStale(property) {
  const fetchedAt = property.rentcast_fetched_at || property.rentcastFetchedAt;
  if (!fetchedAt) return true;
  return Date.now() - new Date(fetchedAt).getTime() > staleRentCastMs;
}

async function rentCastGet(pathname, params) {
  if (!process.env.RENTCAST_API_KEY) throw new Error("RENTCAST_API_KEY is not configured.");
  const url = new URL(`https://api.rentcast.io/v1${pathname}`);
  Object.entries(params).forEach(([key, value]) => {
    if (value != null && value !== "") url.searchParams.set(key, String(value));
  });
  const response = await fetch(url, {
    headers: {
      accept: "application/json",
      "X-Api-Key": process.env.RENTCAST_API_KEY
    }
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`RentCast ${pathname} failed with ${response.status}: ${body}`);
  }
  return response.json();
}

async function fetchRentCastData(property) {
  const address = rentCastAddress(property);
  const [avm, saleListing, market, propertyDetails] = await Promise.all([
    rentCastGet("/avm/value", {
      address,
      bedrooms: property.beds,
      bathrooms: property.baths,
      squareFootage: property.sqft,
      maxRadius: 1,
      daysOld: 180,
      compCount: 15,
      lookupSubjectAttributes: true
    }),
    rentCastGet("/listings/sale", { address, limit: 1 }),
    rentCastGet("/markets", { zipCode: property.zip, dataType: "Sale", historyRange: 6 }),
    rentCastGet("/properties", { address, limit: 1 })
  ]);
  return {
    fetchedAt: new Date().toISOString(),
    avm,
    saleListing,
    market,
    propertyDetails
  };
}

async function persistScore(property, rentcastData = property.rentcast_data || property.rentcastData || null) {
  const clientProperty = toClientProperty({ ...property, rentcast_data: rentcastData });
  const scoring = scoreColumns(calculateDealScore({ ...clientProperty, rentcastData }));
  if (useMemory) {
    const record = memory.properties.find((item) => item.id === property.id);
    if (!record) return null;
    Object.assign(record, scoring, {
      rentcast_data: rentcastData,
      rentcast_fetched_at: rentcastData?.fetchedAt || record.rentcast_fetched_at || null
    });
    return toClientProperty(record);
  }
  await dbQuery(`
    UPDATE properties
    SET rentcast_data = $2, rentcast_fetched_at = $3, updated_at = now()
    WHERE id = $1
  `, [property.id, rentcastData, rentcastData?.fetchedAt || null]);
  await dbQuery(`
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
    property.id,
    scoring.score,
    scoring.profit_margin_score,
    scoring.rehab_risk_score,
    scoring.arv_confidence_score,
    scoring.market_momentum_score,
    scoring.seller_motivation_score,
    JSON.stringify(scoring.score_breakdown)
  ]);
  const rows = await dbQuery(`
    SELECT p.*, ds.score AS deal_score, ds.profit_margin_score, ds.rehab_risk_score,
      ds.arv_confidence_score, ds.market_momentum_score, ds.seller_motivation_score, ds.score_breakdown,
      to_jsonb(us.*) AS underwriting_snapshot
    FROM properties p
    LEFT JOIN deal_scores ds ON ds.property_id = p.id
    LEFT JOIN underwriting_snapshots us ON us.property_id = p.id
    WHERE p.id = $1
  `, [property.id]);
  return rows[0] ? toClientProperty(rows[0]) : null;
}

async function refreshPropertyScore(id, force = false) {
  const property = useMemory
    ? memory.properties.find((item) => item.id === id)
    : (await dbQuery("SELECT * FROM properties WHERE id = $1", [id]))[0];
  if (!property) return null;
  if (!force && !isRentCastStale(property)) return persistScore(property);
  const rentcastData = await fetchRentCastData(toClientProperty(property));
  return persistScore(property, rentcastData);
}

async function refreshStaleScores(records) {
  if (!process.env.RENTCAST_API_KEY) return;
  for (const record of records) {
    if (!isRentCastStale(record)) continue;
    try {
      await refreshPropertyScore(record.id, false);
    } catch (error) {
      console.error(`RentCast refresh failed for ${record.id}: ${error.message}`);
    }
  }
}

async function listProperties() {
  if (useMemory) {
    await refreshStaleScores(memory.properties);
    return memory.properties.map(toClientProperty);
  }
  let rows = await dbQuery(`
    SELECT p.*, ds.score AS deal_score, ds.profit_margin_score, ds.rehab_risk_score,
      ds.arv_confidence_score, ds.market_momentum_score, ds.seller_motivation_score, ds.score_breakdown,
      to_jsonb(us.*) AS underwriting_snapshot
    FROM properties p
    LEFT JOIN deal_scores ds ON ds.property_id = p.id
    LEFT JOIN underwriting_snapshots us ON us.property_id = p.id
    ORDER BY COALESCE(ds.score, 0) DESC, p.rank ASC
  `);
  await refreshStaleScores(rows);
  if (process.env.RENTCAST_API_KEY && rows.some(isRentCastStale)) {
    rows = await dbQuery(`
      SELECT p.*, ds.score AS deal_score, ds.profit_margin_score, ds.rehab_risk_score,
        ds.arv_confidence_score, ds.market_momentum_score, ds.seller_motivation_score, ds.score_breakdown,
        to_jsonb(us.*) AS underwriting_snapshot
      FROM properties p
      LEFT JOIN deal_scores ds ON ds.property_id = p.id
      LEFT JOIN underwriting_snapshots us ON us.property_id = p.id
      ORDER BY COALESCE(ds.score, 0) DESC, p.rank ASC
    `);
  }
  return rows.map(toClientProperty);
}

async function getPropertyById(id) {
  if (useMemory) {
    const property = memory.properties.find((item) => item.id === id);
    return property ? toClientProperty(property) : null;
  }
  const rows = await dbQuery(`
    SELECT p.*, ds.score AS deal_score, ds.profit_margin_score, ds.rehab_risk_score,
      ds.arv_confidence_score, ds.market_momentum_score, ds.seller_motivation_score, ds.score_breakdown,
      to_jsonb(us.*) AS underwriting_snapshot
    FROM properties p
    LEFT JOIN deal_scores ds ON ds.property_id = p.id
    LEFT JOIN underwriting_snapshots us ON us.property_id = p.id
    WHERE p.id = $1
  `, [id]);
  return rows[0] ? toClientProperty(rows[0]) : null;
}

function propertySourceFromBody(body, existing = {}) {
  return {
    ...existing,
    beds: body.beds ?? existing.beds ?? null,
    baths: body.baths ?? existing.baths ?? null,
    sqft: body.sqft ?? existing.sqft ?? null,
    yearBuilt: body.yearBuilt ?? existing.yearBuilt ?? null,
    lot: body.lot ?? existing.lot ?? null,
    mls: body.mls ?? existing.mls ?? null,
    coListingAgent: body.coListingAgent ?? existing.coListingAgent ?? null,
    secondaryPhone: body.secondaryPhone ?? existing.secondaryPhone ?? null,
    brokeragePhone: body.brokeragePhone ?? existing.brokeragePhone ?? null,
    listingEmail: body.listingEmail ?? existing.listingEmail ?? null,
    listingUrl: body.listingUrl ?? existing.listingUrl ?? null,
    details: existing.details ?? null
  };
}

async function createProperty(body) {
  if (!body.address || !body.city || !body.state || !body.zip) {
    const error = new Error("address, city, state, and zip are required");
    error.status = 400;
    throw error;
  }
  const id = `${propertyId(body)}-${randomUUID().slice(0, 8)}`;
  const source = propertySourceFromBody(body);
  const property = {
    id,
    rank: null,
    address: body.address,
    city: body.city,
    state: body.state,
    zip: body.zip,
    list_price: body.listPrice ?? null,
    target_offer_low: null,
    target_offer_high: null,
    listing_agent: body.listingAgent ?? null,
    brokerage: body.brokerage ?? null,
    phone: body.phone ?? null,
    why: body.why ?? null,
    priority: "standard",
    verification_status: null,
    acquisition_status: "New Lead",
    property_phase: "acquisition",
    main_photo: null,
    quick_summary: "",
    source,
    created_at: new Date().toISOString()
  };
  if (useMemory) {
    memory.properties.unshift(property);
    await writeActivity(id, "property.created", { address: body.address }, "Team");
    return toClientProperty(property);
  }
  await dbQuery(`
    INSERT INTO properties
      (id, address, city, state, zip, list_price, listing_agent, brokerage, phone, why, priority, acquisition_status, source)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
  `, [
    id,
    body.address,
    body.city,
    body.state,
    body.zip,
    body.listPrice ?? null,
    body.listingAgent ?? null,
    body.brokerage ?? null,
    body.phone ?? null,
    body.why ?? null,
    "standard",
    "New Lead",
    JSON.stringify(source)
  ]);
  await writeActivity(id, "property.created", { address: body.address }, "Team");
  return getPropertyById(id);
}

async function updateProperty(id, body) {
  if (useMemory) {
    const property = memory.properties.find((item) => item.id === id);
    if (!property) return null;
    if (body.address !== undefined) property.address = body.address;
    if (body.city !== undefined) property.city = body.city;
    if (body.state !== undefined) property.state = body.state;
    if (body.zip !== undefined) property.zip = body.zip;
    if (body.listPrice !== undefined) property.list_price = body.listPrice;
    if (body.listingAgent !== undefined) property.listing_agent = body.listingAgent;
    if (body.brokerage !== undefined) property.brokerage = body.brokerage;
    if (body.phone !== undefined) property.phone = body.phone;
    if (body.why !== undefined) property.why = body.why;
    property.source = propertySourceFromBody(body, property.source || {});
    property.updated_at = new Date().toISOString();
    await writeActivity(id, "property.updated", {}, "Team");
    return toClientProperty(property);
  }
  const existing = (await dbQuery("SELECT source FROM properties WHERE id = $1", [id]))[0];
  if (!existing) return null;
  const source = propertySourceFromBody(body, existing.source || {});
  await dbQuery(`
    UPDATE properties SET
      address = COALESCE($2, address),
      city = COALESCE($3, city),
      state = COALESCE($4, state),
      zip = COALESCE($5, zip),
      list_price = $6,
      listing_agent = $7,
      brokerage = $8,
      phone = $9,
      why = $10,
      source = $11::jsonb,
      updated_at = now()
    WHERE id = $1
  `, [
    id,
    body.address || null,
    body.city || null,
    body.state || null,
    body.zip || null,
    body.listPrice ?? null,
    body.listingAgent ?? null,
    body.brokerage ?? null,
    body.phone ?? null,
    body.why ?? null,
    JSON.stringify(source)
  ]);
  await writeActivity(id, "property.updated", {}, "Team");
  return getPropertyById(id);
}

async function updatePropertyStatus(id, status, quickSummary) {
  if (useMemory) {
    const property = memory.properties.find((item) => item.id === id);
    if (!property) return null;
    if (status) property.acquisition_status = normalizeStage(status);
    if (quickSummary !== undefined) property.quick_summary = quickSummary;
    await writeActivity(id, "property.status_updated", { status: property.acquisition_status }, "Team");
    return toClientProperty(property);
  }
  const rows = await dbQuery(`
    UPDATE properties
    SET acquisition_status = COALESCE($2, acquisition_status),
        quick_summary = COALESCE($3, quick_summary),
        updated_at = now()
    WHERE id = $1
    RETURNING *
  `, [id, status ? normalizeStage(status) : null, quickSummary ?? null]);
  if (status) {
    await dbQuery(`
      INSERT INTO pipeline_stages (property_id, stage)
      VALUES ($1, $2)
      ON CONFLICT (property_id) DO UPDATE SET stage = EXCLUDED.stage, updated_at = now()
    `, [id, normalizeStage(status)]);
  }
  await writeActivity(id, "property.status_updated", { status: status ? normalizeStage(status) : null }, "Team");
  return rows[0] ? toClientProperty(rows[0]) : null;
}

async function writeActivity(propertyIdValue, action, metadata = {}, actor = "Team") {
  const entry = {
    id: randomUUID(),
    property_id: propertyIdValue,
    action,
    actor,
    metadata,
    created_at: new Date().toISOString()
  };
  if (useMemory) {
    memory.activityLog.unshift(entry);
    return entry;
  }
  const rows = await dbQuery(`
    INSERT INTO activity_log (id, property_id, action, actor, metadata)
    VALUES ($1, $2, $3, $4, $5)
    RETURNING *
  `, [entry.id, propertyIdValue, action, actor, JSON.stringify(metadata)]);
  return rows[0];
}

async function saveUnderwriting(propertyIdValue, body) {
  const property = useMemory
    ? memory.properties.find((item) => item.id === propertyIdValue)
    : (await dbQuery("SELECT * FROM properties WHERE id = $1", [propertyIdValue]))[0];
  if (!property) return null;
  const snapshot = normalizeUnderwriting(propertyIdValue, body);
  if (useMemory) {
    const index = memory.underwriting.findIndex((item) => item.property_id === propertyIdValue);
    if (index >= 0) memory.underwriting[index] = snapshot;
    else memory.underwriting.push(snapshot);
    Object.assign(property, {
      target_offer_high: Math.round(snapshot.calculation.recommendedMaxOffer),
      target_offer_low: Math.round(snapshot.calculation.recommendedMaxOffer * 0.95)
    });
  } else {
    await dbQuery(`
      INSERT INTO underwriting_snapshots (
        property_id, list_price_cents, arv_cents, rehab_estimate_cents, proposed_offer_cents,
        closing_costs_cents, holding_costs_cents, financing_cost_cents, selling_cost_cents,
        target_profit_cents, contingency_cents, calculation, notes, created_by
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
      ON CONFLICT (property_id) DO UPDATE SET
        list_price_cents = EXCLUDED.list_price_cents,
        arv_cents = EXCLUDED.arv_cents,
        rehab_estimate_cents = EXCLUDED.rehab_estimate_cents,
        proposed_offer_cents = EXCLUDED.proposed_offer_cents,
        closing_costs_cents = EXCLUDED.closing_costs_cents,
        holding_costs_cents = EXCLUDED.holding_costs_cents,
        financing_cost_cents = EXCLUDED.financing_cost_cents,
        selling_cost_cents = EXCLUDED.selling_cost_cents,
        target_profit_cents = EXCLUDED.target_profit_cents,
        contingency_cents = EXCLUDED.contingency_cents,
        calculation = EXCLUDED.calculation,
        notes = EXCLUDED.notes,
        created_by = EXCLUDED.created_by,
        updated_at = now()
    `, [
      snapshot.property_id,
      snapshot.list_price_cents,
      snapshot.arv_cents,
      snapshot.rehab_estimate_cents,
      snapshot.proposed_offer_cents,
      snapshot.closing_costs_cents,
      snapshot.holding_costs_cents,
      snapshot.financing_cost_cents,
      snapshot.selling_cost_cents,
      snapshot.target_profit_cents,
      snapshot.contingency_cents,
      JSON.stringify(snapshot.calculation),
      snapshot.notes,
      snapshot.created_by
    ]);
    await dbQuery(`
      UPDATE properties
      SET target_offer_high = $2,
          target_offer_low = $3,
          updated_at = now()
      WHERE id = $1
    `, [
      propertyIdValue,
      Math.round(snapshot.calculation.recommendedMaxOffer),
      Math.round(snapshot.calculation.recommendedMaxOffer * 0.95)
    ]);
  }
  await writeActivity(propertyIdValue, "underwriting.saved", {
    recommendedMaxOffer: snapshot.calculation.recommendedMaxOffer,
    netProfit: snapshot.calculation.netProfit,
    roi: snapshot.calculation.roi,
    signal: snapshot.calculation.signal
  }, snapshot.created_by);
  const updated = useMemory
    ? memory.properties.find((item) => item.id === propertyIdValue)
    : (await dbQuery(`
      SELECT p.*, ds.score AS deal_score, ds.profit_margin_score, ds.rehab_risk_score,
        ds.arv_confidence_score, ds.market_momentum_score, ds.seller_motivation_score, ds.score_breakdown,
        to_jsonb(us.*) AS underwriting_snapshot
      FROM properties p
      LEFT JOIN deal_scores ds ON ds.property_id = p.id
      LEFT JOIN underwriting_snapshots us ON us.property_id = p.id
      WHERE p.id = $1
    `, [propertyIdValue]))[0];
  return persistScore(updated, updated.rentcast_data || updated.rentcastData || null);
}

async function listNotes(propertyIdValue) {
  if (useMemory) return memory.notes.filter((note) => note.property_id === propertyIdValue && !note.deleted_at).sort((a, b) => b.created_at.localeCompare(a.created_at));
  return dbQuery("SELECT id, property_id, author, type, body, created_at FROM notes WHERE property_id = $1 AND deleted_at IS NULL ORDER BY created_at DESC", [propertyIdValue]);
}

async function createNote(propertyIdValue, body) {
  const note = {
    id: randomUUID(),
    property_id: propertyIdValue,
    author: body.author || "Team",
    type: body.type || "General",
    body: body.body || body.text || "",
    created_at: new Date().toISOString()
  };
  if (useMemory) {
    memory.notes.unshift(note);
    await writeActivity(propertyIdValue, "note.created", { type: note.type }, note.author);
    return note;
  }
  const rows = await dbQuery(`
    INSERT INTO notes (property_id, author, type, body)
    VALUES ($1, $2, $3, $4)
    RETURNING id, property_id, author, type, body, created_at
  `, [note.property_id, note.author, note.type, note.body]);
  await writeActivity(propertyIdValue, "note.created", { type: note.type }, note.author);
  return rows[0];
}

async function deleteNote(id) {
  if (useMemory) {
    const note = memory.notes.find((item) => item.id === id);
    if (note) {
      note.deleted_at = new Date().toISOString();
      await writeActivity(note.property_id, "note.deleted", { noteId: id }, "Team");
    }
    return;
  }
  const rows = await dbQuery("UPDATE notes SET deleted_at = now() WHERE id = $1 RETURNING property_id", [id]);
  if (rows[0]) await writeActivity(rows[0].property_id, "note.deleted", { noteId: id }, "Team");
}

async function listFeatureRequests() {
  if (useMemory) return memory.featureRequests.sort((a, b) => b.created_at.localeCompare(a.created_at));
  return dbQuery("SELECT id, requester, priority, body, status, created_at FROM feature_requests ORDER BY created_at DESC");
}

async function createFeatureRequest(body) {
  const featureRequest = {
    id: randomUUID(),
    requester: body.requester || body.author || "Team",
    priority: body.priority || "Nice to have",
    body: body.body || body.text || body.request || "",
    status: body.status || "Open",
    created_at: new Date().toISOString()
  };
  if (useMemory) {
    memory.featureRequests.unshift(featureRequest);
    return featureRequest;
  }
  const rows = await dbQuery(`
    INSERT INTO feature_requests (id, requester, priority, body, status)
    VALUES ($1, $2, $3, $4, $5)
    RETURNING id, requester, priority, body, status, created_at
  `, [featureRequest.id, featureRequest.requester, featureRequest.priority, featureRequest.body, featureRequest.status]);
  return rows[0];
}

async function deleteFeatureRequest(id) {
  if (useMemory) {
    memory.featureRequests = memory.featureRequests.filter((request) => request.id !== id);
    return;
  }
  await dbQuery("DELETE FROM feature_requests WHERE id = $1", [id]);
}

function normalizeChatChannel(channel) {
  const value = String(channel || "general").trim().toLowerCase();
  return ["general", "acquisitions", "construction", "finance"].includes(value) ? value : "general";
}

function updateChatPresence(body = {}) {
  const now = Date.now();
  const channel = normalizeChatChannel(body.channel);
  const sessionId = String(body.sessionId || body.session_id || randomUUID());
  const user = String(body.user || body.author || "Team").trim() || "Team";
  for (const [key, entry] of chatPresence.entries()) {
    if (now - entry.lastSeen > chatPresenceTtlMs) chatPresence.delete(key);
  }
  chatPresence.set(sessionId, { channel, user, lastSeen: now });
  const activeCount = [...chatPresence.values()].filter((entry) =>
    entry.channel === channel && now - entry.lastSeen <= chatPresenceTtlMs
  ).length;
  return { sessionId, channel, activeCount };
}

async function listChatMessages(channel = "general") {
  if (channel === "all") {
    if (useMemory) {
      return memory.chatMessages
        .filter((message) => !message.deleted_at)
        .sort((a, b) => a.created_at.localeCompare(b.created_at))
        .slice(-800);
    }
    return dbQuery(`
      SELECT id, channel, author, author_role, body, property_id, created_at
      FROM chat_messages
      WHERE deleted_at IS NULL
      ORDER BY created_at ASC
      LIMIT 800
    `);
  }
  const normalizedChannel = normalizeChatChannel(channel);
  if (useMemory) {
    return memory.chatMessages
      .filter((message) => message.channel === normalizedChannel && !message.deleted_at)
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
      .slice(-200);
  }
  return dbQuery(`
    SELECT id, channel, author, author_role, body, property_id, created_at
    FROM chat_messages
    WHERE channel = $1 AND deleted_at IS NULL
    ORDER BY created_at ASC
    LIMIT 200
  `, [normalizedChannel]);
}

async function createChatMessage(body) {
  const text = String(body.body || body.text || "").trim();
  if (!text) {
    const error = new Error("Message body is required.");
    error.status = 400;
    throw error;
  }
  if (text.length > 2000) {
    const error = new Error("Message is too long.");
    error.status = 400;
    throw error;
  }
  const channel = normalizeChatChannel(body.channel);
  const message = {
    id: randomUUID(),
    channel,
    author: String(body.author || "Team").trim() || "Team",
    author_role: String(body.authorRole || body.author_role || "team").trim() || "team",
    body: text,
    property_id: body.propertyId || body.property_id || null,
    created_at: new Date().toISOString()
  };
  if (useMemory) {
    memory.chatMessages.push(message);
    await writeRuntimeChatMessages();
    await writeActivity(message.property_id, "chat.message_created", { channel }, message.author);
    return message;
  }
  const rows = await dbQuery(`
    INSERT INTO chat_messages (id, channel, author, author_role, body, property_id)
    VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING id, channel, author, author_role, body, property_id, created_at
  `, [message.id, message.channel, message.author, message.author_role, message.body, message.property_id]);
  await writeActivity(message.property_id, "chat.message_created", { channel }, message.author);
  return rows[0];
}

async function deleteChatMessage(id, body = {}) {
  const author = String(body.author || body.user || "").trim();
  if (!author) {
    const error = new Error("Author is required.");
    error.status = 400;
    throw error;
  }
  if (useMemory) {
    const message = memory.chatMessages.find((item) => item.id === id && !item.deleted_at);
    if (!message) return false;
    if (message.author !== author) {
      const error = new Error("You can only delete messages you sent.");
      error.status = 403;
      throw error;
    }
    message.deleted_at = new Date().toISOString();
    await writeRuntimeChatMessages();
    return true;
  }
  const rows = await dbQuery(`
    UPDATE chat_messages
    SET deleted_at = now()
    WHERE id = $1 AND author = $2 AND deleted_at IS NULL
    RETURNING id
  `, [id, author]);
  if (rows.length) return true;
  const existing = await dbQuery("SELECT author FROM chat_messages WHERE id = $1 AND deleted_at IS NULL", [id]);
  if (existing.length) {
    const error = new Error("You can only delete messages you sent.");
    error.status = 403;
    throw error;
  }
  return false;
}

function listByProperty(collection, propertyIdValue) {
  return collection.filter((item) => item.property_id === propertyIdValue);
}

async function api(req, res, pathname) {
  if (pathname === "/api/login" && req.method === "POST") {
    const body = await readBody(req);
    const digits = (s) => (s || "").replace(/\D/g, "");
    const match = TEAM.find(
      (u) => u.name === body.name && digits(u.phone) === digits(body.phone)
    );
    if (!match) return send(res, 401, { error: "Name or password is incorrect." });
    return send(res, 200, { ok: true, name: match.name, role: match.role });
  }

  if (pathname === "/api/health") return send(res, 200, { ok: true, database: useMemory ? "memory" : "postgres" });
  if (pathname === "/api/uploads/media" && req.method === "POST") {
    try {
      return send(res, 201, { upload: await saveUploadedMedia(req) });
    } catch (error) {
      return send(res, error.status || 500, { error: error.message });
    }
  }
  if (pathname === "/api/bootstrap" && req.method === "GET") {
    return send(res, 200, {
      database: useMemory ? "memory" : "postgres",
      persistent: !useMemory,
      properties: await listProperties(),
      notes: useMemory ? memory.notes.filter((note) => !note.deleted_at) : await dbQuery("SELECT id, property_id, author, type, body, created_at FROM notes WHERE deleted_at IS NULL ORDER BY created_at DESC"),
      tasks: useMemory ? memory.tasks : await dbQuery("SELECT * FROM tasks ORDER BY due_date NULLS LAST, created_at DESC"),
      documents: useMemory ? memory.documents : await dbQuery("SELECT * FROM documents ORDER BY created_at DESC"),
      constructionScope: useMemory ? memory.scope : await dbQuery("SELECT * FROM construction_scope ORDER BY created_at DESC"),
      featureRequests: await listFeatureRequests(),
      chatMessages: await listChatMessages("all"),
      prospectMedia: await listProspectMedia(),
      activityLog: useMemory
        ? memory.activityLog.slice(0, 30)
        : await dbQuery("SELECT * FROM activity_log ORDER BY created_at DESC LIMIT 30")
    });
  }
  if (pathname === "/api/properties" && req.method === "POST") {
    try {
      const property = await createProperty(await readBody(req));
      return send(res, 201, { property });
    } catch (error) {
      return send(res, error.status || 500, { error: error.message });
    }
  }
  if (pathname === "/api/properties" && req.method === "GET") return send(res, 200, { properties: await listProperties() });

  if (pathname === "/api/feature-requests" && req.method === "GET") {
    return send(res, 200, { featureRequests: await listFeatureRequests() });
  }
  if (pathname === "/api/feature-requests" && req.method === "POST") {
    return send(res, 201, { featureRequest: await createFeatureRequest(await readBody(req)) });
  }
  const featureRequestMatch = pathname.match(/^\/api\/feature-requests\/([^/]+)$/);
  if (featureRequestMatch && req.method === "DELETE") {
    await deleteFeatureRequest(featureRequestMatch[1]);
    return send(res, 204, {});
  }

  if (pathname === "/api/prospect-media" && req.method === "GET") {
    return send(res, 200, { media: await listProspectMedia() });
  }
  if (pathname === "/api/prospect-media" && req.method === "POST") {
    try {
      return send(res, 201, { media: await createProspectMedia(await readBody(req)) });
    } catch (error) {
      return send(res, error.status || 500, { error: error.message });
    }
  }
  const prospectMediaMatch = pathname.match(/^\/api\/prospect-media\/([^/]+)$/);
  if (prospectMediaMatch && req.method === "DELETE") {
    const deleted = await deleteProspectMedia(prospectMediaMatch[1]);
    return deleted ? send(res, 204, {}) : notFound(res);
  }

  if (pathname === "/api/chat/messages" && req.method === "GET") {
    const requestUrl = new URL(req.url, `http://${req.headers.host}`);
    return send(res, 200, { messages: await listChatMessages(requestUrl.searchParams.get("channel") || "general") });
  }
  if (pathname === "/api/chat/messages" && req.method === "POST") {
    try {
      return send(res, 201, { message: await createChatMessage(await readBody(req)) });
    } catch (error) {
      return send(res, error.status || 500, { error: error.message });
    }
  }
  const chatDeleteMatch = pathname.match(/^\/api\/chat\/messages\/([^/]+)$/);
  if (chatDeleteMatch && req.method === "DELETE") {
    try {
      const deleted = await deleteChatMessage(chatDeleteMatch[1], await readBody(req));
      return deleted ? send(res, 200, { ok: true }) : notFound(res);
    } catch (error) {
      return send(res, error.status || 500, { error: error.message });
    }
  }
  if (pathname === "/api/chat/presence" && req.method === "POST") {
    return send(res, 200, updateChatPresence(await readBody(req)));
  }

  const refreshScoreMatch = pathname.match(/^\/api\/properties\/([^/]+)\/refresh-score$/);
  if (refreshScoreMatch && req.method === "POST") {
    const property = await refreshPropertyScore(refreshScoreMatch[1], true);
    return property ? send(res, 200, { property }) : notFound(res);
  }

  const propertyDeleteMatch = pathname.match(/^\/api\/properties\/([^/]+)\/delete$/);
  if (propertyDeleteMatch && req.method === "DELETE") {
    const id = propertyDeleteMatch[1];
    if (useMemory) {
      memory.properties = memory.properties.filter((p) => p.id !== id);
      memory.tasks = memory.tasks.filter((t) => t.property_id !== id);
      memory.documents = memory.documents.filter((d) => d.property_id !== id);
      memory.scope = memory.scope.filter((s) => s.property_id !== id);
      return send(res, 204, {});
    }
    await dbQuery("DELETE FROM properties WHERE id = $1", [id]);
    return send(res, 204, {});
  }

  const propertyUpdateMatch = pathname.match(/^\/api\/properties\/([^/]+)\/update$/);
  if (propertyUpdateMatch && req.method === "PUT") {
    const property = await updateProperty(propertyUpdateMatch[1], await readBody(req));
    return property ? send(res, 200, { property }) : notFound(res);
  }

  const hazardMatch = pathname.match(/^\/api\/properties\/([^/]+)\/hazards$/);
  if (hazardMatch) {
    const id = hazardMatch[1];

    if (req.method === "GET") {
      const row = useMemory
        ? memory.properties.find((property) => property.id === id)
        : (await dbQuery("SELECT source FROM properties WHERE id = $1", [id]))[0];
      if (!row) return notFound(res);
      const source = row.source || {};
      return send(res, 200, { hazards: source.hazards || {} });
    }

    if (req.method === "PUT") {
      const body = await readBody(req);
      const hazards = body.hazards || {};
      if (useMemory) {
        const property = memory.properties.find((item) => item.id === id);
        if (!property) return notFound(res);
        property.source = { ...(property.source || {}), hazards };
        await writeActivity(id, "property.hazards_updated", {}, "Team");
        return send(res, 200, { ok: true });
      }
      await dbQuery(
        "UPDATE properties SET source = source || $2::jsonb, updated_at = now() WHERE id = $1",
        [id, JSON.stringify({ hazards })]
      );
      await writeActivity(id, "property.hazards_updated", {}, "Team");
      return send(res, 200, { ok: true });
    }
  }

  const timelineMatch = pathname.match(/^\/api\/properties\/([^/]+)\/timeline$/);
  if (timelineMatch) {
    const id = timelineMatch[1];
    if (req.method === "PUT") {
      const body = await readBody(req);
      const timeline = body.timeline || {};
      if (useMemory) {
        const property = memory.properties.find((p) => p.id === id);
        if (!property) return notFound(res);
        property.source = { ...(property.source || {}), timeline };
        await writeActivity(id, "property.timeline_updated", {}, "Team");
        return send(res, 200, { ok: true });
      }
      await dbQuery(
        "UPDATE properties SET source = COALESCE(source, '{}'::jsonb) || $2::jsonb, updated_at = now() WHERE id = $1",
        [id, JSON.stringify({ timeline })]
      );
      await writeActivity(id, "property.timeline_updated", {}, "Team");
      return send(res, 200, { ok: true });
    }
  }

  const ownedMatch = pathname.match(/^\/api\/properties\/([^/]+)\/owned$/);
  if (ownedMatch && req.method === "PUT") {
    const id = ownedMatch[1];
    const body = await readBody(req);
    const owned = body.owned || {};
    const timeline = body.timeline || null;
    if (useMemory) {
      const property = memory.properties.find((p) => p.id === id);
      if (!property) return notFound(res);
      property.source = { ...(property.source || {}), owned, ...(timeline ? { timeline } : {}) };
      await writeActivity(id, "property.owned_updated", {}, "Team");
      return send(res, 200, { ok: true });
    }
    await dbQuery(
      "UPDATE properties SET source = COALESCE(source, '{}'::jsonb) || $2::jsonb, updated_at = now() WHERE id = $1",
      [id, JSON.stringify({ owned, ...(timeline ? { timeline } : {}) })]
    );
    await writeActivity(id, "property.owned_updated", {}, "Team");
    return send(res, 200, { ok: true });
  }

  const propertyStatusMatch = pathname.match(/^\/api\/properties\/([^/]+)\/status$/);
  if (propertyStatusMatch && req.method === "PUT") {
    const body = await readBody(req);
    const property = await updatePropertyStatus(propertyStatusMatch[1], body.status, body.quickSummary);
    return property ? send(res, 200, { property }) : notFound(res);
  }

  const underwritingMatch = pathname.match(/^\/api\/properties\/([^/]+)\/underwriting$/);
  if (underwritingMatch && req.method === "PUT") {
    const property = await saveUnderwriting(underwritingMatch[1], await readBody(req));
    return property ? send(res, 200, { property }) : notFound(res);
  }

  const notesMatch = pathname.match(/^\/api\/properties\/([^/]+)\/notes$/);
  if (notesMatch && req.method === "GET") return send(res, 200, { notes: await listNotes(notesMatch[1]) });
  if (notesMatch && req.method === "POST") return send(res, 201, { note: await createNote(notesMatch[1], await readBody(req)) });

  const noteMatch = pathname.match(/^\/api\/notes\/([^/]+)$/);
  if (noteMatch && req.method === "DELETE") {
    await deleteNote(noteMatch[1]);
    return send(res, 204, {});
  }

  const taskUpdateMatch = pathname.match(/^\/api\/properties\/([^/]+)\/tasks\/([^/]+)$/);
  if (taskUpdateMatch && req.method === "PATCH") {
    const [, propertyIdValue, taskId] = taskUpdateMatch;
    const body = await readBody(req);
    const status = body.status || "Open";
    if (useMemory) {
      const task = memory.tasks.find((item) => item.id === taskId && item.property_id === propertyIdValue);
      if (!task) return notFound(res);
      task.status = status;
      task.updated_at = new Date().toISOString();
      await writeActivity(propertyIdValue, "task.updated", { taskId, status }, "Team");
      return send(res, 200, { task });
    }
    const rows = await dbQuery(`
      UPDATE tasks
      SET status = $3, updated_at = now()
      WHERE property_id = $1 AND id = $2
      RETURNING *
    `, [propertyIdValue, taskId, status]);
    if (!rows[0]) return notFound(res);
    await writeActivity(propertyIdValue, "task.updated", { taskId, status }, "Team");
    return send(res, 200, { task: rows[0] });
  }

  const taskDeleteMatch = pathname.match(/^\/api\/properties\/([^/]+)\/tasks\/([^/]+)\/delete$/);
  if (taskDeleteMatch && req.method === "DELETE") {
    const [, propertyIdValue, taskId] = taskDeleteMatch;
    if (useMemory) {
      memory.tasks = memory.tasks.filter((t) => !(t.id === taskId && t.property_id === propertyIdValue));
      await writeActivity(propertyIdValue, "task.deleted", { taskId }, "Team");
      return send(res, 204, {});
    }
    await dbQuery("DELETE FROM tasks WHERE id = $1 AND property_id = $2", [taskId, propertyIdValue]);
    await writeActivity(propertyIdValue, "task.deleted", { taskId }, "Team");
    return send(res, 204, {});
  }

  const scopeItemMatch = pathname.match(/^\/api\/properties\/([^/]+)\/construction-scope\/([^/]+)$/);
  if (scopeItemMatch) {
    const [, propertyIdValue, scopeId] = scopeItemMatch;
    if (req.method === "PATCH") {
      const body = await readBody(req);
      const estimatedCost = body.estimatedCost ?? body.estimated_cost ?? body.cost;
      const actualCost = body.actualCost ?? body.actual_cost;
      const updates = {
        item: String(body.item || "").trim(),
        estimated_cost: estimatedCost === undefined || estimatedCost === null || estimatedCost === "" ? null : Number(estimatedCost),
        actual_cost: actualCost === undefined || actualCost === null || actualCost === "" ? null : Number(actualCost),
        status: body.status || "Needed",
        updated_at: new Date().toISOString()
      };
      if (!updates.item) return send(res, 400, { error: "item is required" });
      if (useMemory) {
        const scope = memory.scope.find((item) => item.id === scopeId && item.property_id === propertyIdValue);
        if (!scope) return notFound(res);
        Object.assign(scope, updates);
        await writeActivity(propertyIdValue, "construction_scope.updated", { scopeId, item: scope.item, status: scope.status }, "Team");
        return send(res, 200, { scope });
      }
      const rows = await dbQuery(`
        UPDATE construction_scope
        SET item = $3, estimated_cost = $4, actual_cost = $5, status = $6, updated_at = now()
        WHERE property_id = $1 AND id = $2
        RETURNING *
      `, [propertyIdValue, scopeId, updates.item, updates.estimated_cost ?? 0, updates.actual_cost, updates.status]);
      if (!rows[0]) return notFound(res);
      await writeActivity(propertyIdValue, "construction_scope.updated", { scopeId, item: updates.item, status: updates.status }, "Team");
      return send(res, 200, { scope: rows[0] });
    }
    if (req.method === "DELETE") {
      if (useMemory) {
        memory.scope = memory.scope.filter((item) => !(item.id === scopeId && item.property_id === propertyIdValue));
        await writeActivity(propertyIdValue, "construction_scope.deleted", { scopeId }, "Team");
        return send(res, 204, {});
      }
      await dbQuery("DELETE FROM construction_scope WHERE id = $1 AND property_id = $2", [scopeId, propertyIdValue]);
      await writeActivity(propertyIdValue, "construction_scope.deleted", { scopeId }, "Team");
      return send(res, 204, {});
    }
  }

  const childMatch = pathname.match(/^\/api\/properties\/([^/]+)\/(tasks|documents|construction-scope)$/);
  if (childMatch) {
    const [, propertyIdValue, type] = childMatch;
    if (req.method === "GET") {
      if (type === "tasks") return send(res, 200, { tasks: useMemory ? listByProperty(memory.tasks, propertyIdValue) : await dbQuery("SELECT * FROM tasks WHERE property_id = $1 ORDER BY due_date NULLS LAST", [propertyIdValue]) });
      if (type === "documents") return send(res, 200, { documents: useMemory ? listByProperty(memory.documents, propertyIdValue) : await dbQuery("SELECT * FROM documents WHERE property_id = $1 ORDER BY created_at DESC", [propertyIdValue]) });
      return send(res, 200, { constructionScope: useMemory ? listByProperty(memory.scope, propertyIdValue) : await dbQuery("SELECT * FROM construction_scope WHERE property_id = $1 ORDER BY created_at DESC", [propertyIdValue]) });
    }
    if (req.method === "POST") {
      const body = await readBody(req);
      if (type === "tasks") {
        const task = { id: randomUUID(), property_id: propertyIdValue, title: body.title, owner: body.owner, due_date: body.dueDate || null, status: body.status || "Open", created_at: new Date().toISOString() };
        if (useMemory) memory.tasks.push(task);
        else await dbQuery("INSERT INTO tasks (id, property_id, title, owner, due_date, status) VALUES ($1,$2,$3,$4,$5,$6)", [task.id, task.property_id, task.title, task.owner, task.due_date, task.status]);
        await writeActivity(propertyIdValue, "task.created", { title: task.title, owner: task.owner }, "Team");
        return send(res, 201, { task });
      }
      if (type === "documents") {
        const document = { id: randomUUID(), property_id: propertyIdValue, name: body.name, type: body.type || "Other", url: body.url || null, created_at: new Date().toISOString() };
        if (useMemory) memory.documents.push(document);
        else await dbQuery("INSERT INTO documents (id, property_id, name, type, url) VALUES ($1,$2,$3,$4,$5)", [document.id, document.property_id, document.name, document.type, document.url]);
        await writeActivity(propertyIdValue, "document.created", { name: document.name, type: document.type }, "Team");
        return send(res, 201, { document });
      }
      const estimatedCost = body.cost ?? body.estimatedCost;
      const hasEstimatedCost = estimatedCost !== undefined && estimatedCost !== null && estimatedCost !== "";
      const scope = {
        id: randomUUID(),
        property_id: propertyIdValue,
        item: body.item,
        estimated_cost: hasEstimatedCost ? Number(estimatedCost) : null,
        actual_cost: body.actualCost === undefined || body.actualCost === null || body.actualCost === "" ? null : Number(body.actualCost),
        status: body.status || "Needed",
        created_at: new Date().toISOString()
      };
      if (useMemory) memory.scope.push(scope);
      else await dbQuery("INSERT INTO construction_scope (id, property_id, item, estimated_cost, actual_cost, status) VALUES ($1,$2,$3,$4,$5,$6)", [scope.id, scope.property_id, scope.item, scope.estimated_cost ?? 0, scope.actual_cost, scope.status]);
      await writeActivity(propertyIdValue, "construction_scope.created", { item: scope.item, estimatedCost: scope.estimated_cost }, "Team");
      return send(res, 201, { scope });
    }
  }

  notFound(res);
}

function serveStatic(req, res, pathname) {
  const target = pathname === "/" ? "/index.html" : pathname;
  const safePath = normalize(target).replace(/^(\.\.[/\\])+/, "");
  const filePath = join(root, safePath);
  if (!filePath.startsWith(root) || !existsSync(filePath)) return notFound(res);
  res.writeHead(200, { "content-type": mime[extname(filePath)] || "application/octet-stream" });
  createReadStream(filePath).pipe(res);
}

const ready = loadMemorySeed();

export async function handler(req, res) {
  try {
    await ready;
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname.startsWith("/api/")) return await api(req, res, url.pathname);
    serveStatic(req, res, url.pathname);
  } catch (error) {
    console.error(error);
    send(res, 500, { error: error.message });
  }
}

export default handler;

if (!isVercel) {
  createServer(handler).listen(port, "0.0.0.0", () => {
    console.log(`Acquisition OS running at http://localhost:${port}`);
    console.log(`Database mode: ${useMemory ? "memory" : "postgres"}`);
  });
}
