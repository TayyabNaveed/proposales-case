CREATE TABLE IF NOT EXISTS case_workflow.provider_assets (
 asset_key text PRIMARY KEY CHECK(length(asset_key) BETWEEN 1 AND 200),
 payload_hash text NOT NULL CHECK(length(payload_hash)=64),
 state text NOT NULL DEFAULT 'claimed' CHECK(state IN ('claimed','unknown','confirmed')),
 product_id bigint CHECK(product_id>0 AND product_id<=9007199254740991),
 variation_id bigint CHECK(variation_id>0 AND variation_id<=9007199254740991),
 image_uuid uuid,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK ((state='confirmed') = (product_id IS NOT NULL AND variation_id IS NOT NULL)),
 CHECK (image_uuid IS NULL OR state='confirmed')
);
ALTER TABLE case_workflow.provider_assets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON case_workflow.provider_assets FROM PUBLIC, anon, authenticated;
