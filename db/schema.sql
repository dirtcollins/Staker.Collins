CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS properties (
  id TEXT PRIMARY KEY,
  rank INTEGER,
  address TEXT NOT NULL,
  city TEXT NOT NULL,
  state TEXT NOT NULL,
  zip TEXT NOT NULL,
  list_price INTEGER,
  target_offer_low INTEGER,
  target_offer_high INTEGER,
  listing_agent TEXT,
  brokerage TEXT,
  phone TEXT,
  why TEXT,
  priority TEXT,
  verification_status TEXT,
  acquisition_status TEXT NOT NULL DEFAULT 'New Lead',
  property_phase TEXT NOT NULL DEFAULT 'acquisition',
  main_photo TEXT,
  quick_summary TEXT NOT NULL DEFAULT '',
  rentcast_data JSONB,
  rentcast_fetched_at TIMESTAMPTZ,
  source JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE properties ADD COLUMN IF NOT EXISTS quick_summary TEXT NOT NULL DEFAULT '';
ALTER TABLE properties ADD COLUMN IF NOT EXISTS rentcast_data JSONB;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS rentcast_fetched_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id TEXT NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  author TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'General',
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

ALTER TABLE notes ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id TEXT NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  owner TEXT,
  due_date DATE,
  status TEXT NOT NULL DEFAULT 'Open',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id TEXT NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'Other',
  url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS construction_scope (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id TEXT NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  item TEXT NOT NULL,
  estimated_cost INTEGER NOT NULL DEFAULT 0,
  actual_cost INTEGER,
  status TEXT NOT NULL DEFAULT 'Needed',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS feature_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requester TEXT NOT NULL DEFAULT 'Team',
  priority TEXT NOT NULL DEFAULT 'Nice to have',
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Open',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel TEXT NOT NULL DEFAULT 'general',
  author TEXT NOT NULL,
  author_role TEXT NOT NULL DEFAULT 'team',
  body TEXT NOT NULL,
  property_id TEXT REFERENCES properties(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS prospect_media (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id TEXT REFERENCES properties(id) ON DELETE SET NULL,
  url TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'Photo',
  category TEXT NOT NULL DEFAULT 'General',
  caption TEXT,
  mime_type TEXT,
  original_name TEXT,
  created_by TEXT NOT NULL DEFAULT 'Team',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS underwriting_snapshots (
  property_id TEXT PRIMARY KEY REFERENCES properties(id) ON DELETE CASCADE,
  list_price_cents BIGINT NOT NULL DEFAULT 0,
  arv_cents BIGINT NOT NULL DEFAULT 0,
  rehab_estimate_cents BIGINT NOT NULL DEFAULT 0,
  proposed_offer_cents BIGINT NOT NULL DEFAULT 0,
  closing_costs_cents BIGINT NOT NULL DEFAULT 0,
  holding_costs_cents BIGINT NOT NULL DEFAULT 0,
  financing_cost_cents BIGINT NOT NULL DEFAULT 0,
  selling_cost_cents BIGINT NOT NULL DEFAULT 0,
  target_profit_cents BIGINT NOT NULL DEFAULT 0,
  contingency_cents BIGINT NOT NULL DEFAULT 0,
  calculation JSONB NOT NULL DEFAULT '{}'::jsonb,
  notes TEXT NOT NULL DEFAULT '',
  created_by TEXT NOT NULL DEFAULT 'Team',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS activity_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id TEXT REFERENCES properties(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  actor TEXT NOT NULL DEFAULT 'Team',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS deal_scores (
  property_id TEXT PRIMARY KEY REFERENCES properties(id) ON DELETE CASCADE,
  score INTEGER NOT NULL DEFAULT 0,
  price_score INTEGER NOT NULL DEFAULT 0,
  spread_score INTEGER NOT NULL DEFAULT 0,
  priority_score INTEGER NOT NULL DEFAULT 0,
  requested_score INTEGER NOT NULL DEFAULT 0,
  profit_margin_score INTEGER NOT NULL DEFAULT 0,
  rehab_risk_score INTEGER NOT NULL DEFAULT 0,
  arv_confidence_score INTEGER NOT NULL DEFAULT 0,
  market_momentum_score INTEGER NOT NULL DEFAULT 0,
  seller_motivation_score INTEGER NOT NULL DEFAULT 0,
  score_breakdown JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE deal_scores ADD COLUMN IF NOT EXISTS profit_margin_score INTEGER NOT NULL DEFAULT 0;
ALTER TABLE deal_scores ADD COLUMN IF NOT EXISTS rehab_risk_score INTEGER NOT NULL DEFAULT 0;
ALTER TABLE deal_scores ADD COLUMN IF NOT EXISTS arv_confidence_score INTEGER NOT NULL DEFAULT 0;
ALTER TABLE deal_scores ADD COLUMN IF NOT EXISTS market_momentum_score INTEGER NOT NULL DEFAULT 0;
ALTER TABLE deal_scores ADD COLUMN IF NOT EXISTS seller_motivation_score INTEGER NOT NULL DEFAULT 0;
ALTER TABLE deal_scores ADD COLUMN IF NOT EXISTS score_breakdown JSONB NOT NULL DEFAULT '[]'::jsonb;

CREATE TABLE IF NOT EXISTS pipeline_stages (
  property_id TEXT PRIMARY KEY REFERENCES properties(id) ON DELETE CASCADE,
  stage TEXT NOT NULL DEFAULT 'New Lead',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notes_property_id ON notes(property_id);
CREATE INDEX IF NOT EXISTS idx_tasks_property_id ON tasks(property_id);
CREATE INDEX IF NOT EXISTS idx_documents_property_id ON documents(property_id);
CREATE INDEX IF NOT EXISTS idx_construction_scope_property_id ON construction_scope(property_id);
CREATE INDEX IF NOT EXISTS idx_properties_phase ON properties(property_phase);
CREATE INDEX IF NOT EXISTS idx_feature_requests_created_at ON feature_requests(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_messages_channel_created_at ON chat_messages(channel, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_messages_property_id ON chat_messages(property_id);
CREATE INDEX IF NOT EXISTS idx_prospect_media_property_id ON prospect_media(property_id);
CREATE INDEX IF NOT EXISTS idx_prospect_media_created_at ON prospect_media(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_log_property_id ON activity_log(property_id);
CREATE INDEX IF NOT EXISTS idx_activity_log_created_at ON activity_log(created_at DESC);
