import { calculateDealScore, scoreBand } from "./lib/deal-scoring.js";

const stages = [
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
const PASSED_STAGE = "Passed";
const REOPEN_STAGE = "Needs Review";
const activeStages = stages.filter((stage) => stage !== PASSED_STAGE);
const OWNED_PHASES = [
  "Purchased / Not Started",
  "In Rehab",
  "Ready to List",
  "Listed",
  "Under Contract",
  "Sold / Reconciliation"
];
const FLIP_TASK_PHASES = [
  "Demo",
  "Rough Construction",
  "Finishes",
  "Landscaping",
  "Staging",
  "Listing"
];
const FLIP_TASK_STATUSES = ["Not Started", "In Progress", "Done"];
const FLIP_BUDGET_CATEGORIES = [
  "Demo",
  "Framing",
  "Electrical",
  "Plumbing",
  "Drywall",
  "Paint",
  "Flooring",
  "Cabinets",
  "Countertops",
  "Landscaping",
  "Staging",
  "Listing Media",
  "Miscellaneous"
];
const SCOPE_STATUSES = [
  "Needed",
  "Bid Requested",
  "Bid Received",
  "Approved",
  "In Progress",
  "Done",
  "Skipped"
];
const FLIP_MEDIA_ROOMS = [
  "Kitchen",
  "Bathroom",
  "Exterior",
  "Front Yard",
  "Backyard",
  "Living Room",
  "Bedrooms"
];
const FLIP_MEDIA_PHASES = ["Before", "Demo", "Progress", "Finished", "Listing"];
const FLIP_MILESTONE_LABELS = [
  "Purchased",
  "Demo Started",
  "Rough Construction",
  "Finishes",
  "Landscaping",
  "Staging",
  "Photos/Video",
  "Listed",
  "Sold"
];
const priorityAddresses = ["1301 Sycamore Dr", "311 Madison St", "131 Lake Rd", "608 Polk St"];
const teamMembers = [
  { name: "Ashton Staker", role: "owner" },
  { name: "Brent Staker", role: "owner" },
  { name: "Nathan Staker", role: "acquisition" },
  { name: "Nicole Staker", role: "acquisition" },
  { name: "Brendan Collins", role: "owner" }
];
const roleLabels = {
  admin: "Admin",
  owner: "Owner",
  acquisition: "Acquisition",
  underwriter: "Underwriter",
  construction: "Construction",
  finance: "Finance",
  viewer: "Viewer"
};
let tasks = [];
let docs = [];
let scopes = [];
let activityLog = [];
let noteLog = [];
let featureRequests = [];
let chatMessages = [];
let prospectMedia = [];
let apiAvailable = false;
let apiPersistent = false;
let mediaUploadsAvailable = false;

let properties = [];
let selectedId = "";
let selectedFeatureRequestId = "";
let ownedFilters = {
  phase: "All",
  owner: "All",
  risk: "All",
  missingOnly: false,
  flaggedOnly: false,
  search: ""
};
const featureRequestStorageKey = "stakerCollinsFeatureRequestsV3";
const localStateStorageKey = "stakerCollinsStaticStateV1";
const prospectMediaStorageKey = "stakerCollinsProspectMediaV1";
const pipelineOrderStorageKey = "stakerCollinsPipelineOrderV1";
let pipelineOrder = {};
let showAllPipelineAttention = false;
let showAllPipelineOpportunities = false;
let showAllPipelineActivity = false;
let showAllPipelineActions = false;
let rankingSearchRenderTimer = null;
let expandedRankingKey = "";
let selectedOwnedTaskKey = "";
let taskFormState = { open: false, mode: "create", propertyId: "", taskId: "" };
let calendarState = {
  date: new Date().toISOString().slice(0, 10),
  view: "Month",
  projectId: "All",
  type: "All"
};
const navSectionStorageKey = "stakerCollinsNavSectionV1";
const storageGet = (key) => {
  try { return globalThis.localStorage?.getItem(key) || ""; } catch { return ""; }
};
const storageSet = (key, value) => {
  try { globalThis.localStorage?.setItem(key, value); } catch {}
};
let activeNavSection = "prospects";
let activeNavKey = activeNavSection === "owned" ? "ownedDashboard" : "dashboard";
let currentUser = { name: "Team", role: "team" };
let activeChatChannel = storageGet("stakerCollinsChatChannelV1") || "general";
let activeView = "dashboard";
let chatPollTimer = null;
let chatPollInFlight = false;
const chatPresenceSessionKey = "stakerCollinsChatPresenceSessionV1";
const chatPresenceSessionId = storageGet(chatPresenceSessionKey) || crypto.randomUUID();
storageSet(chatPresenceSessionKey, chatPresenceSessionId);

const ownedSectionViews = new Set([
  "homesOwned",
  "tasks",
  "ownedCalendar",
  "ownedMedia",
  "ownedBudget",
  "ownedNotes",
  "ownedReports",
  "ownedSettings"
]);

const money = (value) => value == null ? "TBD" : value.toLocaleString("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0
});

const number = (value) => value == null ? "TBD" : value.toLocaleString("en-US");
const percent = (value) => `${(Number(value || 0) * 100).toFixed(1)}%`;
const moneyInputIds = [
  "calcListPrice",
  "calcArv",
  "calcRehab",
  "calcPurchase",
  "calcClosing",
  "calcFinancing",
  "calcHolding",
  "calcSelling",
  "calcTargetProfit",
  "calcContingency"
];
const parseMoneyInput = (value) => {
  const numeric = String(value || "").replace(/[^0-9.-]/g, "");
  return Number(numeric || 0);
};
const calcValue = (id) => parseMoneyInput(document.getElementById(id)?.value);
const setMoneyInputValue = (id, value) => {
  const element = document.getElementById(id);
  if (element) element.value = money(Number(value || 0));
};
const formatMoneyInput = (element) => {
  element.value = money(parseMoneyInput(element.value));
};
const scoreInputRequirements = {
  arvConfidence: {
    max: 20,
    missing: (inputs) => !Array.isArray(inputs.comps) || inputs.comps.length === 0
  },
  marketMomentum: {
    max: 15,
    missing: (inputs) => !inputs.avgDaysOnMarket
  },
  sellerMotivation: {
    max: 15,
    missing: (inputs) => !inputs.daysListed && !inputs.hasPriceReduction
  }
};

const propertyId = (property) => `${property.address}-${property.zip}`.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

const fullAddress = (property) => `${property.address}, ${property.city}, ${property.state} ${property.zip}`;

const todayIso = () => new Date().toISOString().slice(0, 10);

function normalizeOwnedPhase(phase) {
  if (phase === "Under Contract to Buyer") return "Under Contract";
  return OWNED_PHASES.includes(phase) ? phase : "Purchased / Not Started";
}

function mergeTimelineFromOwned(timeline = {}, owned = {}) {
  return {
    ...timeline,
    purchaseDate: timeline.purchaseDate || owned.purchaseCloseDate || null,
    rehabEnd: timeline.rehabEnd || owned.targetRehabComplete || null,
    listDate: timeline.listDate || owned.listDate || null,
    saleDate: timeline.saleDate || owned.saleCloseDate || null
  };
}

function ownershipDefaultsFor(property) {
  const existingOwned = property.owned || property.source?.owned || {};
  const underwriting = property.underwriting || defaultUnderwritingFor(property);
  const timeline = property.timeline || property.source?.timeline || {};
  const phase = existingOwned.ownedPhase
    ? normalizeOwnedPhase(existingOwned.ownedPhase)
    : timeline.rehabStart ? "In Rehab" : "Purchased / Not Started";
  return {
    ownedPhase: phase,
    assignedOwner: existingOwned.assignedOwner || null,
    purchaseCloseDate: timeline.purchaseDate || existingOwned.purchaseCloseDate || null,
    actualPurchasePrice: Number(existingOwned.actualPurchasePrice) || Number(underwriting.proposedOffer) || Number(property.purchasePrice) || Number(property.targetOfferHigh) || null,
    fundingSource: existingOwned.fundingSource || null,
    actualRehabSpend: Number(existingOwned.actualRehabSpend) || null,
    targetRehabComplete: existingOwned.targetRehabComplete || timeline.rehabEnd || null,
    forecastArv: Number(existingOwned.forecastArv) || Number(underwriting.arv) || Number(property.arv) || null,
    monthlyHoldingCost: Number(existingOwned.monthlyHoldingCost) || Math.round((Number(underwriting.holdingCosts) || 9000) / 3) || 3000,
    targetListPrice: Number(existingOwned.targetListPrice) || null,
    actualListPrice: Number(existingOwned.actualListPrice) || null,
    listDate: existingOwned.listDate || timeline.listDate || null,
    buyerContractPrice: Number(existingOwned.buyerContractPrice) || null,
    sellerConcessions: Number(existingOwned.sellerConcessions) || null,
    saleCloseDate: existingOwned.saleCloseDate || timeline.saleDate || null,
    nextAction: existingOwned.nextAction || null
  };
}

function applyOwnershipHandoff(property) {
  const owned = ownershipDefaultsFor(property);
  const source = property.source || {};
  const timeline = mergeTimelineFromOwned(property.timeline || source.timeline || {}, owned);
  return normalizeProperty({
    ...property,
    owned,
    timeline,
    source: {
      ...source,
      owned,
      timeline
    }
  });
}

function needsOwnedHandoff(property) {
  const owned = getOwned(property || {});
  const timeline = property?.timeline || property?.source?.timeline || {};
  return !(owned.purchaseCloseDate || timeline.purchaseDate);
}

const readRecordState = (id) => {
  const property = propertyById(id);
  return {
    status: recordStageFor(property?.acquisitionStatus || property?.stage),
    notes: property?.quickSummary || "",
    noteLog: noteLog.filter((note) => note.property_id === id)
  };
};

const saveRecordState = async (id, updates) => {
  const current = readRecordState(id);
  const next = {
    ...current,
    ...updates
  };
  const applyLocal = () => {
    const index = properties.findIndex((item) => item.id === id);
    if (index >= 0) {
      const updated = normalizeProperty({
        ...properties[index],
        acquisitionStatus: next.status,
        stage: next.status,
        quickSummary: next.notes
      });
      properties[index] = updated;
      storeLocalState();
    }
  };
  if (!apiAvailable) {
    applyLocal();
    return;
  }
  const response = await fetch(`/api/properties/${id}/status`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      status: next.status,
      quickSummary: next.notes
    })
  });
  if (!response.ok) throw new Error("Could not save property status.");
  const { property } = await response.json();
  const index = properties.findIndex((item) => item.id === id);
  if (index >= 0) {
    properties[index] = normalizeProperty(property);
  }
};

const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  "\"": "&quot;",
  "'": "&#39;"
}[char]));

const SAFE_URL_PROTOCOLS = new Set(["http:", "https:", "data:", "mailto:", "tel:"]);
const sanitizeUrl = (value) => {
  if (!value) return "";
  const text = String(value).trim();
  if (!text) return "";
  if (text.startsWith("/") || text.startsWith("#") || text.startsWith("./") || text.startsWith("../")) {
    return text;
  }
  try {
    const url = new URL(text, window.location.origin);
    if (!SAFE_URL_PROTOCOLS.has(url.protocol)) return "";
    if (url.protocol === "data:" && !/^data:image\//i.test(text)) return "";
    return text;
  } catch {
    return "";
  }
};
const safeUrl = (value) => escapeHtml(sanitizeUrl(value));

const formatNoteTime = (iso) => {
  if (!iso) return "";
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
};

const generatedHouseImage = (property) => {
  const hue = Math.abs([...property.address].reduce((sum, char) => sum + char.charCodeAt(0), 0)) % 70;
  const bg = `hsl(${95 + hue}, 28%, 90%)`;
  const roof = `hsl(${25 + hue / 4}, 34%, 32%)`;
  const body = `hsl(${38 + hue / 5}, 30%, 78%)`;
  const label = `${property.address}, ${property.city}`;
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 720">
      <rect width="960" height="720" fill="${bg}"/>
      <rect y="492" width="960" height="228" fill="#dfe8d6"/>
      <path d="M130 454h700v166H130z" fill="${body}" stroke="#6c715f" stroke-width="10"/>
      <path d="M88 454 480 214l392 240H88z" fill="${roof}" stroke="#3f372c" stroke-width="12" stroke-linejoin="round"/>
      <rect x="424" y="492" width="112" height="128" rx="6" fill="#263126"/>
      <rect x="190" y="494" width="104" height="76" rx="4" fill="#f7faf2" stroke="#68705e" stroke-width="8"/>
      <rect x="668" y="494" width="104" height="76" rx="4" fill="#f7faf2" stroke="#68705e" stroke-width="8"/>
      <rect x="233" y="494" width="8" height="76" fill="#68705e"/>
      <rect x="710" y="494" width="8" height="76" fill="#68705e"/>
      <circle cx="514" cy="558" r="7" fill="#e4bd5c"/>
      <text x="480" y="112" text-anchor="middle" font-family="Arial, sans-serif" font-size="42" font-weight="700" fill="#182019">${escapeSvg(property.address)}</text>
      <text x="480" y="164" text-anchor="middle" font-family="Arial, sans-serif" font-size="28" fill="#4f5a4c">${escapeSvg(property.city)}, ${escapeSvg(property.state)} ${escapeSvg(property.zip)}</text>
      <text x="480" y="682" text-anchor="middle" font-family="Arial, sans-serif" font-size="24" fill="#61705d">Main house image placeholder - replace with listing photo when available</text>
    </svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
};

const escapeSvg = (value) => String(value || "").replace(/[&<>"']/g, (char) => ({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  "\"": "&quot;",
  "'": "&apos;"
}[char]));

const propertyPhoto = (property) => {
  if (property.mainPhoto) {
    const cleaned = sanitizeUrl(property.mainPhoto);
    if (cleaned) return cleaned;
  }
  if (property.address === "1301 Sycamore Dr") return "assets/1301-sycamore-main.jpg";
  return generatedHouseImage(property);
};

const propertyDetailHash = (id) => `#property/${id}`;
const featureRequestDetailHash = (id) => `#feature-requests/${id}`;

function scoreCompleteness(scoring) {
  const missing = scoring.categories.filter((category) => {
    const requirement = scoreInputRequirements[category.key];
    return requirement && category.score === 0 && requirement.missing(scoring.inputs || {});
  });
  const missingPoints = missing.reduce((sum, category) => sum + category.max, 0);
  const scoredPoints = 100 - missingPoints;
  return {
    missing,
    missingPoints,
    scoredPoints,
    label: missing.length ? `${missing.length} categories need data` : "All score inputs present"
  };
}

function daysOnMarketValue(property) {
  return property.daysListed || property.daysOnMarket || property.rentcastData?.saleListing?.[0]?.daysOnMarket || null;
}

function auctionInfo(property) {
  if (property.auction) return property.auction;
  const text = `${property.brokerage || ""} ${property.why || ""} ${property.details || ""}`;
  if (!/(auction\.com|auction signal|auction notice)/i.test(text)) return null;
  return {
    platform: /auction\.com/i.test(text) ? "Auction.com" : "Auction",
    status: "Needs verification",
    date: null,
    source: "Auction signal found in listing notes."
  };
}

function formatAuctionDate(value) {
  if (!value) return "Date needs verification";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Date needs verification";
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function daysUntil(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return Math.ceil((date.getTime() - Date.now()) / 86400000);
}

function generatedQuickSummary(property) {
  const auction = auctionInfo(property);
  const dom = daysOnMarketValue(property);
  const lines = [
    `${property.address}: ${property.why || "Needs initial deal review."}`,
    `Target offer ${money(property.targetOfferLow)} - ${money(property.targetOfferHigh)} against list ${money(property.listPrice)}.`,
    auction ? `${auction.platform} auction signal; ${formatAuctionDate(auction.date).toLowerCase()}.` : null,
    dom ? `${dom} days on market.` : "Days on market needs verification.",
    property.listingAgent || property.phone ? `Contact: ${contactLine(property)}.` : "Listing contact needs verification."
  ].filter(Boolean);
  return lines.join(" ");
}

async function copyText(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  textarea.remove();
}

function calculateUnderwriting(input) {
  const arv = Number(input.arv || 0);
  const rehabEstimate = Number(input.rehabEstimate || 0);
  const proposedOffer = Number(input.proposedOffer || 0);
  const closingCosts = Number(input.closingCosts || 0);
  const holdingCosts = Number(input.holdingCosts || 0);
  const financingCost = Number(input.financingCost || 0);
  const sellingCost = Number(input.sellingCost || 0);
  const targetProfit = Number(input.targetProfit || 0);
  const contingency = Number(input.contingency || 0);
  const listPrice = Number(input.listPrice || 0);
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
  return { officialMao, targetProfitOffer, recommendedMaxOffer, netProfit, roi, profitMargin, listSpread, maoSpread, signal, warnings };
}

function defaultUnderwritingFor(property) {
  const underwriting = property.underwriting || {};
  const arv = underwriting.arv || property.arv || 0;
  const rehabEstimate = underwriting.rehabEstimate || property.rehab || 0;
  const listPrice = underwriting.listPrice || property.listPrice || 0;
  const closingCosts = underwriting.closingCosts ?? Math.round(listPrice * 0.02);
  const holdingCosts = underwriting.holdingCosts ?? 12000;
  const financingCost = 0;
  const sellingCost = underwriting.sellingCost ?? Math.round(arv * 0.08);
  const targetProfit = underwriting.targetProfit ?? 45000;
  const contingency = underwriting.contingency ?? 10000;
  const officialMao = (arv * 0.70) - rehabEstimate;
  const proposedOffer = underwriting.proposedOffer || property.purchasePrice || property.targetOfferHigh || Math.max(0, Math.round(officialMao));
  return {
    listPrice,
    arv,
    rehabEstimate,
    proposedOffer,
    closingCosts,
    holdingCosts,
    financingCost,
    sellingCost,
    targetProfit,
    contingency,
    notes: underwriting.notes || ""
  };
}

const recordStageFor = (status) => stages.includes(status) ? status : "New Lead";

function bindPropertyLinks(root = document) {
  root.querySelectorAll("a[data-property-id], button[data-property-id]").forEach((element) => {
    if (element.dataset.boundPropertyLink === "true") return;
    element.dataset.boundPropertyLink = "true";
    element.addEventListener("click", (event) => {
      event.preventDefault();
      openPropertyDetail(element.dataset.propertyId);
    });
  });
}

const applyScore = (property) => {
  const scoring = calculateDealScore(property);
  property.score = scoring.total;
  property.scoreBreakdown = scoring.categories;
  property.scoreBand = scoring.band;
  property.scoreInputs = scoring.inputs;
  property.scoreCompleteness = scoreCompleteness(scoring);
  return property;
};

function setCalculatorTab(tab = "purchase") {
  const card = document.querySelector(".offer-input-card");
  if (!card) return;
  const nextTab = ["purchase", "rehab", "selling", "other"].includes(tab) ? tab : "purchase";
  card.dataset.activeCalcTab = nextTab;
  card.querySelectorAll("[data-calc-tab]").forEach((button) => {
    button.classList.toggle("active", button.dataset.calcTab === nextTab);
  });
}

const stageFor = (property) => {
  if (priorityAddresses.includes(property.address)) return "Needs Review";
  return "New Lead";
};

const byScore = (items) => [...items].sort((a, b) => (b.score || 0) - (a.score || 0));

function pipelineStageItems(items, stage) {
  const order = Array.isArray(pipelineOrder[stage]) ? pipelineOrder[stage] : [];
  const orderIndex = new Map(order.map((id, index) => [id, index]));
  return [...items].sort((a, b) => {
    const aIndex = orderIndex.has(a.id) ? orderIndex.get(a.id) : Number.POSITIVE_INFINITY;
    const bIndex = orderIndex.has(b.id) ? orderIndex.get(b.id) : Number.POSITIVE_INFINITY;
    return aIndex - bIndex || (b.score || 0) - (a.score || 0);
  });
}

const listingStatusLabel = (property) => property.listingStatus || property.listing_status || "Verify status";

function sourceTagLabel(property) {
  const source = String(property.sourceName || property.source?.name || property.source?.sourceName || property.listingSource || property.sourceUrl || "").toLowerCase();
  if (source.includes("mls") || source.includes("realtracs")) return "MLS";
  if (source.includes("wholesale")) return "Wholesaler";
  return "Retail";
}

function listingStatusKind(property) {
  const status = listingStatusLabel(property).toLowerCase();
  if (["active", "coming soon"].some((term) => status.includes(term))) return "active";
  if (["pending", "contingent", "under contract"].some((term) => status.includes(term))) return "pending";
  if (["closed", "sold", "expired", "withdrawn", "off market"].some((term) => status.includes(term))) return "closed";
  return "unknown";
}

function listingStatusPill(property) {
  const kind = listingStatusKind(property);
  return `<span class="pill listing-status ${kind}">${escapeHtml(listingStatusLabel(property))}</span>`;
}

const isAvailableListing = (property) => !["pending", "closed"].includes(listingStatusKind(property));

function rankingCandidates() {
  const filter = document.getElementById("rankingStatusFilter")?.value || "available";
  const candidates = activeProperties();
  if (filter === "all") return candidates;
  if (filter === "pending") return candidates.filter((property) => listingStatusKind(property) === "pending");
  return candidates.filter(isAvailableListing);
}

const requestedHomes = () => byScore(activeProperties().filter((property) => priorityAddresses.includes(property.address)));

function propertyRoi(property) {
  return calculateUnderwriting(defaultUnderwritingFor(property)).roi;
}

function sortedProperties(items) {
  const sort = document.getElementById("propertySort")?.value || "score-roi";
  return [...items].sort((a, b) => {
    if (sort === "price-asc") return (a.listPrice || 0) - (b.listPrice || 0);
    if (sort === "price-desc") return (b.listPrice || 0) - (a.listPrice || 0);
    return (b.score || 0) - (a.score || 0) || propertyRoi(b) - propertyRoi(a) || (a.listPrice || 0) - (b.listPrice || 0);
  });
}

function normalizeProperty(property) {
  const underwriting = property.underwriting || null;
  const normalized = {
    ...property,
    id: property.id || propertyId(property),
    stage: recordStageFor(property.acquisitionStatus || property.stage || stageFor(property)),
    arv: underwriting?.arv || property.arv || Math.round((property.listPrice || 0) * (priorityAddresses.includes(property.address) ? 1.22 : 1.16) / 1000) * 1000,
    rehab: underwriting?.rehabEstimate || property.rehab || (priorityAddresses.includes(property.address) ? 55000 : 35000),
    purchasePrice: underwriting?.proposedOffer || property.purchasePrice,
    closingCosts: underwriting?.closingCosts ?? property.closingCosts,
    holdingCosts: underwriting?.holdingCosts ?? property.holdingCosts,
    financingCost: underwriting?.financingCost ?? property.financingCost,
    sellingCost: underwriting?.sellingCost ?? property.sellingCost,
    mainPhoto: property.mainPhoto || (property.address === "1301 Sycamore Dr" ? "assets/1301-sycamore-main.jpg" : generatedHouseImage(property)),
    quickSummary: property.quickSummary || "",
    hazards: property.hazards || property.source?.hazards || {},
    owned: property.owned || property.source?.owned || {},
    timeline: property.timeline || property.source?.timeline || {}
  };
  if (Object.keys(normalized.owned || {}).length && normalized.owned.ownedPhase) {
    normalized.owned.ownedPhase = normalizeOwnedPhase(normalized.owned.ownedPhase);
  }
  return applyScore(normalized);
}

function propertyFormPayload(prefix) {
  const value = (id) => document.getElementById(`${prefix}${id}`).value.trim();
  const numberValue = (id) => Number(value(id)) || null;
  return {
    address: value("Address"),
    city: value("City"),
    state: value("State").toUpperCase(),
    zip: value("Zip"),
    listPrice: numberValue("ListPrice"),
    beds: numberValue("Beds"),
    baths: numberValue("Baths"),
    sqft: numberValue("Sqft"),
    yearBuilt: numberValue("YearBuilt"),
    lot: value("Lot") || null,
    listingAgent: value("Agent") || null,
    phone: value("Phone") || null,
    brokerage: value("Brokerage") || null,
    mls: value("Mls") || null,
    why: value("Why") || null
  };
}

function localPropertyFromPayload(body) {
  return normalizeProperty({
    ...body,
    id: `${propertyId(body)}-${crypto.randomUUID().slice(0, 8)}`,
    rank: null,
    targetOfferLow: null,
    targetOfferHigh: null,
    priority: "standard",
    acquisitionStatus: "New Lead",
    propertyPhase: "acquisition",
    quickSummary: "",
    createdAt: new Date().toISOString()
  });
}

function applyPropertyUpdate(property, updates) {
  return normalizeProperty({
    ...property,
    ...updates,
    source: {
      ...(property.source || {}),
      beds: updates.beds,
      baths: updates.baths,
      sqft: updates.sqft,
      yearBuilt: updates.yearBuilt,
      lot: updates.lot,
      mls: updates.mls
    },
    updatedAt: new Date().toISOString()
  });
}

function normalizeNote(note) {
  return {
    id: note.id,
    property_id: note.property_id || note.propertyId,
    author: note.author || "Team",
    type: note.type || "General",
    body: note.body || note.text || "",
    created_at: note.created_at || note.createdAt || new Date().toISOString()
  };
}

function normalizeScopeItem(item) {
  return {
    ...item,
    id: item.id || crypto.randomUUID(),
    property_id: item.property_id || item.propertyId,
    item: item.item || item.name || "",
    estimated_cost: item.estimated_cost ?? item.estimatedCost ?? item.cost ?? null,
    actual_cost: item.actual_cost ?? item.actualCost ?? null,
    status: SCOPE_STATUSES.includes(item.status) ? item.status : "Needed",
    created_at: item.created_at || item.createdAt || new Date().toISOString(),
    updated_at: item.updated_at || item.updatedAt || item.created_at || new Date().toISOString()
  };
}

function normalizeFeatureRequest(request) {
  return {
    id: request.id || crypto.randomUUID(),
    requester: request.requester || request.author || "Team",
    priority: request.priority || "Nice to have",
    body: request.body || request.text || request.request || "",
    status: request.status || "Open",
    created_at: request.created_at || request.createdAt || new Date().toISOString()
  };
}

function normalizeChatMessage(message) {
  return {
    id: message.id || crypto.randomUUID(),
    channel: message.channel || "general",
    author: message.author || "Team",
    author_role: message.author_role || message.authorRole || "team",
    body: message.body || message.text || "",
    property_id: message.property_id || message.propertyId || null,
    created_at: message.created_at || message.createdAt || new Date().toISOString()
  };
}

function normalizeProspectMedia(item = {}) {
  const url = String(item.url || "").trim();
  return {
    id: item.id || crypto.randomUUID(),
    property_id: item.property_id || item.propertyId || "",
    url,
    type: item.type || (/(\.mp4|\.mov|\.webm)(\?|$)/i.test(url) ? "Video" : "Photo"),
    category: item.category || item.room || "General",
    caption: item.caption || "",
    mime_type: item.mime_type || item.mimeType || "",
    original_name: item.original_name || item.originalName || "",
    created_by: item.created_by || item.createdBy || "Team",
    created_at: item.created_at || item.createdAt || new Date().toISOString()
  };
}

function loadStoredFeatureRequests() {
  try {
    return JSON.parse(localStorage.getItem(featureRequestStorageKey) || "[]").map(normalizeFeatureRequest);
  } catch {
    return [];
  }
}

function storeFeatureRequests() {
  localStorage.setItem(featureRequestStorageKey, JSON.stringify(featureRequests));
}

function loadStoredChatMessages() {
  try {
    return JSON.parse(localStorage.getItem("stakerCollinsChatMessagesV1") || "[]").map(normalizeChatMessage);
  } catch {
    return [];
  }
}

function storeChatMessages() {
  if (apiAvailable) return;
  localStorage.setItem("stakerCollinsChatMessagesV1", JSON.stringify(chatMessages));
}

function loadStoredProspectMedia() {
  try {
    return JSON.parse(localStorage.getItem(prospectMediaStorageKey) || "[]").map(normalizeProspectMedia);
  } catch {
    return [];
  }
}

function storeProspectMedia() {
  if (apiAvailable) return;
  localStorage.setItem(prospectMediaStorageKey, JSON.stringify(prospectMedia));
  storeLocalState();
}

function loadPipelineOrder() {
  try {
    const stored = JSON.parse(localStorage.getItem(pipelineOrderStorageKey) || "{}");
    return stored && typeof stored === "object" && !Array.isArray(stored) ? stored : {};
  } catch {
    return {};
  }
}

function storePipelineOrder() {
  localStorage.setItem(pipelineOrderStorageKey, JSON.stringify(pipelineOrder));
}

function loadLocalState() {
  try {
    return JSON.parse(localStorage.getItem(localStateStorageKey) || "{}");
  } catch {
    return {};
  }
}

function storeLocalState() {
  if (apiAvailable) return;
  localStorage.setItem(localStateStorageKey, JSON.stringify({
    properties,
    notes: noteLog,
    tasks,
    documents: docs,
    constructionScope: scopes,
    chatMessages,
    prospectMedia
  }));
}

function mergeLocalState() {
  const local = loadLocalState();
  const propertyState = new Map((local.properties || []).map((property) => [property.id, property]));
  properties = properties.map((property) => {
    const saved = propertyState.get(property.id);
    propertyState.delete(property.id);
    return saved ? normalizeProperty({ ...property, ...saved }) : property;
  });
  properties = [...properties, ...[...propertyState.values()].map(normalizeProperty)];
  if (Array.isArray(local.notes)) noteLog = local.notes.map(normalizeNote);
  if (Array.isArray(local.tasks)) tasks = local.tasks;
  if (Array.isArray(local.documents)) docs = local.documents;
  if (Array.isArray(local.constructionScope)) scopes = local.constructionScope.map(normalizeScopeItem);
  if (Array.isArray(local.chatMessages)) chatMessages = local.chatMessages.map(normalizeChatMessage);
  else if (!chatMessages.length) chatMessages = loadStoredChatMessages().map(normalizeChatMessage);
  if (Array.isArray(local.prospectMedia)) prospectMedia = local.prospectMedia.map(normalizeProspectMedia);
  else if (!prospectMedia.length) prospectMedia = loadStoredProspectMedia().map(normalizeProspectMedia);
}

async function loadData() {
  let data;
  pipelineOrder = loadPipelineOrder();
  try {
    const apiResponse = await fetch("/api/bootstrap");
    if (apiResponse.ok) {
      const bootstrap = await apiResponse.json();
      apiPersistent = bootstrap.persistent !== false && bootstrap.database !== "memory";
      apiAvailable = apiPersistent;
      mediaUploadsAvailable = bootstrap.mediaUploadsAvailable === true;
      properties = bootstrap.properties.map(normalizeProperty);
      noteLog = (bootstrap.notes || []).map(normalizeNote);
      tasks = bootstrap.tasks || [];
      docs = bootstrap.documents || [];
      scopes = (bootstrap.constructionScope || []).map(normalizeScopeItem);
      activityLog = bootstrap.activityLog || [];
      featureRequests = (bootstrap.featureRequests || []).map(normalizeFeatureRequest);
      chatMessages = (bootstrap.chatMessages || []).map(normalizeChatMessage);
      prospectMedia = (bootstrap.prospectMedia || []).map(normalizeProspectMedia);
      if (!apiPersistent) {
        mergeLocalState();
        featureRequests = loadStoredFeatureRequests();
        if (!chatMessages.length) chatMessages = loadStoredChatMessages();
        if (!prospectMedia.length) prospectMedia = loadStoredProspectMedia();
      }
      selectedId = requestedHomes()[0]?.id || properties[0]?.id || "";
      return;
    }
  } catch {
    data = null;
  }
  apiAvailable = false;
  apiPersistent = false;
  mediaUploadsAvailable = false;
  if (!data) {
    const response = await fetch("data/flip-targets.json");
    if (!response.ok) throw new Error(`Could not load property data: ${response.status}`);
    data = await response.json();
  }
  properties = data.targets.map(normalizeProperty);
  mergeLocalState();
  featureRequests = loadStoredFeatureRequests();
  if (!chatMessages.length) chatMessages = loadStoredChatMessages();
  if (!prospectMedia.length) prospectMedia = loadStoredProspectMedia();
  selectedId = requestedHomes()[0]?.id || activeProperties()[0]?.id || "";
}

function setText(id, value) {
  const element = document.getElementById(id);
  if (element) element.textContent = value;
}

const iconPaths = {
  "layout-grid": '<rect x="3" y="3" width="7" height="7" rx="1.5"></rect><rect x="14" y="3" width="7" height="7" rx="1.5"></rect><rect x="3" y="14" width="7" height="7" rx="1.5"></rect><rect x="14" y="14" width="7" height="7" rx="1.5"></rect>',
  crosshair: '<circle cx="12" cy="12" r="8"></circle><path d="M12 2v4"></path><path d="M12 18v4"></path><path d="M2 12h4"></path><path d="M18 12h4"></path>',
  "bar-chart": '<path d="M4 19V9"></path><path d="M10 19V5"></path><path d="M16 19v-7"></path><path d="M22 19H2"></path>',
  "house-chart": '<path d="M3 11.5 12 4l9 7.5"></path><path d="M5 10.5V20h14v-9.5"></path><path d="M10 20v-5h4v5"></path><path d="M15.5 15.5h2.5"></path><path d="M15.5 18h2.5"></path>',
  calculator: '<rect x="5" y="3" width="14" height="18" rx="2"></rect><path d="M8 7h8"></path><path d="M8 11h2"></path><path d="M12 11h2"></path><path d="M16 11h0"></path><path d="M8 15h2"></path><path d="M12 15h2"></path><path d="M16 15h0"></path>',
  "clipboard-list": '<rect x="5" y="4" width="14" height="17" rx="2"></rect><path d="M9 4a3 3 0 0 1 6 0"></path><path d="M9 10h.01"></path><path d="M12 10h4"></path><path d="M9 15h.01"></path><path d="M12 15h4"></path>',
  "file-text": '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><path d="M14 2v6h6"></path><path d="M8 13h8"></path><path d="M8 17h5"></path>',
  "message-square": '<path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z"></path><path d="M8 9h8"></path><path d="M8 13h5"></path>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M22 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path>',
  lightbulb: '<path d="M9 18h6"></path><path d="M10 22h4"></path><path d="M8.5 14.5a6 6 0 1 1 7 0c-.8.6-1.5 1.5-1.5 2.5h-4c0-1-.7-1.9-1.5-2.5Z"></path>',
  "search-user": '<circle cx="10" cy="9" r="6"></circle><path d="m15 14 5 5"></path><circle cx="10" cy="8" r="2"></circle><path d="M6.5 13c.8-1.6 2-2.4 3.5-2.4s2.7.8 3.5 2.4"></path>',
  home: '<path d="M3 11.5 12 4l9 7.5"></path><path d="M5 10.5V20h14v-9.5"></path><path d="M10 20v-6h4v6"></path>',
  briefcase: '<rect x="3" y="7" width="18" height="13" rx="2"></rect><path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"></path><path d="M8 13h.01"></path><path d="M12 13h4"></path>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"></rect><path d="M16 3v4"></path><path d="M8 3v4"></path><path d="M3 10h18"></path>',
  image: '<rect x="3" y="5" width="18" height="14" rx="2"></rect><circle cx="8.5" cy="10" r="1.5"></circle><path d="m21 15-4-4L7 19"></path>',
  "circle-dollar": '<circle cx="12" cy="12" r="9"></circle><path d="M12 7v10"></path><path d="M15 9.5c-.8-.8-1.8-1.2-3-1.2-1.7 0-3 1-3 2.3 0 1.4 1.3 2 3 2.4 1.7.4 3 .9 3 2.4 0 1.3-1.3 2.3-3 2.3-1.3 0-2.5-.5-3.3-1.4"></path>',
  "square-pen": '<path d="M12 20H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path><path d="M16 4.5 19.5 8 11 16.5 7 17.5 8 13.5z"></path>',
  shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"></path>',
  star: '<path d="m12 2 3.09 6.26L22 9.27l-5 4.87L18.18 21 12 17.77 5.82 21 7 14.14 2 9.27l6.91-1.01L12 2Z"></path>',
  settings: '<circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06A1.65 1.65 0 0 0 15 19.4a1.65 1.65 0 0 0-1 .6 1.65 1.65 0 0 0-.4 1.08V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-.6-1 1.65 1.65 0 0 0-1.08-.4H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06A2 2 0 1 1 7.04 4.3l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-.6 1.65 1.65 0 0 0 .4-1.08V3a2 2 0 1 1 4 0v.09A1.65 1.65 0 0 0 15 4.6a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9c.23.36.59.62 1 .73.2.06.42.08.6.08H21a2 2 0 1 1 0 4h-.09A1.65 1.65 0 0 0 19.4 15z"></path>',
  chevron: '<path d="m6 9 6 6 6-6"></path>'
};

function hydrateIcons() {
  document.querySelectorAll("[data-icon]").forEach((element) => {
    const path = iconPaths[element.dataset.icon];
    if (!path || element.dataset.hydratedIcon === "true") return;
    element.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${path}</svg>`;
    element.dataset.hydratedIcon = "true";
  });
}

function setNavCount(view, value) {
  document.querySelectorAll(`[data-nav-count="${view}"]`).forEach((element) => {
    element.textContent = number(Number(value) || 0);
  });
}

function activeLinkedItems(items) {
  return items.filter((item) => activePropertyById(item.property_id));
}

function updateNavCounts() {
  const activeList = activeProperties();
  const availableRankings = activeList.filter(isAvailableListing);
  const ownedList = activeList.filter(isOwnedProperty);
  const activeTasks = activeLinkedItems(tasks);
  const ownedTasks = ownedList.reduce((sum, property) => sum + ownedProjectTasks(property).length, 0);
  const ownedMedia = ownedList.reduce((sum, property) => sum + ownedMediaItems(property).length, 0);
  const ownedBudget = ownedList.length;
  const ownedNotes = noteLog.filter((note) => ownedList.some((property) => property.id === note.property_id)).length;
  const ownedCalendar = ownedList.reduce((sum, property) => {
    const owned = getOwned(property);
    const tl = property.source?.timeline || property.timeline || {};
    return sum + [tl.purchaseDate || owned.purchaseCloseDate, owned.targetRehabComplete || tl.rehabEnd, tl.listDate || owned.listDate, tl.saleDate || owned.saleCloseDate].filter(Boolean).length;
  }, 0);
  const activeDocs = activeLinkedItems(docs);
  const activeScopes = activeLinkedItems(scopes);
  const passedList = passedProperties();

  setNavCount("dashboard", activeList.length);
  setNavCount("pipeline", activeList.length);
  setNavCount("rankings", availableRankings.length);
  setNavCount("properties", activeList.length);
  setNavCount("calculator", activeList.length);
  setNavCount("scope", activeScopes.length);
  setNavCount("homesOwned", ownedList.length);
  setNavCount("homesOwnedDashboard", ownedList.length);
  setNavCount("tasks", activeTasks.length);
  setNavCount("ownedTasks", ownedTasks);
  setNavCount("ownedCalendar", ownedCalendar);
  setNavCount("ownedMedia", ownedMedia);
  setNavCount("ownedBudget", ownedBudget);
  setNavCount("ownedNotes", ownedNotes);
  setNavCount("ownedReports", 0);
  setNavCount("ownedSettings", teamMembers.length);
  setNavCount("documents", activeDocs.length);
  setNavCount("prospectMedia", prospectMedia.length);
  setNavCount("chat", chatMessages.length);
  setNavCount("team", teamMembers.length);
  setNavCount("featureRequests", featureRequests.length);
  setText("passedNavCount", passedList.length);
}

function renderSidebarContext() {
  const projectPanel = document.getElementById("sidebarCurrentProject");
  if (!projectPanel) return;
  const owned = activeProperties().filter(isOwnedProperty);
  const current = owned
    .slice()
    .sort((a, b) => ownedRiskFlags(b).length - ownedRiskFlags(a).length || flipProgress(b) - flipProgress(a))[0];
  if (!current || activeNavSection !== "owned") {
    projectPanel.hidden = true;
    projectPanel.innerHTML = "";
    return;
  }
  const progress = flipProgress(current);
  projectPanel.hidden = false;
  projectPanel.innerHTML = `
    <div class="tiny-label">Current project</div>
    <button class="sidebar-project-row" type="button" data-sidebar-project="${escapeHtml(current.id)}">
      <img src="${propertyPhoto(current)}" alt="${escapeHtml(current.address)}">
      <span>
        <strong>${escapeHtml(current.address)}</strong>
        <span>${escapeHtml(current.city)}, ${escapeHtml(current.state)}</span>
      </span>
      <span class="sidebar-chevron" data-icon="chevron"></span>
    </button>
    <div class="sidebar-project-progress">
      <span>Progress</span>
      <div class="sidebar-project-meter"><div style="width:${Math.min(100, progress)}%"></div></div>
      <strong>${progress}%</strong>
    </div>
  `;
  hydrateIcons();
  projectPanel.querySelector("[data-sidebar-project]")?.addEventListener("click", () => openPropertyDetail(current.id));
}

function propertyById(id) {
  return properties.find((item) => item.id === id);
}

function isPassedProperty(property) {
  return recordStageFor(property?.stage) === PASSED_STAGE;
}

function activeProperties() {
  return properties.filter((property) => !isPassedProperty(property));
}

function passedProperties() {
  return properties.filter(isPassedProperty);
}

function activePropertyById(id) {
  return activeProperties().find((item) => item.id === id);
}

function setActiveNavSection(section, options = {}) {
  activeNavSection = section === "owned" ? "owned" : "prospects";
  storageSet(navSectionStorageKey, activeNavSection);
  document.querySelector(".sidebar")?.setAttribute("data-active-section", activeNavSection);
  document.querySelectorAll(".nav-section-tab").forEach((button) => {
    button.classList.toggle("active", button.dataset.navSection === activeNavSection);
  });
  document.querySelectorAll("[data-nav-section-item]").forEach((item) => {
    item.hidden = item.dataset.navSectionItem !== activeNavSection;
  });
  renderSidebarContext();
  if (!options.keepView) {
    activeNavKey = activeNavSection === "owned" ? "ownedDashboard" : "dashboard";
    setActiveView("dashboard", { fromSectionSwitch: true, navKey: activeNavKey });
  }
}

function navKeyForView(view, options = {}) {
  if (options.navKey) return options.navKey;
  if (view === "featureRequestDetail") return "featureRequests";
  if (view === "homesOwned") return "homesOwned";
  return view;
}

function setActiveView(view, options = {}) {
  activeView = view;
  const inferredSection = view === "dashboard"
    ? (options.navKey === "ownedDashboard" || activeNavSection === "owned" ? "owned" : "prospects")
    : ownedSectionViews.has(view) ? "owned" : "prospects";
  if (inferredSection !== activeNavSection) {
    setActiveNavSection(inferredSection, { keepView: true });
  } else {
    setActiveNavSection(activeNavSection, { keepView: true });
  }
  const activeNavView = view === "featureRequestDetail" ? "featureRequests" : view;
  const activeKey = navKeyForView(view, options);
  activeNavKey = activeKey;
  document.querySelectorAll(".nav-item").forEach((item) => {
    const key = item.dataset.navKey || item.dataset.view;
    item.classList.toggle("active", key === activeKey && item.dataset.navSectionItem === activeNavSection);
  });
  document.querySelectorAll(".view").forEach((section) => section.classList.remove("active"));
  document.getElementById(`${view}View`)?.classList.add("active");
  document.querySelector(".main")?.classList.toggle("flip-dashboard-mode", view === "dashboard" && activeNavSection === "owned");
  document.querySelector(".main")?.classList.toggle("owned-app-mode", activeNavSection === "owned");
  document.querySelector(".main")?.classList.toggle("offer-calculator-mode", view === "calculator");
  window.scrollTo(0, 0);

  const titles = {
    dashboard: activeNavSection === "owned"
      ? ["Dashboard", "Here's what's happening with your flips today."]
      : ["Deal Dashboard", "Daily command center for acquisitions, offers, rehab risk, and follow-up."],
    pipeline: ["Pipeline", "Track and manage deals through every stage of your acquisition process."],
    rankings: ["Deal Ranking", "Scores prioritize the three requested homes, contact urgency, and offer spread."],
    properties: ["Property Records", "Complete listing, agent, and investor notes for every target."],
    passed: ["Passed Properties", "Rejected houses live here so they stay out of the active workflow."],
    detail: [options.title || "Property Details", options.subtitle || "One full page for the property status, notes, photos, numbers, and next steps."],
    calculator: ["Offer Calculator", "Analyze the numbers and determine your maximum allowable offer."],
    scope: ["Construction Scope", "Collect repair line items by property."],
    homesOwned: activeKey === "ownedDashboard"
      ? ["Dashboard", "Overview of owned projects, budget status, and work that needs attention."]
      : ["Projects", "Manage all of your house flip projects in one place."],
    tasks: ["Tasks", "Capture owner, due date, and next step."],
    ownedCalendar: ["Calendar", "Upcoming purchase, rehab, list, and sale dates for owned projects."],
    ownedMedia: ["Photos / Videos", "Review project media links grouped from Homes Owned records."],
    ownedBudget: ["Budget", "Track budget status across active flip projects."],
    ownedNotes: ["Notes", "Recent project notes for homes already purchased."],
    ownedReports: ["Reports", "Portfolio-level profit, budget, and risk rollups."],
    ownedSettings: ["Settings", "Homes Owned administration shortcuts."],
    documents: ["Documents", "Track contract, inspection, photo, and contractor file references."],
    prospectMedia: ["Photos / Videos", "Collect prospect photos, walkthrough videos, repairs, comps, and anything useful before purchase."],
    chat: ["Team Chat", "Internal message threads for acquisitions, construction, finance, and general updates."],
    team: ["Team Access", "Simple role assignments for the workspace."],
    featureRequests: ["Feature Requests", "Submit ideas and track every requested improvement."],
    featureRequestDetail: [options.title || "Feature Request", options.subtitle || "Review the request, priority, owner, and current status."]
  };
  setText("viewTitle", titles[view]?.[0] || "Deal Dashboard");
  setText("viewSubtitle", titles[view]?.[1] || "");
  updateChatPolling();
}

function openPropertyDetail(id, push = true) {
  const property = propertyById(id);
  if (!property) return;
  selectedId = property.id;
  renderDetailRecord();
  setActiveView("detail", { title: property.address, subtitle: fullAddress(property) });
  syncCalculator();
  if (push && window.location.hash !== propertyDetailHash(property.id)) {
    history.pushState(null, "", propertyDetailHash(property.id));
  }
}

function selectPropertyRecord(id) {
  const property = propertyById(id);
  if (!property) return;
  selectedId = property.id;
  document.querySelectorAll("#propertyList .property-button").forEach((button) => {
    button.classList.toggle("active", button.dataset.propertyId === property.id);
  });
  renderRecord();
  syncCalculator();
}

function handleRoute() {
  const propertyMatch = window.location.hash.match(/^#property\/(.+)$/);
  if (propertyMatch) {
    openPropertyDetail(propertyMatch[1], false);
    return;
  }
  const featureRequestMatch = window.location.hash.match(/^#feature-requests\/(.+)$/);
  if (featureRequestMatch) {
    openFeatureRequestDetail(featureRequestMatch[1], false);
  } else {
    setActiveView("dashboard", { navKey: activeNavSection === "owned" ? "ownedDashboard" : "dashboard" });
  }
}

const ACTION_LABELS = {
  "property.created":         (m, addr) => `New property added: ${addr}`,
  "property.updated":         (m, addr) => `${addr} details updated`,
  "property.status_updated":  (m, addr) => `${addr} moved to ${m?.status || "new stage"}`,
  "property.hazards_updated": (m, addr) => `${addr} hazard check updated`,
  "underwriting.saved":       (m, addr) => `${addr} underwriting saved`,
  "note.created":             (m, addr) => `Note added on ${addr}`,
  "note.deleted":             (m, addr) => `Note removed on ${addr}`,
  "task.created":             (m, addr) => `Task added on ${addr}: ${m?.title || ""}`,
  "task.updated":             (m, addr) => `Task on ${addr} marked ${m?.status || "updated"}`,
  "task.deleted":             (m, addr) => `Task deleted on ${addr}`,
  "chat.message_created":     (m, addr) => addr === "Property" ? `Team chat message posted in #${m?.channel || "general"}` : `Team chat message posted about ${addr}`,
  "construction_scope.created": (m, addr) => `Scope item added to ${addr}`,
  "construction_scope.updated": (m, addr) => `Scope item updated on ${addr}: ${m?.item || ""}`,
  "construction_scope.deleted": (m, addr) => `Scope item deleted on ${addr}`,
  "property.hazards_updated": (m, addr) => `Hazard check updated on ${addr}`,
  "property.owned_updated":   (m, addr) => `${addr} ownership data updated`,
};

function renderActivityFeed() {
  const el = document.getElementById("activityFeed");
  if (!el) return;
  if (!activityLog.length) {
    el.innerHTML = "<p class=\"empty\">No activity yet.</p>";
    return;
  }
  const activeActivity = activityLog.filter((entry) => {
    const property = properties.find((p) => p.id === entry.property_id);
    return !property || !isPassedProperty(property);
  });
  if (!activeActivity.length) {
    el.innerHTML = "<p class=\"empty\">No active deal activity yet.</p>";
    return;
  }
  el.innerHTML = activeActivity.slice(0, 30).map((entry) => {
    const property = properties.find((p) => p.id === entry.property_id);
    const addr = property?.address || "a property";
    let metadata = {};
    if (typeof entry.metadata === "string") {
      try { metadata = JSON.parse(entry.metadata) || {}; } catch { metadata = {}; }
    } else if (entry.metadata && typeof entry.metadata === "object") {
      metadata = entry.metadata;
    }
    const labelFn = ACTION_LABELS[entry.action];
    const label = labelFn ? labelFn(metadata, addr) : `${entry.action} on ${addr}`;
    return `
      <div class="activity-row">
        <div class="activity-text">${escapeHtml(label)}</div>
        <div class="activity-meta">
          <span>${escapeHtml(entry.actor || "Team")}</span>
          <span>${escapeHtml(formatNoteTime(entry.created_at))}</span>
        </div>
      </div>
    `;
  }).join("");
}

function renderStats() {
  const activeList = activeProperties();
  const passedList = passedProperties();
  const ownedList = activeList.filter(isOwnedProperty);
  renderFlipDashboard();

  const monthlyGoal = 3;
  const closedCount = activeList.filter((p) => p.stage === "Closed").length;
  setText("closedCount", closedCount);
  document.getElementById("goalProgress").style.width =
    `${Math.min(100, Math.round((closedCount / monthlyGoal) * 100))}%`;
  setText("passedNavCount", passedList.length);
}

function ownedProjectTaskList(ownedList) {
  return ownedList.flatMap((property) =>
    ownedProjectTasks(property).map((task) => ({ ...task, property }))
  );
}

const ownedTaskKey = (task) => `${task.property.id}::${task.id}`;

function renderDashboardProjectCard(property) {
  const isOwned = isOwnedProperty(property);
  const status = isOwned ? projectPortfolioStatus(property) : listingStatusLabel(property);
  const statusClass = isOwned ? status.toLowerCase().replace(/\s+/g, "-") : listingStatusKind(property);
  const underwriting = calculateUnderwriting(defaultUnderwritingFor(property));
  return `
    <article class="dash-project-card">
      <div class="dash-project-image">
        <img src="${propertyPhoto(property)}" alt="${escapeHtml(property.address)}">
        <span class="dash-project-price">${money(property.listPrice)}</span>
        <span class="flip-project-status ${statusClass}">${escapeHtml(status)}</span>
        <span class="dash-project-score">${property.score || 0}</span>
        <button class="flip-project-menu" type="button" aria-label="Project actions">⋮</button>
      </div>
      <div class="dash-project-body">
        <h3>${escapeHtml(property.address)}</h3>
        <p>${escapeHtml(property.city)}, ${escapeHtml(property.state)}</p>
        <div class="dash-mini-meter"><span>Estimated Profit</span><strong>${money(underwriting.netProfit)}</strong><div class="flip-meter"><span style="width:${Math.min(100, Math.max(8, underwriting.profitMargin * 100))}%"></span></div></div>
        <div class="dash-mini-meter"><span>ROI on Cost</span><strong>${percent(underwriting.roi)}</strong><div class="flip-meter budget"><span style="width:${Math.min(100, Math.max(8, underwriting.roi * 100))}%"></span></div></div>
        <div class="flip-project-date"><span>Suggested Max</span><strong>${money(underwriting.recommendedMaxOffer)}</strong></div>
      </div>
      <button class="flip-project-open" type="button" data-property-id="${property.id}" aria-label="Open ${escapeHtml(property.address)}"></button>
    </article>
  `;
}

function renderFlipDashboard() {
  const view = document.getElementById("dashboardView");
  if (!view) return;
  const ownedList = activeProperties().filter(isOwnedProperty);
  const sourceList = byScore(activeProperties().filter((property) =>
    !isOwnedProperty(property) && isAvailableListing(property)
  )).slice(0, 4);
  const projectTasks = ownedProjectTaskList(ownedList);
  const prospectList = activeProperties().filter((property) => !isOwnedProperty(property));
  const buyableProspects = prospectList.filter(isAvailableListing);
  const topProspectUnderwriting = sourceList.map((property) => calculateUnderwriting(defaultUnderwritingFor(property)));
  const totalProfit = topProspectUnderwriting.reduce((sum, calc) => sum + calc.netProfit, 0);
  const avgTopScore = sourceList.length
    ? Math.round(sourceList.reduce((sum, property) => sum + Number(property.score || 0), 0) / sourceList.length)
    : 0;
  const avgTopRoi = topProspectUnderwriting.length
    ? topProspectUnderwriting.reduce((sum, calc) => sum + calc.roi, 0) / topProspectUnderwriting.length
    : 0;
  const totalBudget = ownedList.reduce((sum, property) => sum + flipBudgetSummary(property).estimated, 0);
  const totalSpent = ownedList.reduce((sum, property) => sum + flipBudgetSummary(property).actual, 0);
  const avgProgress = ownedList.length
    ? Math.round(ownedList.reduce((sum, property) => sum + flipProgress(property), 0) / ownedList.length)
    : 0;
  const inProgress = ownedList.filter((property) => projectPortfolioStatus(property) === "In Progress").length;
  const completed = ownedList.filter((property) => projectPortfolioStatus(property) === "Completed").length;
  const planning = ownedList.filter((property) => projectPortfolioStatus(property) === "Planning").length;
  const onHold = ownedList.filter((property) => projectPortfolioStatus(property) === "On Hold").length;
  const budgetUsed = totalBudget > 0 ? Math.round((totalSpent / totalBudget) * 100) : 0;
  const userName = (document.getElementById("sidebarUserName")?.textContent || "Team").split(/\s+/)[0] || "Team";
  const today = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  const upcoming = projectTasks
    .filter((task) => task.status !== "Done")
    .sort((a, b) => String(a.dueDate || "9999").localeCompare(String(b.dueDate || "9999")))
    .slice(0, 5);
  const recentItems = [
    ...ownedList.flatMap((property) => ownedMediaItems(property).slice(0, 1).map((item) => `New ${String(item.type || "media").toLowerCase()} added to ${property.address}`)),
    ...projectTasks.slice(0, 3).map((task) => `Task updated: ${task.name}`),
    ...noteLog.filter((note) => ownedList.some((property) => property.id === note.property_id)).slice(0, 3).map((note) => `Note added: ${note.type}`)
  ].slice(0, 5);
  const attention = [
    [projectTasks.filter((task) => task.dueDate && task.dueDate < todayIso() && task.status !== "Done").length, "tasks", "Overdue"],
    [ownedList.filter((property) => ownedRiskLevel(property) === "critical").length, "projects", "Over budget"],
    [ownedList.filter((property) => defaultProjectMilestones(property).some((m) => m.targetDate && m.targetDate < todayIso() && m.status !== "Done")).length, "milestones", "Past due"]
  ];

  view.innerHTML = `
    <section class="flip-dash">
      <div class="flip-dash-head">
        <div>
          <h2>Good morning, ${escapeHtml(userName)}</h2>
          <p>Here are the best buyable prospects to chase right now.</p>
        </div>
        <div class="flip-dash-actions">
          <button class="secondary-link compact" type="button">${today}</button>
          <button class="primary compact" type="button" id="dashNewProject">+ Add Prospect</button>
        </div>
      </div>

      <div class="flip-dash-kpis">
        ${[
          ["Buyable Prospects", buyableProspects.length, `${prospectList.length - buyableProspects.length} unavailable`],
          ["Top Avg Score", avgTopScore, "Top 4 prospects"],
          ["Top Avg ROI", percent(avgTopRoi), "Estimated on cost"],
          ["Top Profit", money(totalProfit), "Estimated net"],
          ["Active Pipeline", prospectList.length, "Not passed or owned"]
        ].map(([label, value, meta]) => `
          <article>
            <span>${label}</span>
            <strong>${value}</strong>
            <em>${meta}</em>
          </article>
        `).join("")}
      </div>

      <div class="flip-dash-layout">
        <section class="flip-dash-panel projects-overview">
          <div class="flip-panel-head"><h3>Top Buyable Prospects</h3><button type="button" data-dashboard-view="rankings">View ranking</button></div>
          <div class="dash-project-row">${sourceList.slice(0, 4).map(renderDashboardProjectCard).join("") || "<p class=\"empty\">No buyable prospects right now.</p>"}</div>
        </section>
        <section class="flip-dash-panel upcoming-panel">
          <div class="flip-panel-head"><h3>Owned Project Tasks</h3><button type="button" data-dashboard-view="tasks">View all</button></div>
          <div class="dash-task-list">
            ${upcoming.map((task) => `
              <div class="dash-task-row">
                <time>${task.dueDate ? formatProjectDate(task.dueDate).replace(",", "") : "No date"}</time>
                <div><strong>${escapeHtml(task.name)}</strong><span>${escapeHtml(task.property.address)}</span></div>
                <span class="flip-status ${taskStatusClass(task.status)}">${escapeHtml(displayTaskStatus(task.status))}</span>
                <i>${escapeHtml(personInitials(task.assignedPerson))}</i>
              </div>
            `).join("") || "<p class=\"empty compact-empty\">No owned project tasks yet.</p>"}
          </div>
        </section>
      </div>

      <div class="flip-dash-layout lower">
        <section class="flip-dash-panel">
          <div class="flip-panel-head"><h3>Top Prospect Value</h3><span>Top 4</span></div>
          <div class="budget-donut-row">
            <div class="dash-donut" style="--pct:${Math.min(100, avgTopRoi * 100)}"><strong>${percent(avgTopRoi)}</strong><span>Avg ROI</span></div>
            <div class="dash-budget-lines">
              <div><span>Est. Profit</span><strong>${money(totalProfit)}</strong></div>
              <div><span>Avg Score</span><strong>${avgTopScore}</strong></div>
              <div><span>Buyable Count</span><strong>${buyableProspects.length}</strong></div>
            </div>
          </div>
        </section>
        <section class="flip-dash-panel">
          <div class="flip-panel-head"><h3>Prospects by Stage</h3><span>Current</span></div>
          <div class="status-summary">
            <div class="dash-donut status" style="--pct:${prospectList.length ? Math.round((buyableProspects.length / prospectList.length) * 100) : 0}"><strong>${prospectList.length}</strong><span>Total</span></div>
            <div class="dash-budget-lines">
              <div><span>Buyable</span><strong>${buyableProspects.length}</strong></div>
              <div><span>Needs Review</span><strong>${prospectList.filter((property) => recordStageFor(property.stage) === "Needs Review").length}</strong></div>
              <div><span>Underwriting</span><strong>${prospectList.filter((property) => recordStageFor(property.stage) === "Underwriting").length}</strong></div>
              <div><span>Offer Made</span><strong>${prospectList.filter((property) => recordStageFor(property.stage) === "Offer Made").length}</strong></div>
            </div>
          </div>
        </section>
        <section class="flip-dash-panel recent-panel">
          <div class="flip-panel-head"><h3>Best Next Calls</h3><button type="button" data-dashboard-view="pipeline">View pipeline</button></div>
          <div class="dash-recent-list">
            ${sourceList.map((property) => `<div><span></span><strong>${escapeHtml(property.address)}</strong><em>${escapeHtml(property.phone || property.listingAgent || "Verify contact")}</em></div>`).join("") || "<p class=\"empty compact-empty\">No buyable prospects right now.</p>"}
          </div>
        </section>
      </div>

      <section class="flip-dash-panel attention-panel">
        <div class="flip-panel-head"><h3>Acquisition Attention</h3><span>${attention.reduce((sum, item) => sum + item[0], 0)} items</span></div>
        <div class="attention-grid">
          ${attention.map(([count, label, meta]) => `<div><strong>${count} ${label}</strong><span>${meta}</span></div>`).join("")}
        </div>
      </section>
    </section>
  `;
  view.querySelector("#dashNewProject")?.addEventListener("click", () => document.getElementById("newPropertyBtn")?.click());
  view.querySelectorAll("[data-dashboard-view]").forEach((button) => {
    button.addEventListener("click", () => setActiveView(button.dataset.dashboardView));
  });
  view.querySelectorAll("[data-property-id]").forEach((button) => {
    button.addEventListener("click", () => openPropertyDetail(button.dataset.propertyId));
  });
}

function contactLine(property) {
  const names = [property.listingAgent, property.coListingAgent].filter(Boolean).join(" / ") || "Verify agent";
  const phones = [property.phone, property.secondaryPhone, property.brokeragePhone].filter(Boolean).join(" / ") || "Verify phone";
  return `${names} · ${property.brokerage || "Verify brokerage"} · ${phones}`;
}

function phoneLink(value) {
  if (!value) return "";
  const href = String(value).replace(/[^\d+]/g, "");
  return href ? `<a class="contact-chip phone-chip" href="tel:${href}">${escapeHtml(value)}</a>` : "";
}

function emailLink(value) {
  if (!value) return "";
  const email = String(value).trim();
  return email ? `<a class="contact-chip" href="mailto:${escapeHtml(email)}">${escapeHtml(email)}</a>` : "";
}

function contactFieldLinks(values, fallback) {
  const links = values.filter(Boolean);
  return links.length ? `<div class="contact-chip-list">${links.join("")}</div>` : fallback;
}

function scoreBadge(property, compact = false) {
  const band = property.scoreBand || scoreBand(property.score || 0);
  return `<span class="score-badge ${band.tone}"><strong>${property.score || 0}</strong>${compact ? "" : `<span>${band.label}</span>`}</span>`;
}

function renderScoreBreakdown(property) {
  const categories = property.scoreBreakdown || calculateDealScore(property).categories;
  const completeness = property.scoreCompleteness || scoreCompleteness(calculateDealScore(property));
  const missingKeys = new Set(completeness.missing.map((category) => category.key));
  return `
    <section class="score-panel">
      <div class="score-panel-head">
        <div>
          ${scoreBadge(property)}
          <p class="score-context">${completeness.missing.length ? `${property.score || 0}/${completeness.scoredPoints} scored · ${completeness.label}` : "Score uses all current inputs"}</p>
        </div>
        <button class="secondary-link compact" type="button" data-refresh-score="${property.id}">Refresh Score</button>
      </div>
      ${completeness.missing.length ? `<div class="score-callout">${completeness.label}: ${completeness.missing.map((category) => category.label).join(", ")}.</div>` : ""}
      <div class="score-lines">
        ${categories.map((category) => `
          <div class="score-line ${missingKeys.has(category.key) ? "missing" : ""}">
            <span>${category.label}</span>
            <div class="score-track"><div style="width:${category.score / category.max * 100}%"></div></div>
            <strong>${missingKeys.has(category.key) ? "Needs data" : `${category.score}/${category.max}`}</strong>
          </div>
        `).join("")}
      </div>
      <div class="score-total"><span>Total Score</span><strong>${property.score || 0}/100</strong></div>
    </section>
  `;
}

function renderDecisionList() {
  const decisionEl = document.getElementById("decisionList");
  if (!decisionEl) return;
  const today = new Date().toISOString().slice(0, 10);
  const activeList = activeProperties();
  const ownedActions = ownedActionItems(activeList.filter(isOwnedProperty))
    .filter((item) => item.level === "critical" || item.level === "warn")
    .slice(0, 4);

  // Properties with at least one overdue or due-today open task
  const urgent = activeList.filter((property) =>
    tasks.some((t) =>
      t.property_id === property.id &&
      t.due_date &&
      t.due_date <= today &&
      (t.status || "Open") !== "Done"
    )
  );

  // Fall back to highest-scored properties if no urgent tasks exist
  const list = ownedActions.length
    ? ownedActions.map((item) => item.property)
    : urgent.length > 0 ? byScore(urgent) : byScore(activeList).slice(0, 4);

  decisionEl.innerHTML = list.map((property) => {
    const propertyTasks = tasks.filter(
      (t) => t.property_id === property.id && t.due_date && t.due_date <= today && (t.status || "Open") !== "Done"
    );
    const ownedAction = ownedActions.find((item) => item.property.id === property.id);
    const taskLabel = propertyTasks.length > 0
      ? `${propertyTasks.length} task${propertyTasks.length > 1 ? "s" : ""} due`
      : ownedAction ? ownedAction.label : "High priority";
    return `
      <button class="stack-card property-card-link" type="button" data-property-id="${escapeHtml(property.id)}">
        <strong>${escapeHtml(property.address)}</strong>
        <p>${ownedAction ? `${escapeHtml(ownedPhaseFor(property))} · ${escapeHtml(ownedAction.label)}` : escapeHtml(property.why)}</p>
        <div class="meta">
          ${scoreBadge(property)}
          <span class="pill">${money(property.listPrice)}</span>
          <span class="pill amber">${escapeHtml(property.beds || "?")} bd / ${escapeHtml(property.baths || "?")} ba</span>
          <span class="pill amber">${escapeHtml(taskLabel)}</span>
          <span class="pill blue">Call ${escapeHtml(property.phone || "agent")}</span>
        </div>
      </button>
    `;
  }).join("") || "<p class=\"empty\">No urgent decisions today.</p>";

  bindPropertyLinks(decisionEl);
}

function renderDashboardPhotos() {
  const photoGrid = document.getElementById("dashboardPhotoGrid");
  if (!photoGrid) return;
  photoGrid.innerHTML = byScore(activeProperties()).slice(0, 6).map((property) => `
    <button class="photo-tile" type="button" data-property-id="${escapeHtml(property.id)}">
      <div class="photo-media">
        <img src="${safeUrl(propertyPhoto(property))}" alt="Main house image for ${escapeHtml(property.address)}">
        <div class="price-badge">
          <span>Current list</span>
          <strong>${money(property.listPrice)}</strong>
        </div>
      </div>
      <span>${escapeHtml(property.address)}</span>
    </button>
  `).join("");

  photoGrid.querySelectorAll("[data-property-id]").forEach((button) => {
    button.addEventListener("click", () => {
      openPropertyDetail(button.dataset.propertyId);
    });
  });
}

function renderStageBars() {
  const stageBars = document.getElementById("stageBars");
  if (!stageBars) return;
  const activeList = activeProperties();
  const counts = activeStages.map((stage) => [stage, activeList.filter((property) => property.stage === stage).length]);
  const max = Math.max(...counts.map(([, count]) => count), 1);
  stageBars.innerHTML = counts.map(([stage, count]) => `
    <div class="stage-bar-row">
      <div class="stage-bar-label"><span>${escapeHtml(stage)}</span><strong>${Number(count)}</strong></div>
      <div class="stage-track"><div style="width:${Math.max(8, count / max * 100)}%"></div></div>
    </div>
  `).join("");
}

function renderDashboardTable() {
  const table = document.getElementById("dashboardTable");
  if (!table) return;
  table.innerHTML = byScore(activeProperties().filter(isAvailableListing)).slice(0, 12).map((property) => `
    <tr>
      <td>${scoreBadge(property, true)}</td>
      <td><a href="${safeUrl(propertyDetailHash(property.id))}" data-property-id="${escapeHtml(property.id)}">${escapeHtml(property.address)}</a><br><span>${escapeHtml(property.city)}, ${escapeHtml(property.state)}</span></td>
      <td>${escapeHtml(property.stage)}</td>
      <td>${listingStatusPill(property)}</td>
      <td>${money(property.listPrice)}</td>
      <td>${money(property.targetOfferLow)} - ${money(property.targetOfferHigh)}</td>
      <td>${escapeHtml(property.listingAgent || "Verify")}<br><span>${escapeHtml(property.phone || "")}</span></td>
      <td>${daysOnMarketValue(property) ? `${Number(daysOnMarketValue(property))} DOM · ` : ""}${auctionInfo(property) ? "Verify auction date" : property.status === "verify" ? "Verify listing, then call agent" : "Follow up"}</td>
    </tr>
  `).join("");
  bindPropertyLinks(table);
}

function renderPipeline() {
  const searchQuery = document.getElementById("searchInput")?.value.trim() || "";
  const activeList = filteredProperties();
  const board = document.getElementById("pipelineBoard");
  const pipelineGroups = [
    { label: "New Leads", dot: "blue", stages: ["New Lead"], moveTo: "New Lead" },
    { label: "Initial Review", dot: "orange", stages: ["Needs Review"], moveTo: "Needs Review" },
    { label: "Under Analysis", dot: "violet", stages: ["Underwriting", "Due Diligence"], moveTo: "Underwriting" },
    { label: "Offer Sent", dot: "blue", stages: ["Offer Made", "Negotiation"], moveTo: "Offer Made" },
    { label: "Under Contract", dot: "green", stages: ["Under Contract", "Approved", "Closed"], moveTo: "Under Contract" }
  ];
  const groupForStage = (stage) => pipelineGroups.find((group) => group.stages.includes(stage)) || pipelineGroups[0];
  const propertiesForGroup = (group) => activeList.filter((property) => group.stages.includes(recordStageFor(property.stage)));
  const estimatedProfit = (property) => {
    const underwriting = property.underwriting || defaultUnderwritingFor(property);
    return Number(underwriting.netProfit ?? calculateUnderwriting(underwriting).netProfit ?? property.netProfit ?? 0);
  };
  const compactMoney = (value) => {
    const numeric = Number(value || 0);
    if (Math.abs(numeric) >= 1000000) return `$${(numeric / 1000000).toFixed(1)}M`;
    if (Math.abs(numeric) >= 1000) return `$${Math.round(numeric / 1000)}K`;
    return money(numeric);
  };
  const sourceTag = (property) => {
    const source = String(property.sourceName || property.source?.name || property.source?.sourceName || property.listingSource || property.sourceUrl || "").toLowerCase();
    if (source.includes("mls") || source.includes("realtracs")) return "MLS";
    if (source.includes("wholesale")) return "Wholesaler";
    return "Retail";
  };
  const sourceClass = (label) => label.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const scoreRingTone = (score) => score >= 80 ? "good" : score >= 70 ? "mid" : "watch";
  const cardAge = (property) => {
    const dom = daysOnMarketValue(property);
    if (dom) return `${dom} day${dom === 1 ? "" : "s"} ago`;
    const stage = groupForStage(recordStageFor(property.stage));
    if (stage.label === "Under Contract") return "Under contract";
    if (stage.label === "Offer Sent") return "Offer sent recently";
    if (stage.label === "Under Analysis") return "Analyzed recently";
    if (stage.label === "Initial Review") return "Reviewed recently";
    return "Added recently";
  };
  const pipelineCard = (property) => {
    const score = Number(property.score || 0);
    const tag = sourceTag(property);
    return `
      <article class="pipeline-deal-card" draggable="true" data-pipeline-card="${escapeHtml(property.id)}">
        <button class="pipeline-card-star" type="button" aria-label="Favorite ${escapeHtml(property.address)}">☆</button>
        <button class="pipeline-deal-main property-card-link" type="button" data-property-id="${escapeHtml(property.id)}">
          <span class="pipeline-deal-photo">
            <img src="${propertyPhoto(property)}" alt="${escapeHtml(property.address)}" draggable="false">
            <span class="pipeline-score-ring ${scoreRingTone(score)}">${score}</span>
          </span>
          <span class="pipeline-deal-copy">
            <strong>${escapeHtml(property.address)}</strong>
            <span>${escapeHtml(property.city)}, ${escapeHtml(property.state)}</span>
            <small>Est. Profit</small>
            <em>${money(estimatedProfit(property))}</em>
            <small>${escapeHtml(cardAge(property))}</small>
          </span>
          <span class="pipeline-source-pill ${sourceClass(tag)}">${escapeHtml(tag)}</span>
        </button>
      </article>
    `;
  };
  const totalPipelineValue = activeList.reduce((sum, property) => sum + Number(property.listPrice || 0), 0);
  const avgScore = activeList.length
    ? Math.round(activeList.reduce((sum, property) => sum + Number(property.score || 0), 0) / activeList.length)
    : 0;
  const underContract = activeList.filter((property) => ["Under Contract", "Approved"].includes(recordStageFor(property.stage)));
  const closedThisMonth = activeList.filter((property) => recordStageFor(property.stage) === "Closed");
  const kpis = [
    ["users", "Total Deals", number(activeList.length), "All stages", "violet"],
    ["circle-dollar", "Total Value", compactMoney(totalPipelineValue), "Across pipeline", "green"],
    ["bar-chart", "Avg. Lead Score", number(avgScore), "Across pipeline", "amber"],
    ["clipboard-list", "Under Contract", number(underContract.length), `${compactMoney(underContract.reduce((sum, p) => sum + Number(p.listPrice || 0), 0))} value`, "blue"],
    ["briefcase", "Closed This Month", number(closedThisMonth.length), `${compactMoney(closedThisMonth.reduce((sum, p) => sum + Number(p.listPrice || 0), 0))} value`, "violet"]
  ];
  const attentionAll = byScore(activeList)
    .filter((property) => recordStageFor(property.stage) !== "Closed")
  const attention = showAllPipelineAttention ? attentionAll : attentionAll.slice(0, 4);
  const opportunitiesAll = byScore(activeList);
  const opportunities = showAllPipelineOpportunities ? opportunitiesAll : opportunitiesAll.slice(0, 3);
  const activityAll = activityLog.length
    ? activityLog
    : activeList.map((property) => ({ action: "property.updated", metadata: {}, property_id: property.id, created_at: todayIso() }));
  const recentActivity = showAllPipelineActivity ? activityAll : activityAll.slice(0, 5);
  const upcomingAll = tasks
    .filter((task) => activePropertyById(task.property_id) && (task.status || "Open") !== "Done");
  const upcoming = showAllPipelineActions ? upcomingAll : upcomingAll.slice(0, 4);
  const propertyPickerOptions = activeList
    .slice()
    .sort((a, b) => String(a.address || "").localeCompare(String(b.address || "")))
    .map((property) => `<option value="${escapeHtml(property.id)}">${escapeHtml(property.address)} · ${escapeHtml(recordStageFor(property.stage))}</option>`)
    .join("");

  board.innerHTML = `
    <section class="pipeline-page">
      <div class="pipeline-actions-row">
        <button class="secondary-link" type="button"><span data-icon="file-text"></span>Import Deals</button>
        <select class="pipeline-property-picker" id="pipelinePropertyPicker" aria-label="Open current property">
          <option value="">Open current property...</option>
          ${propertyPickerOptions}
        </select>
        <button class="secondary-link pipeline-menu-btn" type="button" aria-label="More pipeline actions">•••</button>
      </div>
      <div class="pipeline-kpi-grid">
        ${kpis.map(([icon, label, value, detail, tone]) => `
          <article class="pipeline-kpi">
            <span class="pipeline-kpi-icon ${tone}" data-icon="${icon}"></span>
            <div>
              <span>${label}</span>
              <strong>${value}</strong>
              <em>${detail}</em>
            </div>
          </article>
        `).join("")}
      </div>
      <div class="pipeline-filter-row">
        <label class="pipeline-search"><span data-icon="search-user"></span><input id="pipelineSearchInput" type="search" placeholder="Search deals, addresses, owners..." aria-label="Search pipeline" value="${escapeHtml(searchQuery)}"></label>
        <select aria-label="Lead source"><option>All Lead Sources</option><option>Retail</option><option>MLS</option><option>Wholesaler</option></select>
        <select aria-label="Market"><option>All Markets</option><option>Nashville</option><option>Manchester</option></select>
        <select aria-label="Owner"><option>All Owners</option>${teamMembers.map((member) => `<option>${escapeHtml(member.name)}</option>`).join("")}</select>
        <button class="secondary-link" type="button">More Filters <span data-icon="settings"></span></button>
        <span class="pipeline-sort">Sort: Newest <span data-icon="chevron"></span></span>
      </div>
      <div class="pipeline-columns">
        ${pipelineGroups.map((group) => {
          const items = pipelineStageItems(propertiesForGroup(group), group.moveTo);
          const value = items.reduce((sum, property) => sum + Number(property.listPrice || 0), 0);
          return `
            <section class="pipeline-stage-column" data-pipeline-stage="${escapeHtml(group.moveTo)}">
              <header>
                <div>
                  <h2><span class="pipeline-dot ${group.dot}"></span>${escapeHtml(group.label)} <strong>${items.length}</strong></h2>
                  <p>${compactMoney(value)}</p>
                </div>
              </header>
              <div class="pipeline-card-list pipeline-dropzone" data-pipeline-stage="${escapeHtml(group.moveTo)}">
                ${items.slice(0, 3).map(pipelineCard).join("") || "<p class=\"empty\">No records</p>"}
              </div>
            </section>
          `;
        }).join("")}
      </div>
      <div class="pipeline-insight-grid">
        <section class="pipeline-insight-card attention">
          <h3><span data-icon="lightbulb"></span>Needs Attention <strong>${attentionAll.length}</strong></h3>
          ${attention.map((property, index) => `
            <button type="button" data-property-id="${escapeHtml(property.id)}">
              <span>${index + 1}</span>
              <strong>${escapeHtml(property.address)}<em>${escapeHtml(property.stage === "Offer Made" ? "Offer expires soon" : property.score < 70 ? "Lead score dropping" : "Needs next action")}</em></strong>
              <i class="${scoreRingTone(property.score || 0)}">${property.score || 0}</i>
            </button>
          `).join("") || "<p class=\"empty\">No urgent items.</p>"}
          ${attentionAll.length > 4 ? `<button class="pipeline-card-link" type="button" id="pipelineAttentionToggle">${showAllPipelineAttention ? "Show Less" : `View All (${attentionAll.length})`}</button>` : ""}
        </section>
        <section class="pipeline-insight-card">
          <h3><span data-icon="bar-chart"></span>Top Opportunities</h3>
          ${opportunities.map((property) => `
            <button type="button" data-property-id="${escapeHtml(property.id)}" class="pipeline-opportunity">
              <img src="${propertyPhoto(property)}" alt="${escapeHtml(property.address)}">
              <strong>${escapeHtml(property.address)}<span>${escapeHtml(property.city)}, ${escapeHtml(property.state)}</span></strong>
              <em>Lead Score <b>${property.score || 0}</b></em>
              <em>Est. Profit <b>${money(estimatedProfit(property))}</b></em>
            </button>
          `).join("")}
          ${opportunitiesAll.length > 3 ? `<button class="pipeline-card-link" type="button" id="pipelineOpportunitiesToggle">${showAllPipelineOpportunities ? "Show Less" : `View All Opportunities (${opportunitiesAll.length})`}</button>` : ""}
        </section>
        <section class="pipeline-insight-card">
          <h3><span data-icon="calendar"></span>Recent Activity</h3>
          ${recentActivity.map((entry, index) => {
            const property = propertyById(entry.property_id);
            return `<div class="pipeline-activity-line"><span>${index + 1}</span><strong>${escapeHtml(ACTION_LABELS[entry.action]?.(entry.metadata, property?.address || "Property") || "Pipeline updated")}</strong><em>${formatNoteTime(entry.created_at) || "recent"}</em></div>`;
          }).join("")}
          ${activityAll.length > 5 ? `<button class="pipeline-card-link" type="button" id="pipelineActivityToggle">${showAllPipelineActivity ? "Show Less" : `View All Activity (${activityAll.length})`}</button>` : ""}
        </section>
        <section class="pipeline-insight-card">
          <h3><span data-icon="calendar"></span>Upcoming Actions</h3>
          ${upcoming.map((task) => `
            <div class="pipeline-action-line">
              <span>✓</span>
              <strong>${escapeHtml(task.title || task.text || "Follow up")}<em>${escapeHtml(propertyById(task.property_id)?.address || "Property")}</em></strong>
              <time>${escapeHtml(task.due_date || "No date")}</time>
            </div>
          `).join("") || "<p class=\"empty\">No upcoming actions.</p>"}
          ${upcomingAll.length > 4 ? `<button class="pipeline-card-link" type="button" id="pipelineActionsToggle">${showAllPipelineActions ? "Show Less" : `View All Actions (${upcomingAll.length})`}</button>` : ""}
        </section>
      </div>
    </section>
  `;

  bindPropertyLinks(board);
  hydrateIcons();

  const savePipelineStage = async (id, newStage) => {
    const shouldOpenHandoff = newStage === "Closed" && needsOwnedHandoff(propertyById(id));
    await saveRecordState(id, { status: newStage });
    if (newStage === "Closed") {
      const property = propertyById(id);
      await saveOwnedForProperty(id, {
        ...ownershipDefaultsFor(property || {}),
        ...getOwned(property || {})
      });
    }
    return shouldOpenHandoff;
  };

  const movePipelineProperty = async (id, newStage) => {
    const shouldOpenHandoff = await savePipelineStage(id, newStage);
    renderAll();
    if (shouldOpenHandoff) openOwnedModal(id, { handoff: true });
  };

  const visibleCardIds = (stage) => Array.from(
    document.querySelectorAll(`.pipeline-dropzone[data-pipeline-stage="${stage}"] [data-pipeline-card]`)
  ).map((card) => card.dataset.pipelineCard);

  const insertPipelineOrder = (ids, draggedId, targetId, placement) => {
    const nextIds = ids.filter((id) => id !== draggedId);
    const targetIndex = targetId ? nextIds.indexOf(targetId) : -1;
    if (targetIndex < 0) {
      nextIds.push(draggedId);
      return nextIds;
    }
    nextIds.splice(placement === "after" ? targetIndex + 1 : targetIndex, 0, draggedId);
    return nextIds;
  };

  const handlePipelineDrop = async (event, zone) => {
    event.preventDefault();
    zone.classList.remove("drag-over");
    const id = event.dataTransfer.getData("text/plain");
    const newStage = zone.dataset.pipelineStage;
    const property = propertyById(id);
    if (!id || !newStage || !property) return;

    const targetCard = event.target.closest("[data-pipeline-card]");
    const targetId = targetCard?.dataset.pipelineCard === id ? null : targetCard?.dataset.pipelineCard;
    const rect = targetCard?.getBoundingClientRect();
    const placement = rect && event.clientY > rect.top + rect.height / 2 ? "after" : "before";
    const previousStage = property.stage;

    if (previousStage && previousStage !== newStage) {
      pipelineOrder[previousStage] = visibleCardIds(previousStage).filter((cardId) => cardId !== id);
      var shouldOpenHandoff = await savePipelineStage(id, newStage);
    }

    pipelineOrder[newStage] = insertPipelineOrder(visibleCardIds(newStage), id, targetId, placement);
    storePipelineOrder();
    renderAll();
    if (shouldOpenHandoff) openOwnedModal(id, { handoff: true });
  };

  document.getElementById("pipelinePropertyPicker")?.addEventListener("change", (event) => {
    const propertyIdValue = event.target.value;
    if (!propertyIdValue) return;
    openPropertyDetail(propertyIdValue);
  });
  document.getElementById("pipelineSearchInput")?.addEventListener("input", (event) => {
    const headerSearch = document.getElementById("searchInput");
    if (headerSearch) headerSearch.value = event.target.value;
    showAllPipelineAttention = false;
    showAllPipelineOpportunities = false;
    showAllPipelineActivity = false;
    showAllPipelineActions = false;
    renderPipeline();
  });
  document.getElementById("pipelineAttentionToggle")?.addEventListener("click", () => {
    showAllPipelineAttention = !showAllPipelineAttention;
    renderPipeline();
  });
  document.getElementById("pipelineOpportunitiesToggle")?.addEventListener("click", () => {
    showAllPipelineOpportunities = !showAllPipelineOpportunities;
    renderPipeline();
  });
  document.getElementById("pipelineActivityToggle")?.addEventListener("click", () => {
    showAllPipelineActivity = !showAllPipelineActivity;
    renderPipeline();
  });
  document.getElementById("pipelineActionsToggle")?.addEventListener("click", () => {
    showAllPipelineActions = !showAllPipelineActions;
    renderPipeline();
  });

  document.querySelectorAll("[data-pipeline-card]").forEach((card) => {
    card.addEventListener("dragstart", (event) => {
      event.dataTransfer.setData("text/plain", card.dataset.pipelineCard);
      event.dataTransfer.effectAllowed = "move";
      card.classList.add("dragging");
    });
    card.addEventListener("dragend", () => {
      card.classList.remove("dragging");
      document.querySelectorAll(".pipeline-dropzone.drag-over").forEach((zone) => zone.classList.remove("drag-over"));
    });
  });

  document.querySelectorAll(".pipeline-dropzone").forEach((zone) => {
    zone.addEventListener("dragover", (event) => {
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      zone.classList.add("drag-over");
    });
    zone.addEventListener("dragleave", (event) => {
      if (!zone.contains(event.relatedTarget)) zone.classList.remove("drag-over");
    });
    zone.addEventListener("drop", async (event) => {
      await handlePipelineDrop(event, zone);
    });
  });
}

function renderRankings() {
  const page = document.getElementById("rankingPage");
  if (!page) return;
  const searchQuery = document.getElementById("searchInput")?.value.trim() || "";
  const sourceFilter = document.getElementById("rankingSourceFilter")?.value || "All";
  const marketFilter = document.getElementById("rankingMarketFilter")?.value || "All";
  const ownerFilter = document.getElementById("rankingOwnerFilter")?.value || "All";
  const stageFilter = document.getElementById("rankingStageFilter")?.value || "All";
  const sortMode = document.getElementById("rankingSort")?.value || "score";
  const baseCandidates = filteredProperties();
  const rankingSource = (property) => sourceTagLabel(property);
  const rankingMarket = (property) => property.city || "Unknown";
  const rankingOwner = (property) => property.assignedOwner || property.owner || "Unassigned";
  const matchesFilter = (property) => (
    (sourceFilter === "All" || rankingSource(property) === sourceFilter) &&
    (marketFilter === "All" || rankingMarket(property) === marketFilter) &&
    (ownerFilter === "All" || rankingOwner(property) === ownerFilter) &&
    (stageFilter === "All" || recordStageFor(property.stage) === stageFilter)
  );
  const rankingCalc = (property) => {
    const input = defaultUnderwritingFor(property);
    return { ...input, ...calculateUnderwriting(input) };
  };
  const ranked = baseCandidates
    .filter(matchesFilter)
    .map((property) => ({ property, calc: rankingCalc(property) }))
    .sort((a, b) => {
      if (sortMode === "profit") return b.calc.netProfit - a.calc.netProfit;
      if (sortMode === "roi") return b.calc.roi - a.calc.roi;
      if (sortMode === "arv") return (b.property.arv || 0) - (a.property.arv || 0);
      return (b.property.score || 0) - (a.property.score || 0);
    });
  const top = ranked[0];
  const totalProfit = ranked.reduce((sum, item) => sum + Math.max(0, Number(item.calc.netProfit || 0)), 0);
  const avgScore = ranked.length ? Math.round(ranked.reduce((sum, item) => sum + Number(item.property.score || 0), 0) / ranked.length) : 0;
  const underContractCount = ranked.filter(({ property }) => ["Under Contract", "Approved", "Closed"].includes(recordStageFor(property.stage))).length;
  const sourceOptions = ["All", ...new Set(activeProperties().map(rankingSource))].sort();
  const marketOptions = ["All", ...new Set(activeProperties().map(rankingMarket))].sort();
  const ownerOptions = ["All", ...new Set(activeProperties().map(rankingOwner))].sort();
  const stageOptions = ["All", ...activeStages];
  const optionList = (items, selected) => items.map((item) => `<option value="${escapeHtml(item)}" ${item === selected ? "selected" : ""}>${escapeHtml(item === "All" ? item : item)}</option>`).join("");
  const scoreTone = (score) => score >= 85 ? "excellent" : score >= 75 ? "high" : score >= 65 ? "good" : score >= 55 ? "average" : "low";
  const statusTone = (stage) => recordStageFor(stage).toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const sourceTone = (source) => source.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const activityFor = (property) => activityLog.find((entry) => entry.property_id === property.id);
  const activityLabel = (property) => {
    const entry = activityFor(property);
    if (!entry) return property.stage === "New Lead" ? "New lead" : "Added to pipeline";
    return ACTION_LABELS[entry.action]?.(entry.metadata || {}, property.address) || "Updated";
  };
  const scoreReasonList = (property, calc) => {
    const categories = property.scoreBreakdown || calculateDealScore(property).categories;
    return categories
      .slice()
      .sort((a, b) => b.score / b.max - a.score / a.max)
      .slice(0, 4)
      .map((category) => ({
        title: category.label,
        body: category.score >= category.max * 0.7 ? "Strong fit" : category.score >= category.max * 0.45 ? "Needs review" : "Weak signal"
      }))
      .concat(calc.netProfit > 0 ? [{ title: "Positive profit model", body: `${money(calc.netProfit)} estimated net` }] : [])
      .slice(0, 4);
  };
  const rowMarkup = ({ property, calc }, index) => {
    const source = rankingSource(property);
    const band = property.scoreBand || scoreBand(property.score || 0);
    const isExpanded = expandedRankingKey === property.id;
    return `
      <tr class="ranking-row ${isExpanded ? "expanded" : ""}">
        <td class="ranking-rank">${index + 1}</td>
        <td>
          <button class="ranking-property" type="button" data-property-id="${escapeHtml(property.id)}">
            <img src="${propertyPhoto(property)}" alt="${escapeHtml(property.address)}">
            <span>
              <strong>${escapeHtml(property.address)}</strong>
              <em>${escapeHtml(property.city)}, ${escapeHtml(property.state)} ${escapeHtml(property.zip || "")}</em>
              <small><i class="ranking-source ${sourceTone(source)}">${escapeHtml(source)}</i><i class="ranking-temp ${listingStatusKind(property)}">${escapeHtml(listingStatusLabel(property))}</i></small>
            </span>
          </button>
        </td>
        <td><span class="ranking-score ${scoreTone(property.score || 0)}"><strong>${property.score || 0}</strong><em>${escapeHtml(band.label)}</em></span></td>
        <td class="ranking-profit">${money(calc.netProfit)}</td>
        <td>${percent(calc.roi)}</td>
        <td><strong>${money(property.arv || calc.arv)}</strong><em>Est. Rehab ${money(property.rehab || calc.rehabEstimate)}</em></td>
        <td><span class="ranking-stage ${statusTone(property.stage)}">${escapeHtml(recordStageFor(property.stage))}</span></td>
        <td><span class="ranking-activity">${escapeHtml(activityLabel(property))}<em>${formatNoteTime(activityFor(property)?.created_at) || "recent"}</em></span></td>
        <td>
          <div class="ranking-row-actions">
            <button type="button" data-ranking-favorite="${escapeHtml(property.id)}" aria-label="Favorite ${escapeHtml(property.address)}"><span data-icon="star"></span></button>
            <button class="ranking-expand-btn ${isExpanded ? "open" : ""}" type="button" data-ranking-toggle="${escapeHtml(property.id)}" aria-expanded="${isExpanded}" aria-label="${isExpanded ? "Collapse" : "Expand"} ${escapeHtml(property.address)}">${isExpanded ? "⌃" : "⌄"}</button>
            <button type="button" data-property-id="${escapeHtml(property.id)}" aria-label="Open ${escapeHtml(property.address)}">•••</button>
          </div>
        </td>
      </tr>
      ${isExpanded ? expandedRankingRow(property, calc, scoreReasonList(property, calc)) : ""}
    `;
  };
  const expandedRankingRow = (property, calc, reasons) => `
    <tr class="ranking-expanded-row">
      <td colspan="9">
        <div class="ranking-expanded">
          <section>
            <h3>Why this ranks high</h3>
            <div class="ranking-reasons">
              ${reasons.map((reason) => `<div><span>✓</span><strong>${escapeHtml(reason.title)}</strong><em>${escapeHtml(reason.body)}</em></div>`).join("")}
            </div>
          </section>
          <section class="ranking-metrics">
            ${[
              ["Purchase Price", money(calc.proposedOffer)],
              ["Est. Rehab", money(calc.rehabEstimate)],
              ["Sq Ft", number(property.sqft || property.squareFeet || property.square_feet || 0)],
              ["Potential Profit", money(calc.netProfit)],
              ["ROI (on Cost)", percent(calc.roi)],
              ["MAO", money(calc.officialMao)],
              ["Cash Needed", money(calc.proposedOffer + calc.rehabEstimate + calc.closingCosts)]
            ].map(([label, value]) => `<div><span>${label}</span><strong>${value}</strong></div>`).join("")}
          </section>
          <section>
            <h3>Next Step</h3>
            <p>${escapeHtml(property.nextAction || property.why || "Follow up with seller or listing agent to confirm timeline.")}</p>
            <div class="ranking-next-card"><span data-icon="calendar"></span><strong>Follow up call</strong><em>${escapeHtml(property.phone || "Contact needs review")}</em></div>
            <h3>Notes</h3>
            <p>${escapeHtml(property.quickSummary || property.details || "Review listing facts, contact role, ARV confidence, and rehab scope before making an offer.")}</p>
          </section>
          <section class="ranking-expanded-actions">
            <button class="primary" type="button" data-ranking-analyze="${escapeHtml(property.id)}">Analyze Deal <span>→</span></button>
            <button class="secondary-link" type="button" data-ranking-offer="${escapeHtml(property.id)}"><span data-icon="star"></span>Make Offer</button>
            <button class="secondary-link" type="button" data-ranking-note="${escapeHtml(property.id)}"><span data-icon="square-pen"></span>Add Note</button>
          </section>
        </div>
      </td>
    </tr>
  `;

  page.innerHTML = `
    <section class="ranking-page">
      <header class="ranking-hero">
        <div class="ranking-summary-wrap">
          <div class="ranking-summary">
            <strong>${number(ranked.length)} Deals</strong>
            <span>Avg Score ${number(avgScore)}</span>
            <span>${money(totalProfit)} Pipeline</span>
            <span>${number(underContractCount)} Under Contract</span>
          </div>
        </div>
        <div class="ranking-actions">
          <button class="secondary-link" type="button"><span data-icon="settings"></span>Customize Scoring</button>
          <button class="secondary-link" type="button" id="rankingExportBtn"><span data-icon="file-text"></span>Export</button>
          <button class="primary" type="button" id="rankingAddDealBtn"><span>+</span>Add Deal</button>
        </div>
      </header>
      <div class="ranking-toolbar">
        <label class="ranking-search"><span data-icon="search-user"></span><input id="rankingSearchInput" type="search" placeholder="Search deals, addresses, owners..." value="${escapeHtml(searchQuery)}"></label>
        <select id="rankingSourceFilter" aria-label="Lead source">${optionList(sourceOptions, sourceFilter)}</select>
        <select id="rankingMarketFilter" aria-label="Market">${optionList(marketOptions, marketFilter)}</select>
        <select id="rankingOwnerFilter" aria-label="Owner">${optionList(ownerOptions, ownerFilter)}</select>
        <select id="rankingStageFilter" aria-label="Stage">${optionList(stageOptions, stageFilter)}</select>
        <button class="secondary-link" type="button">More Filters <span data-icon="settings"></span></button>
        <select id="rankingSort" aria-label="Sort ranking">
          <option value="score" ${sortMode === "score" ? "selected" : ""}>Sort: Lead Score</option>
          <option value="profit" ${sortMode === "profit" ? "selected" : ""}>Sort: Profit</option>
          <option value="roi" ${sortMode === "roi" ? "selected" : ""}>Sort: ROI</option>
          <option value="arv" ${sortMode === "arv" ? "selected" : ""}>Sort: ARV</option>
        </select>
      </div>
      <div class="ranking-table-wrap">
        <table class="ranking-table">
          <colgroup>
            <col class="ranking-col-rank">
            <col class="ranking-col-property">
            <col class="ranking-col-score">
            <col class="ranking-col-profit">
            <col class="ranking-col-roi">
            <col class="ranking-col-arv">
            <col class="ranking-col-stage">
            <col class="ranking-col-activity">
            <col class="ranking-col-actions">
          </colgroup>
          <thead>
            <tr>
              <th>Rank</th>
              <th>Property</th>
              <th>Lead Score</th>
              <th>Potential Profit</th>
              <th>ROI (on Cost)</th>
              <th>ARV</th>
              <th>Stage</th>
              <th>Last Activity</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>${ranked.map(rowMarkup).join("") || `<tr><td colspan="9" class="empty-table">No deals match the current ranking filters.</td></tr>`}</tbody>
        </table>
      </div>
      <footer class="ranking-footer"><span>Showing ${ranked.length ? `1 to ${ranked.length}` : "0"} of ${baseCandidates.length} deals</span><div><button class="active" type="button">1</button><button type="button">2</button><button type="button">3</button><button type="button">…</button></div></footer>
    </section>
  `;
  hydrateIcons();
  bindPropertyLinks(page);
  ["rankingSourceFilter", "rankingMarketFilter", "rankingOwnerFilter", "rankingStageFilter", "rankingSort"].forEach((id) => {
    document.getElementById(id)?.addEventListener("change", renderRankings);
  });
  document.getElementById("rankingSearchInput")?.addEventListener("input", (event) => {
    const headerSearch = document.getElementById("searchInput");
    if (headerSearch) headerSearch.value = event.target.value;
    if (rankingSearchRenderTimer) clearTimeout(rankingSearchRenderTimer);
    rankingSearchRenderTimer = setTimeout(renderRankings, 180);
  });
  document.getElementById("rankingAddDealBtn")?.addEventListener("click", () => document.querySelector(".new-chat")?.click());
  document.getElementById("rankingExportBtn")?.addEventListener("click", () => document.getElementById("exportBtn")?.click());
  page.querySelectorAll("[data-ranking-toggle]").forEach((button) => {
    button.addEventListener("click", () => {
      expandedRankingKey = expandedRankingKey === button.dataset.rankingToggle ? "" : button.dataset.rankingToggle;
      renderRankings();
    });
  });
  page.querySelectorAll("[data-ranking-analyze]").forEach((button) => {
    button.addEventListener("click", () => {
      selectedId = button.dataset.rankingAnalyze;
      setActiveView("calculator");
      syncCalculator();
    });
  });
  page.querySelectorAll("[data-ranking-note]").forEach((button) => {
    button.addEventListener("click", () => openPropertyDetail(button.dataset.rankingNote));
  });
  page.querySelectorAll("[data-ranking-offer]").forEach((button) => {
    button.addEventListener("click", async () => {
      const property = propertyById(button.dataset.rankingOffer);
      if (!property) return;
      button.disabled = true;
      await saveRecordState(property.id, { status: "Offer Made" });
      property.stage = "Offer Made";
      renderAll();
      setActiveView("rankings");
    });
  });
}

function renderProperties() {
  const list = document.getElementById("propertyList");
  const filtered = sortedProperties(filteredProperties());
  if (filtered.length && !filtered.some((property) => property.id === selectedId)) {
    selectedId = filtered[0].id;
  }
  list.innerHTML = filtered.map((property) => `
    <button class="property-button ${property.id === selectedId ? "active" : ""}" data-property-id="${escapeHtml(property.id)}">
      <img src="${safeUrl(propertyPhoto(property))}" alt="Main house image for ${escapeHtml(property.address)}">
      <span>
        <span class="property-title-row">
          <strong>${escapeHtml(property.address)}</strong>
          ${listingStatusKind(property) === "unknown" ? "" : listingStatusPill(property)}
        </span>
        <em>${escapeHtml(readRecordState(property.id).status)} · ${money(property.listPrice)} · ${escapeHtml(property.beds || "?")} bd / ${escapeHtml(property.baths || "?")} ba · ${Number(property.score || 0)} ${escapeHtml(property.scoreBand?.label || "")}</em>
      </span>
    </button>
  `).join("") || "<p class=\"empty\">No matching properties</p>";

  list.querySelectorAll("[data-property-id]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      if (window.matchMedia("(max-width: 768px)").matches) {
        openPropertyDetail(button.dataset.propertyId);
        return;
      }
      selectPropertyRecord(button.dataset.propertyId);
    });
  });

  renderRecord();
}

function renderPassedProperties() {
  const list = document.getElementById("passedList");
  const count = document.getElementById("passedCount");
  if (!list) return;
  const filtered = sortedProperties(filteredPassedProperties());
  if (count) count.textContent = `${filtered.length} passed`;
  list.innerHTML = filtered.map((property) => {
    const underwriting = calculateUnderwriting(defaultUnderwritingFor(property));
    const state = readRecordState(property.id);
    const lastDecision = state.notes || property.quickSummary || property.why || "No pass note saved.";
    return `
      <article class="passed-card">
        <img src="${propertyPhoto(property)}" alt="Main house image for ${escapeHtml(property.address)}">
        <div class="passed-card-body">
          <div class="passed-card-head">
            <div>
              <strong>${escapeHtml(property.address)}</strong>
              <span>${escapeHtml(property.city)}, ${escapeHtml(property.state)} ${escapeHtml(property.zip)}</span>
            </div>
            <span class="pill amber">Passed</span>
          </div>
          <p>${escapeHtml(lastDecision)}</p>
          <div class="passed-card-kpis">
            <div><span>List</span><strong>${money(property.listPrice)}</strong></div>
            <div><span>MAO</span><strong>${money(underwriting.officialMao)}</strong></div>
            <div><span>Net</span><strong>${money(underwriting.netProfit)}</strong></div>
            <div><span>ROI</span><strong>${percent(underwriting.roi)}</strong></div>
          </div>
          <div class="meta">
            ${scoreBadge(property)}
            ${listingStatusPill(property)}
            <span class="pill">${property.listingAgent || "Agent verify"}</span>
            <span class="pill">${property.phone || "Phone verify"}</span>
          </div>
          <div class="passed-card-actions">
            <button class="secondary-link" type="button" data-property-id="${property.id}">View Details</button>
            <button class="primary compact" type="button" data-reopen-property="${property.id}">Reopen to ${REOPEN_STAGE}</button>
          </div>
        </div>
      </article>
    `;
  }).join("") || "<p class=\"empty\">No passed properties yet.</p>";

  bindPropertyLinks(list);
  list.querySelectorAll("[data-reopen-property]").forEach((button) => {
    button.addEventListener("click", async () => {
      const property = propertyById(button.dataset.reopenProperty);
      if (!property) return;
      button.disabled = true;
      await saveRecordState(property.id, {
        status: REOPEN_STAGE,
        notes: readRecordState(property.id).notes || property.quickSummary || ""
      });
      property.stage = REOPEN_STAGE;
      selectedId = property.id;
      renderAll();
      setActiveView("properties");
      selectPropertyRecord(property.id);
    });
  });
}

function renderDetailRecord() {
  renderRecord("detailPanel", "detail");
}

const HAZARD_TYPES = [
  { key: "soil", label: "Soil Contamination" },
  { key: "water", label: "Water Contamination" },
  { key: "asbestos", label: "Asbestos" },
  { key: "leadPaint", label: "Lead Paint" },
  { key: "pesticides", label: "Pesticides / Herbicides" },
  { key: "mold", label: "Mold" },
  { key: "other", label: "Other Environmental Risk" }
];

function hazardStatusClass(status) {
  if (status === "Clear") return "hazard-clear";
  if (status === "Flagged") return "hazard-flagged";
  return "hazard-unknown";
}

function overallHazardRisk(hazards) {
  const statuses = HAZARD_TYPES.map((hazard) => hazards[hazard.key]?.status || "Unknown");
  if (statuses.some((status) => status === "Flagged")) return { label: "Flagged", cls: "hazard-flagged" };
  if (statuses.every((status) => status === "Clear")) return { label: "All Clear", cls: "hazard-clear" };
  return { label: "Needs Review", cls: "hazard-unknown" };
}

function renderHazardSection(property, suffix) {
  const hazards = property.hazards || property.source?.hazards || {};
  const overall = overallHazardRisk(hazards);
  const openAttr = overall.label === "Flagged" ? " open" : "";
  return `
    <section class="hazard-section" id="hazardSection-${suffix}">
      <details class="hazard-details"${openAttr}>
        <summary class="hazard-head">
          <div>
            <h3>Environmental Hazard Check</h3>
            <p>Flag known or potential environmental risks before underwriting.</p>
          </div>
          <span class="hazard-meta">
            <span class="pill hazard-status-pill ${overall.cls}">${overall.label}</span>
            <span class="hazard-toggle">Review</span>
          </span>
        </summary>
        <div class="hazard-grid">
          ${HAZARD_TYPES.map((hazard) => {
            const entry = hazards[hazard.key] || { status: "Unknown", notes: "" };
            return `
              <div class="hazard-row ${hazardStatusClass(entry.status)}" data-key="${hazard.key}">
                <div class="hazard-label">${hazard.label}</div>
                <select class="hazard-status-select" data-hazard-key="${hazard.key}" data-suffix="${suffix}" aria-label="${hazard.label} status">
                  <option ${entry.status === "Unknown" ? "selected" : ""}>Unknown</option>
                  <option ${entry.status === "Clear" ? "selected" : ""}>Clear</option>
                  <option ${entry.status === "Flagged" ? "selected" : ""}>Flagged</option>
                </select>
                <input class="hazard-notes-input" type="text"
                  placeholder="Notes..."
                  value="${escapeHtml(entry.notes || "")}"
                  data-hazard-key="${hazard.key}" data-suffix="${suffix}">
              </div>
            `;
          }).join("")}
        </div>
        <div class="hazard-actions">
          <button class="primary" type="button" id="saveHazardsBtn-${suffix}">Save Hazard Check</button>
          <span class="hazard-save-status" id="hazardSaveStatus-${suffix}"></span>
        </div>
      </details>
    </section>
  `;
}

function renderTimelineSection(property, suffix) {
  const tl = property.timeline || property.source?.timeline || {};
  const today = new Date().toISOString().slice(0, 10);

  const milestones = [
    { key: "offerDate", label: "Offer Made" },
    { key: "purchaseDate", label: "Purchase Closed" },
    { key: "rehabStart", label: "Rehab Started" },
    { key: "rehabEnd", label: "Rehab Complete" },
    { key: "listDate", label: "Listed for Sale" },
    { key: "saleDate", label: "Sale Closed" },
  ];

  let currentPhase = "Pre-Offer";
  if (tl.saleDate) currentPhase = "Sold";
  else if (tl.listDate) currentPhase = "On Market";
  else if (tl.rehabStart) currentPhase = "In Rehab";
  else if (tl.purchaseDate) currentPhase = "Rehab Not Started";
  else if (tl.offerDate) currentPhase = "Under Contract";

  let elapsed = null;
  if (tl.purchaseDate) {
    const start = new Date(tl.purchaseDate);
    const end = tl.saleDate ? new Date(tl.saleDate) : new Date();
    elapsed = Math.round((end - start) / (1000 * 60 * 60 * 24));
  }

  let rehabDaysLeft = null;
  if (tl.rehabEnd && !tl.saleDate) {
    const diff = Math.round((new Date(tl.rehabEnd) - new Date()) / (1000 * 60 * 60 * 24));
    rehabDaysLeft = diff;
  }

  const phaseColor = {
    "Sold": "var(--green)",
    "On Market": "var(--blue)",
    "In Rehab": "var(--amber)",
    "Rehab Not Started": "var(--muted)",
    "Under Contract": "var(--amber)",
    "Pre-Offer": "var(--muted)"
  }[currentPhase] || "var(--muted)";

  return `
    <section class="timeline-section" id="timelineSection-${suffix}">
      <details class="timeline-details">
        <summary class="timeline-section-head">
          <div>
            <h3>Flip Timeline</h3>
            <p>Track key dates from offer to sale.</p>
          </div>
          <div class="timeline-head-meta">
            <span class="pill" style="color:${phaseColor};background:${phaseColor}22">
              ${currentPhase}
            </span>
            ${elapsed !== null ? `<span class="pill">${elapsed} days owned</span>` : ""}
            ${rehabDaysLeft !== null
              ? `<span class="pill ${rehabDaysLeft < 0 ? "amber" : ""}">
                  Rehab ${rehabDaysLeft < 0 ? `${Math.abs(rehabDaysLeft)}d overdue` : `${rehabDaysLeft}d left`}
                 </span>`
              : ""}
            <span class="timeline-toggle">Open</span>
          </div>
        </summary>
        <div class="timeline-milestones">
          ${milestones.map((m) => `
            <label class="timeline-milestone ${tl[m.key] ? "milestone-done" : ""}">
              <span class="milestone-dot"></span>
              <span class="milestone-label">${m.label}</span>
              <input type="date"
                class="milestone-input"
                data-timeline-key="${m.key}"
                data-suffix="${suffix}"
                value="${tl[m.key] || ""}"
                max="${today}">
            </label>
          `).join("")}
        </div>
        <div class="timeline-actions">
          <button class="primary" type="button" id="saveTimelineBtn-${suffix}">
            Save Timeline
          </button>
          <span class="timeline-save-status" id="timelineSaveStatus-${suffix}"></span>
        </div>
      </details>
    </section>
  `;
}

function renderRecord(containerId = "recordPanel", mode = "embedded") {
  const fallbackList = mode === "detail" ? properties : filteredProperties();
  const selectedProperty = mode === "detail" ? propertyById(selectedId) : activePropertyById(selectedId);
  const property = selectedProperty || fallbackList[0] || activeProperties()[0];
  const container = document.getElementById(containerId);
  if (!container) return;
  if (!property) {
    container.innerHTML = "<p class=\"empty\">No active properties to show.</p>";
    return;
  }
  selectedId = property.id;
  const state = readRecordState(property.id);
  const photo = propertyPhoto(property);
  const hasRealPhoto = !photo.startsWith("data:");
  const underwriting = defaultUnderwritingFor(property);
  const underwritingCalc = calculateUnderwriting(underwriting);
  const draftLabel = property.underwriting ? "Saved" : "Estimated";
  const auction = auctionInfo(property);
  const auctionDays = daysUntil(auction?.date);
  const dom = daysOnMarketValue(property);
  const quickSummary = state.notes || generatedQuickSummary(property);
  const suffix = containerId;
  const hazardsData = property.hazards || property.source?.hazards || {};
  property.hazards = hazardsData;
  property.timeline = property.timeline || property.source?.timeline || {};
  container.classList.toggle("owned-project-record", isOwnedProperty(property));
  container.innerHTML = `
    ${mode === "detail" ? `<div class="detail-eyebrow">Property detail page</div>` : ""}
    <div class="record-top">
      <div>
        <div class="record-hero">
          <div>
            <h2>${property.address}</h2>
            <p>${fullAddress(property)}</p>
          </div>
          <div class="record-actions">
            ${listingStatusPill(property)}
            <span class="pill amber">MLS ${property.mls || "verify"}</span>
            <a class="secondary-link compact" href="https://www.realtracs.com/" target="_blank" rel="noreferrer">All listings</a>
            ${!isOwnedProperty(property) ? `<button class="primary compact" type="button" data-start-owned="${property.id}">Mark as Purchased</button>` : ""}
            <button class="secondary-link compact" type="button" id="editPropertyBtn-${suffix}">Edit</button>
            <button class="danger-link compact" type="button"
              id="deletePropertyBtn-${suffix}">Delete Property</button>
          </div>
        </div>
        ${auction ? `
          <div class="urgency-strip">
            <div>
              <span class="tiny-label">${auction.platform || "Auction"} urgency</span>
              <strong>${auctionDays == null ? formatAuctionDate(auction.date) : `${auctionDays} day${auctionDays === 1 ? "" : "s"} until auction`}</strong>
            </div>
            <span class="pill amber">${auction.status || "Verify auction"}</span>
          </div>
        ` : ""}
        ${renderScoreBreakdown(property)}
        <div class="record-editor">
          <section class="stage-control" aria-label="Pipeline stage">
            <div class="stage-control-head">
              <span>Pipeline Stage</span>
              <strong>${recordStageFor(state.status)}</strong>
            </div>
            <select id="recordStatus-${suffix}">
              ${stages.map((status) => `<option ${recordStageFor(state.status) === status ? "selected" : ""}>${status}</option>`).join("")}
            </select>
          </section>
          <label class="summary-control">Quick Summary
            <textarea id="recordNotes-${suffix}" placeholder="Current decision, seller motivation, repair flags, offer logic, next step..."></textarea>
          </label>
        </div>
      </div>
      <figure class="record-photo">
        <div class="photo-media">
          <img src="${photo}" alt="Main house image for ${property.address}">
          <div class="price-badge">
            <span>Current list</span>
            <strong>${money(property.listPrice)}</strong>
          </div>
        </div>
        <figcaption>${hasRealPhoto ? "Main house photo" : "Main house placeholder - replace with listing photo when available"}</figcaption>
      </figure>
    </div>
    ${isOwnedProperty(property) ? `${renderOwnedSummarySection(property, suffix)}${renderOwnedProjectWorkflow(property, suffix)}` : renderOwnershipStartSection(property)}
    ${!isOwnedProperty(property) ? renderDecisionPanel(property, underwritingCalc) : ""}
    <div class="field-grid" id="fieldGrid-${suffix}">
      ${field("List Price", money(property.listPrice))}
      ${field("Target Offer", `<span>${money(property.targetOfferLow)} - ${money(property.targetOfferHigh)}</span><button class="inline-copy" type="button" data-copy-offer="${property.id}">Copy offer</button>`)}
      ${field(`${draftLabel} MAO`, money(underwritingCalc.officialMao))}
      ${field(`${draftLabel} Net Profit`, money(underwritingCalc.netProfit))}
      ${field(`${draftLabel} ROI`, percent(underwritingCalc.roi))}
      ${field("Days on Market", dom ? `${dom} days` : "Verify")}
      ${field("Beds / Baths", `${property.beds || "?"} / ${property.baths || "?"}`)}
      ${field("Square Feet", number(property.sqft))}
      ${field("Lot", property.lot || "Verify")}
      ${field("Year Built", property.yearBuilt || "Verify")}
      ${field("Price / Sqft", property.pricePerSqft ? money(property.pricePerSqft) : "Verify")}
      ${field("Brokerage", escapeHtml(property.brokerage || "Verify brokerage"))}
      ${field("Agent", contactFieldLinks([
        escapeHtml(property.listingAgent),
        escapeHtml(property.coListingAgent),
        emailLink(property.listingEmail || property.agentEmail || property.email)
      ], "Contact unverified"))}
      ${field("Phone", contactFieldLinks([
        phoneLink(property.phone),
        phoneLink(property.secondaryPhone),
        phoneLink(property.brokeragePhone)
      ], "Contact unverified"))}
    </div>
    <div class="edit-form" id="editForm-${suffix}" style="display:none">
      <div class="modal-row">
        <label class="modal-field grow">Street Address
          <input id="ef-address-${suffix}" value="${escapeHtml(property.address || "")}">
        </label>
      </div>
      <div class="modal-row">
        <label class="modal-field grow">City
          <input id="ef-city-${suffix}" value="${escapeHtml(property.city || "")}">
        </label>
        <label class="modal-field short">State
          <input id="ef-state-${suffix}" value="${escapeHtml(property.state || "")}" maxlength="2">
        </label>
        <label class="modal-field short">ZIP
          <input id="ef-zip-${suffix}" value="${escapeHtml(property.zip || "")}">
        </label>
      </div>
      <div class="modal-row">
        <label class="modal-field">List Price
          <input id="ef-listPrice-${suffix}" type="number" value="${property.listPrice || ""}">
        </label>
        <label class="modal-field">Beds
          <input id="ef-beds-${suffix}" type="number" value="${property.beds || ""}">
        </label>
        <label class="modal-field">Baths
          <input id="ef-baths-${suffix}" type="number" step="0.5" value="${property.baths || ""}">
        </label>
      </div>
      <div class="modal-row">
        <label class="modal-field">Sq Ft
          <input id="ef-sqft-${suffix}" type="number" value="${property.sqft || ""}">
        </label>
        <label class="modal-field">Year Built
          <input id="ef-yearBuilt-${suffix}" type="number" value="${property.yearBuilt || ""}">
        </label>
        <label class="modal-field">Lot
          <input id="ef-lot-${suffix}" value="${escapeHtml(property.lot || "")}">
        </label>
      </div>
      <div class="modal-row">
        <label class="modal-field grow">Agent
          <input id="ef-agent-${suffix}" value="${escapeHtml(property.listingAgent || "")}">
        </label>
        <label class="modal-field grow">Phone
          <input id="ef-phone-${suffix}" value="${escapeHtml(property.phone || "")}">
        </label>
      </div>
      <div class="modal-row">
        <label class="modal-field grow">Brokerage
          <input id="ef-brokerage-${suffix}" value="${escapeHtml(property.brokerage || "")}">
        </label>
        <label class="modal-field grow">MLS #
          <input id="ef-mls-${suffix}" value="${escapeHtml(property.mls || "")}">
        </label>
      </div>
      <div class="modal-row">
        <label class="modal-field grow">Why it matters
          <textarea id="ef-why-${suffix}" rows="2">${escapeHtml(property.why || "")}</textarea>
        </label>
      </div>
      <div class="modal-actions">
        <button class="primary" type="button" id="ef-save-${suffix}">Save Changes</button>
        <button class="secondary-link" type="button" id="ef-cancel-${suffix}">Cancel</button>
        <span id="ef-status-${suffix}"></span>
      </div>
    </div>
    <div class="notes">
      <div class="note"><strong>Why it matters:</strong> ${property.why}</div>
      <div class="note"><strong>Property details:</strong> ${property.details || "Verify full listing details before outreach."}</div>
      ${auction ? `<div class="note"><strong>Auction:</strong> ${auction.platform || "Auction"} · ${formatAuctionDate(auction.date)} · ${auction.source || "Verify auction terms before outreach."}</div>` : ""}
      <div class="note"><strong>Source checked:</strong> ${property.sourceChecked || "Needs verification"} ${property.listingUrl ? `· <a href="${property.listingUrl}" target="_blank" rel="noreferrer">Open listing</a>` : ""}</div>
    </div>
    ${renderTimelineSection(property, suffix)}
    ${renderHazardSection(property, suffix)}
    <section class="team-notes">
      <div class="team-notes-head">
        <div>
          <h3>Team Notes</h3>
          <p>Running log for calls, decisions, repair flags, offers, and follow-ups.</p>
        </div>
        <span class="pill blue">${state.noteLog.length} notes</span>
      </div>
      <div class="note-composer">
        <select id="noteAuthor-${suffix}" aria-label="Note author">
          ${teamMembers.map((member) => `<option>${escapeHtml(member.name)}</option>`).join("")}
        </select>
        <select id="noteType-${suffix}" aria-label="Note type">
          <option>General</option>
          <option>Call</option>
          <option>Decision</option>
          <option>Repair</option>
          <option>Offer</option>
          <option>Follow Up</option>
        </select>
        <textarea id="noteText-${suffix}" placeholder="Add a note for the team..."></textarea>
        <button class="primary" type="button" id="addNote-${suffix}">Add Note</button>
      </div>
      <div class="note-feed" id="noteFeed-${suffix}">
        ${renderNoteLog(state)}
      </div>
    </section>
  `;
  // Bind "Update Ownership" button injected by renderOwnedSummarySection
  container.querySelectorAll("[data-open-owned]").forEach((btn) => {
    btn.addEventListener("click", () => openOwnedModal(btn.dataset.openOwned));
  });
  container.querySelectorAll("[data-open-homes-owned]").forEach((btn) => {
    btn.addEventListener("click", () => {
      setActiveView("homesOwned");
      renderHomesOwned();
    });
  });
  container.querySelectorAll("[data-start-owned]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      btn.disabled = true;
      const propertyIdValue = btn.dataset.startOwned;
      const shouldOpenHandoff = needsOwnedHandoff(propertyById(propertyIdValue) || property);
      await saveRecordState(propertyIdValue, { status: "Closed", notes: notesEl?.value || quickSummary });
      const currentProperty = propertyById(propertyIdValue) || { ...property, id: propertyIdValue, stage: "Closed", acquisitionStatus: "Closed" };
      await saveOwnedForProperty(propertyIdValue, {
        ...ownershipDefaultsFor(currentProperty || {}),
        ...getOwned(currentProperty || {})
      });
      selectedId = propertyIdValue;
      renderAll();
      renderRecord(containerId, mode);
      if (shouldOpenHandoff) openOwnedModal(propertyIdValue, { handoff: true });
      btn.disabled = false;
    });
  });
  container.querySelectorAll("[data-owned-workflow]").forEach((checkbox) => {
    checkbox.addEventListener("change", async () => {
      const current = getOwned(property);
      const owned = {
        ...current,
        workflow: {
          ...(current.workflow || {}),
          [checkbox.dataset.ownedWorkflow]: checkbox.checked
        }
      };
      await saveOwnedForProperty(property.id, owned);
      renderAll();
      if (mode === "detail") renderDetailRecord();
    });
  });
  container.querySelectorAll("[data-owned-phase-set]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const owned = {
        ...getOwned(property),
        ownedPhase: normalizeOwnedPhase(btn.dataset.phase)
      };
      await saveOwnedForProperty(property.id, owned);
      renderAll();
      if (mode === "detail") renderDetailRecord();
    });
  });
  document.getElementById(`ownedAddScope-${suffix}`)?.addEventListener("click", async () => {
    const itemInput = document.getElementById(`ownedScopeItem-${suffix}`);
    const costInput = document.getElementById(`ownedScopeCost-${suffix}`);
    const status = document.getElementById(`ownedScopeStatus-${suffix}`);
    const item = itemInput.value.trim();
    if (!item) {
      status.textContent = "Enter a scope item.";
      return;
    }
    status.textContent = "Adding...";
    try {
      await createScopeItemForProperty(property.id, item, costInput.value.trim() ? parseMoneyInput(costInput.value) : null);
      itemInput.value = "";
      costInput.value = "";
      status.textContent = "Added.";
      renderAll();
      if (mode === "detail") renderDetailRecord();
    } catch (err) {
      status.textContent = err.message;
    }
  });
  document.getElementById(`ownedAddPhoto-${suffix}`)?.addEventListener("click", async () => {
    const nameInput = document.getElementById(`ownedPhotoName-${suffix}`);
    const urlInput = document.getElementById(`ownedPhotoUrl-${suffix}`);
    const status = document.getElementById(`ownedPhotoStatus-${suffix}`);
    const name = nameInput.value.trim() || "Project photos";
    const url = urlInput.value.trim();
    if (!url) {
      status.textContent = "Paste a photo URL or folder link.";
      return;
    }
    status.textContent = "Adding...";
    try {
      await createDocumentForProperty(property.id, name, "Photo", url);
      const current = getOwned(property);
      await saveOwnedForProperty(property.id, {
        ...current,
        workflow: { ...(current.workflow || {}), photosComplete: true }
      });
      nameInput.value = "";
      urlInput.value = "";
      status.textContent = "Photo link added.";
      renderAll();
      if (mode === "detail") renderDetailRecord();
    } catch (err) {
      status.textContent = err.message;
    }
  });
  document.getElementById(`flipAddTask-${suffix}`)?.addEventListener("click", async () => {
    const status = document.getElementById(`flipTaskStatusMsg-${suffix}`);
    const name = document.getElementById(`flipTaskName-${suffix}`)?.value.trim();
    if (!name) {
      status.textContent = "Task name is required.";
      return;
    }
    status.textContent = "Adding...";
    await addOwnedArrayItem(property, "projectTasks", {
      id: crypto.randomUUID(),
      name,
      category: document.getElementById(`flipTaskPhase-${suffix}`)?.value || "Demo",
      status: document.getElementById(`flipTaskStatus-${suffix}`)?.value || "Not Started",
      dueDate: document.getElementById(`flipTaskDue-${suffix}`)?.value || null,
      assignedPerson: document.getElementById(`flipTaskOwner-${suffix}`)?.value || null,
      photoUrl: document.getElementById(`flipTaskPhoto-${suffix}`)?.value.trim() || null,
      notes: document.getElementById(`flipTaskNotes-${suffix}`)?.value.trim() || null,
      createdAt: new Date().toISOString()
    });
    renderAll();
    if (mode === "detail") renderDetailRecord();
  });
  document.getElementById(`flipFocusTask-${suffix}`)?.addEventListener("click", () => {
    document.getElementById(`flipTaskName-${suffix}`)?.focus();
  });
  container.querySelectorAll("[data-flip-task-done]").forEach((checkbox) => {
    checkbox.addEventListener("change", async () => {
      await updateOwnedArrayItem(property, "projectTasks", checkbox.dataset.flipTaskDone, {
        status: checkbox.checked ? "Done" : "In Progress"
      });
      renderAll();
      if (mode === "detail") renderDetailRecord();
    });
  });
  document.getElementById(`flipAddBudget-${suffix}`)?.addEventListener("click", async () => {
    const status = document.getElementById(`flipBudgetStatusMsg-${suffix}`);
    const category = document.getElementById(`flipBudgetCategory-${suffix}`)?.value;
    status.textContent = "Adding...";
    await addOwnedArrayItem(property, "budgetItems", {
      id: crypto.randomUUID(),
      category,
      estimatedBudget: parseMoneyInput(document.getElementById(`flipBudgetEstimate-${suffix}`)?.value),
      actualCost: parseMoneyInput(document.getElementById(`flipBudgetActual-${suffix}`)?.value),
      status: document.getElementById(`flipBudgetStatus-${suffix}`)?.value || "Planned",
      notes: document.getElementById(`flipBudgetNotes-${suffix}`)?.value.trim() || null,
      createdAt: new Date().toISOString()
    });
    renderAll();
    if (mode === "detail") renderDetailRecord();
  });
  document.getElementById(`flipAddMedia-${suffix}`)?.addEventListener("click", async () => {
    const status = document.getElementById(`flipMediaStatusMsg-${suffix}`);
    const urlInput = document.getElementById(`flipMediaUrl-${suffix}`);
    const fileInput = document.getElementById(`flipMediaFile-${suffix}`);
    const file = fileInput?.files?.[0] || null;
    let url = urlInput?.value.trim() || "";
    if (!url && !file) {
      status.textContent = "Choose a file or paste a photo/video link.";
      return;
    }
    status.textContent = "Adding...";
    try {
      const upload = file ? await uploadMediaFile(file) : null;
      if (upload) url = upload.url;
      await addOwnedArrayItem(property, "mediaItems", {
        id: crypto.randomUUID(),
        url,
        type: upload?.mimeType?.startsWith("video/") ? "Video" : document.getElementById(`flipMediaType-${suffix}`)?.value || "Photo",
        room: document.getElementById(`flipMediaRoom-${suffix}`)?.value || "Kitchen",
        phase: document.getElementById(`flipMediaPhase-${suffix}`)?.value || "Progress",
        caption: document.getElementById(`flipMediaCaption-${suffix}`)?.value.trim() || upload?.originalName || null,
        mimeType: upload?.mimeType || null,
        createdAt: new Date().toISOString()
      });
      renderAll();
      if (mode === "detail") renderDetailRecord();
    } catch (error) {
      status.textContent = error.message || "Could not add media.";
    }
  });
  document.getElementById(`flipSaveMilestones-${suffix}`)?.addEventListener("click", async () => {
    const status = document.getElementById(`flipMilestoneStatusMsg-${suffix}`);
    status.textContent = "Saving...";
    const milestones = [...container.querySelectorAll(".flip-milestone")].map((row) => {
      const read = (field) => row.querySelector(`[data-flip-milestone-field="${field}"]`)?.value || "";
      return {
        id: row.dataset.milestoneId,
        label: row.querySelector("strong")?.textContent || "",
        status: read("status"),
        targetDate: read("targetDate") || null,
        completedDate: read("completedDate") || null,
        notes: read("notes").trim() || null
      };
    });
    await saveOwnedForProperty(property.id, { ...getOwned(property), projectMilestones: milestones });
    status.textContent = "Saved.";
    renderAll();
    if (mode === "detail") renderDetailRecord();
  });
  document.getElementById(`flipFocusNote-${suffix}`)?.addEventListener("click", () => {
    document.getElementById(`flipNoteText-${suffix}`)?.focus();
  });
  document.getElementById(`flipAddNote-${suffix}`)?.addEventListener("click", async () => {
    const textEl = document.getElementById(`flipNoteText-${suffix}`);
    const status = document.getElementById(`flipNoteStatusMsg-${suffix}`);
    const body = textEl?.value.trim();
    if (!body) {
      status.textContent = "Note text is required.";
      return;
    }
    status.textContent = "Adding...";
    const draft = normalizeNote({
      id: crypto.randomUUID(),
      property_id: property.id,
      author: document.getElementById(`flipNoteAuthor-${suffix}`)?.value || "Team",
      type: document.getElementById(`flipNoteType-${suffix}`)?.value || "General",
      body,
      created_at: new Date().toISOString()
    });
    if (!apiAvailable) {
      noteLog.unshift(draft);
      storeLocalState();
      renderRecord(suffix, suffix === "detailPanel" ? "detail" : "embedded");
      return;
    }
    try {
      const response = await fetch(`/api/properties/${property.id}/notes`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          author: draft.author,
          type: draft.type,
          body: draft.body
        })
      });
      if (!response.ok) throw new Error("Could not save note.");
      const { note } = await response.json();
      noteLog.unshift(normalizeNote(note));
      renderAll();
      if (mode === "detail") renderDetailRecord();
    } catch (err) {
      status.textContent = err.message;
    }
  });

  const editBtn = document.getElementById(`editPropertyBtn-${suffix}`);
  const editForm = document.getElementById(`editForm-${suffix}`);
  const fieldGrid = document.getElementById(`fieldGrid-${suffix}`);

  document.getElementById(`deletePropertyBtn-${suffix}`)
    .addEventListener("click", async () => {
      const confirmed = confirm(
        `Permanently delete ${property.address}?\n\nThis removes all tasks, notes, documents, and scope items for this property. This cannot be undone.`
      );
      if (!confirmed) return;
      const response = await fetch(`/api/properties/${property.id}/delete`, {
        method: "DELETE"
      });
      if (!response.ok) return alert("Could not delete property.");
      properties = properties.filter((p) => p.id !== property.id);
      tasks = tasks.filter((t) => t.property_id !== property.id);
      docs = docs.filter((d) => d.property_id !== property.id);
      scopes = scopes.filter((s) => s.property_id !== property.id);
      selectedId = properties[0]?.id || "";
      setActiveView("properties");
      renderAll();
    });

  editBtn.addEventListener("click", () => {
    fieldGrid.style.display = "none";
    editForm.style.display = "flex";
    editBtn.textContent = "Editing...";
    editBtn.disabled = true;
  });

  document.getElementById(`ef-cancel-${suffix}`).addEventListener("click", () => {
    editForm.style.display = "none";
    fieldGrid.style.display = "";
    editBtn.textContent = "Edit";
    editBtn.disabled = false;
  });

  document.getElementById(`ef-save-${suffix}`).addEventListener("click", async () => {
    const saveBtn = document.getElementById(`ef-save-${suffix}`);
    const efStatus = document.getElementById(`ef-status-${suffix}`);
    saveBtn.disabled = true;
    efStatus.textContent = "Saving...";
    const updates = {
      address: document.getElementById(`ef-address-${suffix}`).value.trim(),
      city: document.getElementById(`ef-city-${suffix}`).value.trim(),
      state: document.getElementById(`ef-state-${suffix}`).value.trim().toUpperCase(),
      zip: document.getElementById(`ef-zip-${suffix}`).value.trim(),
      listPrice: Number(document.getElementById(`ef-listPrice-${suffix}`).value) || null,
      beds: Number(document.getElementById(`ef-beds-${suffix}`).value) || null,
      baths: Number(document.getElementById(`ef-baths-${suffix}`).value) || null,
      sqft: Number(document.getElementById(`ef-sqft-${suffix}`).value) || null,
      yearBuilt: Number(document.getElementById(`ef-yearBuilt-${suffix}`).value) || null,
      lot: document.getElementById(`ef-lot-${suffix}`).value.trim() || null,
      listingAgent: document.getElementById(`ef-agent-${suffix}`).value.trim() || null,
      phone: document.getElementById(`ef-phone-${suffix}`).value.trim() || null,
      brokerage: document.getElementById(`ef-brokerage-${suffix}`).value.trim() || null,
      mls: document.getElementById(`ef-mls-${suffix}`).value.trim() || null,
      why: document.getElementById(`ef-why-${suffix}`).value.trim() || null
    };
    if (!updates.address || !updates.city || !updates.state || !updates.zip) {
      efStatus.textContent = "Address, city, state, and ZIP are required.";
      saveBtn.disabled = false;
      return;
    }
    try {
      if (!apiAvailable) {
        const index = properties.findIndex((item) => item.id === property.id);
        if (index >= 0) properties[index] = applyPropertyUpdate(properties[index], updates);
        storeLocalState();
        renderAll();
        return;
      }
      const response = await fetch(`/api/properties/${property.id}/update`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(updates)
      });
      if (!response.ok) throw new Error("Could not save changes.");
      const { property: updated } = await response.json();
      const index = properties.findIndex((item) => item.id === property.id);
      if (index >= 0) properties[index] = normalizeProperty(updated);
      renderAll();
    } catch (error) {
      efStatus.textContent = error.message;
      saveBtn.disabled = false;
    }
  });

  const updateHazardDisplay = (hazards) => {
    const overall = overallHazardRisk(hazards);
    const section = document.getElementById(`hazardSection-${suffix}`);
    const badge = section?.querySelector(".hazard-status-pill");
    if (badge) {
      badge.className = `pill hazard-status-pill ${overall.cls}`;
      badge.textContent = overall.label;
    }
    HAZARD_TYPES.forEach((hazard) => {
      const row = section?.querySelector(`.hazard-row[data-key="${hazard.key}"]`);
      if (row) row.className = `hazard-row ${hazardStatusClass(hazards[hazard.key]?.status || "Unknown")}`;
    });
  };

  const collectHazards = () => {
    const hazards = {};
    HAZARD_TYPES.forEach((hazard) => {
      const select = container.querySelector(`.hazard-status-select[data-hazard-key="${hazard.key}"][data-suffix="${suffix}"]`);
      const input = container.querySelector(`.hazard-notes-input[data-hazard-key="${hazard.key}"][data-suffix="${suffix}"]`);
      hazards[hazard.key] = {
        status: select?.value || "Unknown",
        notes: input?.value.trim() || ""
      };
    });
    return hazards;
  };

  container.querySelectorAll(".hazard-status-select").forEach((select) => {
    select.addEventListener("change", () => {
      updateHazardDisplay(collectHazards());
    });
  });

  document.getElementById(`saveHazardsBtn-${suffix}`).addEventListener("click", async () => {
    const button = document.getElementById(`saveHazardsBtn-${suffix}`);
    const saveStatus = document.getElementById(`hazardSaveStatus-${suffix}`);
    button.disabled = true;
    saveStatus.textContent = "Saving...";
    const hazards = collectHazards();
    try {
      if (!apiAvailable) {
        property.hazards = hazards;
        property.source = { ...(property.source || {}), hazards };
        const index = properties.findIndex((item) => item.id === property.id);
        if (index >= 0) {
          properties[index].hazards = hazards;
          properties[index].source = { ...(properties[index].source || {}), hazards };
        }
        storeLocalState();
      } else {
        const response = await fetch(`/api/properties/${property.id}/hazards`, {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ hazards })
        });
        if (!response.ok) throw new Error("Could not save hazard data.");
        property.hazards = hazards;
        property.source = { ...(property.source || {}), hazards };
        const index = properties.findIndex((item) => item.id === property.id);
        if (index >= 0) {
          properties[index].hazards = hazards;
          properties[index].source = { ...(properties[index].source || {}), hazards };
        }
      }
      saveStatus.textContent = "Saved";
      updateHazardDisplay(hazards);
    } catch (error) {
      saveStatus.textContent = error.message;
    } finally {
      button.disabled = false;
    }
  });

  const bindTimelineSave = () => {
    const saveTimelineBtn = document.getElementById(`saveTimelineBtn-${suffix}`);
    if (!saveTimelineBtn) return;
    saveTimelineBtn.addEventListener("click", async () => {
      const btn = document.getElementById(`saveTimelineBtn-${suffix}`);
      const statusEl = document.getElementById(`timelineSaveStatus-${suffix}`);
      btn.disabled = true;
      statusEl.textContent = "Saving...";

      const timeline = {};
      container.querySelectorAll(`.milestone-input[data-suffix="${suffix}"]`).forEach((input) => {
        timeline[input.dataset.timelineKey] = input.value || null;
      });
      const owned = isOwnedProperty(property)
        ? {
            ...getOwned(property),
            purchaseCloseDate: timeline.purchaseDate || getOwned(property).purchaseCloseDate || null,
            targetRehabComplete: timeline.rehabEnd || getOwned(property).targetRehabComplete || null,
            listDate: timeline.listDate || getOwned(property).listDate || null,
            saleCloseDate: timeline.saleDate || getOwned(property).saleCloseDate || null
          }
        : null;

      try {
        if (!apiAvailable) {
          property.timeline = timeline;
          if (owned) property.owned = owned;
          property.source = { ...(property.source || {}), timeline, ...(owned ? { owned } : {}) };
          const idx = properties.findIndex((p) => p.id === property.id);
          if (idx >= 0) {
            properties[idx].timeline = timeline;
            if (owned) properties[idx].owned = owned;
            properties[idx].source = { ...(properties[idx].source || {}), timeline, ...(owned ? { owned } : {}) };
          }
          storeLocalState();
        } else {
          const response = await fetch(`/api/properties/${property.id}/timeline`, {
            method: "PUT",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ timeline })
          });
          if (!response.ok) throw new Error("Could not save timeline.");
          if (owned) {
            await fetch(`/api/properties/${property.id}/owned`, {
              method: "PUT",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ owned })
            });
          }
          property.timeline = timeline;
          if (owned) property.owned = owned;
          property.source = { ...(property.source || {}), timeline, ...(owned ? { owned } : {}) };
          const idx = properties.findIndex((p) => p.id === property.id);
          if (idx >= 0) {
            properties[idx].timeline = timeline;
            if (owned) properties[idx].owned = owned;
            properties[idx].source = { ...(properties[idx].source || {}), timeline, ...(owned ? { owned } : {}) };
          }
        }
        statusEl.textContent = "Saved";
        const section = document.getElementById(`timelineSection-${suffix}`);
        if (section) section.outerHTML = renderTimelineSection({ ...property, timeline }, suffix);
        bindTimelineSave();
      } catch (err) {
        statusEl.textContent = err.message;
      } finally {
        btn.disabled = false;
      }
    });
  };
  bindTimelineSave();

  const statusEl = document.getElementById(`recordStatus-${suffix}`);
  const notesEl = document.getElementById(`recordNotes-${suffix}`);
  notesEl.value = quickSummary;
  const persist = async () => {
    const nextStatus = statusEl.value;
    const shouldOpenHandoff = nextStatus === "Closed" && needsOwnedHandoff(property);
    await saveRecordState(property.id, {
      status: statusEl.value,
      notes: notesEl.value
    });
    if (nextStatus === "Closed") {
      await saveOwnedForProperty(property.id, {
        ...ownershipDefaultsFor(property),
        ...getOwned(property)
      });
    }
    property.stage = recordStageFor(nextStatus);
    const activeSummary = document.querySelector(`[data-property-id="${property.id}"] em`);
    if (activeSummary) activeSummary.textContent = `${nextStatus} · ${money(property.listPrice)} · ${property.beds || "?"} bd / ${property.baths || "?"} ba · ${property.score || 0} ${property.scoreBand?.label || ""}`;
    renderAll();
    if (shouldOpenHandoff) openOwnedModal(property.id, { handoff: true });
  };
  statusEl.addEventListener("change", persist);
  notesEl.addEventListener("input", persist);
  document.getElementById(`addNote-${suffix}`).addEventListener("click", () => {
    addPropertyNote(property.id, suffix);
  });
  container.querySelector("[data-refresh-score]")?.addEventListener("click", () => {
    refreshPropertyScore(property.id, suffix);
  });
  container.querySelectorAll("[data-copy-offer]").forEach((button) => {
    button.addEventListener("click", (event) => {
      const originalText = event.currentTarget.textContent;
      const text = `${property.address}: ${money(property.targetOfferLow)} - ${money(property.targetOfferHigh)}`;
      copyText(text)
        .then(() => {
          event.currentTarget.textContent = "Copied";
          window.setTimeout(() => {
            event.currentTarget.textContent = originalText;
          }, 1400);
        })
        .catch(() => {
          event.currentTarget.textContent = "Copy failed";
        });
    });
  });
  container.querySelector("[data-open-calculator]")?.addEventListener("click", () => {
    selectedId = property.id;
    renderCalculatorOptions();
    syncCalculator();
    setActiveView("calculator");
  });
  container.querySelectorAll("[data-delete-note]").forEach((button) => {
    button.addEventListener("click", () => {
      deletePropertyNote(property.id, button.dataset.deleteNote, suffix);
    });
  });
}

function renderNoteLog(state) {
  const propertyNotes = [...(state.noteLog || [])].sort((a, b) => b.created_at.localeCompare(a.created_at));
  if (!propertyNotes.length) {
    return "<p class=\"empty\">No team notes yet. Add the first call recap or decision.</p>";
  }
  return propertyNotes.map((note) => `
    <article class="team-note">
      <header>
        <div>
          <strong>${escapeHtml(note.author)}</strong>
          <span>${escapeHtml(note.type)} · ${formatNoteTime(note.created_at)}</span>
        </div>
        <button class="note-delete" type="button" data-delete-note="${note.id}">Remove</button>
      </header>
      <p>${escapeHtml(note.body)}</p>
    </article>
  `).join("");
}

async function addPropertyNote(propertyId, suffix) {
  const textEl = document.getElementById(`noteText-${suffix}`);
  const text = textEl.value.trim();
  if (!text) return;
  const draft = normalizeNote({
    id: crypto.randomUUID(),
    property_id: propertyId,
    author: document.getElementById(`noteAuthor-${suffix}`).value,
    type: document.getElementById(`noteType-${suffix}`).value,
    body: text,
    created_at: new Date().toISOString()
  });
  if (!apiAvailable) {
    noteLog.unshift(draft);
    storeLocalState();
    textEl.value = "";
    renderRecord(suffix, suffix === "detailPanel" ? "detail" : "embedded");
    return;
  }
  const response = await fetch(`/api/properties/${propertyId}/notes`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
    author: document.getElementById(`noteAuthor-${suffix}`).value,
    type: document.getElementById(`noteType-${suffix}`).value,
      body: text
    })
  });
  if (!response.ok) throw new Error("Could not save note.");
  const { note } = await response.json();
  noteLog.unshift(normalizeNote(note));
  textEl.value = "";
  renderRecord(suffix, suffix === "detailPanel" ? "detail" : "embedded");
}

async function deletePropertyNote(propertyId, noteId, suffix) {
  if (!apiAvailable) {
    noteLog = noteLog.filter((note) => note.id !== noteId);
    storeLocalState();
    renderRecord(suffix, suffix === "detailPanel" ? "detail" : "embedded");
    return;
  }
  const response = await fetch(`/api/notes/${noteId}`, { method: "DELETE" });
  if (!response.ok && response.status !== 204) throw new Error("Could not delete note.");
  noteLog = noteLog.filter((note) => note.id !== noteId);
  renderRecord(suffix, suffix === "detailPanel" ? "detail" : "embedded");
}

async function refreshPropertyScore(propertyId, suffix) {
  const button = document.querySelector(`[data-refresh-score="${propertyId}"]`);
  if (button) {
    button.textContent = "Refreshing...";
    button.disabled = true;
  }
  try {
    const response = await fetch(`/api/properties/${propertyId}/refresh-score`, { method: "POST" });
    if (!response.ok) throw new Error((await response.json()).error || "Could not refresh score");
    const { property } = await response.json();
    const index = properties.findIndex((item) => item.id === propertyId);
    if (index >= 0) {
      properties[index] = applyScore({ ...properties[index], ...property });
      selectedId = propertyId;
      renderAll();
      renderRecord(suffix, suffix === "detailPanel" ? "detail" : "embedded");
    }
  } catch (error) {
    alert(error.message);
  } finally {
    if (button) {
      button.textContent = "Refresh Score";
      button.disabled = false;
    }
  }
}

function field(label, value) {
  return `<div class="field"><span>${label}</span><strong>${value}</strong></div>`;
}

function renderCalculatorOptions() {
  const options = activeProperties().map((property) => `<option value="${escapeHtml(property.id)}">${escapeHtml(property.address)}</option>`).join("");
  ["calcProperty", "scopeProperty", "taskProperty", "docProperty"].forEach((id) => {
    const select = document.getElementById(id);
    if (select) select.innerHTML = options;
  });
  const scopeSelect = document.getElementById("scopeProperty");
  if (scopeSelect && activePropertyById(selectedId)) scopeSelect.value = selectedId;
  const taskOwner = document.getElementById("taskOwner");
  if (taskOwner) taskOwner.innerHTML = teamMembers.map((member) => `<option>${escapeHtml(member.name)}</option>`).join("");
}

function syncCalculator() {
  const property = activeProperties().find((item) => item.id === selectedId) || activeProperties()[0];
  if (!property) return;
  const underwriting = defaultUnderwritingFor(property);
  document.getElementById("calcProperty").value = property.id;
  setText("calcBreadcrumbProperty", property.address);
  setText("calcPropertyTitle", property.address);
  setText("calcPropertyLocation", `${property.city}, ${property.state} ${property.zip || ""}`.trim());
  setText("calcPropertyStage", recordStageFor(property.stage));
  setText("calcPropertyLeadType", `${sourceTagLabel(property)} Lead`);
  setText("calcLeadScore", property.score || 0);
  setText("calcLeadScoreLabel", (property.score || 0) >= 80 ? "High" : (property.score || 0) >= 65 ? "Medium" : "Review");
  const photo = document.getElementById("calcPropertyPhoto");
  if (photo) {
    photo.src = propertyPhoto(property);
    photo.alt = property.address;
  }
  const stats = document.getElementById("calcPropertyStats");
  if (stats) {
    stats.innerHTML = [
      ["ARV", money(underwriting.arv)],
      ["Est. Rehab", money(underwriting.rehabEstimate)],
      ["Est. Rent", property.rent || property.estimatedRent ? money(property.rent || property.estimatedRent) + "/mo" : "TBD"],
      ["Sq Ft", number(property.sqft || property.squareFeet || 0)],
      ["Built", property.yearBuilt || "TBD"]
    ].map(([label, value]) => `<div><span>${label}</span><strong>${value}</strong></div>`).join("");
  }
  setMoneyInputValue("calcListPrice", underwriting.listPrice);
  setMoneyInputValue("calcArv", underwriting.arv);
  setMoneyInputValue("calcRehab", underwriting.rehabEstimate);
  const scopeItems = scopes.filter((s) => s.property_id === property.id);
  const scopeTotal = scopeItems.reduce((sum, s) => sum + (s.estimated_cost ?? 0), 0);
  const existingScopeBadge = document.getElementById("calcScopeBadge");
  if (existingScopeBadge) existingScopeBadge.remove();
  if (scopeTotal > 0) {
    const rehabInput = document.getElementById("calcRehab");
    const anchor = rehabInput?.closest("label");
    if (anchor) {
      const badge = document.createElement("div");
      badge.id = "calcScopeBadge";
      badge.className = "scope-badge";
      const matches = scopeTotal === (underwriting.rehabEstimate || 0);
      badge.innerHTML = `
        <span>Construction scope total: <strong>${money(scopeTotal)}</strong></span>
        ${!matches ? `<button class="secondary-link compact" type="button" id="useScopeTotal">Use this</button>` : `<span class="pill" style="color:var(--green)">✓ Matches rehab</span>`}
      `;
      anchor.after(badge);
      const useBtn = document.getElementById("useScopeTotal");
      if (useBtn) {
        useBtn.addEventListener("click", () => {
          setMoneyInputValue("calcRehab", scopeTotal);
          calculateOffer();
          badge.innerHTML = `<span>Construction scope total: <strong>${money(scopeTotal)}</strong></span><span class="pill" style="color:var(--green)">✓ Applied</span>`;
        });
      }
    }
  }
  setMoneyInputValue("calcPurchase", underwriting.proposedOffer);
  setMoneyInputValue("calcClosing", underwriting.closingCosts);
  const tw = property.underwriting;
  const defaultWeeksAcq = tw?.weeksAcquisition || 4;
  const defaultWeeksRehab = tw?.weeksRehab || 10;
  const defaultWeeksSale = tw?.weeksSale || 12;
  const defaultMonths = (defaultWeeksAcq + defaultWeeksRehab + defaultWeeksSale) / 4.33;
  setMoneyInputValue("calcHolding", defaultMonths > 0 ? Math.round(underwriting.holdingCosts / defaultMonths) : underwriting.holdingCosts);
  setMoneyInputValue("calcFinancing", underwriting.financingCost);
  setMoneyInputValue("calcSelling", underwriting.sellingCost);
  setMoneyInputValue("calcTargetProfit", underwriting.targetProfit);
  setMoneyInputValue("calcContingency", underwriting.contingency);
  if (document.getElementById("calcWeeksAcq")) {
    document.getElementById("calcWeeksAcq").value = defaultWeeksAcq;
    document.getElementById("calcWeeksRehab").value = defaultWeeksRehab;
    document.getElementById("calcWeeksSale").value = defaultWeeksSale;
  }
  document.getElementById("calcNotes").value = underwriting.notes;
  document.getElementById("calcSaveStatus").textContent = property.underwriting ? `Saved ${formatNoteTime(property.underwriting.updatedAt)}` : "";
  updateTimelineEstimate();
  calculateOffer();
}

function readCalculatorInput() {
  const weeksAcquisition = Number(document.getElementById("calcWeeksAcq")?.value || 0) || null;
  const weeksRehab = Number(document.getElementById("calcWeeksRehab")?.value || 0) || null;
  const weeksSale = Number(document.getElementById("calcWeeksSale")?.value || 0) || null;
  const totalWeeks = Number(weeksAcquisition || 0) + Number(weeksRehab || 0) + Number(weeksSale || 0);
  const monthlyHolding = calcValue("calcHolding");
  const totalHoldingCosts = totalWeeks > 0 ? Math.round(monthlyHolding * (totalWeeks / 4.33)) : monthlyHolding;
  return {
    listPrice: calcValue("calcListPrice"),
    arv: calcValue("calcArv"),
    rehabEstimate: calcValue("calcRehab"),
    proposedOffer: calcValue("calcPurchase"),
    closingCosts: calcValue("calcClosing"),
    holdingCosts: totalHoldingCosts,
    financingCost: calcValue("calcFinancing"),
    sellingCost: calcValue("calcSelling"),
    targetProfit: calcValue("calcTargetProfit"),
    contingency: calcValue("calcContingency"),
    weeksAcquisition,
    weeksRehab,
    weeksSale,
    notes: document.getElementById("calcNotes").value.trim()
  };
}

function updateTimelineEstimate() {
  const acqWks = Number(document.getElementById("calcWeeksAcq")?.value || 0);
  const rehabWks = Number(document.getElementById("calcWeeksRehab")?.value || 0);
  const saleWks = Number(document.getElementById("calcWeeksSale")?.value || 0);
  const total = acqWks + rehabWks + saleWks;

  const summary = document.getElementById("calcTimelineSummary");
  const viz = document.getElementById("calcTimelineViz");
  const segAcq = document.getElementById("vizSegAcq");
  const segRehab = document.getElementById("vizSegRehab");
  const segSale = document.getElementById("vizSegSale");
  const labels = document.getElementById("vizBarLabels");
  const totalEl = document.getElementById("vizTotal");

  if (!summary || !viz) return;
  if (!total) {
    summary.style.display = "none";
    summary.innerHTML = "";
    viz.style.display = "none";
    return;
  }

  const months = (total / 4.33).toFixed(1);
  const currentHolding = calcValue("calcHolding") || 0;
  const impliedMonthly = currentHolding > 0 ? money(currentHolding) : null;
  const suggestedHolding = 2500;

  summary.style.display = "flex";
  summary.innerHTML = `
    <span><strong>${total} weeks</strong> total (${months} months)</span>
    ${impliedMonthly
        ? `<span>${impliedMonthly}/month · ${money(Math.round(currentHolding * Number(months))) } total hold</span>`
      : `<button class="secondary-link compact" type="button" id="applyHoldingCost">
           Apply suggested monthly holding: ${money(suggestedHolding)}
         </button>`
    }
  `;

  const applyBtn = document.getElementById("applyHoldingCost");
  if (applyBtn) {
    applyBtn.addEventListener("click", () => {
      setMoneyInputValue("calcHolding", suggestedHolding);
      calculateOffer();
      updateTimelineEstimate();
    });
  }

  viz.style.display = "block";
  const pctAcq = total > 0 ? Math.round((acqWks / total) * 100) : 0;
  const pctRehab = total > 0 ? Math.round((rehabWks / total) * 100) : 0;
  const pctSale = 100 - pctAcq - pctRehab;

  segAcq.style.width = `${pctAcq}%`;
  segRehab.style.width = `${pctRehab}%`;
  segSale.style.width = `${pctSale}%`;

  if (labels) labels.innerHTML = `
    <span>${acqWks}w</span>
    <span>${rehabWks}w</span>
    <span>${saleWks}w</span>
  `;
  if (totalEl) totalEl.textContent = `Total: ${total} weeks · ${months} months`;
}

function calculateOffer() {
  const input = readCalculatorInput();
  const result = calculateUnderwriting(input);
  const totalProjectCosts = input.proposedOffer + input.closingCosts + input.holdingCosts + input.rehabEstimate + input.financingCost + input.sellingCost;
  const purchaseTotal = input.proposedOffer + input.closingCosts + input.financingCost + input.contingency;
  const closingPct = input.proposedOffer > 0 ? input.closingCosts / input.proposedOffer : 0;
  const financingPct = input.proposedOffer > 0 ? input.financingCost / input.proposedOffer : 0;
  const rehabHard = Math.round(input.rehabEstimate * 0.78);
  const rehabSoft = Math.round(input.rehabEstimate * 0.12);
  const rehabContingency = Math.max(0, input.rehabEstimate - rehabHard - rehabSoft);
  setText("maxOffer", money(result.recommendedMaxOffer));
  setText("calcSummaryProfit", `${money(result.netProfit)} Potential Profit`);
  setText("calcSummaryRoi", `${percent(result.roi)} Return on Cost`);
  setText("calcPurchaseTotal", money(purchaseTotal));
  setText("calcClosingPct", percent(closingPct));
  setText("calcFinancingPct", percent(financingPct));
  const rehabSummary = document.getElementById("calcRehabSummary");
  if (rehabSummary) {
    rehabSummary.innerHTML = [
      ["Hard Costs", rehabHard],
      ["Soft Costs", rehabSoft],
      ["Contingency", rehabContingency],
      ["Total Est. Rehab", input.rehabEstimate]
    ].map(([label, value], index) => `
      <div class="${index === 3 ? "total" : ""}">
        <span>${label}</span>
        <strong>${money(value)}</strong>
      </div>
    `).join("");
  }
  document.getElementById("calcKpis").innerHTML = [
    ["After Repair Value (ARV)", money(input.arv)],
    ["Total Project Costs", money(totalProjectCosts)],
    ["Potential Profit", money(result.netProfit)],
    ["Return on Cost", percent(result.roi)],
    ["Return on ARV", percent(result.profitMargin)]
  ].map(([label, value]) => `<article><span>${label}</span><strong>${value}</strong></article>`).join("");
  document.getElementById("calcWarnings").innerHTML = result.warnings.map((warning) => `<div class="calc-warning">${warning}</div>`).join("");
  setText("calcExplain", result.signal === "Strong" ? "This offer is within the current max allowable offer and return target." : "Review spread, rehab, and holding assumptions before submitting this offer.");
  document.getElementById("calcLines").innerHTML = [
    ["Official 70% MAO", `${money(input.arv)} x 70% - ${money(input.rehabEstimate)} = ${money(result.officialMao)}`],
    ["Target-profit offer", `${money(result.targetProfitOffer)}`],
    ["Proposed offer", money(input.proposedOffer)]
  ].map(([label, value]) => `<div><span>${label}</span><strong>${value}</strong></div>`).join("");
  const scenarios = document.getElementById("calcScenarios");
  if (scenarios) {
    [
      ["Conservative", result.recommendedMaxOffer * 0.94, "Lower risk approach"],
      ["Recommended", result.recommendedMaxOffer, "Balanced approach"],
      ["Aggressive", result.recommendedMaxOffer * 1.06, "Maximize potential"],
      ["Custom Scenario", null, "Create your own custom scenario"]
    ].forEach(() => {});
    scenarios.innerHTML = [
      ["Conservative", result.recommendedMaxOffer * 0.94, "Lower risk approach", "shield"],
      ["Recommended", result.recommendedMaxOffer, "Balanced approach", "star"],
      ["Aggressive", result.recommendedMaxOffer * 1.06, "Maximize potential", "crosshair"]
    ].map(([label, offer, note, icon]) => {
      const scenarioInput = { ...input, proposedOffer: Math.round(offer) };
      const scenarioResult = calculateUnderwriting(scenarioInput);
      return `
        <article class="${label === "Recommended" ? "active" : ""}">
          <h4><span data-icon="${icon}"></span>${label}</h4>
          <p>${note}</p>
          <div><span>MAO</span><strong>${money(scenarioResult.recommendedMaxOffer)}</strong></div>
          <div><span>Potential Profit</span><strong>${money(scenarioResult.netProfit)}</strong></div>
          <div><span>Return on Cost</span><strong>${percent(scenarioResult.roi)}</strong></div>
          ${label === "Recommended" ? "<em>Current Scenario</em>" : ""}
        </article>
      `;
    }).join("") + `
      <article class="custom">
        <strong>+</strong>
        <h4>Custom Scenario</h4>
        <p>Create your own custom scenario</p>
      </article>
    `;
  }
  const sensitivity = document.getElementById("calcSensitivity");
  if (sensitivity) {
    const rows = [
      ["ARV", "-5%", { ...input, arv: Math.round(input.arv * 0.95) }],
      ["Rehab", "+10%", { ...input, rehabEstimate: Math.round(input.rehabEstimate * 1.10) }],
      ["Hold Period", "+2 mo.", { ...input, holdingCosts: input.holdingCosts + 4300 }]
    ];
    sensitivity.innerHTML = rows.map(([label, delta, scenario]) => {
      const scenarioResult = calculateUnderwriting(scenario);
      return `<div><span>${label}</span><em>${delta}</em><strong>${money(label === "ARV" ? scenario.arv : label === "Rehab" ? scenario.rehabEstimate : scenario.holdingCosts)}</strong><b>${money(scenarioResult.recommendedMaxOffer)} ›</b></div>`;
    }).join("");
  }
  hydrateIcons();
  updateTimelineEstimate();
}

async function saveUnderwriting() {
  const propertyId = document.getElementById("calcProperty").value;
  const button = document.getElementById("saveUnderwritingBtn");
  const status = document.getElementById("calcSaveStatus");
  const saveLocalUnderwriting = () => {
    const input = readCalculatorInput();
    const calculation = calculateUnderwriting(input);
    const underwriting = {
      propertyId,
      ...input,
      calculation,
      updatedAt: new Date().toISOString(),
      createdBy: "Team"
    };
    const index = properties.findIndex((item) => item.id === propertyId);
    if (index >= 0) {
      properties[index] = normalizeProperty({
        ...properties[index],
        underwriting,
        targetOfferHigh: Math.round(calculation.recommendedMaxOffer),
        targetOfferLow: Math.round(calculation.recommendedMaxOffer * 0.95)
      });
    }
    selectedId = propertyId;
    storeLocalState();
    renderAll();
    setActiveView("calculator");
    status.textContent = "Saved locally";
  };
  button.disabled = true;
  status.textContent = "Saving...";
  try {
    if (!apiAvailable) {
      saveLocalUnderwriting();
      return;
    }
    const response = await fetch(`/api/properties/${propertyId}/underwriting`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...readCalculatorInput(), createdBy: "Team" })
    });
    if (!response.ok) throw new Error("Could not save underwriting.");
    const { property } = await response.json();
    const index = properties.findIndex((item) => item.id === propertyId);
    if (index >= 0) properties[index] = normalizeProperty({ ...properties[index], ...property });
    selectedId = propertyId;
    renderAll();
    setActiveView("calculator");
    status.textContent = "Saved";
  } catch (error) {
    if (!apiAvailable) saveLocalUnderwriting();
    else status.textContent = error.message;
  } finally {
    button.disabled = false;
  }
}

function selectedScopeProperty() {
  const selected = document.getElementById("scopeProperty")?.value;
  return activePropertyById(selected) || activeProperties()[0] || null;
}

function scopeValue(item, key) {
  const value = Number(item[key]);
  return Number.isFinite(value) ? value : 0;
}

function scopeItemsFor(propertyIdValue) {
  return scopes
    .map(normalizeScopeItem)
    .filter((item) => item.property_id === propertyIdValue)
    .sort((a, b) => {
      const aDone = ["Done", "Skipped"].includes(a.status) ? 1 : 0;
      const bDone = ["Done", "Skipped"].includes(b.status) ? 1 : 0;
      return aDone - bDone || String(b.created_at || "").localeCompare(String(a.created_at || ""));
    });
}

function scopeTotals(rows) {
  return rows.reduce((totals, row) => ({
    estimated: totals.estimated + scopeValue(row, "estimated_cost"),
    actual: totals.actual + scopeValue(row, "actual_cost"),
    open: totals.open + (["Done", "Skipped"].includes(row.status) ? 0 : 1),
    done: totals.done + (row.status === "Done" ? 1 : 0)
  }), { estimated: 0, actual: 0, open: 0, done: 0 });
}

function scopeStatusOptions(selected) {
  return SCOPE_STATUSES.map((status) =>
    `<option value="${escapeHtml(status)}"${status === selected ? " selected" : ""}>${escapeHtml(status)}</option>`
  ).join("");
}

function renderScope() {
  const property = selectedScopeProperty();
  const list = document.getElementById("scopeList");
  const stats = document.getElementById("scopeStats");
  if (!list || !stats) return;

  if (!property) {
    stats.innerHTML = "";
    list.innerHTML = "<p class=\"empty\">Add a property before building a construction scope.</p>";
    updateNavCounts();
    return;
  }

  const select = document.getElementById("scopeProperty");
  if (select && select.value !== property.id) select.value = property.id;
  const rows = scopeItemsFor(property.id);
  const totals = scopeTotals(rows);
  const rehab = Number(defaultUnderwritingFor(property).rehabEstimate || 0);
  const variance = totals.estimated - rehab;

  stats.innerHTML = [
    ["Scope Items", rows.length],
    ["Open Items", totals.open],
    ["Estimated Total", money(totals.estimated)],
    ["Actual Cost", money(totals.actual)],
    ["Current Rehab", money(rehab)],
    ["Variance", `${variance >= 0 ? "+" : ""}${money(variance)}`]
  ].map(([label, value]) => `<article class="stat"><span class="tiny-label">${label}</span><strong>${value}</strong></article>`).join("");

  list.innerHTML = `
    <div class="scope-property-head">
      <div>
        <strong>${escapeHtml(property.address)}</strong>
        <span>${escapeHtml(property.city)}, ${escapeHtml(property.state)} · Rehab estimate ${money(rehab)}</span>
      </div>
      <span class="pill">${rows.length} item${rows.length === 1 ? "" : "s"}</span>
    </div>
    ${rows.length ? `
      <div class="scope-table">
        <div class="scope-table-row scope-table-head">
          <strong>Item</strong>
          <strong>Estimated</strong>
          <strong>Actual</strong>
          <strong>Status</strong>
          <strong>Actions</strong>
        </div>
        ${rows.map((row) => `
          <div class="scope-table-row" data-scope-row="${escapeHtml(row.id)}">
            <input data-scope-field="item" value="${escapeHtml(row.item)}" aria-label="Scope item">
            <input data-scope-field="estimated_cost" class="money-input" inputmode="decimal" value="${row.estimated_cost == null ? "" : money(row.estimated_cost)}" aria-label="Estimated cost">
            <input data-scope-field="actual_cost" class="money-input" inputmode="decimal" value="${row.actual_cost == null ? "" : money(row.actual_cost)}" aria-label="Actual cost">
            <select data-scope-field="status" aria-label="Status">${scopeStatusOptions(row.status)}</select>
            <div class="scope-actions">
              <button class="secondary-link compact" type="button" data-save-scope="${escapeHtml(row.id)}">Save</button>
              <button class="danger-link compact" type="button" data-delete-scope="${escapeHtml(row.id)}">Delete</button>
            </div>
          </div>
        `).join("")}
      </div>
    ` : "<p class=\"empty\">No scope items for this property yet. Add line items above as you walk bids or photos.</p>"}
  `;

  list.querySelectorAll("[data-scope-field='estimated_cost'], [data-scope-field='actual_cost']").forEach((input) => {
    input.addEventListener("focus", (event) => {
      event.target.value = parseMoneyInput(event.target.value) || "";
      event.target.select();
    });
    input.addEventListener("blur", (event) => {
      if (event.target.value.trim()) formatMoneyInput(event.target);
    });
  });
  list.querySelectorAll("[data-save-scope]").forEach((button) => {
    button.addEventListener("click", () => saveScopeRow(property.id, button.dataset.saveScope));
  });
  list.querySelectorAll("[data-delete-scope]").forEach((button) => {
    button.addEventListener("click", () => deleteScopeItem(property.id, button.dataset.deleteScope));
  });
  updateNavCounts();
}

async function addScopeItem() {
  const button = document.getElementById("addScopeBtn");
  const status = document.getElementById("scopeStatus");
  const id = document.getElementById("scopeProperty").value;
  const name = document.getElementById("scopeItem").value.trim();
  const costValue = document.getElementById("scopeCost").value.trim();
  const actualCostValue = document.getElementById("scopeActualCost")?.value.trim() || "";
  const cost = costValue ? parseMoneyInput(costValue) : null;
  const actualCost = actualCostValue ? parseMoneyInput(actualCostValue) : null;
  const scopeStatus = document.getElementById("scopeStatusSelect")?.value || "Needed";
  status.textContent = "";
  if (!id) {
    status.textContent = "Choose a property.";
    return;
  }
  if (!name) {
    status.textContent = "Enter a scope item.";
    return;
  }
  button.disabled = true;
  button.textContent = "Adding...";
  const localScope = {
    id: crypto.randomUUID(),
    property_id: id,
    item: name,
    estimated_cost: cost,
    actual_cost: actualCost,
    status: scopeStatus,
    created_at: new Date().toISOString()
  };
  try {
    if (!apiAvailable) {
      scopes.push(normalizeScopeItem(localScope));
      storeLocalState();
      document.getElementById("scopeItem").value = "";
      document.getElementById("scopeCost").value = "";
      document.getElementById("scopeActualCost").value = "";
      status.textContent = "Scope item added locally.";
      renderScope();
      syncCalculator();
      return;
    }
    const response = await fetch(`/api/properties/${id}/construction-scope`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ item: name, estimatedCost: cost, actualCost, status: scopeStatus })
    });
    if (!response.ok) throw new Error("Could not save construction scope.");
    const { scope } = await response.json();
    scopes.push(normalizeScopeItem(scope));
    document.getElementById("scopeItem").value = "";
    document.getElementById("scopeCost").value = "";
    document.getElementById("scopeActualCost").value = "";
    status.textContent = "Scope item added.";
    renderScope();
    syncCalculator();
  } catch (error) {
    scopes.push(normalizeScopeItem(localScope));
    storeLocalState();
    document.getElementById("scopeItem").value = "";
    document.getElementById("scopeCost").value = "";
    document.getElementById("scopeActualCost").value = "";
    status.textContent = "Scope item added locally.";
    renderScope();
    syncCalculator();
  } finally {
    button.disabled = false;
    button.textContent = "Add";
  }
}

async function createScopeItemForProperty(propertyIdValue, name, cost) {
  const localScope = {
    id: crypto.randomUUID(),
    property_id: propertyIdValue,
    item: name,
    estimated_cost: cost,
    status: "Needed",
    created_at: new Date().toISOString()
  };
  if (!apiAvailable) {
    scopes.push(normalizeScopeItem(localScope));
    storeLocalState();
    return localScope;
  }
  const response = await fetch(`/api/properties/${propertyIdValue}/construction-scope`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ item: name, estimatedCost: cost })
  });
  if (!response.ok) throw new Error("Could not save construction scope.");
  const { scope } = await response.json();
  const normalized = normalizeScopeItem(scope);
  scopes.push(normalized);
  return normalized;
}

async function saveScopeRow(propertyIdValue, scopeId) {
  const row = document.querySelector(`[data-scope-row="${CSS.escape(scopeId)}"]`);
  const status = document.getElementById("scopeStatus");
  if (!row) return;
  const item = row.querySelector("[data-scope-field='item']").value.trim();
  if (!item) {
    status.textContent = "Scope item name is required.";
    return;
  }
  const updates = {
    item,
    estimatedCost: row.querySelector("[data-scope-field='estimated_cost']").value.trim()
      ? parseMoneyInput(row.querySelector("[data-scope-field='estimated_cost']").value)
      : null,
    actualCost: row.querySelector("[data-scope-field='actual_cost']").value.trim()
      ? parseMoneyInput(row.querySelector("[data-scope-field='actual_cost']").value)
      : null,
    status: row.querySelector("[data-scope-field='status']").value
  };
  const applyLocal = (payload = updates) => {
    const index = scopes.findIndex((scope) => scope.id === scopeId);
    if (index >= 0) {
      scopes[index] = normalizeScopeItem({
        ...scopes[index],
        item: payload.item,
        estimated_cost: payload.estimated_cost ?? payload.estimatedCost,
        actual_cost: payload.actual_cost ?? payload.actualCost,
        status: payload.status,
        updated_at: payload.updated_at || new Date().toISOString()
      });
    }
    storeLocalState();
    renderScope();
    syncCalculator();
  };
  status.textContent = "Saving scope item...";
  try {
    if (!apiAvailable) {
      applyLocal();
      status.textContent = "Scope item saved locally.";
      return;
    }
    const response = await fetch(`/api/properties/${propertyIdValue}/construction-scope/${scopeId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(updates)
    });
    if (!response.ok) throw new Error("Could not save scope item.");
    const { scope } = await response.json();
    applyLocal(scope);
    status.textContent = "Scope item saved.";
  } catch (error) {
    if (!apiAvailable) {
      applyLocal();
      status.textContent = "Scope item saved locally.";
    } else {
      status.textContent = error.message;
    }
  }
}

async function deleteScopeItem(propertyIdValue, scopeId) {
  if (!confirm("Delete this scope item?")) return;
  const status = document.getElementById("scopeStatus");
  const applyLocal = () => {
    scopes = scopes.filter((scope) => scope.id !== scopeId);
    storeLocalState();
    renderScope();
    syncCalculator();
  };
  status.textContent = "Deleting scope item...";
  try {
    if (!apiAvailable) {
      applyLocal();
      status.textContent = "Scope item deleted locally.";
      return;
    }
    const response = await fetch(`/api/properties/${propertyIdValue}/construction-scope/${scopeId}`, {
      method: "DELETE"
    });
    if (!response.ok && response.status !== 204) throw new Error("Could not delete scope item.");
    applyLocal();
    status.textContent = "Scope item deleted.";
  } catch (error) {
    status.textContent = error.message;
  }
}

function applySelectedScopeToCalculator() {
  const property = selectedScopeProperty();
  if (!property) return;
  const total = scopeTotals(scopeItemsFor(property.id)).estimated;
  selectedId = property.id;
  renderCalculatorOptions();
  syncCalculator();
  setMoneyInputValue("calcRehab", total);
  calculateOffer();
  setActiveView("calculator");
  document.getElementById("calcSaveStatus").textContent = "Scope total applied. Save underwriting to keep it.";
}

async function createDocumentForProperty(propertyIdValue, name, type, url) {
  const localDocument = {
    id: crypto.randomUUID(),
    property_id: propertyIdValue,
    name,
    type,
    url: url || null,
    created_at: new Date().toISOString()
  };
  if (!apiAvailable) {
    docs.push(localDocument);
    storeLocalState();
    return localDocument;
  }
  const response = await fetch(`/api/properties/${propertyIdValue}/documents`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name, type, url: url || null })
  });
  if (!response.ok) throw new Error("Could not save document.");
  const { document: documentRecord } = await response.json();
  docs.push(documentRecord);
  return documentRecord;
}

function ownedProjects() {
  return activeProperties().filter(isOwnedProperty);
}

function primaryOwnedProject() {
  return ownedProjects().find((property) => property.id === selectedId) || ownedProjects()[0] || null;
}

function ownedPageHead(title, subtitle, actions = "") {
  const project = primaryOwnedProject();
  const crumb = project
    ? `<div class="flip-breadcrumb">Projects <span>/</span> ${escapeHtml(project.address)} <span>/</span> ${escapeHtml(title)}</div>`
    : `<div class="flip-breadcrumb">Homes Owned <span>/</span> ${escapeHtml(title)}</div>`;
  return `
    <div class="owned-page-head">
      <div>
        ${crumb}
        <h2>${escapeHtml(title)}</h2>
        <p>${escapeHtml(subtitle)}</p>
      </div>
      <div class="owned-page-actions">${actions}</div>
    </div>
  `;
}

function prospectPageHead(title, subtitle, actions = "") {
  return `
    <div class="owned-page-head">
      <div>
        <div class="flip-breadcrumb">Prospects <span>/</span> ${escapeHtml(title)}</div>
        <h2>${escapeHtml(title)}</h2>
        <p>${escapeHtml(subtitle)}</p>
      </div>
      <div class="owned-page-actions">${actions}</div>
    </div>
  `;
}

function ownedEmptyState(title = "No owned projects yet") {
  return `
    <section class="owned-empty">
      <h2>${escapeHtml(title)}</h2>
      <p>Pick <strong>Closed</strong> on any property to start treating it like an active flip project.</p>
      <p>Once a home is closed, this area manages construction tasks, budget, photos, timeline, notes, listing, and sale tracking.</p>
      <button class="primary compact" type="button" data-empty-start-owned>Open Properties</button>
    </section>
  `;
}

function bindOwnedEmptyState(root = document) {
  root.querySelectorAll("[data-empty-start-owned]").forEach((button) => {
    button.addEventListener("click", () => setActiveView("properties"));
  });
}

function taskCategoryClass(category) {
  const value = String(category || "").toLowerCase();
  if (value.includes("finish") || value.includes("cabinet") || value.includes("counter")) return "blue";
  if (value.includes("land") || value.includes("exterior")) return "green";
  if (value.includes("demo")) return "purple";
  return "orange";
}

function calendarEventTone(status) {
  const portfolio = String(status || "").toLowerCase();
  if (portfolio.includes("completed") || portfolio.includes("done")) return "purple";
  if (portfolio.includes("planning") || portfolio.includes("not started")) return "blue";
  if (portfolio.includes("hold")) return "orange";
  return "green";
}

function dateFromIso(iso) {
  const [year, month, day] = String(iso || todayIso()).split("-").map(Number);
  return new Date(year || new Date().getFullYear(), (month || 1) - 1, day || 1);
}

function isoFromDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDaysIso(iso, days) {
  const date = dateFromIso(iso);
  date.setDate(date.getDate() + days);
  return isoFromDate(date);
}

function addMonthsIso(iso, months) {
  const date = dateFromIso(iso);
  date.setMonth(date.getMonth() + months);
  return isoFromDate(date);
}

function monthDays(anchorIso = calendarState.date) {
  const anchor = dateFromIso(anchorIso);
  const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const gridStart = new Date(first);
  gridStart.setDate(1 - first.getDay());
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(gridStart);
    date.setDate(gridStart.getDate() + index);
    return {
      date,
      iso: isoFromDate(date),
      muted: date.getMonth() !== anchor.getMonth()
    };
  });
}

function weekDays(anchorIso = calendarState.date) {
  const anchor = dateFromIso(anchorIso);
  const start = new Date(anchor);
  start.setDate(anchor.getDate() - anchor.getDay());
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return { date, iso: isoFromDate(date), muted: false };
  });
}

function calendarTitle() {
  const date = dateFromIso(calendarState.date);
  if (calendarState.view === "Week") {
    const days = weekDays(calendarState.date);
    const first = days[0].date;
    const last = days[6].date;
    if (first.getMonth() === last.getMonth()) {
      return `${first.toLocaleDateString("en-US", { month: "long" })} ${first.getDate()}-${last.getDate()}, ${last.getFullYear()}`;
    }
    return `${first.toLocaleDateString("en-US", { month: "short", day: "numeric" })} - ${last.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;
  }
  if (calendarState.view === "List") return "Upcoming Schedule";
  return date.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

function ownedCalendarEvents(owned = ownedProjects()) {
  return owned.flatMap((property) => {
    const status = projectPortfolioStatus(property);
    const ownedData = getOwned(property);
    const tl = property.source?.timeline || property.timeline || {};
    const milestoneEvents = defaultProjectMilestones(property)
      .flatMap((milestone) => [
        milestone.targetDate ? {
          id: `${property.id}-${milestone.id}-target`,
          property,
          title: milestone.label,
          date: milestone.targetDate,
          status,
          type: "Milestone",
          sourceKind: "milestone",
          sourceId: milestone.id,
          dateField: "targetDate"
        } : null,
        milestone.completedDate ? {
          id: `${property.id}-${milestone.id}-done`,
          property,
          title: `${milestone.label} Complete`,
          date: milestone.completedDate,
          status: "Completed",
          type: "Milestone",
          sourceKind: "milestone",
          sourceId: milestone.id,
          dateField: "completedDate"
        } : null
      ].filter(Boolean));
    const taskEvents = ownedProjectTasks(property)
      .filter((task) => task.dueDate)
      .map((task) => ({
        id: `${property.id}-${task.id}`,
        property,
        title: task.name,
        date: task.dueDate,
        status: task.status,
        type: "Task",
        sourceKind: "task",
        sourceId: task.id,
        dateField: "dueDate"
      }));
    const dateEvents = [
      ["Purchased", tl.purchaseDate || ownedData.purchaseCloseDate, "purchaseCloseDate"],
      ["Target List", tl.listDate || ownedData.listDate || flipTargetListDate(property), "listDate"],
      ["Sale Close", tl.saleDate || ownedData.saleCloseDate, "saleCloseDate"]
    ].filter(([, date]) => date).map(([title, date, dateField]) => ({
      id: `${property.id}-${dateField}`,
      property,
      title,
      date,
      status,
      type: "Date",
      sourceKind: "ownedDate",
      sourceId: dateField,
      dateField
    }));
    return [...dateEvents, ...milestoneEvents, ...taskEvents];
  }).sort((a, b) => String(a.date).localeCompare(String(b.date)));
}

function renderTasks() {
  const view = document.getElementById("tasksView");
  if (!view) return;
  const owned = ownedProjects();
  if (!owned.length) {
    view.innerHTML = `<section class="owned-page">${ownedPageHead("Tasks", "Track construction, listing, photo, and sale work across owned projects.")}${ownedEmptyState("No project tasks yet")}</section>`;
    bindOwnedEmptyState(view);
    updateNavCounts();
    return;
  }
  const rows = ownedProjectTaskList(owned).sort((a, b) =>
    String(a.dueDate || "9999-99-99").localeCompare(String(b.dueDate || "9999-99-99"))
  );
  if (rows.length && !rows.some((task) => ownedTaskKey(task) === selectedOwnedTaskKey)) {
    selectedOwnedTaskKey = ownedTaskKey(rows[0]);
  }
  const selected = rows.find((task) => ownedTaskKey(task) === selectedOwnedTaskKey) || rows[0] || null;
  const count = (status) => status === "All"
    ? rows.length
    : status === "To Do"
      ? rows.filter((row) => row.status !== "Done" && row.status !== "In Progress").length
      : rows.filter((row) => row.status === status).length;
  if (taskFormState.open) {
    view.innerHTML = renderTaskFormPage(owned);
    hydrateIcons();
    bindOwnedTasksPage(view);
    updateNavCounts();
    return;
  }
  const taskCard = (task) => {
    const key = ownedTaskKey(task);
    return `
      <button class="task-list-card ${key === selectedOwnedTaskKey ? "active" : ""}" type="button" data-owned-task-key="${escapeHtml(key)}" data-task-status="${escapeHtml(displayTaskStatus(task.status))}">
        <span class="task-select-ring"></span>
        <span class="task-card-main">
          <strong>${escapeHtml(task.name)}</strong>
          <span class="task-card-property">${escapeHtml(task.property.address)}</span>
          <em><i class="${taskCategoryClass(task.category)}">${escapeHtml((task.category || "G").slice(0, 1))}</i>${escapeHtml(task.category || "General")}</em>
        </span>
        <span class="task-card-meta">
          <i class="flip-status ${taskStatusClass(task.status)}">${escapeHtml(displayTaskStatus(task.status))}</i>
          <small>${formatProjectDate(task.dueDate)}</small>
          <small><b>${escapeHtml(personInitials(task.assignedPerson))}</b>${escapeHtml(task.assignedPerson || "Unassigned")}</small>
        </span>
      </button>
    `;
  };
  view.innerHTML = `
    <section class="task-workspace">
      <aside class="task-list-pane">
        <div class="task-breadcrumbs">
          <span>Projects</span><span>›</span><span>${escapeHtml(selected?.property.address || "Tasks")}</span><span>›</span><strong>${escapeHtml(selected?.name || "Task list")}</strong>
        </div>
        <div class="task-list-head">
          <h2>Tasks</h2>
          <button class="primary compact" type="button" id="ownedNewTaskBtn">+ New Task</button>
        </div>
        <div class="owned-segment-tabs task-status-tabs" id="ownedTaskStatusTabs">
          ${["All", "To Do", "In Progress", "Done"].map((status) => `<button class="${status === "All" ? "active" : ""}" type="button" data-task-filter="${status}">${status} <span>${count(status)}</span></button>`).join("")}
        </div>
        <div class="task-list-search">
          <label><span data-icon="search-user"></span><input id="ownedTaskSearch" type="search" placeholder="Search tasks..."></label>
          <button class="secondary-link compact" type="button" aria-label="Task list options">☷</button>
        </div>
        <div class="task-list-stack">
          ${rows.map(taskCard).join("") || "<p class=\"empty compact-empty\">No project tasks yet.</p>"}
        </div>
        <p class="project-showing">Showing ${rows.length ? `1 to ${rows.length}` : "0"} of ${rows.length} tasks</p>
      </aside>
      <main class="task-detail-pane">
        ${selected ? renderOwnedTaskDetail(selected) : renderEmptyTaskDetail(owned)}
      </main>
      ${renderTaskFormSlideOver(owned)}
    </section>
  `;
  hydrateIcons();
  bindOwnedTasksPage(view);
  updateNavCounts();
}

function renderEmptyTaskDetail(owned = []) {
  const firstProject = owned[0];
  return `
    <section class="task-detail-card task-empty-detail">
      <div class="task-detail-top">
        <span class="task-category-dot general">T</span>
        <span>No task selected</span>
      </div>
      <h2>No project tasks yet</h2>
      <p class="empty compact-empty">Create a task for ${escapeHtml(firstProject?.address || "an owned project")} to track rehab work, listing prep, and project blockers.</p>
      <button class="primary compact" type="button" id="ownedEmptyNewTaskBtn">+ New Task</button>
    </section>
  `;
}

function taskChecklist(task) {
  const existing = Array.isArray(task.checklist) ? task.checklist : [];
  if (existing.length) return existing;
  return ["Confirm scope and materials", "Complete work area prep", "Upload progress photos", "Mark task ready for review"]
    .map((text, index) => ({ id: `default-${index + 1}`, text, done: task.status === "Done" }));
}

function taskActivityItems(task) {
  return [
    { actor: task.assignedPerson || "Team", text: `${displayTaskStatus(task.status)} task status`, time: formatProjectDate(task.updatedAt || task.createdAt || todayIso()) },
    { actor: task.assignedPerson || "Team", text: `Assigned to ${task.assignedPerson || "Unassigned"}`, time: formatProjectDate(task.createdAt || todayIso()) },
    ...ownedMediaItems(task.property).slice(0, 1).map((item) => ({
      actor: item.createdBy || "Team",
      text: `Added ${item.room || item.phase || "project"} media`,
      time: formatProjectDate(item.createdAt || todayIso())
    }))
  ].slice(0, 4);
}

function taskMediaImageUrl(item, property) {
  const candidate = String(item.url || item.photoUrl || item.src || "");
  if (/^(https?:|data:image\/|assets\/|\/)/.test(candidate)) return candidate;
  return propertyPhoto(property);
}

const isVideoMedia = (item = {}) =>
  String(item.type || "").toLowerCase() === "video" || /\.(mp4|mov|webm)(\?|$)/i.test(String(item.url || ""));

function mediaPreview(item = {}, property = {}) {
  const url = safeUrl(item.url || "");
  if (!url) return "";
  if (isVideoMedia(item)) return `<video src="${url}" muted playsinline preload="metadata"></video>`;
  return `<img src="${url}" alt="${escapeHtml(item.caption || property.address || "Project media")}">`;
}

async function uploadMediaFile(file) {
  if (!file) return null;
  if (!mediaUploadsAvailable) return await readLocalMediaFile(file);
  const formData = new FormData();
  formData.append("file", file);
  const response = await fetch("/api/uploads/media", { method: "POST", body: formData });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error || "Could not upload media.");
  }
  const { upload } = await response.json();
  return upload;
}

function readLocalMediaFile(file) {
  const maxLocalUploadBytes = 4 * 1024 * 1024;
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith("image/") && !file.type.startsWith("video/")) {
      reject(new Error("Only image and video uploads are supported."));
      return;
    }
    if (file.size > maxLocalUploadBytes) {
      reject(new Error("For this live demo, upload files under 4 MB or paste a hosted media link."));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => resolve({
      url: String(reader.result || ""),
      filename: file.name,
      originalName: file.name,
      mimeType: file.type || "application/octet-stream",
      size: file.size,
      localOnly: true
    });
    reader.onerror = () => reject(new Error("Could not read media file."));
    reader.readAsDataURL(file);
  });
}

function nextOwnedTask(task) {
  const list = ownedProjectTasks(task.property).map((item) => ({ ...item, property: task.property }));
  const currentIndex = list.findIndex((item) => item.id === task.id);
  return list.slice(currentIndex + 1).find((item) => item.status !== "Done") || list.find((item) => item.id !== task.id && item.status !== "Done") || null;
}

function renderOwnedTaskDetail(task) {
  const checklist = taskChecklist(task);
  const doneCount = checklist.filter((item) => item.done).length;
  const media = ownedMediaItems(task.property).slice(0, 4);
  const relatedNotes = noteLog.filter((note) => note.property_id === task.property.id);
  const budget = flipBudgetSummary(task.property);
  const priority = task.priority || (task.status === "Done" ? "Low" : "Medium");
  const next = nextOwnedTask(task);
  return `
    <section class="task-detail-card">
      <div class="task-detail-actions">
        <button class="secondary-link compact" type="button" id="ownedEditTaskBtn"><span data-icon="square-pen"></span>Edit</button>
        <button class="secondary-link compact" type="button">More Actions <span data-icon="chevron"></span></button>
      </div>
      <div class="task-detail-top">
        <span class="task-category-dot ${taskCategoryClass(task.category)}">${escapeHtml((task.category || "G").slice(0, 1))}</span>
        <span>${escapeHtml(task.category || "General")}</span>
        <select id="taskDetailStatus" aria-label="Task status">
          ${FLIP_TASK_STATUSES.map((item) => `<option value="${escapeHtml(item)}" ${item === task.status ? "selected" : ""}>${escapeHtml(displayTaskStatus(item))}</option>`).join("")}
        </select>
      </div>
      <h2>${escapeHtml(task.name)}</h2>
      <div class="task-detail-kpis">
        <div><span>Assignee</span><strong><i>${escapeHtml(personInitials(task.assignedPerson))}</i>${escapeHtml(task.assignedPerson || "Unassigned")}</strong></div>
        <div><span>Due Date</span><strong><span data-icon="calendar"></span>${formatProjectDate(task.dueDate)}</strong></div>
        <div><span>Priority</span><strong><b class="priority-dot ${priority.toLowerCase()}"></b>${escapeHtml(priority)}</strong></div>
        <div><span>Estimated Time</span><strong>${escapeHtml(task.estimatedTime || "1-2 days")}</strong></div>
      </div>
      <section class="task-description">
        <h3>Description</h3>
        <p>${escapeHtml(task.notes || "No task description yet.")}</p>
      </section>
      <div class="task-detail-grid">
        <section class="task-main-column">
          <section class="task-checklist">
            <h3>Checklist <span>${doneCount}/${checklist.length}</span></h3>
            ${checklist.map((item) => `
              <label>
                <input type="checkbox" data-task-checklist-id="${escapeHtml(item.id)}" ${item.done ? "checked" : ""}>
                <span>${escapeHtml(item.text)}</span>
              </label>
            `).join("")}
            <button class="secondary-link compact" type="button" id="taskAddChecklistItem">+ Add item</button>
          </section>
          <section class="task-attachments">
            <h3>Attachments <span>(${media.length})</span></h3>
            <div>
              ${media.map((item) => `<img src="${escapeHtml(taskMediaImageUrl(item, task.property))}" alt="${escapeHtml(item.caption || task.name)}">`).join("")}
              <button type="button" id="taskUploadPlaceholder">+<span>Upload</span></button>
            </div>
          </section>
          <section class="task-activity">
            <h3>Activity</h3>
            ${taskActivityItems(task).map((item) => `
              <div>
                <i>${escapeHtml(personInitials(item.actor))}</i>
                <strong>${escapeHtml(item.actor)}</strong>
                <span>${escapeHtml(item.text)}</span>
                <time>${escapeHtml(item.time)}</time>
              </div>
            `).join("")}
          </section>
        </section>
        <aside class="task-side-column">
          <section><h3>Category</h3><p><i class="${taskCategoryClass(task.category)}">${escapeHtml((task.category || "G").slice(0, 1))}</i>${escapeHtml(task.category || "General")}</p></section>
          <section><h3>Location</h3><p>${escapeHtml(task.location || task.property.address)}</p></section>
          <section>
            <h3>Related</h3>
            <button type="button" data-property-id="${escapeHtml(task.property.id)}">Photos (${ownedMediaItems(task.property).length}) <span>›</span></button>
            <button type="button" data-property-id="${escapeHtml(task.property.id)}">Notes (${relatedNotes.length}) <span>›</span></button>
            <button type="button" data-property-id="${escapeHtml(task.property.id)}">Budget (${money(budget.actual || budget.estimated)}) <span>›</span></button>
          </section>
          <section class="task-next-step">
            <h3>Next Step</h3>
            <div>✓</div>
            <strong>${task.status === "Done" ? "Great job! What's next?" : "Keep this task moving."}</strong>
            <p>${escapeHtml(next?.name || "No next task queued.")}</p>
            ${next ? `<button class="primary compact" type="button" data-next-owned-task="${escapeHtml(ownedTaskKey(next))}">View Next Task <span>→</span></button>` : ""}
          </section>
        </aside>
      </div>
    </section>
  `;
}

function renderTaskFormSlideOver(owned) {
  if (!taskFormState.open) return "";
  const isEdit = taskFormState.mode === "edit";
  const property = propertyById(taskFormState.propertyId) || owned[0] || null;
  const task = isEdit ? ownedProjectTasks(property || {}).find((item) => item.id === taskFormState.taskId) || {} : {};
  return `
    <div class="task-form-backdrop" id="taskFormBackdrop"></div>
    <aside class="task-form-panel" role="dialog" aria-modal="true" aria-label="${isEdit ? "Edit task" : "Create task"}">
      <header>
        <div><h2>${isEdit ? "Edit Task" : "New Task"}</h2><p>${isEdit ? "Update task details and ownership." : "Create work for an owned project."}</p></div>
        <button type="button" id="taskFormClose" aria-label="Close task form">×</button>
      </header>
      <div class="task-form-grid">
        <label>Project<select id="taskFormProject">${owned.map((item) => `<option value="${escapeHtml(item.id)}" ${item.id === property?.id ? "selected" : ""}>${escapeHtml(item.address)}</option>`).join("")}</select></label>
        <label>Task Name<input id="taskFormName" value="${escapeHtml(task.name || "")}" placeholder="Task name"></label>
        <label>Category<select id="taskFormCategory">${FLIP_TASK_PHASES.map((phase) => `<option ${phase === (task.category || "Demo") ? "selected" : ""}>${escapeHtml(phase)}</option>`).join("")}</select></label>
        <label>Status<select id="taskFormStatus">${FLIP_TASK_STATUSES.map((status) => `<option ${status === (task.status || "Not Started") ? "selected" : ""}>${escapeHtml(status)}</option>`).join("")}</select></label>
        <label>Due Date<input id="taskFormDue" type="date" value="${escapeHtml(task.dueDate || "")}"></label>
        <label>Assignee<select id="taskFormAssignee"><option value="">Unassigned</option>${teamMembers.map((member) => `<option value="${escapeHtml(member.name)}" ${member.name === task.assignedPerson ? "selected" : ""}>${escapeHtml(member.name)}</option>`).join("")}</select></label>
        <label>Priority<select id="taskFormPriority">${["Low", "Medium", "High"].map((priority) => `<option ${priority === (task.priority || "Medium") ? "selected" : ""}>${priority}</option>`).join("")}</select></label>
        <label>Estimated Time<input id="taskFormEstimated" value="${escapeHtml(task.estimatedTime || "1-2 days")}" placeholder="1-2 days"></label>
        <label>Location<input id="taskFormLocation" value="${escapeHtml(task.location || "")}" placeholder="Kitchen, exterior, whole house"></label>
        <label class="wide">Description<textarea id="taskFormNotes" placeholder="Task instructions">${escapeHtml(task.notes || "")}</textarea></label>
      </div>
      <footer>
        <span class="form-status" id="taskFormStatusMsg"></span>
        <button class="secondary-link" type="button" id="taskFormCancel">Cancel</button>
        <button class="primary" type="button" id="taskFormSave">${isEdit ? "Save Task" : "Create Task"}</button>
      </footer>
    </aside>
  `;
}

function renderTaskFormPage(owned) {
  const isEdit = taskFormState.mode === "edit";
  const property = propertyById(taskFormState.propertyId) || owned[0] || null;
  const task = isEdit ? ownedProjectTasks(property || {}).find((item) => item.id === taskFormState.taskId) || {} : {};
  const projectBudget = property ? ownedRehabBudget(property).originalEstimate || getOwned(property).forecastRehab || property.rehab || 0 : 0;
  const budget = property ? flipBudgetSummary(property) : { actual: 0, percentUsed: 0 };
  const remaining = Math.max(0, projectBudget - Number(budget.actual || 0));
  const checklist = Array.isArray(task.checklist) ? task.checklist : [];
  const option = (value, selected) => `<option value="${escapeHtml(value)}" ${value === selected ? "selected" : ""}>${escapeHtml(value)}</option>`;
  const projectOptions = owned.map((item) => `<option value="${escapeHtml(item.id)}" ${item.id === property?.id ? "selected" : ""}>${escapeHtml(item.address)}</option>`).join("");
  return `
    <section class="task-create-page">
      <header class="task-create-header">
        <div>
          <div class="task-breadcrumbs"><span>Projects</span><span>›</span><span>${escapeHtml(property?.address || "Project")}</span><span>›</span><span>Tasks</span><span>›</span><strong>${isEdit ? "Edit Task" : "New Task"}</strong></div>
          <h2>${isEdit ? "Edit Task" : "New Task"}</h2>
          <p>${isEdit ? "Update task details" : `Create a new task for ${escapeHtml(property?.address || "this project")}`}</p>
        </div>
        <div>
          <button class="secondary-link" type="button" id="taskFormCancel">Cancel</button>
          <button class="primary" type="button" id="taskFormSave">${isEdit ? "Save Task" : "Create Task"}</button>
        </div>
      </header>
      <div class="task-create-layout">
        <main class="task-create-main">
          <section class="task-form-section task-details-section">
            <div class="task-section-title"><span>1</span><h3>Task Details</h3></div>
            <label class="wide">House<select id="taskFormProject">${projectOptions}</select></label>
            <label class="wide">Task Name <b>*</b><input id="taskFormName" value="${escapeHtml(task.name || "")}" placeholder="e.g. Demo kitchen"></label>
            <div class="task-form-row three">
              <label>Category<select id="taskFormCategory"><option value="">Select category</option>${FLIP_TASK_PHASES.map((phase) => option(phase, task.category || "")).join("")}</select></label>
              <label>Status<select id="taskFormStatus">${FLIP_TASK_STATUSES.map((status) => option(status, task.status || "Not Started")).join("")}</select></label>
              <label>Priority<select id="taskFormPriority">${["Low", "Medium", "High"].map((priority) => option(priority, task.priority || "Medium")).join("")}</select></label>
            </div>
            <label class="wide">Description
              <div class="rich-toolbar"><button type="button">B</button><button type="button"><i>I</i></button><button type="button"><u>U</u></button><button type="button">☷</button><button type="button">↩</button><button type="button">↪</button></div>
              <textarea id="taskFormNotes" placeholder="Add a detailed description of the task...">${escapeHtml(task.notes || "")}</textarea>
            </label>
            <aside class="task-quick-tips">
              <h3>Quick Tips</h3>
              <p>Be specific about what needs to be done</p>
              <p>Add checklist items to break down the work</p>
              <p>Attach photos or plans for reference</p>
              <p>Set a due date to keep the project on track</p>
            </aside>
          </section>
          <section class="task-form-section">
            <div class="task-section-title"><span>2</span><h3>Assignments & Scheduling</h3></div>
            <div class="task-form-row four">
              <label>Assignee<select id="taskFormAssignee"><option value="">Select assignee</option>${teamMembers.map((member) => option(member.name, task.assignedPerson || "")).join("")}</select></label>
              <label>Due Date<input id="taskFormDue" type="date" value="${escapeHtml(task.dueDate || "")}"></label>
              <label>Estimated Time<input id="taskFormEstimated" value="${escapeHtml(task.estimatedTime || "")}" placeholder="e.g. 1-2 days"></label>
              <label>Start Date <em>(Optional)</em><input id="taskFormStart" type="date" value="${escapeHtml(task.startDate || "")}"></label>
            </div>
            <label class="task-toggle-row"><span data-icon="calendar"></span><strong>Add to Project Calendar<em>This task will appear on the project timeline</em></strong><input id="taskFormCalendar" type="checkbox" ${task.addToCalendar === false ? "" : "checked"}></label>
          </section>
          <section class="task-form-section">
            <div class="task-section-title"><span>3</span><h3>Cost & Budget</h3></div>
            <div class="task-form-row four">
              <label>Estimated Cost<input id="taskFormEstimatedCost" class="money-input" value="${task.estimatedCost ? money(task.estimatedCost) : ""}" placeholder="$ 0.00"></label>
              <label>Actual Cost<input id="taskFormActualCost" class="money-input" value="${task.actualCost ? money(task.actualCost) : ""}" placeholder="$ 0.00"></label>
              <label>Cost Variance<input id="taskFormCostVariance" value="${money(Number(task.estimatedCost || 0) - Number(task.actualCost || 0))}" disabled></label>
              <label class="track-cost-toggle"><strong>Track Actual Cost<em>Track real expenses for this task</em></strong><input id="taskFormTrackCost" type="checkbox" ${task.trackCost === false ? "" : "checked"}></label>
            </div>
            <div class="task-form-row three">
              <label>Budget Category<select id="taskFormBudgetCategory"><option value="">Select budget category</option>${FLIP_BUDGET_CATEGORIES.map((category) => option(category, task.budgetCategory || "")).join("")}</select></label>
              <label>Vendor / Contractor <em>(Optional)</em><input id="taskFormVendor" value="${escapeHtml(task.vendor || "")}" placeholder="Select vendor"></label>
              <label>Payment Method<select id="taskFormPayment"><option value="">Select payment method</option>${["Cash", "Credit Card", "Check", "ACH", "Other"].map((value) => option(value, task.paymentMethod || "")).join("")}</select></label>
            </div>
            <p class="task-cost-note">Costs will sync to your project budget and help you track profitability.</p>
          </section>
          <section class="task-form-section">
            <div class="task-section-title"><span>4</span><h3>Checklist</h3></div>
            <p>Add steps that need to be completed for this task.</p>
            <div class="task-checklist-input"><input id="taskFormChecklistItem" placeholder="Add checklist item..."><button type="button">+</button></div>
            <div class="task-empty-checklist">${checklist.length ? checklist.map((item) => `<span>${escapeHtml(item.text)}</span>`).join("") : "<strong>No checklist items yet</strong><em>Add steps to stay organized and track progress.</em>"}</div>
          </section>
          <div class="task-form-bottom-grid">
            <section class="task-form-section"><div class="task-section-title"><span>5</span><h3>Attachments</h3></div><p>Upload photos, videos, documents, or plans.</p><button class="task-upload-drop" type="button">☁<strong>Click to upload</strong><span>or drag and drop<br>Photos, videos, docs, plans (max 50MB)</span></button></section>
            <section class="task-form-section"><div class="task-section-title"><span>6</span><h3>Notes</h3></div><p>Add any notes or special instructions.</p><textarea id="taskFormExtraNotes" placeholder="Add notes...">${escapeHtml(task.extraNotes || "")}</textarea></section>
          </div>
          <section class="task-form-section">
            <div class="task-section-title"><span>7</span><h3>Additional Information <em>(Optional)</em></h3></div>
            <div class="task-form-row four">
              <label>Room / Location<input id="taskFormLocation" value="${escapeHtml(task.location || "")}" placeholder="e.g. Kitchen"></label>
              <label>Linked Milestone<select id="taskFormMilestone"><option value="">Select milestone</option>${FLIP_MILESTONE_LABELS.map((value) => option(value, task.milestone || "")).join("")}</select></label>
              <label>Depends On <em>(Optional)</em><select id="taskFormDepends"><option value="">Select task</option>${ownedProjectTasks(property || {}).filter((item) => item.id !== task.id).map((item) => option(item.id, task.dependsOn || "")).join("")}</select></label>
              <label>Tags<input id="taskFormTags" value="${escapeHtml(Array.isArray(task.tags) ? task.tags.join(", ") : task.tags || "")}" placeholder="Add tags..."></label>
            </div>
          </section>
        </main>
        <aside class="task-create-summary">
          <section>
            <h3>${escapeHtml(property?.address || "Project")}</h3>
            <p>${escapeHtml(ownedPhaseFor(property || {}))}</p>
            <div><span>Project Budget</span><strong>${money(projectBudget)}</strong></div>
            <div><span>Total Spent</span><strong>${money(budget.actual)}</strong></div>
            <div><span>Budget Remaining</span><strong class="green">${money(remaining)}</strong></div>
            <div><span>Project Progress</span><div class="task-progress"><i style="width:${Math.min(100, flipProgress(property || {}))}%"></i></div><strong>${flipProgress(property || {})}%</strong></div>
          </section>
          <p class="form-status" id="taskFormStatusMsg"></p>
        </aside>
      </div>
    </section>
  `;
}

async function markTaskDone(propertyId, taskId) {
  const markLocal = () => {
    const index = tasks.findIndex((item) => item.id === taskId);
    if (index >= 0) {
      tasks[index] = { ...tasks[index], status: "Done", updated_at: new Date().toISOString() };
      storeLocalState();
      renderTasks();
    }
  };
  if (!apiAvailable) {
    markLocal();
    return;
  }
  const response = await fetch(`/api/properties/${propertyId}/tasks/${taskId}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ status: "Done" })
  });
  if (!response.ok) throw new Error("Could not update task.");
  const { task } = await response.json();
  const index = tasks.findIndex((item) => item.id === taskId);
  if (index >= 0) tasks[index] = { ...tasks[index], ...task };
  renderTasks();
}

function renderDocuments() {
  document.getElementById("docTable").innerHTML = docs.filter((doc) => activePropertyById(doc.property_id)).map((doc) => {
    const linkCell = doc.url
      ? `<td><a href="${doc.url}" target="_blank" rel="noreferrer">Open</a></td>`
      : "<td>—</td>";
    return `<tr>
      <td>${propertyById(doc.property_id)?.address || doc.property || "Unknown"}</td>
      <td>${doc.name}</td>
      <td>${doc.type}</td>
      ${linkCell}
      <td>${(doc.created_at || doc.date || "").slice(0, 10)}</td>
    </tr>`;
  }).join("") || "<tr><td colspan=\"5\">No documents attached yet.</td></tr>";
  updateNavCounts();
}

const chatChannels = [
  { id: "general", label: "General", subtitle: "Company-wide coordination and quick updates." },
  { id: "acquisitions", label: "Acquisitions", subtitle: "Lead calls, offers, seller responses, and underwriting blockers." },
  { id: "construction", label: "Construction", subtitle: "Scopes, bids, rehab photos, and project schedule updates." },
  { id: "finance", label: "Finance", subtitle: "Funding, closing, reimbursements, and profit tracking." }
];

function chatChannelMeta(id = activeChatChannel) {
  return chatChannels.find((channel) => channel.id === id) || chatChannels[0];
}

function chatMessagesForActiveChannel() {
  return chatMessages
    .filter((message) => message.channel === activeChatChannel)
    .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
}

function renderChat() {
  const channelList = document.getElementById("chatChannelList");
  const feed = document.getElementById("chatFeed");
  const propertySelect = document.getElementById("chatPropertySelect");
  if (!channelList || !feed || !propertySelect) return;

  const meta = chatChannelMeta();
  setText("chatChannelEyebrow", `#${meta.id}`);
  setText("chatChannelTitle", meta.label);
  setText("chatChannelSubtitle", meta.subtitle);
  updateChatLiveStatus();

  channelList.innerHTML = chatChannels.map((channel) => {
    const count = chatMessages.filter((message) => message.channel === channel.id).length;
    return `
      <button class="chat-channel ${channel.id === activeChatChannel ? "active" : ""}" type="button" data-chat-channel="${channel.id}">
        <span>#</span>
        <strong>${escapeHtml(channel.label)}</strong>
        <em>${count}</em>
      </button>
    `;
  }).join("");

  propertySelect.innerHTML = `
    <option value="">No property attached</option>
    ${activeProperties()
      .slice()
      .sort((a, b) => String(a.address || "").localeCompare(String(b.address || "")))
      .map((property) => `<option value="${escapeHtml(property.id)}">${escapeHtml(property.address)}</option>`)
      .join("")}
  `;

  const rows = chatMessagesForActiveChannel();
  feed.innerHTML = rows.map((message) => {
    const property = propertyById(message.property_id);
    const isMine = message.author === currentUser.name;
    return `
      <article class="chat-message ${isMine ? "mine" : ""}">
        <div class="chat-avatar">${escapeHtml(personInitials(message.author))}</div>
        <div class="chat-bubble">
          <header>
            <strong>${escapeHtml(message.author)}</strong>
            <span>${escapeHtml(roleLabels[message.author_role] || message.author_role || "Team")} · ${escapeHtml(formatNoteTime(message.created_at) || "now")}</span>
            ${isMine ? `<button class="chat-delete-message" type="button" data-chat-delete="${escapeHtml(message.id)}" aria-label="Delete message">Delete</button>` : ""}
          </header>
          <p>${escapeHtml(message.body)}</p>
          ${property ? `<button class="chat-property-link" type="button" data-property-id="${escapeHtml(property.id)}">${escapeHtml(property.address)} <span>Open</span></button>` : ""}
        </div>
      </article>
    `;
  }).join("") || `
    <div class="chat-empty">
      <strong>No messages in #${escapeHtml(activeChatChannel)} yet.</strong>
      <span>Start the thread with the update the team needs next.</span>
    </div>
  `;

  channelList.querySelectorAll("[data-chat-channel]").forEach((button) => {
    button.addEventListener("click", async () => {
      activeChatChannel = button.dataset.chatChannel;
      storageSet("stakerCollinsChatChannelV1", activeChatChannel);
      await refreshChatMessages(activeChatChannel);
      renderChat();
      updateChatPolling();
    });
  });
  feed.querySelectorAll("[data-chat-delete]").forEach((button) => {
    button.addEventListener("click", () => deleteChatMessage(button.dataset.chatDelete));
  });
  bindPropertyLinks(feed);
  requestAnimationFrame(() => {
    feed.scrollTop = feed.scrollHeight;
  });
  updateNavCounts();
}

function updateChatLiveStatus(activeCount = null) {
  const el = document.getElementById("chatLiveStatus");
  if (!el) return;
  if (!shouldPollChat()) {
    el.textContent = "Auto-refresh starts when you are viewing Team Chat.";
    el.dataset.state = "idle";
    return;
  }
  if (Number(activeCount) > 1) {
    el.textContent = `${activeCount} teammates viewing. Messages refresh every 5 seconds.`;
    el.dataset.state = "live";
    return;
  }
  el.textContent = "Waiting for another teammate before auto-refresh starts.";
  el.dataset.state = "waiting";
}

async function refreshChatMessages(channel = activeChatChannel) {
  if (!apiAvailable) return;
  const response = await fetch(`/api/chat/messages?channel=${encodeURIComponent(channel)}`);
  if (!response.ok) return;
  const { messages } = await response.json();
  const otherChannels = chatMessages.filter((message) => message.channel !== channel);
  chatMessages = [...otherChannels, ...(messages || []).map(normalizeChatMessage)];
}

async function deleteChatMessage(id) {
  if (!id) return;
  const statusEl = document.getElementById("chatStatus");
  if (statusEl) statusEl.textContent = "Deleting...";
  try {
    if (apiAvailable) {
      const response = await fetch(`/api/chat/messages/${encodeURIComponent(id)}`, {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ author: currentUser.name })
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || "Could not delete message.");
      }
    }
    chatMessages = chatMessages.filter((message) => message.id !== id);
    if (!apiAvailable) {
      storeChatMessages();
      storeLocalState();
    }
    if (statusEl) statusEl.textContent = "";
    renderChat();
  } catch (error) {
    if (statusEl) statusEl.textContent = error.message || "Could not delete message.";
  }
}

function shouldPollChat() {
  return apiAvailable
    && appStarted
    && currentUser.name !== "Team"
    && activeView === "chat"
    && !document.hidden;
}

function stopChatPolling() {
  if (chatPollTimer) clearTimeout(chatPollTimer);
  chatPollTimer = null;
}

function scheduleChatPolling(delay = 5000) {
  stopChatPolling();
  if (shouldPollChat()) chatPollTimer = setTimeout(pollChatPresence, delay);
}

async function pollChatPresence() {
  if (!shouldPollChat() || chatPollInFlight) {
    scheduleChatPolling();
    return;
  }
  chatPollInFlight = true;
  try {
    const response = await fetch("/api/chat/presence", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        sessionId: chatPresenceSessionId,
        user: currentUser.name,
        channel: activeChatChannel
      })
    });
    if (response.ok) {
      const { activeCount } = await response.json();
      updateChatLiveStatus(activeCount);
      if (Number(activeCount) > 1) {
        await refreshChatMessages(activeChatChannel);
        renderChat();
      }
    }
  } finally {
    chatPollInFlight = false;
    scheduleChatPolling();
  }
}

function updateChatPolling() {
  if (shouldPollChat()) {
    scheduleChatPolling(0);
  } else {
    stopChatPolling();
  }
  updateChatLiveStatus();
}

async function sendChatMessage(event) {
  event.preventDefault();
  const textEl = document.getElementById("chatMessageText");
  const statusEl = document.getElementById("chatStatus");
  const propertyEl = document.getElementById("chatPropertySelect");
  const body = textEl.value.trim();
  if (!body) return;
  const draft = normalizeChatMessage({
    channel: activeChatChannel,
    author: currentUser.name,
    authorRole: currentUser.role,
    body,
    propertyId: propertyEl.value || null
  });
  textEl.disabled = true;
  if (statusEl) statusEl.textContent = "Sending...";
  try {
    if (apiAvailable) {
      const response = await fetch("/api/chat/messages", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(draft)
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || "Could not send message.");
      }
      const { message } = await response.json();
      chatMessages.push(normalizeChatMessage(message));
    } else {
      chatMessages.push(draft);
      storeChatMessages();
      storeLocalState();
    }
    textEl.value = "";
    if (statusEl) statusEl.textContent = "";
    renderChat();
  } catch (error) {
    if (statusEl) statusEl.textContent = error.message || "Message was not sent.";
  } finally {
    textEl.disabled = false;
    textEl.focus();
  }
}

function renderTeam() {
  document.getElementById("teamList").innerHTML = teamMembers.map((member) => `
    <article class="member-card"><strong>${escapeHtml(member.name)}</strong><span class="member-role">· ${roleLabels[member.role] || escapeHtml(member.role)}</span></article>
  `).join("");
  updateNavCounts();
}

function renderFeatureRequests() {
  const list = document.getElementById("featureRequestList");
  if (!list) return;
  setText("featureRequestCount", `${featureRequests.length} request${featureRequests.length === 1 ? "" : "s"}`);
  const sortedRequests = [...featureRequests].sort((a, b) => b.created_at.localeCompare(a.created_at));
  list.innerHTML = sortedRequests
    .map((request) => `
      <button class="feature-request-item" type="button" data-feature-request-id="${request.id}">
        <div>
          <strong>${escapeHtml(request.body)}</strong>
          <span>${escapeHtml(request.requester)} · ${escapeHtml(request.priority)} · ${formatNoteTime(request.created_at)}</span>
        </div>
        <em>${escapeHtml(request.status)}</em>
      </button>
    `).join("") || "<p class=\"empty\">No feature requests yet.</p>";

  list.querySelectorAll("[data-feature-request-id]").forEach((button) => {
    button.addEventListener("click", () => {
      openFeatureRequestDetail(button.dataset.featureRequestId);
    });
  });
  updateNavCounts();
}

function renderFeatureRequestDetail() {
  const panel = document.getElementById("featureRequestDetailPanel");
  if (!panel) return;
  const request = featureRequests.find((item) => item.id === selectedFeatureRequestId) || featureRequests[0];
  if (!request) {
    panel.innerHTML = "<p class=\"empty\">No feature request selected.</p>";
    return;
  }
  selectedFeatureRequestId = request.id;
  panel.innerHTML = `
    <div class="feature-detail-head">
      <div>
        <span class="tiny-label">Feature request</span>
        <h2>${escapeHtml(request.body)}</h2>
        <p>${escapeHtml(request.requester)} submitted this on ${formatNoteTime(request.created_at)}.</p>
      </div>
      <div class="feature-detail-actions">
        <span class="pill blue">${escapeHtml(request.status)}</span>
        <button class="danger-link" type="button" id="deleteFeatureRequestBtn">Delete Request</button>
      </div>
    </div>
    <div class="field-grid">
      ${field("Priority", escapeHtml(request.priority))}
      ${field("Requested By", escapeHtml(request.requester))}
      ${field("Status", escapeHtml(request.status))}
      ${field("Created", formatNoteTime(request.created_at))}
    </div>
    <div class="notes">
      <div class="note"><strong>Request:</strong> ${escapeHtml(request.body)}</div>
      <div class="note"><strong>Next step:</strong> Decide whether this should be built now, later, or closed.</div>
    </div>
  `;
  document.getElementById("deleteFeatureRequestBtn").addEventListener("click", () => {
    deleteFeatureRequest(request.id);
  });
}

function openFeatureRequestDetail(id, push = true) {
  const request = featureRequests.find((item) => item.id === id);
  if (!request) {
    setActiveView("featureRequests");
    renderFeatureRequests();
    if (push || window.location.hash) history.pushState(null, "", window.location.pathname + window.location.search);
    return;
  }
  selectedFeatureRequestId = request.id;
  renderFeatureRequestDetail();
  setActiveView("featureRequestDetail", {
    title: "Feature Request Detail",
    subtitle: request.body
  });
  if (push && window.location.hash !== featureRequestDetailHash(request.id)) {
    history.pushState(null, "", featureRequestDetailHash(request.id));
  }
}

async function addFeatureRequest() {
  const requesterEl = document.getElementById("featureRequester");
  const priorityEl = document.getElementById("featurePriority");
  const textEl = document.getElementById("featureRequestText");
  const body = textEl.value.trim();
  if (!body) return;

  const draft = normalizeFeatureRequest({
    requester: requesterEl.value.trim() || "Team",
    priority: priorityEl.value,
    body
  });

  try {
    const response = await fetch("/api/feature-requests", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(draft)
    });
    if (response.ok) {
      const { featureRequest } = await response.json();
      featureRequests.unshift(normalizeFeatureRequest(featureRequest));
    } else {
      featureRequests.unshift(draft);
      storeFeatureRequests();
    }
  } catch {
    featureRequests.unshift(draft);
    storeFeatureRequests();
  }

  textEl.value = "";
  renderFeatureRequests();
  openFeatureRequestDetail(featureRequests[0].id);
}

async function deleteFeatureRequest(id) {
  const request = featureRequests.find((item) => item.id === id);
  if (!request) return;

  try {
    const response = await fetch(`/api/feature-requests/${id}`, { method: "DELETE" });
    if (!response.ok && response.status !== 204 && response.status !== 404) {
      throw new Error("Could not delete feature request.");
    }
  } catch {
    // Static preview fallback.
  }

  featureRequests = featureRequests.filter((item) => item.id !== id);
  storeFeatureRequests();
  selectedFeatureRequestId = "";
  renderFeatureRequests();
  setActiveView("featureRequests");
  history.pushState(null, "", window.location.pathname + window.location.search);
}

// ── Homes Owned helpers ───────────────────────────────────────────────────────

function getOwned(property) {
  return property.owned || property.source?.owned || {};
}

function isOwnedProperty(property) {
  if (isPassedProperty(property)) return false;
  return recordStageFor(property?.stage) === "Closed";
}

function ownedPhaseFor(property) {
  const owned = getOwned(property);
  if (owned.ownedPhase) return normalizeOwnedPhase(owned.ownedPhase);
  const tl = property.source?.timeline || property.timeline || {};
  if (tl.saleDate || owned.saleCloseDate) return "Sold / Reconciliation";
  if (owned.buyerContractPrice) return "Under Contract";
  if (tl.listDate || owned.listDate || owned.actualListPrice) return "Listed";
  if (tl.rehabStart) return "In Rehab";
  return "Purchased / Not Started";
}

function daysOwnedCount(property) {
  const tl = property.source?.timeline || property.timeline || {};
  const owned = getOwned(property);
  const dateStr = tl.purchaseDate || owned.purchaseCloseDate;
  if (!dateStr) return null;
  const endDate = tl.saleDate || owned.saleCloseDate || todayIso();
  return Math.max(0, Math.floor((new Date(endDate).getTime() - new Date(dateStr).getTime()) / 86400000));
}

function ownedRehabBudget(property) {
  const owned = getOwned(property);
  const originalEstimate = property.underwriting?.rehabEstimate || property.rehab || 0;
  const propertyScopes = Array.isArray(property.scope)
    ? property.scope
    : scopes.filter((s) => s.property_id === property.id);
  const approvedScope = propertyScopes.reduce((sum, s) => sum + (Number(s.estimated_cost) || 0), 0);
  const actualSpend = Number(owned.actualRehabSpend) || 0;
  const budgetBase = approvedScope > 0 ? approvedScope : originalEstimate;
  const remaining = budgetBase - actualSpend;
  const percentUsed = budgetBase > 0 ? actualSpend / budgetBase : 0;
  return { originalEstimate, approvedScope, actualSpend, remaining, percentUsed, overBudget: budgetBase > 0 && actualSpend > budgetBase, atRisk: percentUsed > 0.9 };
}

function ownedHoldingCosts(property) {
  const owned = getOwned(property);
  const days = daysOwnedCount(property) || 0;
  const monthly = Number(owned.monthlyHoldingCost) || 3000;
  const toDate = Math.round(monthly * (days / 30));
  return { monthly, days, toDate };
}

function ownedForecastProfit(property) {
  const owned = getOwned(property);
  const underwriting = property.underwriting || defaultUnderwritingFor(property);
  const arv = Number(owned.forecastArv) || Number(underwriting.arv) || Number(property.arv) || 0;
  const salePrice = Number(owned.buyerContractPrice) || Number(owned.actualListPrice) || Number(owned.targetListPrice) || arv;
  const purchasePrice = Number(owned.actualPurchasePrice) || Number(underwriting.proposedOffer) || Number(property.purchasePrice) || Number(property.targetOfferHigh) || 0;
  const rehab = ownedRehabBudget(property);
  const rehabCost = rehab.actualSpend > 0 ? rehab.actualSpend : (rehab.approvedScope > 0 ? rehab.approvedScope : rehab.originalEstimate);
  const holding = ownedHoldingCosts(property);
  const holdingCost = Math.max(holding.toDate, Number(underwriting.holdingCosts) || 0);
  const closingCosts = Number(underwriting.closingCosts) || Math.round(purchasePrice * 0.02);
  const sellerConcessions = Number(owned.sellerConcessions) || 0;
  const sellingCost = Number(underwriting.sellingCost) || Math.round(salePrice * 0.08);
  const realized = normalizeOwnedPhase(owned.ownedPhase) === "Sold / Reconciliation" ||
    Boolean(owned.saleCloseDate || (property.source?.timeline || property.timeline || {}).saleDate);
  const netProceeds = salePrice - sellerConcessions;
  const forecast = realized
    ? netProceeds - purchasePrice - rehabCost - holding.toDate
    : salePrice - sellerConcessions - purchasePrice - rehabCost - holdingCost - closingCosts - sellingCost;
  const origCalc = calculateUnderwriting(defaultUnderwritingFor(property));
  const cashIn = purchasePrice + rehabCost + (realized ? 0 : closingCosts);
  return {
    forecast,
    originalProfit: origCalc.netProfit,
    variance: forecast - origCalc.netProfit,
    roi: cashIn > 0 ? forecast / cashIn : 0,
    salePrice,
    netProceeds,
    sellerConcessions,
    sellingCost,
    closingCosts,
    holdingCost,
    rehabCost,
    purchasePrice,
    realized
  };
}

function ownedRiskFlags(property) {
  const owned = getOwned(property);
  const tl = property.source?.timeline || property.timeline || {};
  const phase = ownedPhaseFor(property);
  const flags = [];
  const rehab = ownedRehabBudget(property);
  if (rehab.overBudget) flags.push({ label: "Over budget", level: "critical" });
  else if (rehab.atRisk && phase === "In Rehab") flags.push({ label: "Budget >90% used", level: "warn" });
  if (owned.targetRehabComplete && phase === "In Rehab") {
    const daysLeft = Math.ceil((new Date(owned.targetRehabComplete) - new Date()) / 86400000);
    if (daysLeft < 0) flags.push({ label: `Rehab ${Math.abs(daysLeft)}d overdue`, level: "critical" });
    else if (daysLeft <= 7) flags.push({ label: `Rehab due in ${daysLeft}d`, level: "warn" });
  }
  if (phase === "Listed") {
    const listDate = tl.listDate || owned.listDate;
    if (listDate) {
      const daysListed = Math.floor((Date.now() - new Date(listDate).getTime()) / 86400000);
      if (daysListed > 45) flags.push({ label: `Listed ${daysListed}d`, level: "warn" });
    }
  }
  if (phase === "Ready to List" && !(tl.listDate || owned.listDate || owned.targetListPrice)) {
    flags.push({ label: "Listing plan missing", level: "warn" });
  }
  if ((tl.saleDate || owned.saleCloseDate) && (!owned.buyerContractPrice || !owned.actualRehabSpend || !owned.actualPurchasePrice)) {
    flags.push({ label: "Final reconciliation incomplete", level: "warn" });
  }
  return flags;
}

function ownedRiskLevel(property) {
  const flags = ownedRiskFlags(property);
  if (flags.some((f) => f.level === "critical")) return "critical";
  if (flags.some((f) => f.level === "warn")) return "warn";
  return "ok";
}

function ownedProjectTasks(property) {
  return Array.isArray(getOwned(property).projectTasks) ? getOwned(property).projectTasks : [];
}

function ownedBudgetItems(property) {
  return Array.isArray(getOwned(property).budgetItems) ? getOwned(property).budgetItems : [];
}

function ownedMediaItems(property) {
  return Array.isArray(getOwned(property).mediaItems) ? getOwned(property).mediaItems : [];
}

function defaultProjectMilestones(property) {
  const owned = getOwned(property);
  const tl = property.source?.timeline || property.timeline || {};
  const existing = Array.isArray(owned.projectMilestones) ? owned.projectMilestones : [];
  return FLIP_MILESTONE_LABELS.map((label) => {
    const current = existing.find((item) => item.label === label) || {};
    const completedDate = current.completedDate ||
      (label === "Purchased" ? owned.purchaseCloseDate || tl.purchaseDate :
        label === "Listed" ? owned.listDate || tl.listDate :
          label === "Sold" ? owned.saleCloseDate || tl.saleDate : null);
    return {
      id: current.id || label.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
      label,
      status: current.status || (completedDate ? "Done" : "Not Started"),
      targetDate: current.targetDate || "",
      completedDate: completedDate || "",
      notes: current.notes || ""
    };
  });
}

function flipProgress(property) {
  const tasksList = ownedProjectTasks(property);
  if (tasksList.length) {
    const done = tasksList.filter((task) => task.status === "Done").length;
    return Math.round((done / tasksList.length) * 100);
  }
  const milestones = defaultProjectMilestones(property);
  const done = milestones.filter((milestone) => milestone.status === "Done" || milestone.completedDate).length;
  return Math.round((done / milestones.length) * 100);
}

function flipBudgetSummary(property) {
  const items = ownedBudgetItems(property);
  const estimated = items.reduce((sum, item) => sum + (Number(item.estimatedBudget) || 0), 0);
  const actual = items.reduce((sum, item) => sum + (Number(item.actualCost) || 0), 0);
  const rehab = ownedRehabBudget(property);
  const fallbackEstimated = rehab.approvedScope || rehab.originalEstimate || 0;
  const fallbackActual = rehab.actualSpend || 0;
  const totalEstimated = estimated || fallbackEstimated;
  const totalActual = actual || fallbackActual;
  return {
    estimated: totalEstimated,
    actual: totalActual,
    difference: totalEstimated - totalActual,
    percentUsed: totalEstimated > 0 ? Math.round((totalActual / totalEstimated) * 100) : 0
  };
}

function flipTargetListDate(property) {
  const owned = getOwned(property);
  const tl = property.source?.timeline || property.timeline || {};
  const milestone = defaultProjectMilestones(property).find((item) => item.label === "Listed");
  return milestone?.targetDate || owned.listDate || tl.listDate || owned.targetRehabComplete || "";
}

function flipRecentActivity(property) {
  const candidates = [
    ...noteLog.filter((note) => note.property_id === property.id).map((note) => ({
      at: note.created_at,
      text: `${note.type || "Note"}: ${note.body || ""}`
    })),
    ...activityLog.filter((item) => item.property_id === property.id).map((item) => ({
      at: item.created_at,
      text: item.label || item.action || "Activity updated"
    })),
    ...ownedMediaItems(property).map((item) => ({
      at: item.createdAt,
      text: `${item.phase || "Media"} added${item.room ? ` · ${item.room}` : ""}`
    }))
  ].filter((item) => item.at || item.text);
  candidates.sort((a, b) => String(b.at || "").localeCompare(String(a.at || "")));
  return candidates[0]?.text || "No recent activity yet";
}

function displayTaskStatus(status) {
  return status === "Not Started" ? "To Do" : status || "To Do";
}

function taskStatusClass(status) {
  if (status === "Done") return "done";
  if (status === "In Progress") return "progress";
  return "todo";
}

function personInitials(name) {
  return String(name || "Unassigned")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || "")
    .join("") || "UA";
}

function formatProjectDate(date) {
  if (!date) return "No date";
  return new Date(date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function projectPortfolioStatus(property) {
  const phase = ownedPhaseFor(property);
  if (phase === "Sold / Reconciliation") return "Completed";
  if (phase === "Purchased / Not Started") return "Planning";
  if (getOwned(property).onHold) return "On Hold";
  return "In Progress";
}

function addOwnedArrayItem(property, key, item) {
  const owned = getOwned(property);
  return saveOwnedForProperty(property.id, {
    ...owned,
    [key]: [...(Array.isArray(owned[key]) ? owned[key] : []), item]
  });
}

function updateOwnedArrayItem(property, key, itemId, updates) {
  const owned = getOwned(property);
  const list = (Array.isArray(owned[key]) ? owned[key] : []).map((item) =>
    item.id === itemId ? { ...item, ...updates } : item
  );
  return saveOwnedForProperty(property.id, { ...owned, [key]: list });
}

function ownedActionItems(ownedList) {
  return ownedList.flatMap((property) => {
    const owned = getOwned(property);
    const flags = ownedRiskFlags(property).map((flag) => ({
      property,
      label: flag.label,
      level: flag.level,
      action: flag.label
    }));
    if (owned.nextAction) {
      flags.unshift({
        property,
        label: owned.nextAction,
        level: "next",
        action: "Next action"
      });
    }
    if (!flags.length) return [];
    return flags;
  }).sort((a, b) => {
    const weight = { critical: 0, warn: 1, next: 2, ok: 3 };
    return (weight[a.level] ?? 3) - (weight[b.level] ?? 3);
  });
}

function renderOwnedSummarySection(property, suffix) {
  const owned = getOwned(property);
  const tl = property.source?.timeline || property.timeline || {};
  const days = daysOwnedCount(property);
  const profit = ownedForecastProfit(property);
  const flags = ownedRiskFlags(property);
  const phase = ownedPhaseFor(property);
  const purchaseDate = tl.purchaseDate || owned.purchaseCloseDate;
  const riskLevel = ownedRiskLevel(property);
  const riskLabel = { critical: "At Risk", warn: "Watch", ok: "On Track" }[riskLevel];
  const progress = flipProgress(property);
  const budget = flipBudgetSummary(property);
  const milestones = defaultProjectMilestones(property);
  const nextMilestone = milestones.find((item) => item.status !== "Done" && !item.completedDate);
  const targetListDate = flipTargetListDate(property);
  const statusDot = riskLevel === "critical" ? "#c0392b" : riskLevel === "warn" ? "var(--amber)" : "var(--green)";

  return `
    <section class="owned-summary-section flip-dashboard-hero">
      <div class="flip-breadcrumb">Homes Owned <span>/</span> ${escapeHtml(property.address)}</div>
      <div class="flip-dashboard-title">
        <div>
          <h2>${escapeHtml(property.address)}</h2>
          <p>${escapeHtml(property.city)}, ${escapeHtml(property.state)}${days != null ? ` · ${days} days owned` : ""}</p>
        </div>
        <div class="flip-dashboard-actions">
          <button class="secondary-link compact" type="button" data-open-homes-owned>Projects</button>
          <button class="primary compact" type="button" data-open-owned="${property.id}">Edit Project</button>
        </div>
      </div>

      ${flags.length ? `<div class="owned-summary-flags">${flags.map((f) =>
        `<span class="pill ${f.level === "critical" ? "red-pill" : "amber-pill"}">${f.label}</span>`
      ).join("")}</div>` : ""}

      <div class="flip-dashboard-grid">
        <figure class="flip-cover-card">
          <img src="${propertyPhoto(property)}" alt="Main house image for ${escapeHtml(property.address)}">
          <button class="secondary-link compact" type="button" data-open-owned="${property.id}">Change Cover</button>
        </figure>
        <div class="flip-facts-card">
          <div><span>Purchase Date</span><strong>${purchaseDate ? new Date(purchaseDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "Not set"}</strong></div>
          <div><span>Target List Price</span><strong>${money(owned.targetListPrice || owned.actualListPrice || profit.salePrice)}</strong></div>
          <div><span>Purchase Price</span><strong>${money(owned.actualPurchasePrice || property.purchasePrice || property.targetOfferHigh)}</strong></div>
          <div><span>Target List Date</span><strong>${targetListDate || "Not set"}</strong></div>
          <div><span>Estimated ARV</span><strong>${money(owned.forecastArv || property.arv)}</strong></div>
          <div><span>Project Status</span><strong><i style="background:${statusDot}"></i>${phase}</strong></div>
        </div>
      </div>

      <div class="flip-dashboard-kpis">
        <div>
          <span>Progress</span>
          <strong>${progress}%</strong>
          <div class="flip-meter"><span style="width:${Math.min(100, progress)}%"></span></div>
        </div>
        <div>
          <span>Budget Used</span>
          <strong>${budget.percentUsed}%</strong>
          <div class="flip-meter"><span style="width:${Math.min(100, budget.percentUsed)}%;background:${budget.percentUsed > 100 ? "#c0392b" : "var(--amber)"}"></span></div>
        </div>
        <div>
          <span>Next Milestone</span>
          <strong>${nextMilestone ? escapeHtml(nextMilestone.label) : "Complete"}</strong>
          <em>${nextMilestone?.targetDate || targetListDate || "No target date"}</em>
        </div>
      </div>

      <div class="flip-dashboard-tabs">
        <button class="active" type="button">Overview</button>
        <button type="button">Tasks <span>${ownedProjectTasks(property).length}</span></button>
        <button type="button">Budget</button>
        <button type="button">Photos / Videos</button>
        <button type="button">Timeline</button>
        <button type="button">Notes</button>
      </div>

      <div class="flip-overview-panels">
        <section>
          <h3>Recent Activity</h3>
          <div class="flip-activity-list">
            ${[
              ...ownedProjectTasks(property).slice(0, 2).map((task) => `${task.status === "Done" ? "Task completed" : "Task updated"}: ${task.name}`),
              ...ownedMediaItems(property).slice(0, 2).map((item) => `${item.type || "Media"} added to ${item.room || "project"} - ${item.phase || "Progress"}`),
              ...ownedBudgetItems(property).slice(0, 1).map((item) => `Budget item updated: ${item.category}`)
            ].slice(0, 5).map((item) => `<div><span></span><strong>${escapeHtml(item)}</strong><em>${escapeHtml(formatNoteTime(new Date().toISOString()))}</em></div>`).join("") || "<p class=\"empty compact-empty\">No project activity yet.</p>"}
          </div>
        </section>
        <section>
          <h3>Project Notes</h3>
          ${(noteLog.filter((note) => note.property_id === property.id).slice(0, 4).map((note) =>
            `<p>${escapeHtml(note.body)}</p>`
          ).join("")) || `<p>${escapeHtml(owned.nextAction || "Use notes for lockbox codes, paint colors, contractor notes, materials, problems found, permit notes, and listing ideas.")}</p>`}
        </section>
      </div>
    </section>
  `;
}

function renderOwnedProjectWorkflow(property, suffix) {
  const owned = getOwned(property);
  const phase = ownedPhaseFor(property);
  const tasksList = ownedProjectTasks(property);
  const budgetItems = ownedBudgetItems(property);
  const mediaItems = ownedMediaItems(property);
  const milestones = defaultProjectMilestones(property);
  const budget = flipBudgetSummary(property);
  const progress = flipProgress(property);
  const nextMilestone = milestones.find((item) => item.status !== "Done" && !item.completedDate);
  const optionTags = (items, selected = "") => items.map((item) =>
    `<option value="${escapeHtml(item)}"${item === selected ? " selected" : ""}>${escapeHtml(item)}</option>`
  ).join("");
  const mediaGroups = FLIP_MEDIA_ROOMS.map((room) => ({
    room,
    items: mediaItems.filter((item) => item.room === room)
  })).filter((group) => group.items.length);
  const taskCounts = {
    all: tasksList.length,
    todo: tasksList.filter((task) => task.status !== "Done" && task.status !== "In Progress").length,
    progress: tasksList.filter((task) => task.status === "In Progress").length,
    done: tasksList.filter((task) => task.status === "Done").length
  };
  const categoryOptions = [...new Set([...FLIP_TASK_PHASES, ...tasksList.map((task) => task.category).filter(Boolean)])];
  const projectNotes = noteLog.filter((note) => note.property_id === property.id);
  const noteCategories = ["General", "Contractors", "Materials", "Finishes", "Permits", "Listing", "Ideas"];
  const selectedNote = projectNotes[0] || null;
  const noteTitle = (note) => String(note?.body || "Project Note").split(/[.\n]/)[0].slice(0, 42) || "Project Note";

  return `
    <section class="flip-project-section">
      <div class="flip-project-head">
        <div>
          <h3>Flip Project</h3>
          <p>${phase} · ${progress}% complete · ${nextMilestone ? `Next: ${escapeHtml(nextMilestone.label)}` : "Project complete"}</p>
        </div>
        <div class="owned-sale-actions">
          <button class="secondary-link compact" type="button" data-owned-phase-set="${property.id}" data-phase="In Rehab">In Rehab</button>
          <button class="secondary-link compact" type="button" data-owned-phase-set="${property.id}" data-phase="Ready to List">Ready to List</button>
          <button class="secondary-link compact" type="button" data-owned-phase-set="${property.id}" data-phase="Listed">Listed</button>
          <button class="secondary-link compact" type="button" data-open-owned="${property.id}">Sale Details</button>
        </div>
      </div>

      <div class="flip-overview-grid">
        <div>
          <span class="tiny-label">Progress</span>
          <strong>${progress}%</strong>
          <div class="flip-meter"><span style="width:${Math.min(100, progress)}%"></span></div>
        </div>
        <div>
          <span class="tiny-label">Budget Used</span>
          <strong>${budget.percentUsed}%</strong>
          <div class="flip-meter"><span style="width:${Math.min(100, budget.percentUsed)}%;background:${budget.percentUsed > 100 ? "#c0392b" : "var(--green)"}"></span></div>
        </div>
        <div>
          <span class="tiny-label">Target List Date</span>
          <strong>${flipTargetListDate(property) || "Not set"}</strong>
        </div>
        <div>
          <span class="tiny-label">Recent Activity</span>
          <strong>${escapeHtml(flipRecentActivity(property)).slice(0, 90)}</strong>
        </div>
      </div>

      <div class="flip-workspace-grid">
        <section class="flip-workspace-card flip-tasks-panel">
          <div class="flip-task-page-head">
            <div>
              <h4>Tasks</h4>
              <p>Track the work that moves this house from purchase to listing.</p>
            </div>
            <button class="primary compact" type="button" id="flipFocusTask-${suffix}">+ New Task</button>
          </div>
          <div class="flip-task-toolbar">
            <div class="flip-task-tabs" aria-label="Task status filters">
              <button class="active" type="button">All <span>${taskCounts.all}</span></button>
              <button type="button">To Do <span>${taskCounts.todo}</span></button>
              <button type="button">In Progress <span>${taskCounts.progress}</span></button>
              <button type="button">Done <span>${taskCounts.done}</span></button>
            </div>
            <div class="flip-task-actions">
              <select aria-label="Task category filter">
                <option>All Categories</option>
                ${categoryOptions.map((category) => `<option>${escapeHtml(category)}</option>`).join("")}
              </select>
              <button class="secondary-link compact" type="button">Filters</button>
            </div>
          </div>
          <div class="flip-task-form">
            <input id="flipTaskName-${suffix}" placeholder="Task, e.g. install cabinets">
            <select id="flipTaskPhase-${suffix}">${optionTags(FLIP_TASK_PHASES)}</select>
            <select id="flipTaskStatus-${suffix}">${optionTags(FLIP_TASK_STATUSES)}</select>
            <input id="flipTaskDue-${suffix}" type="date" aria-label="Task due date">
            <select id="flipTaskOwner-${suffix}">
              <option value="">Unassigned</option>
              ${teamMembers.map((member) => `<option>${escapeHtml(member.name)}</option>`).join("")}
            </select>
            <input id="flipTaskPhoto-${suffix}" placeholder="Optional photo link">
            <textarea id="flipTaskNotes-${suffix}" placeholder="Notes"></textarea>
            <button type="button" id="flipAddTask-${suffix}">Add Task</button>
          </div>
          <span class="form-status" id="flipTaskStatusMsg-${suffix}"></span>
          <div class="flip-task-table">
            <div class="flip-task-row flip-task-header">
              <span></span>
              <strong>Task</strong>
              <strong>Category</strong>
              <strong>Assignee</strong>
              <strong>Due Date</strong>
              <strong>Status</strong>
              <strong>Actions</strong>
            </div>
            ${tasksList.map((task) => `
              <div class="flip-task-row">
                <label class="flip-task-check">
                  <input type="checkbox" data-flip-task-done="${escapeHtml(task.id)}" ${task.status === "Done" ? "checked" : ""}>
                  <span></span>
                </label>
                <div class="flip-task-name">
                  <strong>${escapeHtml(task.name)}</strong>
                  ${task.notes ? `<em>${escapeHtml(task.notes)}</em>` : ""}
                </div>
                <div class="flip-task-category">
                  <i>${escapeHtml((task.category || "General").slice(0, 1))}</i>
                  <span>${escapeHtml(task.category || "General")}</span>
                </div>
                <div class="flip-task-assignee">
                  <i>${escapeHtml(personInitials(task.assignedPerson))}</i>
                  <span>${escapeHtml(task.assignedPerson || "Unassigned")}</span>
                </div>
                <div class="flip-task-date">${formatProjectDate(task.dueDate)}</div>
                <div><span class="flip-status ${taskStatusClass(task.status)}">${escapeHtml(displayTaskStatus(task.status))}</span></div>
                <button class="flip-row-menu" type="button" aria-label="Task actions">⋮</button>
              </div>
            `).join("") || `
              <div class="flip-task-empty">
                <strong>No tasks yet</strong>
                <span>Add demo, construction, finishes, photo, and listing tasks as soon as the property closes.</span>
              </div>
            `}
          </div>
        </section>

        <section class="flip-workspace-card">
          <div class="flip-card-title">
            <h4>Budget</h4>
            <span>${money(budget.actual)} / ${money(budget.estimated)}</span>
          </div>
          <div class="flip-budget-summary">
            <div><span>Estimated</span><strong>${money(budget.estimated)}</strong></div>
            <div><span>Actual</span><strong>${money(budget.actual)}</strong></div>
            <div><span>Difference</span><strong class="${budget.difference >= 0 ? "positive" : "negative"}">${budget.difference >= 0 ? "+" : ""}${money(budget.difference)}</strong></div>
          </div>
          <div class="flip-budget-form">
            <select id="flipBudgetCategory-${suffix}">${optionTags(FLIP_BUDGET_CATEGORIES)}</select>
            <input id="flipBudgetEstimate-${suffix}" class="money-input" placeholder="Estimated">
            <input id="flipBudgetActual-${suffix}" class="money-input" placeholder="Actual">
            <select id="flipBudgetStatus-${suffix}">${optionTags(["Planned", "In Progress", "Done"])}</select>
            <input id="flipBudgetNotes-${suffix}" placeholder="Notes">
            <button type="button" id="flipAddBudget-${suffix}">Add</button>
          </div>
          <span class="form-status" id="flipBudgetStatusMsg-${suffix}"></span>
          <div class="flip-list">
            ${budgetItems.map((item) => `
              <article class="flip-budget-row">
                <strong>${escapeHtml(item.category)}</strong>
                <span>${money(Number(item.estimatedBudget) || 0)} est</span>
                <span>${money(Number(item.actualCost) || 0)} actual</span>
                <em>${escapeHtml(item.status || "Planned")}</em>
              </article>
            `).join("") || "<p class=\"empty compact-empty\">No budget items yet. Add the major rehab categories as costs become real.</p>"}
          </div>
        </section>

        <section class="flip-workspace-card">
          <div class="flip-card-title">
            <h4>Photos / Videos</h4>
            <span>${mediaItems.length} item${mediaItems.length === 1 ? "" : "s"}</span>
          </div>
          <div class="flip-media-form">
            <input id="flipMediaUrl-${suffix}" placeholder="Photo/video link">
            <input id="flipMediaFile-${suffix}" type="file" accept="image/*,video/*">
            <select id="flipMediaType-${suffix}">${optionTags(["Photo", "Video"])}</select>
            <select id="flipMediaRoom-${suffix}">${optionTags(FLIP_MEDIA_ROOMS)}</select>
            <select id="flipMediaPhase-${suffix}">${optionTags(FLIP_MEDIA_PHASES)}</select>
            <input id="flipMediaCaption-${suffix}" placeholder="Caption">
            <button type="button" id="flipAddMedia-${suffix}">Add Media</button>
          </div>
          <span class="form-status" id="flipMediaStatusMsg-${suffix}"></span>
          <div class="flip-media-groups">
            ${mediaGroups.map((group) => `
              <div class="flip-media-group">
                <strong>${escapeHtml(group.room)}</strong>
                <div class="flip-media-strip">
                  ${group.items.map((item) => `
                    <a href="${escapeHtml(item.url)}" target="_blank" rel="noreferrer">
                      <span class="flip-media-preview">${mediaPreview(item, property)}</span>
                      <span>${escapeHtml(item.type || "Media")}</span>
                      <em>${escapeHtml(item.phase || "Progress")}</em>
                      ${item.caption ? `<small>${escapeHtml(item.caption)}</small>` : ""}
                    </a>
                  `).join("")}
                </div>
              </div>
            `).join("") || "<p class=\"empty compact-empty\">No media yet. Add before, progress, finished, and listing links by room.</p>"}
          </div>
        </section>

        <section class="flip-workspace-card">
          <div class="flip-card-title">
            <h4>Timeline</h4>
            <span>${milestones.filter((item) => item.status === "Done" || item.completedDate).length}/${milestones.length} milestones</span>
          </div>
          <div class="flip-milestone-list">
            ${milestones.map((milestone) => `
              <article class="flip-milestone" data-milestone-id="${escapeHtml(milestone.id)}">
                <strong>${escapeHtml(milestone.label)}</strong>
                <select data-flip-milestone-field="status">${optionTags(FLIP_TASK_STATUSES, milestone.status)}</select>
                <input type="date" data-flip-milestone-field="targetDate" value="${escapeHtml(milestone.targetDate || "")}" aria-label="${escapeHtml(milestone.label)} target date">
                <input type="date" data-flip-milestone-field="completedDate" value="${escapeHtml(milestone.completedDate || "")}" aria-label="${escapeHtml(milestone.label)} completed date">
                <input data-flip-milestone-field="notes" value="${escapeHtml(milestone.notes || "")}" placeholder="Notes">
              </article>
            `).join("")}
          </div>
          <button class="secondary-link compact" type="button" id="flipSaveMilestones-${suffix}">Save Timeline</button>
          <span class="form-status" id="flipMilestoneStatusMsg-${suffix}"></span>
        </section>

        <section class="flip-workspace-card flip-notes-panel">
          <div class="flip-notes-head">
            <div>
              <h4>Notes</h4>
              <p>All project notes, details, ideas, and important information in one place.</p>
            </div>
            <div class="flip-notes-actions">
              <input id="flipNoteSearch-${suffix}" placeholder="Search notes...">
              <button class="primary compact" type="button" id="flipFocusNote-${suffix}">+ New Note</button>
            </div>
          </div>
          <div class="flip-note-tabs">
            <button class="active" type="button">All Notes <span>${projectNotes.length}</span></button>
            ${noteCategories.map((category) => `
              <button type="button">${category} <span>${projectNotes.filter((note) => note.type === category).length}</span></button>
            `).join("")}
          </div>
          <div class="flip-note-composer">
            <select id="flipNoteAuthor-${suffix}" aria-label="Note author">
              ${teamMembers.map((member) => `<option>${escapeHtml(member.name)}</option>`).join("")}
            </select>
            <select id="flipNoteType-${suffix}" aria-label="Note category">
              ${noteCategories.map((category) => `<option>${escapeHtml(category)}</option>`).join("")}
            </select>
            <textarea id="flipNoteText-${suffix}" placeholder="Add lockbox codes, paint colors, contractor notes, material selections, permit notes, problems found, or listing ideas..."></textarea>
            <button type="button" id="flipAddNote-${suffix}">Add Note</button>
          </div>
          <span class="form-status" id="flipNoteStatusMsg-${suffix}"></span>
          <div class="flip-notes-layout">
            <aside class="flip-note-list">
              <div class="flip-note-list-head">
                <strong>Notes (${projectNotes.length})</strong>
                <span>Most Recent</span>
              </div>
              ${projectNotes.map((note, index) => `
                <article class="flip-note-item ${index === 0 ? "active" : ""}">
                  <i>${escapeHtml((note.type || "G").slice(0, 1))}</i>
                  <div>
                    <strong>${escapeHtml(noteTitle(note))}</strong>
                    <p>${escapeHtml(note.body || "").slice(0, 92)}${String(note.body || "").length > 92 ? "..." : ""}</p>
                    <span>${formatNoteTime(note.created_at)}</span>
                  </div>
                  <button class="flip-row-menu" type="button" aria-label="Note actions">⋮</button>
                </article>
              `).join("") || `
                <div class="flip-task-empty">
                  <strong>No notes yet</strong>
                  <span>Add lockbox codes, paint colors, contractor notes, materials, permit notes, and listing ideas.</span>
                </div>
              `}
            </aside>
            <article class="flip-note-detail">
              ${selectedNote ? `
                <div class="flip-note-detail-head">
                  <span>${escapeHtml(selectedNote.type || "General")}</span>
                  <button class="secondary-link compact" type="button">Edit</button>
                </div>
                <h3>${escapeHtml(noteTitle(selectedNote))}</h3>
                <p class="flip-note-meta">${formatNoteTime(selectedNote.created_at)} · ${escapeHtml(selectedNote.author || "Team")}</p>
                <div class="flip-note-body">${escapeHtml(selectedNote.body || "").replace(/\n/g, "<br>")}</div>
                <div class="flip-note-tags">
                  <span>${escapeHtml(selectedNote.type || "General")}</span>
                  <span>${escapeHtml(property.address)}</span>
                </div>
              ` : `
                <h3>Project Notes</h3>
                <div class="flip-note-body">Use this area for lockbox codes, paint colors, contractor notes, material selections, problems found, permit notes, and listing ideas.</div>
              `}
            </article>
          </div>
        </section>
      </div>
    </section>
  `;
}

function renderOwnershipStartSection(property) {
  return `
    <section class="owned-start-section">
      <div>
        <h3>Mark as Purchased</h3>
        <p>Use this after closing. It moves the house into Homes Owned and opens purchase, budget, rehab, listing, and sale tracking.</p>
      </div>
      <button class="primary compact" type="button" data-start-owned="${property.id}">
        Mark as Purchased
      </button>
    </section>
  `;
}

function decisionSignalFor(property, calc) {
  if (!isAvailableListing(property)) return ["Unavailable", "This listing is pending, closed, or not clearly buyable.", "review"];
  if ((property.score || 0) >= 80 && calc.roi >= 0.18 && calc.netProfit > 0) {
    return ["Strong Buy Candidate", "Score, ROI, and profit all clear the current target.", "strong"];
  }
  if ((property.score || 0) >= 70 && calc.netProfit > 0) {
    return ["Workable Candidate", "Worth underwriting deeper before making an offer.", "workable"];
  }
  return ["Needs Review", "Confirm ARV, rehab, motivation, and listing status before pursuing.", "review"];
}

function renderDecisionPanel(property, calc) {
  const [label, body, tone] = decisionSignalFor(property, calc);
  return `
    <section class="decision-panel ${tone}">
      <div>
        <span class="tiny-label">Decision Signal</span>
        <h3>${escapeHtml(label)}</h3>
        <p>${escapeHtml(body)}</p>
      </div>
      <div class="decision-panel-grid">
        <div><span>Lead Score</span><strong>${property.score || 0}</strong></div>
        <div><span>Max Offer</span><strong>${money(calc.recommendedMaxOffer)}</strong></div>
        <div><span>Est. Profit</span><strong>${money(calc.netProfit)}</strong></div>
        <div><span>ROI</span><strong>${percent(calc.roi)}</strong></div>
      </div>
      <div class="decision-panel-actions">
        <button class="primary compact" type="button" data-open-calculator="${escapeHtml(property.id)}">Open Calculator</button>
        <button class="secondary-link compact" type="button" data-copy-offer="${escapeHtml(property.id)}">Copy Offer Range</button>
      </div>
    </section>
  `;
}

// ── Homes Owned render ────────────────────────────────────────────────────────

function renderOwnedStats(ownedList) {
  const el = document.getElementById("homesOwnedStats");
  if (!el) return;
  el.style.display = "none";
  el.innerHTML = "";
}

function renderOwnedCard(property) {
  const owned = getOwned(property);
  const status = projectPortfolioStatus(property);
  const progress = flipProgress(property);
  const budget = flipBudgetSummary(property);
  const targetDate = flipTargetListDate(property);
  const updated = formatNoteTime(
    [...noteLog.filter((note) => note.property_id === property.id).map((note) => note.created_at), todayIso()]
      .sort()
      .at(-1)
  );
  const owner = owned.assignedOwner || "Team";
  const statusClass = status.toLowerCase().replace(/\s+/g, "-");
  const dateLabel = status === "Completed" ? "Sold Date" : "Target List Date";
  const dateValue = status === "Completed"
    ? (owned.saleCloseDate || property.timeline?.saleDate || "Not set")
    : (targetDate || "Not set");

  return `
    <article class="owned-card flip-project-card">
      <div class="flip-project-thumb">
        <img src="${propertyPhoto(property)}" alt="${escapeHtml(property.address)}">
        <span class="flip-project-status ${statusClass}">${escapeHtml(status)}</span>
        <button class="flip-project-menu" type="button" aria-label="Project actions">⋮</button>
      </div>
      <div class="flip-project-card-body">
        <h3>${escapeHtml(property.address)}</h3>
        <p>${escapeHtml(property.city)}, ${escapeHtml(property.state)}</p>
        <div class="flip-project-metric">
          <div><span>Progress</span><strong>${progress}%</strong></div>
          <div class="flip-meter"><span style="width:${Math.min(100, progress)}%"></span></div>
        </div>
        <div class="flip-project-metric">
          <div><span>Budget Used</span><strong>${budget.percentUsed}%</strong></div>
          <div class="flip-meter budget"><span style="width:${Math.min(100, budget.percentUsed)}%"></span></div>
        </div>
        <div class="flip-project-date">
          <span>${dateLabel}</span>
          <strong>${escapeHtml(dateValue)}</strong>
        </div>
        <footer>
          <span>Updated ${escapeHtml(updated || "recently")}</span>
          <i>${escapeHtml(personInitials(owner))}</i>
        </footer>
        <button class="flip-project-open" type="button" data-property-id="${property.id}" aria-label="Open ${escapeHtml(property.address)}"></button>
      </div>
    </article>
  `;
}

function ownedMatchesFilters(property) {
  const status = projectPortfolioStatus(property);
  const owner = getOwned(property).assignedOwner || "Unassigned";
  const risk = ownedRiskLevel(property);
  const flags = ownedRiskFlags(property).map((flag) => flag.label);
  const missingData = flags.some((label) => /Missing|No |missing|incomplete/i.test(label));
  const query = String(ownedFilters.search || "").trim().toLowerCase();
  if (query && ![
    property.address,
    property.city,
    property.state,
    owner,
    status
  ].filter(Boolean).join(" ").toLowerCase().includes(query)) return false;
  if (ownedFilters.flaggedOnly && !flags.length) return false;
  if (ownedFilters.phase !== "All" && status !== ownedFilters.phase) return false;
  if (ownedFilters.owner !== "All" && owner !== ownedFilters.owner) return false;
  if (ownedFilters.risk === "Watch" && risk !== "warn") return false;
  if (ownedFilters.risk === "At Risk" && risk !== "critical") return false;
  if (ownedFilters.missingOnly && !missingData) return false;
  return true;
}

function renderOwnedControls(ownedList) {
  const owners = [...new Set(ownedList.map((property) => getOwned(property).assignedOwner || "Unassigned"))].sort();
  const option = (value, selected) => `<option value="${escapeHtml(value)}"${value === selected ? " selected" : ""}>${escapeHtml(value)}</option>`;
  const statuses = ["All", "In Progress", "Planning", "Completed", "On Hold"];
  const countFor = (status) => status === "All"
    ? ownedList.length
    : ownedList.filter((property) => projectPortfolioStatus(property) === status).length;
  return `
    <section class="owned-controls project-controls">
      <div class="project-tabs-row">
        <div class="owned-phase-tabs" role="tablist" aria-label="Project status filter">
          ${statuses.map((status) => `
            <button class="${ownedFilters.phase === status ? "active" : ""}" type="button" data-owned-phase-filter="${escapeHtml(status)}">
              ${status === "All" ? "All Projects" : escapeHtml(status)} <span>${countFor(status)}</span>
            </button>
          `).join("")}
        </div>
        <div class="project-view-toggles">
          <button class="active" type="button" aria-label="Grid view">▦</button>
          <button type="button" aria-label="List view">☷</button>
        </div>
      </div>
      <div class="owned-filter-row project-filter-row">
        <label>Owner
          <select id="ownedFilterOwner">
            ${["All", ...owners].map((value) => option(value, ownedFilters.owner)).join("")}
          </select>
        </label>
        <label>Risk
          <select id="ownedFilterRisk">
            ${["All", "Watch", "At Risk"].map((value) => option(value, ownedFilters.risk)).join("")}
          </select>
        </label>
        <label class="owned-toggle">
          <input id="ownedFilterMissing" type="checkbox" ${ownedFilters.missingOnly ? "checked" : ""}>
          Missing Data Only
        </label>
        ${ownedFilters.flaggedOnly ? `<button class="secondary-link compact" type="button" id="clearOwnedAlertFilter">Showing owned alerts ×</button>` : ""}
      </div>
    </section>
  `;
}

function renderOwnedActionQueue(ownedList) {
  const actions = ownedActionItems(ownedList).slice(0, 8);
  return `
    <section class="owned-action-queue panel">
      <div class="panel-head">
        <div>
          <h2>Owned Action Queue</h2>
          <p>Highest priority ownership blockers and next actions.</p>
        </div>
        <span class="pill">${actions.length} shown</span>
      </div>
      <div class="owned-action-list">
        ${actions.map((item) => `
          <button class="owned-action-item" type="button" data-property-id="${item.property.id}">
            <span class="risk-badge risk-${item.level === "critical" ? "critical" : item.level === "warn" ? "warn" : "ok"}">${escapeHtml(item.action)}</span>
            <strong>${escapeHtml(item.property.address)}</strong>
            <span>${escapeHtml(item.label)}</span>
          </button>
        `).join("") || "<p class=\"empty\">No ownership actions. Everything has an owner, date, and next step.</p>"}
      </div>
    </section>
  `;
}

function renderHomesOwned() {
  const board = document.getElementById("homesOwnedBoard");
  if (!board) return;
  const owned = activeProperties().filter(isOwnedProperty);
  renderOwnedStats(owned);
  if (!owned.length) {
    board.innerHTML = `
      ${ownedPageHead("Projects", "Manage all of your house flip projects in one place.", `<button class="primary compact" type="button" id="ownedCreateProjectTopBtn">+ New Project</button>`)}
      ${ownedEmptyState()}`;
    document.getElementById("ownedCreateProjectTopBtn")?.addEventListener("click", () => {
      document.getElementById("newPropertyBtn")?.click();
    });
    bindOwnedEmptyState(board);
    updateNavCounts();
    return;
  }
  const filtered = owned.filter(ownedMatchesFilters);
  board.innerHTML = `
    ${ownedPageHead("Projects", "Manage all of your house flip projects in one place.", `
      <input class="owned-search-input" id="ownedProjectSearchTop" placeholder="Search projects..." value="${escapeHtml(ownedFilters.search || "")}">
      <button class="secondary-link compact" type="button">Filter</button>
      <button class="secondary-link compact" type="button">Sort</button>
      <button class="primary compact" type="button" id="ownedCreateProjectTopBtn">+ New Project</button>
    `)}
    ${renderOwnedControls(owned)}
    ${filtered.length ? "" : "<p class=\"owned-empty\">No owned homes match the current filters.</p>"}
    <section class="owned-phase-section">
      <div class="owned-cards">${filtered.map(renderOwnedCard).join("")}</div>
      <p class="project-showing">Showing ${filtered.length ? `1 to ${filtered.length}` : "0"} of ${owned.length} projects</p>
    </section>
  `;
  board.querySelectorAll("[data-owned-phase-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      ownedFilters.phase = button.dataset.ownedPhaseFilter;
      ownedFilters.flaggedOnly = false;
      renderHomesOwned();
    });
  });
  [["ownedFilterOwner", "owner"], ["ownedFilterRisk", "risk"]].forEach(([id, key]) => {
    document.getElementById(id)?.addEventListener("change", (event) => {
      ownedFilters[key] = event.target.value;
      ownedFilters.flaggedOnly = false;
      renderHomesOwned();
    });
  });
  document.getElementById("ownedFilterMissing")?.addEventListener("change", (event) => {
    ownedFilters.missingOnly = event.target.checked;
    ownedFilters.flaggedOnly = false;
    renderHomesOwned();
  });
  document.getElementById("clearOwnedAlertFilter")?.addEventListener("click", () => {
    ownedFilters.flaggedOnly = false;
    renderHomesOwned();
  });
  document.getElementById("ownedProjectSearchTop")?.addEventListener("input", (event) => {
    ownedFilters.search = event.target.value;
    renderHomesOwned();
  });
  document.getElementById("ownedCreateProjectTopBtn")?.addEventListener("click", () => {
    document.getElementById("newPropertyBtn")?.click();
  });
  board.querySelectorAll("[data-property-id]").forEach((btn) => {
    btn.addEventListener("click", () => openPropertyDetail(btn.dataset.propertyId));
  });
  board.querySelectorAll("[data-open-owned]").forEach((btn) => {
    btn.addEventListener("click", () => openOwnedModal(btn.dataset.openOwned));
  });
  updateNavCounts();
}

function ownedProjectCard(property, body) {
  return `
    <article class="stack-card">
      <strong>${escapeHtml(property.address)}</strong>
      <p>${body}</p>
      <div class="meta">
        <span class="pill">${escapeHtml(ownedPhaseFor(property))}</span>
        <button class="secondary-link compact" type="button" data-property-id="${escapeHtml(property.id)}">Open Project</button>
      </div>
    </article>
  `;
}

function filteredCalendarEvents(owned) {
  return ownedCalendarEvents(owned).filter((event) => {
    const projectMatch = calendarState.projectId === "All" || event.property.id === calendarState.projectId;
    const typeMatch = calendarState.type === "All" || event.type === calendarState.type;
    return projectMatch && typeMatch;
  });
}

function renderCalendarEventButton(event) {
  return `
    <button class="calendar-event ${calendarEventTone(event.status)}" type="button" draggable="true"
      data-calendar-event-id="${escapeHtml(event.id)}" data-property-id="${event.property.id}">
      <span></span><strong>${escapeHtml(event.title)}</strong><em>${escapeHtml(event.property.address)}</em>
    </button>
  `;
}

async function moveCalendarEvent(eventId, newDate) {
  const event = ownedCalendarEvents(ownedProjects()).find((item) => item.id === eventId);
  if (!event || event.date === newDate) return;
  const property = propertyById(event.property.id);
  if (!property) return;
  const owned = getOwned(property);
  if (event.sourceKind === "task") {
    await updateOwnedArrayItem(property, "projectTasks", event.sourceId, { dueDate: newDate, updatedAt: new Date().toISOString() });
  } else if (event.sourceKind === "milestone") {
    const milestones = defaultProjectMilestones(property).map((milestone) =>
      milestone.id === event.sourceId ? { ...milestone, [event.dateField]: newDate } : milestone
    );
    await saveOwnedForProperty(property.id, { ...owned, projectMilestones: milestones });
  } else if (event.sourceKind === "ownedDate") {
    await saveOwnedForProperty(property.id, { ...owned, [event.dateField]: newDate });
  }
  calendarState.date = newDate;
  renderOwnedContextViews();
  renderTasks();
  updateNavCounts();
}

function bindOwnedCalendar(root) {
  root.querySelector("#calendarTodayBtn")?.addEventListener("click", () => {
    calendarState.date = todayIso();
    renderOwnedCalendar();
  });
  root.querySelector("#calendarPrevBtn")?.addEventListener("click", () => {
    calendarState.date = calendarState.view === "Week" ? addDaysIso(calendarState.date, -7) : addMonthsIso(calendarState.date, -1);
    renderOwnedCalendar();
  });
  root.querySelector("#calendarNextBtn")?.addEventListener("click", () => {
    calendarState.date = calendarState.view === "Week" ? addDaysIso(calendarState.date, 7) : addMonthsIso(calendarState.date, 1);
    renderOwnedCalendar();
  });
  root.querySelector("#calendarProjectFilter")?.addEventListener("change", (event) => {
    calendarState.projectId = event.target.value;
    renderOwnedCalendar();
  });
  root.querySelector("#calendarTypeFilter")?.addEventListener("change", (event) => {
    calendarState.type = event.target.value;
    renderOwnedCalendar();
  });
  root.querySelector("#calendarClearFilters")?.addEventListener("click", () => {
    calendarState.projectId = "All";
    calendarState.type = "All";
    renderOwnedCalendar();
  });
  root.querySelectorAll("[data-calendar-view]").forEach((button) => {
    button.addEventListener("click", () => {
      calendarState.view = button.dataset.calendarView;
      renderOwnedCalendar();
    });
  });
  root.querySelectorAll("[data-calendar-date]").forEach((button) => {
    button.addEventListener("click", () => {
      calendarState.date = button.dataset.calendarDate;
      if (calendarState.view === "List") calendarState.view = "Month";
      renderOwnedCalendar();
    });
  });
  root.querySelectorAll("[data-calendar-event-id]").forEach((button) => {
    button.addEventListener("click", () => openPropertyDetail(button.dataset.propertyId));
    button.addEventListener("dragstart", (event) => {
      event.dataTransfer.setData("text/plain", button.dataset.calendarEventId);
      event.dataTransfer.effectAllowed = "move";
      button.classList.add("dragging");
    });
    button.addEventListener("dragend", () => button.classList.remove("dragging"));
  });
  root.querySelectorAll("[data-calendar-drop-date]").forEach((day) => {
    day.addEventListener("dragover", (event) => {
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      day.classList.add("drag-over");
    });
    day.addEventListener("dragleave", (event) => {
      if (!day.contains(event.relatedTarget)) day.classList.remove("drag-over");
    });
    day.addEventListener("drop", async (event) => {
      event.preventDefault();
      day.classList.remove("drag-over");
      const eventId = event.dataTransfer.getData("text/plain");
      if (eventId) await moveCalendarEvent(eventId, day.dataset.calendarDropDate);
    });
  });
}

function renderOwnedCalendar() {
  const view = document.getElementById("ownedCalendarView");
  if (!view) return;
  const owned = ownedProjects();
  if (!owned.length) {
    view.innerHTML = `<section class="owned-page">${ownedPageHead("Calendar", "View all project tasks, milestones, and important dates in one place.")}${ownedEmptyState("No project calendar yet")}</section>`;
    bindOwnedEmptyState(view);
    return;
  }
  const anchor = dateFromIso(calendarState.date);
  const year = anchor.getFullYear();
  const month = anchor.getMonth();
  const monthName = anchor.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  const first = new Date(year, month, 1);
  const events = filteredCalendarEvents(owned);
  const upcoming = events.filter((event) => event.date >= todayIso()).slice(0, 5);
  const days = monthDays(calendarState.date).map((day) => ({ ...day, dayEvents: events.filter((event) => event.date === day.iso) }));
  const week = weekDays(calendarState.date).map((day) => ({ ...day, dayEvents: events.filter((event) => event.date === day.iso) }));
  const visibleEvents = calendarState.view === "List"
    ? events.filter((event) => event.date >= todayIso()).slice(0, 25)
    : [];
  view.innerHTML = `
    <section class="owned-page calendar-page">
      ${ownedPageHead("Calendar", "View all project tasks, milestones, and important dates in one place.", `
        <select class="owned-compact-select" id="calendarProjectFilter"><option value="All">All Projects</option>${owned.map((property) => `<option value="${property.id}" ${calendarState.projectId === property.id ? "selected" : ""}>${escapeHtml(property.address)}</option>`).join("")}</select>
        <select class="owned-compact-select" id="calendarTypeFilter"><option value="All">All Types</option>${["Task", "Milestone", "Date"].map((type) => `<option ${calendarState.type === type ? "selected" : ""}>${type}</option>`).join("")}</select>
        <button class="primary compact" type="button" id="calendarNewEventBtn">+ New Event</button>
      `)}
      <div class="calendar-shell">
        <section>
          <div class="calendar-topline">
            <div>
              <button class="secondary-link compact" type="button" id="calendarTodayBtn">Today</button>
              <button class="secondary-link compact calendar-nav-btn" type="button" id="calendarPrevBtn" aria-label="Previous">‹</button>
              <button class="secondary-link compact calendar-nav-btn" type="button" id="calendarNextBtn" aria-label="Next">›</button>
              <strong>${calendarTitle()}</strong>
            </div>
            <div class="owned-segment-tabs compact">${["Month", "Week", "List"].map((mode) => `<button class="${calendarState.view === mode ? "active" : ""}" type="button" data-calendar-view="${mode}">${mode}</button>`).join("")}</div>
          </div>
          ${calendarState.view === "Month" ? `<div class="calendar-grid">
            ${["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => `<div class="calendar-weekday">${day}</div>`).join("")}
            ${days.map(({ date, iso, dayEvents, muted }) => `
              <div class="calendar-day ${muted ? "muted" : ""} ${iso === todayIso() ? "today" : ""}" data-calendar-drop-date="${iso}">
                <strong>${date.getDate()}</strong>
                ${dayEvents.slice(0, 3).map(renderCalendarEventButton).join("")}
                ${dayEvents.length > 3 ? `<small>+${dayEvents.length - 3} more</small>` : ""}
              </div>
            `).join("")}
          </div>` : ""}
          ${calendarState.view === "Week" ? `<div class="calendar-week-grid">
            ${week.map(({ date, iso, dayEvents }) => `
              <div class="calendar-week-column ${iso === todayIso() ? "today" : ""}" data-calendar-drop-date="${iso}">
                <button type="button" data-calendar-date="${iso}"><span>${date.toLocaleDateString("en-US", { weekday: "short" })}</span><strong>${date.getDate()}</strong></button>
                <div>${dayEvents.map(renderCalendarEventButton).join("") || "<em>No events</em>"}</div>
              </div>
            `).join("")}
          </div>` : ""}
          ${calendarState.view === "List" ? `<div class="calendar-list-view">
            ${visibleEvents.map((event) => `
              <div class="calendar-list-row" data-calendar-drop-date="${event.date}">
                <time>${formatProjectDate(event.date).replace(",", "")}</time>
                ${renderCalendarEventButton(event)}
                <i>${escapeHtml(event.type)}</i>
              </div>
            `).join("") || "<p class=\"empty compact-empty\">No upcoming calendar events match these filters.</p>"}
          </div>` : ""}
          <div class="calendar-legend">
            <span><i class="green"></i> In Progress</span>
            <span><i class="blue"></i> Planning</span>
            <span><i class="orange"></i> On Hold</span>
            <span><i class="purple"></i> Completed</span>
            <button class="secondary-link compact" type="button" id="calendarAddEventBottom">+ Add Event</button>
          </div>
        </section>
        <aside class="calendar-side">
          <section class="owned-side-card mini-calendar">
            <div class="flip-panel-head"><h3>${monthName}</h3><span>‹ ›</span></div>
            <div class="mini-calendar-grid">
              ${["S", "M", "T", "W", "T", "F", "S"].map((day) => `<span>${day}</span>`).join("")}
              ${days.map(({ date, muted, iso }) => `<button class="${muted ? "muted" : ""} ${iso === calendarState.date ? "active" : ""}" type="button" data-calendar-date="${iso}">${date.getDate()}</button>`).join("")}
            </div>
          </section>
          <section class="owned-side-card">
            <h3>Filters</h3>
            <select id="calendarProjectFilterSide"><option>${calendarState.projectId === "All" ? "All Projects" : escapeHtml(owned.find((property) => property.id === calendarState.projectId)?.address || "Project")}</option></select>
            <select><option>${calendarState.type === "All" ? "All Event Types" : escapeHtml(calendarState.type)}</option></select>
            <input value="${isoFromDate(first)} - ${isoFromDate(new Date(year, month + 1, 0))}" readonly>
            <button class="secondary-link compact" type="button" id="calendarClearFilters">Clear Filters</button>
          </section>
          <section class="owned-side-card">
            <div class="flip-panel-head"><h3>Upcoming</h3><button type="button">View all</button></div>
            <div class="calendar-upcoming">
              ${upcoming.map((event) => `
                <button type="button" data-property-id="${event.property.id}">
                  <time>${formatProjectDate(event.date).replace(",", "")}</time>
                  <span><strong>${escapeHtml(event.title)}</strong><em>${escapeHtml(event.property.address)}</em></span>
                  <i class="${calendarEventTone(event.status)}">${escapeHtml(projectPortfolioStatus(event.property))}</i>
                </button>
              `).join("") || "<p class=\"empty compact-empty\">No upcoming project dates.</p>"}
            </div>
          </section>
          <section class="owned-side-card sync-card"><strong>Sync Calendar</strong><span>Connect your Google or Outlook calendar.</span><button class="secondary-link compact" type="button">Connect</button></section>
        </aside>
      </div>
    </section>
  `;
  bindOwnedContextLinks(view);
  view.querySelector("#calendarNewEventBtn")?.addEventListener("click", () => setActiveView("tasks"));
  view.querySelector("#calendarAddEventBottom")?.addEventListener("click", () => setActiveView("tasks"));
  bindOwnedCalendar(view);
}

function renderOwnedMedia() {
  const view = document.getElementById("ownedMediaView");
  if (!view) return;
  const owned = ownedProjects();
  if (!owned.length) {
    view.innerHTML = `<section class="owned-page">${ownedPageHead("Photos / Videos", "Organize before, progress, finished, and listing media by room and project.")}${ownedEmptyState("No project media yet")}</section>`;
    bindOwnedEmptyState(view);
    return;
  }
  const media = owned.flatMap((property) => ownedMediaItems(property).map((item) => ({ property, item })));
  view.innerHTML = `
    <section class="owned-page">
      ${ownedPageHead("Photos / Videos", "Organize before, progress, finished, and listing media by room and project.", `
        <button class="primary compact" type="button" id="ownedNewMediaBtn">+ Add Media</button>
      `)}
      <div class="owned-task-composer" id="ownedMediaComposer" hidden>
        <select id="ownedMediaProject">${owned.map((property) => `<option value="${property.id}">${escapeHtml(property.address)}</option>`).join("")}</select>
        <input id="ownedMediaUrl" placeholder="Photo/video link">
        <input id="ownedMediaFile" type="file" accept="image/*,video/*">
        <select id="ownedMediaType"><option>Photo</option><option>Video</option></select>
        <select id="ownedMediaRoom">${FLIP_MEDIA_ROOMS.map((room) => `<option>${escapeHtml(room)}</option>`).join("")}</select>
        <select id="ownedMediaPhase">${FLIP_MEDIA_PHASES.map((phase) => `<option>${escapeHtml(phase)}</option>`).join("")}</select>
        <input id="ownedMediaCaption" placeholder="Caption">
        <button type="button" id="ownedSaveMediaBtn">Add Media</button>
        <span class="form-status" id="ownedMediaStatusMsg"></span>
      </div>
      <div class="owned-media-board">
        ${FLIP_MEDIA_ROOMS.map((room) => {
          const items = media.filter(({ item }) => item.room === room);
          return `
            <section class="owned-media-group">
              <div class="flip-panel-head"><h3>${escapeHtml(room)}</h3><span>${items.length}</span></div>
              <div class="owned-media-grid">
                ${items.map(({ property, item }) => `
                  <a href="${escapeHtml(item.url || "#")}" target="_blank" rel="noreferrer">
                    <span class="owned-media-preview">${mediaPreview(item, property)}</span>
                    <div><span>${escapeHtml(item.type || "Media")}</span><i>${escapeHtml(item.phase || "Progress")}</i></div>
                    <strong>${escapeHtml(item.caption || item.room || "Project media")}</strong>
                    <em>${escapeHtml(property.address)} · ${formatProjectDate(item.createdAt)}</em>
                  </a>
                `).join("") || "<p class=\"empty compact-empty\">No media yet.</p>"}
              </div>
            </section>
          `;
        }).join("")}
      </div>
    </section>
  `;
  bindOwnedMediaPage(view);
}

function prospectMediaPropertyOptions() {
  return activeProperties()
    .filter((property) => !isOwnedProperty(property))
    .sort((a, b) => String(a.address).localeCompare(String(b.address)));
}

function prospectMediaProperty(item) {
  return item.property_id ? propertyById(item.property_id) : null;
}

function renderProspectMedia() {
  const view = document.getElementById("prospectMediaView");
  if (!view) return;
  const prospects = prospectMediaPropertyOptions();
  const categories = ["General", "Exterior", "Interior", "Repairs", "Walkthrough", "Comps", "Neighborhood", "Contractor"];
  const items = prospectMedia.slice().sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  const groups = [
    { key: "general", title: "General / Not tied to a house", items: items.filter((item) => !item.property_id) },
    ...prospects.map((property) => ({
      key: property.id,
      title: property.address,
      items: items.filter((item) => item.property_id === property.id)
    }))
  ].filter((group) => group.key === "general" || group.items.length);

  view.innerHTML = `
    <section class="owned-page prospect-media-page">
      ${prospectPageHead("Photos / Videos", "Add prospect photos, walkthrough videos, repairs, comps, and anything the team needs before purchase.", `
        <button class="primary compact" type="button" id="prospectNewMediaBtn">+ Add Media</button>
      `)}
      <div class="owned-task-composer" id="prospectMediaComposer" hidden>
        <select id="prospectMediaProperty">
          <option value="">General / not tied to a house</option>
          ${prospects.map((property) => `<option value="${escapeHtml(property.id)}">${escapeHtml(property.address)}</option>`).join("")}
        </select>
        <input id="prospectMediaUrl" placeholder="Photo/video link">
        <input id="prospectMediaFile" type="file" accept="image/*,video/*">
        <select id="prospectMediaType"><option>Photo</option><option>Video</option></select>
        <select id="prospectMediaCategory">${categories.map((category) => `<option>${escapeHtml(category)}</option>`).join("")}</select>
        <input id="prospectMediaCaption" placeholder="Caption">
        <button type="button" id="prospectSaveMediaBtn">Add Media</button>
        <span class="form-status" id="prospectMediaStatusMsg"></span>
      </div>
      <div class="owned-media-board">
        ${groups.map((group) => `
          <section class="owned-media-group">
            <div class="flip-panel-head"><h3>${escapeHtml(group.title)}</h3><span>${group.items.length}</span></div>
            <div class="owned-media-grid">
              ${group.items.map((item) => {
                const property = prospectMediaProperty(item);
                return `
                  <article class="prospect-media-card">
                    <a href="${escapeHtml(item.url || "#")}" target="_blank" rel="noreferrer">
                      <span class="owned-media-preview">${mediaPreview(item, property || {})}</span>
                      <div><span>${escapeHtml(item.type || "Media")}</span><i>${escapeHtml(item.category || "General")}</i></div>
                      <strong>${escapeHtml(item.caption || item.original_name || "Prospect media")}</strong>
                      <em>${escapeHtml(property?.address || "General")} · ${formatProjectDate(item.created_at)}</em>
                    </a>
                    <button class="danger-link compact prospect-media-delete" type="button" data-prospect-media-delete="${escapeHtml(item.id)}">Delete</button>
                  </article>
                `;
              }).join("") || "<p class=\"empty compact-empty\">No media yet.</p>"}
            </div>
          </section>
        `).join("") || `
          <section class="owned-media-group">
            <div class="flip-panel-head"><h3>General / Not tied to a house</h3><span>0</span></div>
            <p class="empty compact-empty">No prospect media yet.</p>
          </section>
        `}
      </div>
    </section>
  `;
  bindProspectMediaPage(view);
}

function renderOwnedBudget() {
  const view = document.getElementById("ownedBudgetView");
  if (!view) return;
  const owned = ownedProjects();
  const project = primaryOwnedProject();
  if (!project) {
    view.innerHTML = `<section class="owned-page">${ownedPageHead("Budget", "Track all income, expenses, and budget details for your flip.")}${ownedEmptyState("No project budget yet")}</section>`;
    bindOwnedEmptyState(view);
    return;
  }
  const budget = flipBudgetSummary(project);
  const forecast = ownedForecastProfit(project);
  const categories = [...new Set([...FLIP_BUDGET_CATEGORIES, ...ownedBudgetItems(project).map((item) => item.category).filter(Boolean)])];
  const categoryRows = categories.map((category) => {
    const items = ownedBudgetItems(project).filter((item) => item.category === category);
    const estimated = items.reduce((sum, item) => sum + (Number(item.estimatedBudget) || 0), 0);
    const actual = items.reduce((sum, item) => sum + (Number(item.actualCost) || 0), 0);
    return { category, estimated, actual, remaining: estimated - actual, used: estimated > 0 ? Math.round((actual / estimated) * 100) : 0 };
  }).filter((row) => row.estimated || row.actual);
  const rows = categoryRows.length ? categoryRows : [{ category: "Rehab Budget", estimated: budget.estimated, actual: budget.actual, remaining: budget.difference, used: budget.percentUsed }];
  view.innerHTML = `
    <section class="owned-page budget-page">
      ${ownedPageHead("Budget", "Track all income, expenses, and budget details for your flip.", `
        <button class="secondary-link compact" type="button">${new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</button>
        <button class="primary compact" type="button" id="ownedAddTransactionBtn">+ Add Transaction</button>
      `)}
      <div class="budget-kpis">
        ${[
          ["Total Budget", money(budget.estimated), "100% of target"],
          ["Total Spent", money(budget.actual), `${budget.percentUsed}% of budget`],
          ["Remaining Budget", money(budget.difference), `${Math.max(0, 100 - budget.percentUsed)}% of budget`],
          ["Projected Profit", money(forecast.forecast), `${(forecast.roi * 100).toFixed(1)}% ROI`],
          ["Projected ROI", `${(forecast.roi * 100).toFixed(1)}%`, "On total investment"]
        ].map(([label, value, meta]) => `<article><span>${label}</span><strong>${value}</strong><em>${meta}</em></article>`).join("")}
      </div>
      <div class="owned-task-composer" id="ownedTransactionComposer" hidden>
        <select id="ownedTransactionProject">${owned.map((property) => `<option value="${property.id}" ${property.id === project.id ? "selected" : ""}>${escapeHtml(property.address)}</option>`).join("")}</select>
        <select id="ownedTransactionCategory">${FLIP_BUDGET_CATEGORIES.map((category) => `<option>${escapeHtml(category)}</option>`).join("")}</select>
        <input id="ownedTransactionEstimate" class="money-input" placeholder="Estimated budget">
        <input id="ownedTransactionActual" class="money-input" placeholder="Actual cost">
        <select id="ownedTransactionStatus"><option>Planned</option><option>In Progress</option><option>Done</option></select>
        <input id="ownedTransactionNotes" placeholder="Vendor / notes">
        <button type="button" id="ownedSaveTransactionBtn">Add Transaction</button>
        <span class="form-status" id="ownedTransactionStatusMsg"></span>
      </div>
      <div class="budget-layout">
        <section class="budget-main-card">
          <div class="flip-panel-head"><h3>Budget Overview</h3><button class="secondary-link compact" type="button">This Month</button></div>
          <div class="budget-overview-grid">
            <div class="dash-donut" style="--pct:${Math.min(100, budget.percentUsed)}"><strong>${budget.percentUsed}%</strong><span>Budget Used</span><em>${money(budget.actual)} / ${money(budget.estimated)}</em></div>
            <div class="budget-category-list">
              <div class="budget-category-head"><span>Category</span><span>Budget</span><span>Spent</span><span>Remaining</span><span>% Used</span></div>
              ${rows.map((row) => `<div><strong>${escapeHtml(row.category)}</strong><span>${money(row.estimated)}</span><span>${money(row.actual)}</span><span>${money(row.remaining)}</span><span>${row.used}% <i style="width:${Math.min(100, row.used)}%"></i></span></div>`).join("")}
            </div>
          </div>
        </section>
        <aside class="budget-side">
          <section class="owned-side-card">
            <h3>Budget Summary</h3>
            ${[
              ["After Repair Value (ARV)", money(forecast.salePrice)],
              ["Total Investment", money(forecast.purchasePrice + forecast.rehabCost)],
              ["Projected Profit", money(forecast.forecast)],
              ["Projected ROI", `${(forecast.roi * 100).toFixed(1)}%`],
              ["Target List Price", money(Number(getOwned(project).targetListPrice) || forecast.salePrice)],
              ["Target Close Date", formatProjectDate(getOwned(project).saleCloseDate || "")]
            ].map(([label, value]) => `<div class="budget-summary-line"><span>${label}</span><strong>${value}</strong></div>`).join("")}
            <button class="secondary-link compact" type="button" data-open-owned="${project.id}">Edit Targets</button>
          </section>
          <section class="owned-side-card">
            <div class="flip-panel-head"><h3>Recent Transactions</h3><button type="button">View all</button></div>
            <div class="recent-transactions">
              ${ownedBudgetItems(project).slice(0, 5).map((item) => `<div><span>${escapeHtml(item.notes || item.category)}</span><em>${escapeHtml(item.category)}</em><strong>${money(Number(item.actualCost) || Number(item.estimatedBudget) || 0)}</strong></div>`).join("") || "<p class=\"empty compact-empty\">No transactions yet.</p>"}
            </div>
          </section>
        </aside>
      </div>
      <section class="budget-main-card">
        <h3>Budget Breakdown</h3>
        <div class="budget-breakdown">
          ${rows.map((row) => `<div><strong>${escapeHtml(row.category)}</strong><span>${money(row.estimated)}</span><span>${money(row.actual)}</span><span>${money(row.remaining)}</span><span>${row.used}%</span><button type="button" data-open-owned="${project.id}">View</button></div>`).join("")}
        </div>
      </section>
    </section>
  `;
  bindOwnedBudgetPage(view);
}

function renderOwnedNotes() {
  const view = document.getElementById("ownedNotesView");
  if (!view) return;
  const owned = ownedProjects();
  if (!owned.length) {
    view.innerHTML = `<section class="owned-page">${ownedPageHead("Notes", "All project notes, details, ideas, and important information in one place.")}${ownedEmptyState("No project notes yet")}</section>`;
    bindOwnedEmptyState(view);
    return;
  }
  const categories = ["General", "Contractors", "Materials", "Finishes", "Permits", "Listing", "Ideas"];
  const rows = noteLog
    .filter((note) => owned.some((property) => property.id === note.property_id))
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  const selected = rows[0] || null;
  const noteTitle = (note) => String(note?.body || "Project Note").split(/[.\n]/)[0].slice(0, 44) || "Project Note";
  view.innerHTML = `
    <section class="owned-page notes-page">
      ${ownedPageHead("Notes", "All project notes, details, ideas, and important information in one place.", `
        <input class="owned-search-input" id="ownedNoteSearch" placeholder="Search notes...">
        <button class="primary compact" type="button" id="ownedNewNoteBtn">+ New Note</button>
      `)}
      <div class="owned-segment-tabs note-tabs">
        <button class="active" type="button">All Notes <span>${rows.length}</span></button>
        ${categories.map((category) => `<button type="button">${category} <span>${rows.filter((note) => note.type === category).length}</span></button>`).join("")}
      </div>
      <div class="owned-task-composer" id="ownedNoteComposer" hidden>
        <select id="ownedNoteProject">${owned.map((property) => `<option value="${property.id}">${escapeHtml(property.address)}</option>`).join("")}</select>
        <select id="ownedNoteAuthor">${teamMembers.map((member) => `<option>${escapeHtml(member.name)}</option>`).join("")}</select>
        <select id="ownedNoteType">${categories.map((category) => `<option>${escapeHtml(category)}</option>`).join("")}</select>
        <textarea id="ownedNoteBody" placeholder="Lockbox codes, paint colors, contractor notes, materials, problems found, permit notes, listing ideas..."></textarea>
        <button type="button" id="ownedSaveNoteBtn">Add Note</button>
        <span class="form-status" id="ownedNoteStatusMsg"></span>
      </div>
      <div class="owned-notes-layout">
        <aside class="owned-note-list">
          <div class="flip-panel-head"><h3>Notes (${rows.length})</h3><span>Most Recent</span></div>
          ${rows.map((note, index) => {
            const property = propertyById(note.property_id);
            return `
              <button class="owned-note-item ${index === 0 ? "active" : ""}" type="button" data-property-id="${escapeHtml(note.property_id)}">
                <i>${escapeHtml((note.type || "G").slice(0, 1))}</i>
                <span><strong>${escapeHtml(noteTitle(note))}</strong><em>${escapeHtml(note.body || "").slice(0, 90)}${String(note.body || "").length > 90 ? "..." : ""}</em><small>${escapeHtml(property?.address || "Project")} · ${formatNoteTime(note.created_at)}</small></span>
                <b>⋮</b>
              </button>
            `;
          }).join("") || "<p class=\"empty compact-empty\">No project notes yet.</p>"}
        </aside>
        <article class="owned-note-detail">
          ${selected ? `
            <div class="flip-note-detail-head"><span>${escapeHtml(selected.type || "General")}</span><button class="secondary-link compact" type="button">Edit</button><button class="secondary-link compact" type="button">⋮</button></div>
            <h3>${escapeHtml(noteTitle(selected))}</h3>
            <p>${formatNoteTime(selected.created_at)} · ${escapeHtml(selected.author || "Team")}</p>
            <div>${escapeHtml(selected.body || "").replace(/\n/g, "<br>")}</div>
            <div class="flip-note-tags"><span>${escapeHtml(selected.type || "General")}</span><span>${escapeHtml(propertyById(selected.property_id)?.address || "Project")}</span><button class="secondary-link compact" type="button">+ Add Tag</button></div>
          ` : `
            <h3>Project Notes</h3>
            <div>Add lockbox codes, paint colors, contractor notes, material selections, permit notes, problems found, and listing ideas.</div>
          `}
        </article>
      </div>
    </section>
  `;
  bindOwnedNotesPage(view);
}

function renderOwnedReports() {
  const view = document.getElementById("ownedReportsView");
  if (!view) return;
  const owned = ownedProjects();
  const totalForecast = owned.reduce((sum, property) => sum + ownedForecastProfit(property).forecast, 0);
  const totalSpent = owned.reduce((sum, property) => sum + flipBudgetSummary(property).actual, 0);
  const riskCount = owned.filter((property) => ownedRiskLevel(property) !== "ok").length;
  const avgProgress = owned.length ? Math.round(owned.reduce((sum, property) => sum + flipProgress(property), 0) / owned.length) : 0;
  view.innerHTML = `
    <section class="owned-page">
      ${ownedPageHead("Reports", "Portfolio-level profit, budget, progress, and risk rollups for owned flips.", `<button class="secondary-link compact" type="button">Export</button>`)}
      <div class="budget-kpis">
        ${[
          ["Owned Projects", number(owned.length), "Closed homes in tracking"],
          ["Forecast Profit", money(totalForecast), "Estimated across owned projects"],
          ["Actual Spend", money(totalSpent), "Budget items and rehab spend"],
          ["Avg. Progress", `${avgProgress}%`, "Tasks and milestones complete"],
          ["Needs Attention", number(riskCount), "Budget, date, or data flags"]
        ].map(([label, value, detail]) => `<article><span>${label}</span><strong>${value}</strong><em>${detail}</em></article>`).join("")}
      </div>
      <div class="flip-dash-layout lower">
        <section class="flip-dash-panel"><div class="flip-panel-head"><h3>Profit by Project</h3><span>This Month</span></div><div class="dash-budget-lines">${owned.map((property) => `<div><span>${escapeHtml(property.address)}</span><strong>${money(ownedForecastProfit(property).forecast)}</strong></div>`).join("") || "<p class=\"empty compact-empty\">No owned projects yet.</p>"}</div></section>
        <section class="flip-dash-panel"><div class="flip-panel-head"><h3>Budget Risk</h3><span>${riskCount} flagged</span></div><div class="owned-action-list">${ownedActionItems(owned).slice(0, 6).map((item) => `<button class="owned-action-item" type="button" data-property-id="${item.property.id}"><span class="risk-badge risk-${item.level === "critical" ? "critical" : "warn"}">${escapeHtml(item.action)}</span><strong>${escapeHtml(item.property.address)}</strong><span>${escapeHtml(item.label)}</span></button>`).join("") || "<p class=\"empty compact-empty\">No current risk flags.</p>"}</div></section>
      </div>
    </section>
  `;
  bindOwnedContextLinks(view);
}

function renderOwnedSettings() {
  const view = document.getElementById("ownedSettingsView");
  if (!view) return;
  view.innerHTML = `
    <section class="owned-page">
      ${ownedPageHead("Settings", "Homes Owned administration shortcuts and project defaults.")}
      <div class="settings-grid">
        ${[
          ["Project Ownership", "Assign project owners from the project detail page or sale details modal.", "Open Projects", "homesOwned"],
          ["Task Defaults", "Use demo, rough construction, finishes, landscaping, staging, and listing phases.", "View Tasks", "tasks"],
          ["Budget Defaults", "Holding costs and sale assumptions come from underwriting until project-specific numbers are entered.", "View Budget", "ownedBudget"],
          ["Media Organization", "Group photos and videos by room and phase so listing content is easy to find.", "View Media", "ownedMedia"]
        ].map(([title, body, action, viewName]) => `<article class="owned-side-card"><h3>${title}</h3><p>${body}</p><button class="secondary-link compact" type="button" data-settings-view="${viewName}">${action}</button></article>`).join("")}
      </div>
    </section>
  `;
  view.querySelectorAll("[data-settings-view]").forEach((button) => {
    button.addEventListener("click", () => setActiveView(button.dataset.settingsView));
  });
}

function bindOwnedContextLinks(root) {
  bindPropertyLinks(root);
  root.querySelectorAll("[data-property-id]").forEach((button) => {
    if (button.dataset.boundOwnedProject === "true") return;
    button.dataset.boundOwnedProject = "true";
    button.addEventListener("click", () => openPropertyDetail(button.dataset.propertyId));
  });
  root.querySelectorAll("[data-open-owned]").forEach((button) => {
    if (button.dataset.boundOwnedModal === "true") return;
    button.dataset.boundOwnedModal = "true";
    button.addEventListener("click", () => openOwnedModal(button.dataset.openOwned));
  });
  root.querySelectorAll("[data-dashboard-view]").forEach((button) => {
    if (button.dataset.boundDashboardView === "true") return;
    button.dataset.boundDashboardView = "true";
    button.addEventListener("click", () => setActiveView(button.dataset.dashboardView));
  });
  hydrateIcons();
}

function bindOwnedTasksPage(root) {
  const openCreateForm = () => {
    const firstOwned = ownedProjects()[0];
    taskFormState = { open: true, mode: "create", propertyId: firstOwned?.id || "", taskId: "" };
    renderTasks();
  };
  root.querySelector("#ownedNewTaskBtn")?.addEventListener("click", openCreateForm);
  root.querySelector("#emptyNewTaskBtn")?.addEventListener("click", openCreateForm);
  root.querySelector("#ownedEmptyNewTaskBtn")?.addEventListener("click", openCreateForm);
  root.querySelectorAll("[data-owned-task-key]").forEach((button) => {
    button.addEventListener("click", () => {
      selectedOwnedTaskKey = button.dataset.ownedTaskKey;
      renderTasks();
    });
  });
  root.querySelector("#ownedTaskSearch")?.addEventListener("input", (event) => {
    const query = event.target.value.trim().toLowerCase();
    root.querySelectorAll("[data-owned-task-key]").forEach((card) => {
      card.hidden = query && !card.textContent.toLowerCase().includes(query);
    });
  });
  root.querySelectorAll("[data-task-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      root.querySelectorAll("[data-task-filter]").forEach((item) => item.classList.toggle("active", item === button));
      const filter = button.dataset.taskFilter;
      root.querySelectorAll("[data-owned-task-key]").forEach((card) => {
        card.hidden = filter !== "All" && card.dataset.taskStatus !== filter;
      });
    });
  });
  root.querySelector("#ownedEditTaskBtn")?.addEventListener("click", () => {
    const [propertyId, taskId] = selectedOwnedTaskKey.split("::");
    taskFormState = { open: true, mode: "edit", propertyId, taskId };
    renderTasks();
  });
  root.querySelector("#taskDetailStatus")?.addEventListener("change", async (event) => {
    const [propertyId, taskId] = selectedOwnedTaskKey.split("::");
    const property = propertyById(propertyId);
    if (!property) return;
    await updateOwnedArrayItem(property, "projectTasks", taskId, { status: event.target.value, updatedAt: new Date().toISOString() });
    renderTasks();
    renderOwnedContextViews();
  });
  root.querySelectorAll("[data-task-checklist-id]").forEach((checkbox) => {
    checkbox.addEventListener("change", async () => {
      const [propertyId, taskId] = selectedOwnedTaskKey.split("::");
      const property = propertyById(propertyId);
      const task = ownedProjectTasks(property || {}).find((item) => item.id === taskId);
      if (!property || !task) return;
      const nextChecklist = taskChecklist(task).map((item) =>
        item.id === checkbox.dataset.taskChecklistId ? { ...item, done: checkbox.checked } : item
      );
      const allDone = nextChecklist.every((item) => item.done);
      await updateOwnedArrayItem(property, "projectTasks", taskId, {
        checklist: nextChecklist,
        status: allDone ? "Done" : task.status === "Done" ? "In Progress" : task.status,
        updatedAt: new Date().toISOString()
      });
      renderTasks();
    });
  });
  root.querySelector("[data-next-owned-task]")?.addEventListener("click", (event) => {
    selectedOwnedTaskKey = event.currentTarget.dataset.nextOwnedTask;
    renderTasks();
  });
  root.querySelector("#taskFormClose")?.addEventListener("click", () => {
    taskFormState = { open: false, mode: "create", propertyId: "", taskId: "" };
    renderTasks();
  });
  root.querySelector("#taskFormCancel")?.addEventListener("click", () => {
    taskFormState = { open: false, mode: "create", propertyId: "", taskId: "" };
    renderTasks();
  });
  root.querySelector("#taskFormBackdrop")?.addEventListener("click", () => {
    taskFormState = { open: false, mode: "create", propertyId: "", taskId: "" };
    renderTasks();
  });
  root.querySelector("#taskFormSave")?.addEventListener("click", async () => {
    const status = root.querySelector("#taskFormStatusMsg");
    const propertyId = root.querySelector("#taskFormProject")?.value || taskFormState.propertyId || ownedProjects()[0]?.id || "";
    const property = propertyById(propertyId);
    const name = root.querySelector("#taskFormName")?.value.trim();
    if (!name) {
      if (status) status.textContent = "Enter a task name.";
      root.querySelector("#taskFormName")?.focus();
      return;
    }
    if (!property) {
      if (status) status.textContent = "No owned project is available for this task.";
      return;
    }
    const payload = {
      name,
      category: root.querySelector("#taskFormCategory")?.value || "Demo",
      status: root.querySelector("#taskFormStatus")?.value || "Not Started",
      dueDate: root.querySelector("#taskFormDue")?.value || null,
      assignedPerson: root.querySelector("#taskFormAssignee")?.value || null,
      priority: root.querySelector("#taskFormPriority")?.value || "Medium",
      estimatedTime: root.querySelector("#taskFormEstimated")?.value.trim() || null,
      location: root.querySelector("#taskFormLocation")?.value.trim() || null,
      startDate: root.querySelector("#taskFormStart")?.value || null,
      addToCalendar: root.querySelector("#taskFormCalendar")?.checked ?? true,
      estimatedCost: root.querySelector("#taskFormEstimatedCost")?.value.trim() ? parseMoneyInput(root.querySelector("#taskFormEstimatedCost").value) : null,
      actualCost: root.querySelector("#taskFormActualCost")?.value.trim() ? parseMoneyInput(root.querySelector("#taskFormActualCost").value) : null,
      trackCost: root.querySelector("#taskFormTrackCost")?.checked ?? true,
      budgetCategory: root.querySelector("#taskFormBudgetCategory")?.value || null,
      vendor: root.querySelector("#taskFormVendor")?.value.trim() || null,
      paymentMethod: root.querySelector("#taskFormPayment")?.value || null,
      milestone: root.querySelector("#taskFormMilestone")?.value || null,
      dependsOn: root.querySelector("#taskFormDepends")?.value || null,
      tags: root.querySelector("#taskFormTags")?.value.split(",").map((tag) => tag.trim()).filter(Boolean) || [],
      extraNotes: root.querySelector("#taskFormExtraNotes")?.value.trim() || null,
      checklist: root.querySelector("#taskFormChecklistItem")?.value.trim()
        ? [{ id: crypto.randomUUID(), text: root.querySelector("#taskFormChecklistItem").value.trim(), done: false }]
        : undefined,
      notes: root.querySelector("#taskFormNotes")?.value.trim() || null,
      updatedAt: new Date().toISOString()
    };
    try {
      if (status) status.textContent = "Saving...";
      if (taskFormState.mode === "edit") {
        const sourceProperty = propertyById(taskFormState.propertyId);
        if (sourceProperty && sourceProperty.id !== property.id) {
          const existingTask = ownedProjectTasks(sourceProperty).find((item) => item.id === taskFormState.taskId) || { id: taskFormState.taskId };
          const sourceOwned = getOwned(sourceProperty);
          await saveOwnedForProperty(sourceProperty.id, {
            ...sourceOwned,
            projectTasks: (Array.isArray(sourceOwned.projectTasks) ? sourceOwned.projectTasks : []).filter((item) => item.id !== taskFormState.taskId)
          });
          await addOwnedArrayItem(property, "projectTasks", { ...existingTask, ...payload, id: taskFormState.taskId });
        } else {
          await updateOwnedArrayItem(property, "projectTasks", taskFormState.taskId, payload);
        }
        selectedOwnedTaskKey = `${property.id}::${taskFormState.taskId}`;
      } else {
        const id = crypto.randomUUID();
        await addOwnedArrayItem(property, "projectTasks", { id, ...payload, createdAt: new Date().toISOString() });
        selectedOwnedTaskKey = `${property.id}::${id}`;
      }
    } catch (error) {
      if (status) status.textContent = error.message || "Could not save task.";
      return;
    }
    taskFormState = { open: false, mode: "create", propertyId: "", taskId: "" };
    renderTasks();
    renderOwnedContextViews();
  });
  bindOwnedContextLinks(root);
}

function bindOwnedMediaPage(root) {
  root.querySelector("#ownedNewMediaBtn")?.addEventListener("click", () => {
    const composer = root.querySelector("#ownedMediaComposer");
    if (composer) composer.hidden = !composer.hidden;
    root.querySelector("#ownedMediaUrl")?.focus();
  });
  root.querySelector("#ownedSaveMediaBtn")?.addEventListener("click", async () => {
    const status = root.querySelector("#ownedMediaStatusMsg");
    const property = propertyById(root.querySelector("#ownedMediaProject")?.value);
    const urlInput = root.querySelector("#ownedMediaUrl");
    const fileInput = root.querySelector("#ownedMediaFile");
    const file = fileInput?.files?.[0] || null;
    let url = urlInput?.value.trim() || "";
    if (!property || (!url && !file)) {
      if (status) status.textContent = "Pick a project and choose a file or paste a media link.";
      return;
    }
    if (status) status.textContent = "Adding...";
    try {
      const upload = file ? await uploadMediaFile(file) : null;
      if (upload) url = upload.url;
      await addOwnedArrayItem(property, "mediaItems", {
        id: crypto.randomUUID(),
        url,
        type: upload?.mimeType?.startsWith("video/") ? "Video" : root.querySelector("#ownedMediaType")?.value || "Photo",
        room: root.querySelector("#ownedMediaRoom")?.value || "Kitchen",
        phase: root.querySelector("#ownedMediaPhase")?.value || "Progress",
        caption: root.querySelector("#ownedMediaCaption")?.value.trim() || upload?.originalName || null,
        mimeType: upload?.mimeType || null,
        createdAt: new Date().toISOString()
      });
      renderOwnedMedia();
      renderFlipDashboard();
    } catch (error) {
      if (status) status.textContent = error.message || "Could not add media.";
    }
  });
}

async function saveProspectMediaItem(payload) {
  const draft = normalizeProspectMedia(payload);
  if (!apiAvailable) {
    prospectMedia.unshift(draft);
    storeProspectMedia();
    return draft;
  }
  const response = await fetch("/api/prospect-media", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(draft)
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || "Could not add media.");
  }
  const { media } = await response.json();
  const saved = normalizeProspectMedia(media);
  prospectMedia.unshift(saved);
  return saved;
}

async function deleteProspectMediaItem(id) {
  if (!id) return;
  if (!apiAvailable) {
    prospectMedia = prospectMedia.filter((item) => item.id !== id);
    storeProspectMedia();
    renderProspectMedia();
    updateNavCounts();
    return;
  }
  const response = await fetch(`/api/prospect-media/${id}`, { method: "DELETE" });
  if (!response.ok && response.status !== 204) {
    const body = await response.json().catch(() => ({}));
    alert(body.error || "Could not delete media.");
    return;
  }
  prospectMedia = prospectMedia.filter((item) => item.id !== id);
  renderProspectMedia();
  updateNavCounts();
}

function bindProspectMediaPage(root) {
  root.querySelector("#prospectNewMediaBtn")?.addEventListener("click", () => {
    const composer = root.querySelector("#prospectMediaComposer");
    if (composer) composer.hidden = !composer.hidden;
    root.querySelector("#prospectMediaUrl")?.focus();
  });
  root.querySelector("#prospectSaveMediaBtn")?.addEventListener("click", async () => {
    const status = root.querySelector("#prospectMediaStatusMsg");
    const propertyId = root.querySelector("#prospectMediaProperty")?.value || "";
    const urlInput = root.querySelector("#prospectMediaUrl");
    const fileInput = root.querySelector("#prospectMediaFile");
    const file = fileInput?.files?.[0] || null;
    let url = urlInput?.value.trim() || "";
    if (!url && !file) {
      if (status) status.textContent = "Choose a file or paste a media link.";
      return;
    }
    if (status) status.textContent = "Adding...";
    try {
      const upload = file ? await uploadMediaFile(file) : null;
      if (upload) url = upload.url;
      await saveProspectMediaItem({
        id: crypto.randomUUID(),
        property_id: propertyId || null,
        url,
        type: upload?.mimeType?.startsWith("video/") ? "Video" : root.querySelector("#prospectMediaType")?.value || "Photo",
        category: root.querySelector("#prospectMediaCategory")?.value || "General",
        caption: root.querySelector("#prospectMediaCaption")?.value.trim() || upload?.originalName || "",
        mime_type: upload?.mimeType || "",
        original_name: upload?.originalName || "",
        created_by: currentUser.name || "Team",
        created_at: new Date().toISOString()
      });
      renderProspectMedia();
      updateNavCounts();
    } catch (error) {
      if (status) status.textContent = error.message || "Could not add media.";
    }
  });
  root.querySelectorAll("[data-prospect-media-delete]").forEach((button) => {
    button.addEventListener("click", () => deleteProspectMediaItem(button.dataset.prospectMediaDelete));
  });
  bindPropertyLinks(root);
}

function bindOwnedBudgetPage(root) {
  root.querySelector("#ownedAddTransactionBtn")?.addEventListener("click", () => {
    const composer = root.querySelector("#ownedTransactionComposer");
    if (composer) composer.hidden = !composer.hidden;
    root.querySelector("#ownedTransactionNotes")?.focus();
  });
  root.querySelector("#ownedSaveTransactionBtn")?.addEventListener("click", async () => {
    const status = root.querySelector("#ownedTransactionStatusMsg");
    const property = propertyById(root.querySelector("#ownedTransactionProject")?.value);
    if (!property) {
      if (status) status.textContent = "Pick a project.";
      return;
    }
    if (status) status.textContent = "Adding...";
    await addOwnedArrayItem(property, "budgetItems", {
      id: crypto.randomUUID(),
      category: root.querySelector("#ownedTransactionCategory")?.value || "Miscellaneous",
      estimatedBudget: parseMoneyInput(root.querySelector("#ownedTransactionEstimate")?.value),
      actualCost: parseMoneyInput(root.querySelector("#ownedTransactionActual")?.value),
      status: root.querySelector("#ownedTransactionStatus")?.value || "Planned",
      notes: root.querySelector("#ownedTransactionNotes")?.value.trim() || null,
      createdAt: new Date().toISOString()
    });
    renderOwnedBudget();
    renderFlipDashboard();
  });
  root.querySelectorAll(".money-input").forEach((input) => {
    input.addEventListener("blur", () => {
      if (input.value.trim()) formatMoneyInput(input);
    });
  });
  bindOwnedContextLinks(root);
}

function bindOwnedNotesPage(root) {
  root.querySelector("#ownedNewNoteBtn")?.addEventListener("click", () => {
    const composer = root.querySelector("#ownedNoteComposer");
    if (composer) composer.hidden = !composer.hidden;
    root.querySelector("#ownedNoteBody")?.focus();
  });
  root.querySelector("#ownedSaveNoteBtn")?.addEventListener("click", async () => {
    const status = root.querySelector("#ownedNoteStatusMsg");
    const property = propertyById(root.querySelector("#ownedNoteProject")?.value);
    const body = root.querySelector("#ownedNoteBody")?.value.trim();
    if (!property || !body) {
      if (status) status.textContent = "Pick a project and enter a note.";
      return;
    }
    if (status) status.textContent = "Saving...";
    const draft = normalizeNote({
      id: crypto.randomUUID(),
      property_id: property.id,
      author: root.querySelector("#ownedNoteAuthor")?.value || "Team",
      type: root.querySelector("#ownedNoteType")?.value || "General",
      body,
      created_at: new Date().toISOString()
    });
    if (!apiAvailable) {
      noteLog.unshift(draft);
      storeLocalState();
      renderOwnedNotes();
      renderFlipDashboard();
      return;
    }
    const response = await fetch(`/api/properties/${property.id}/notes`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ author: draft.author, type: draft.type, body: draft.body })
    });
    if (!response.ok) {
      if (status) status.textContent = "Could not save note.";
      return;
    }
    const { note } = await response.json();
    noteLog.unshift(normalizeNote(note));
    renderOwnedNotes();
    renderFlipDashboard();
  });
  root.querySelector("#ownedNoteSearch")?.addEventListener("input", (event) => {
    const query = event.target.value.trim().toLowerCase();
    root.querySelectorAll(".owned-note-item").forEach((item) => {
      item.hidden = query && !item.textContent.toLowerCase().includes(query);
    });
  });
  bindOwnedContextLinks(root);
}

function renderOwnedContextViews() {
  renderOwnedCalendar();
  renderOwnedMedia();
  renderOwnedBudget();
  renderOwnedNotes();
  renderOwnedReports();
  renderOwnedSettings();
}

// ── Owned modal ───────────────────────────────────────────────────────────────

function updateOwnedModalCalcs() {
  const purchaseDate = document.getElementById("ownedPurchaseDate")?.value;
  const saleDate = document.getElementById("ownedSaleCloseDate")?.value;
  const buyerPrice = parseMoneyInput(document.getElementById("ownedBuyerPrice")?.value);
  const concessions = parseMoneyInput(document.getElementById("ownedConcessions")?.value);
  const purchasePrice = parseMoneyInput(document.getElementById("ownedPurchasePrice")?.value);
  const rehabSpend = parseMoneyInput(document.getElementById("ownedActualSpend")?.value);
  const monthlyHolding = parseMoneyInput(document.getElementById("ownedMonthlyHolding")?.value) || 3000;
  const endDate = saleDate || todayIso();
  const days = purchaseDate ? Math.max(0, Math.floor((new Date(endDate) - new Date(purchaseDate)) / 86400000)) : 0;
  const holdingCost = Math.round(monthlyHolding * (days / 30));
  const netProceeds = Math.max(0, buyerPrice - concessions);
  const finalProfit = netProceeds - purchasePrice - rehabSpend - holdingCost;
  setText("ownedNetProceeds", money(netProceeds));
  setText("ownedFinalProfit", money(finalProfit));
}

function openOwnedModal(propertyId, options = {}) {
  const property = propertyById(propertyId);
  if (!property) return;
  const owned = getOwned(property);
  const tl = property.source?.timeline || property.timeline || {};

  document.getElementById("ownedPropertyId").value = propertyId;
  document.getElementById("ownedModalAddress").textContent = `${property.address}, ${property.city}, ${property.state}`;
  const banner = document.getElementById("ownedHandoffBanner");
  if (banner) banner.style.display = options.handoff ? "block" : "none";

  const ownerSel = document.getElementById("ownedOwnerSelect");
  ownerSel.innerHTML = `<option value="">— Select owner —</option>` +
    teamMembers.map((m) => `<option${owned.assignedOwner === m.name ? " selected" : ""}>${escapeHtml(m.name)}</option>`).join("");

  document.getElementById("ownedPhaseSelect").value = normalizeOwnedPhase(owned.ownedPhase);
  document.getElementById("ownedPurchaseDate").value = tl.purchaseDate || owned.purchaseCloseDate || "";
  setMoneyInputValue("ownedPurchasePrice", owned.actualPurchasePrice || property.purchasePrice || property.targetOfferHigh || 0);
  document.getElementById("ownedFundingSource").value = owned.fundingSource || "";
  setMoneyInputValue("ownedActualSpend", owned.actualRehabSpend || 0);
  document.getElementById("ownedTargetRehab").value = owned.targetRehabComplete || tl.rehabEnd || "";
  setMoneyInputValue("ownedForecastArv", owned.forecastArv || property.arv || 0);
  setMoneyInputValue("ownedMonthlyHolding", owned.monthlyHoldingCost || 3000);
  setMoneyInputValue("ownedTargetListPrice", owned.targetListPrice || 0);
  setMoneyInputValue("ownedActualListPrice", owned.actualListPrice || 0);
  document.getElementById("ownedListDate").value = tl.listDate || owned.listDate || "";
  document.getElementById("ownedSaleCloseDate").value = tl.saleDate || owned.saleCloseDate || "";
  setMoneyInputValue("ownedBuyerPrice", owned.buyerContractPrice || 0);
  setMoneyInputValue("ownedConcessions", owned.sellerConcessions || 0);
  document.getElementById("ownedNextAction").value = owned.nextAction || "";
  document.getElementById("ownedSaveStatus").textContent = "";
  updateOwnedModalCalcs();

  document.getElementById("ownedOverlay").style.display = "flex";
  document.body.style.overflow = "hidden";
}

function closeOwnedModal() {
  document.getElementById("ownedOverlay").style.display = "none";
  document.body.style.overflow = "";
}

async function saveOwnedForProperty(propertyIdValue, owned) {
  const property = propertyById(propertyIdValue);
  const existingTimeline = property?.timeline || property?.source?.timeline || {};
  const timeline = {
    ...existingTimeline,
    purchaseDate: owned.purchaseCloseDate || existingTimeline.purchaseDate || null,
    rehabEnd: owned.targetRehabComplete || existingTimeline.rehabEnd || null,
    listDate: owned.listDate || existingTimeline.listDate || null,
    saleDate: owned.saleCloseDate || existingTimeline.saleDate || null
  };
  const applyLocal = () => {
    const idx = properties.findIndex((p) => p.id === propertyIdValue);
    if (idx >= 0) {
      properties[idx] = normalizeProperty({
        ...properties[idx],
        owned,
        timeline,
        source: { ...(properties[idx].source || {}), owned, timeline }
      });
    }
  };
  if (!apiAvailable) {
    applyLocal();
    storeLocalState();
    return;
  }
  const response = await fetch(`/api/properties/${propertyIdValue}/owned`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ owned, timeline })
  });
  if (!response.ok) throw new Error("Could not save ownership workflow.");
  applyLocal();
}

async function saveOwnedData() {
  const propertyId = document.getElementById("ownedPropertyId").value;
  const button = document.getElementById("ownedSaveBtn");
  const status = document.getElementById("ownedSaveStatus");
  const pm = (id) => parseMoneyInput(document.getElementById(id).value) || null;
  const existingOwned = getOwned(propertyById(propertyId) || {});
  const owned = {
    ...existingOwned,
    ownedPhase: normalizeOwnedPhase(document.getElementById("ownedPhaseSelect").value),
    assignedOwner: document.getElementById("ownedOwnerSelect").value || null,
    purchaseCloseDate: document.getElementById("ownedPurchaseDate").value || null,
    actualPurchasePrice: pm("ownedPurchasePrice"),
    fundingSource: document.getElementById("ownedFundingSource").value.trim() || null,
    actualRehabSpend: pm("ownedActualSpend"),
    targetRehabComplete: document.getElementById("ownedTargetRehab").value || null,
    forecastArv: pm("ownedForecastArv"),
    monthlyHoldingCost: pm("ownedMonthlyHolding"),
    targetListPrice: pm("ownedTargetListPrice"),
    actualListPrice: pm("ownedActualListPrice"),
    listDate: document.getElementById("ownedListDate").value || null,
    buyerContractPrice: pm("ownedBuyerPrice"),
    sellerConcessions: pm("ownedConcessions"),
    saleCloseDate: document.getElementById("ownedSaleCloseDate").value || null,
    nextAction: document.getElementById("ownedNextAction").value.trim() || null
  };
  button.disabled = true;
  status.textContent = "Saving…";
  try {
    await saveOwnedForProperty(propertyId, owned);
    closeOwnedModal();
    renderAll();
  } catch (err) {
    status.textContent = err.message;
  } finally {
    button.disabled = false;
  }
}

function filteredProperties() {
  const query = document.getElementById("searchInput").value.trim().toLowerCase();
  const candidates = activeProperties();
  if (!query) return candidates;
  return candidates.filter((property) => [
    property.address,
    property.city,
    listingStatusLabel(property),
    property.listingAgent,
    property.coListingAgent,
    property.brokerage
  ].filter(Boolean).join(" ").toLowerCase().includes(query));
}

function filteredPassedProperties() {
  const query = document.getElementById("searchInput").value.trim().toLowerCase();
  const candidates = passedProperties();
  if (!query) return candidates;
  return candidates.filter((property) => [
    property.address,
    property.city,
    listingStatusLabel(property),
    property.listingAgent,
    property.coListingAgent,
    property.brokerage
  ].filter(Boolean).join(" ").toLowerCase().includes(query));
}

function renderAll() {
  renderStats();
  renderActivityFeed();
  renderDecisionList();
  renderDashboardPhotos();
  renderStageBars();
  renderDashboardTable();
  renderPipeline();
  renderRankings();
  renderProperties();
  renderPassedProperties();
  renderCalculatorOptions();
  syncCalculator();
  renderScope();
  renderProspectMedia();
  renderHomesOwned();
  renderOwnedContextViews();
  renderTasks();
  renderDocuments();
  renderChat();
  renderTeam();
  renderFeatureRequests();
  renderFeatureRequestDetail();
  updateNavCounts();
  renderSidebarContext();
  hydrateIcons();
}

function bindEvents() {
  hydrateIcons();
  document.querySelectorAll(".nav-section-tab").forEach((button) => {
    button.addEventListener("click", () => {
      setActiveNavSection(button.dataset.navSection);
      if (window.location.hash) history.pushState(null, "", window.location.pathname + window.location.search);
    });
  });

  document.querySelectorAll(".nav-item").forEach((button) => {
    button.addEventListener("click", () => {
      activeNavKey = button.dataset.navKey || button.dataset.view;
      setActiveView(button.dataset.view, { navKey: activeNavKey });
      if (window.location.hash) history.pushState(null, "", window.location.pathname + window.location.search);
    });
  });

  // Mobile nav drawer
  const navToggle = document.getElementById("navToggle");
  const navOverlay = document.getElementById("navOverlay");
  const sidebar = document.querySelector(".sidebar");

  function openNav() {
    sidebar.classList.add("open");
    navOverlay.classList.add("open");
    document.body.style.overflow = "hidden";
  }

  function closeNav() {
    sidebar.classList.remove("open");
    navOverlay.classList.remove("open");
    document.body.style.overflow = "";
  }

  navToggle.addEventListener("click", () => {
    sidebar.classList.contains("open") ? closeNav() : openNav();
  });

  navOverlay.addEventListener("click", closeNav);

  // Close drawer when any nav item is tapped
  document.querySelectorAll(".nav-item").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (window.innerWidth <= 768) closeNav();
    });
  });

  // New Property modal
  const newPropertyOverlay = document.getElementById("newPropertyOverlay");
  const newPropertyForm = document.getElementById("newPropertyForm");

  function openNewPropertyModal() {
    newPropertyOverlay.style.display = "flex";
    document.body.style.overflow = "hidden";
    document.getElementById("npAddress").focus();
  }

  function closeNewPropertyModal() {
    newPropertyOverlay.style.display = "none";
    document.body.style.overflow = "";
    newPropertyForm.reset();
    document.getElementById("newPropertyStatus").textContent = "";
  }

  document.querySelector(".new-chat").addEventListener("click", openNewPropertyModal);
  document.getElementById("newPropertyClose").addEventListener("click", closeNewPropertyModal);
  document.getElementById("newPropertyCancel").addEventListener("click", closeNewPropertyModal);
  newPropertyOverlay.addEventListener("click", (event) => {
    if (event.target === newPropertyOverlay) closeNewPropertyModal();
  });

  newPropertyForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = document.getElementById("newPropertySubmit");
    const status = document.getElementById("newPropertyStatus");
    button.disabled = true;
    status.textContent = "Saving...";
    const body = propertyFormPayload("np");
    try {
      if (!apiAvailable) {
        const property = localPropertyFromPayload(body);
        properties.unshift(property);
        selectedId = property.id;
        storeLocalState();
        closeNewPropertyModal();
        setActiveView("properties");
        renderAll();
        return;
      }
      const response = await fetch("/api/properties", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body)
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || "Could not save property.");
      }
      const { property } = await response.json();
      const normalized = normalizeProperty(property);
      properties.unshift(normalized);
      selectedId = normalized.id;
      closeNewPropertyModal();
      setActiveView("properties");
      renderAll();
    } catch (error) {
      status.textContent = error.message;
    } finally {
      button.disabled = false;
    }
  });

  // Owned modal events
  const ownedOverlay = document.getElementById("ownedOverlay");
  document.getElementById("ownedClose").addEventListener("click", closeOwnedModal);
  document.getElementById("ownedCancel").addEventListener("click", closeOwnedModal);
  ownedOverlay.addEventListener("click", (event) => { if (event.target === ownedOverlay) closeOwnedModal(); });
  document.getElementById("ownedSaveBtn").addEventListener("click", saveOwnedData);
  // Format money inputs in the owned modal
  ["ownedPurchasePrice","ownedActualSpend","ownedForecastArv","ownedMonthlyHolding",
   "ownedTargetListPrice","ownedActualListPrice","ownedBuyerPrice","ownedConcessions"].forEach((id) => {
    const input = document.getElementById(id);
    if (!input) return;
    input.addEventListener("focus", () => { input.value = parseMoneyInput(input.value) || ""; input.select(); });
    input.addEventListener("input", updateOwnedModalCalcs);
    input.addEventListener("blur", () => { if (input.value.trim()) formatMoneyInput(input); updateOwnedModalCalcs(); });
  });
  ["ownedPurchaseDate", "ownedSaleCloseDate"].forEach((id) => {
    document.getElementById(id)?.addEventListener("input", updateOwnedModalCalcs);
  });

  document.getElementById("backToProperties").addEventListener("click", () => {
    setActiveView("properties");
    renderProperties();
    history.pushState(null, "", window.location.pathname + window.location.search);
  });

  document.getElementById("backToFeatureRequests").addEventListener("click", () => {
    setActiveView("featureRequests");
    renderFeatureRequests();
    history.pushState(null, "", window.location.pathname + window.location.search);
  });

  window.addEventListener("popstate", handleRoute);
  window.addEventListener("hashchange", handleRoute);

  document.getElementById("searchInput").addEventListener("input", () => {
    showAllPipelineAttention = false;
    showAllPipelineOpportunities = false;
    showAllPipelineActivity = false;
    showAllPipelineActions = false;
    renderPipeline();
    renderRankings();
    renderProperties();
    renderPassedProperties();
  });
  document.getElementById("propertySort").addEventListener("change", renderProperties);
  document.getElementById("exportBtn").addEventListener("click", () => {
    const blob = new Blob([JSON.stringify({ properties, tasks, docs, scopes, featureRequests, chatMessages }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "flip-pipeline-export.json";
    link.click();
    URL.revokeObjectURL(url);
  });

  document.getElementById("addFeatureRequestBtn").addEventListener("click", addFeatureRequest);

  moneyInputIds.forEach((id) => {
    const input = document.getElementById(id);
    input.addEventListener("input", calculateOffer);
    input.addEventListener("focus", () => {
      input.value = parseMoneyInput(input.value) || "";
      input.select();
    });
    input.addEventListener("blur", () => {
      formatMoneyInput(input);
      calculateOffer();
    });
  });
  ["calcWeeksAcq", "calcWeeksRehab", "calcWeeksSale"].forEach((id) => {
    document.getElementById(id)?.addEventListener("input", () => {
      updateTimelineEstimate();
      calculateOffer();
    });
  });
  document.getElementById("saveUnderwritingBtn").addEventListener("click", saveUnderwriting);
  document.getElementById("saveUnderwritingTopBtn")?.addEventListener("click", saveUnderwriting);
  document.getElementById("calcAddToPipeline")?.addEventListener("click", () => setActiveView("pipeline"));
  document.querySelector("[data-open-scope-from-calc]")?.addEventListener("click", () => setActiveView("scope"));
  document.querySelectorAll("[data-calc-tab]").forEach((button) => {
    button.addEventListener("click", () => setCalculatorTab(button.dataset.calcTab));
  });
  setCalculatorTab("purchase");
  document.getElementById("resetUnderwritingBtn").addEventListener("click", () => {
    const property = properties.find((item) => item.id === document.getElementById("calcProperty").value);
    if (!property) return;
    const currentUnderwriting = property.underwriting;
    property.underwriting = null;
    syncCalculator();
    property.underwriting = currentUnderwriting;
    document.getElementById("calcSaveStatus").textContent = "Reset locally";
  });

  document.getElementById("calcProperty").addEventListener("change", (event) => {
    selectedId = event.target.value;
    renderProperties();
    syncCalculator();
  });

  document.getElementById("addScopeBtn").addEventListener("click", addScopeItem);
  document.getElementById("scopeProperty").addEventListener("change", (event) => {
    selectedId = event.target.value;
    renderScope();
  });
  document.getElementById("scopeOpenPropertyBtn").addEventListener("click", () => {
    const property = selectedScopeProperty();
    if (property) openPropertyDetail(property.id);
  });
  document.getElementById("scopeApplyRehabBtn").addEventListener("click", applySelectedScopeToCalculator);
  ["scopeCost", "scopeActualCost"].forEach((id) => {
    const input = document.getElementById(id);
    input.addEventListener("focus", (event) => {
      event.target.value = parseMoneyInput(event.target.value) || "";
      event.target.select();
    });
    input.addEventListener("blur", (event) => {
      if (event.target.value.trim()) formatMoneyInput(event.target);
    });
  });
  ["scopeItem", "scopeCost", "scopeActualCost"].forEach((id) => {
    document.getElementById(id).addEventListener("keydown", (event) => {
      if (event.key === "Enter") addScopeItem();
    });
  });

  document.getElementById("addTaskBtn")?.addEventListener("click", async () => {
    const property = properties.find((item) => item.id === document.getElementById("taskProperty").value);
    const text = document.getElementById("taskText").value.trim();
    if (!property || !text) return;
    const localTask = {
      id: crypto.randomUUID(),
      property_id: property.id,
      title: text,
      owner: document.getElementById("taskOwner").value,
      due_date: document.getElementById("taskDue").value || null,
      status: "Open",
      created_at: new Date().toISOString()
    };
    if (!apiAvailable) {
      tasks.push(localTask);
      storeLocalState();
      document.getElementById("taskText").value = "";
      renderTasks();
      return;
    }
    const response = await fetch(`/api/properties/${property.id}/tasks`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
      title: text,
      owner: document.getElementById("taskOwner").value,
        dueDate: document.getElementById("taskDue").value || null
      })
    });
    if (!response.ok) throw new Error("Could not save task.");
    const { task } = await response.json();
    tasks.push(task);
    document.getElementById("taskText").value = "";
    renderTasks();
  });

  document.getElementById("addDocBtn").addEventListener("click", async () => {
    const property = properties.find((item) => item.id === document.getElementById("docProperty").value);
    const name = document.getElementById("docName").value.trim();
    if (!property || !name) return;
    const localDocument = {
      id: crypto.randomUUID(),
      property_id: property.id,
      name,
      type: document.getElementById("docType").value,
      url: document.getElementById("docUrl").value.trim() || null,
      created_at: new Date().toISOString()
    };
    if (!apiAvailable) {
      docs.push(localDocument);
      storeLocalState();
      document.getElementById("docName").value = "";
      document.getElementById("docUrl").value = "";
      renderDocuments();
      return;
    }
    const response = await fetch(`/api/properties/${property.id}/documents`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name,
        type: document.getElementById("docType").value,
        url: document.getElementById("docUrl").value.trim() || null
      })
    });
    if (!response.ok) throw new Error("Could not save document.");
    const { document: documentRecord } = await response.json();
    docs.push(documentRecord);
    document.getElementById("docName").value = "";
    document.getElementById("docUrl").value = "";
    renderDocuments();
  });

  document.getElementById("chatComposer")?.addEventListener("submit", sendChatMessage);
  document.getElementById("chatRefreshBtn")?.addEventListener("click", async () => {
    const statusEl = document.getElementById("chatStatus");
    if (statusEl) statusEl.textContent = "Refreshing...";
    await refreshChatMessages(activeChatChannel);
    if (statusEl) statusEl.textContent = "";
    renderChat();
  });

  document.getElementById("addMemberBtn").addEventListener("click", () => {
    const name = document.getElementById("memberName").value.trim();
    if (!name) return;
    teamMembers.push({ name, role: document.getElementById("memberRole").value });
    document.getElementById("memberName").value = "";
    renderTeam();
    renderCalculatorOptions();
  });

  document.addEventListener("visibilitychange", updateChatPolling);
}

function startApp() {
  return loadData()
    .then(() => {
      bindEvents();
      renderAll();
      handleRoute();
      updateChatPolling();
    })
    .catch((error) => {
      document.body.innerHTML = `<main class="view active"><section class="panel"><h1>Property data could not load</h1><p>${escapeHtml(error?.message || "Unknown error")}</p></section></main>`;
    });
}

// Login gate
const LOGIN_KEY = "sc_user";
const loginScreen = document.getElementById("loginScreen");
const appShell = document.querySelector(".app-shell");
const loginForm = document.getElementById("loginForm");
const loginError = document.getElementById("loginError");
const sidebarUser = document.getElementById("sidebarUser");
const sidebarUserName = document.getElementById("sidebarUserName");
let appStarted = false;

function showLoginError(msg) {
  loginError.textContent = msg;
  loginError.style.display = "block";
}

function applySession(name, role) {
  currentUser = { name: name || "Team", role: role || "team" };
  loginScreen.style.display = "none";
  appShell.style.display = "";
  sidebarUser.style.display = "flex";
  document.getElementById("sidebarAvatar").textContent = personInitials(name);
  const email = `${name.toLowerCase().replace(/[^a-z]+/g, ".").replace(/^\.+|\.+$/g, "")}@stakercollins.com`;
  sidebarUserName.innerHTML = `<strong>${escapeHtml(name)}</strong>${escapeHtml(email)}`;
}

function bootAuthenticatedApp(name, role) {
  applySession(name, role);
  if (appStarted) return;
  appStarted = true;
  startApp();
}

const saved = localStorage.getItem(LOGIN_KEY);
if (saved) {
  try {
    const { name, role } = JSON.parse(saved);
    if (name) {
      bootAuthenticatedApp(name, role);
    } else {
      throw new Error("bad session");
    }
  } catch {
    localStorage.removeItem(LOGIN_KEY);
    loginScreen.style.display = "flex";
    appShell.style.display = "none";
  }
} else {
  loginScreen.style.display = "flex";
  appShell.style.display = "none";
}

loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = document.getElementById("loginName").value;
  const phone = document.getElementById("loginPhone").value.trim();
  const btn = document.getElementById("loginSubmit");
  if (!name) return showLoginError("Please select your name.");
  if (!phone) return showLoginError("Please enter your phone number.");
  btn.disabled = true;
  btn.textContent = "Signing in...";
  loginError.style.display = "none";
  try {
    const res = await fetch("/api/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, phone })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return showLoginError(data.error || "Name or password is incorrect.");
    }
    localStorage.setItem(LOGIN_KEY, JSON.stringify({ name: data.name, role: data.role }));
    bootAuthenticatedApp(data.name, data.role);
  } catch {
    showLoginError("Could not reach the login service. Try again in a moment.");
  } finally {
    btn.disabled = false;
    btn.textContent = "Sign In";
  }
});

document.getElementById("logoutBtn").addEventListener("click", () => {
  stopChatPolling();
  localStorage.removeItem(LOGIN_KEY);
  location.reload();
});
// End login gate
