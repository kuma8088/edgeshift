-- migrations/009_restore_campaign_indexes.sql
-- Restore indexes lost during migration 008 table recreation
-- These indexes were originally defined in schema.sql but lost when
-- campaigns table was recreated to fix CHECK constraint

-- Unique index for campaign slugs (public blog URLs)
CREATE UNIQUE INDEX IF NOT EXISTS idx_campaigns_slug ON campaigns(slug);

-- Composite index for published campaign queries
CREATE INDEX IF NOT EXISTS idx_campaigns_published ON campaigns(is_published, published_at);
