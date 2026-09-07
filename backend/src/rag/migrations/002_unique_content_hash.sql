-- 同一用户、同一知识库下 content_hash 唯一，避免并发重复上传。
CREATE UNIQUE INDEX IF NOT EXISTS idx_doc_owner_kb_hash
  ON documents (owner_username, knowledge_base_id, content_hash)
  WHERE content_hash IS NOT NULL;
