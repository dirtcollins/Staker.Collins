CREATE TABLE IF NOT EXISTS schema_migrations (
  version TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE properties ADD COLUMN IF NOT EXISTS list_price_cents BIGINT;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS target_offer_low_cents BIGINT;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS target_offer_high_cents BIGINT;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'properties' AND column_name = 'list_price'
  ) THEN
    UPDATE properties
    SET list_price_cents = COALESCE(list_price_cents, list_price::bigint * 100)
    WHERE list_price IS NOT NULL;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'properties' AND column_name = 'target_offer_low'
  ) THEN
    UPDATE properties
    SET target_offer_low_cents = COALESCE(target_offer_low_cents, target_offer_low::bigint * 100)
    WHERE target_offer_low IS NOT NULL;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'properties' AND column_name = 'target_offer_high'
  ) THEN
    UPDATE properties
    SET target_offer_high_cents = COALESCE(target_offer_high_cents, target_offer_high::bigint * 100)
    WHERE target_offer_high IS NOT NULL;
  END IF;
END $$;

ALTER TABLE properties DROP COLUMN IF EXISTS list_price;
ALTER TABLE properties DROP COLUMN IF EXISTS target_offer_low;
ALTER TABLE properties DROP COLUMN IF EXISTS target_offer_high;

INSERT INTO schema_migrations (version)
VALUES ('20260524_money_to_cents')
ON CONFLICT DO NOTHING;
