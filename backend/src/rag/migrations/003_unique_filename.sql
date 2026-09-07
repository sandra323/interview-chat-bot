-- 同一用户、同一知识库下文件名唯一（不区分大小写），避免并发同名上传。
CREATE UNIQUE INDEX IF NOT EXISTS idx_doc_owner_kb_filename
  ON documents (owner_username, knowledge_base_id, lower(filename));
