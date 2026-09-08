-- 记录已从 SQLite 处理过的 document id，避免删库后重启再次迁入并复活「默认资料库」
CREATE TABLE IF NOT EXISTS legacy_sqlite_document_migrations (
  document_id UUID PRIMARY KEY,
  owner_username TEXT NOT NULL,
  migrated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_legacy_sqlite_migrations_owner
  ON legacy_sqlite_document_migrations(owner_username, migrated_at DESC);
