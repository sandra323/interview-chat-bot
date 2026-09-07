-- knowledge_bases
CREATE TABLE IF NOT EXISTS knowledge_bases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), -- 知识库ID
  owner_username TEXT NOT NULL, -- 用户名
  name TEXT NOT NULL, -- 知识库名称
  description TEXT DEFAULT '', -- 知识库描述
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), -- 创建时间
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now() -- 更新时间
);
CREATE INDEX IF NOT EXISTS idx_kb_owner -- 用户名和更新时间索引
  ON knowledge_bases(owner_username, updated_at DESC);

-- documents
CREATE TABLE IF NOT EXISTS documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), -- 文档ID
  knowledge_base_id UUID NOT NULL REFERENCES knowledge_bases(id) ON DELETE CASCADE, -- 知识库ID
  owner_username TEXT NOT NULL, -- 用户名
  filename TEXT NOT NULL, -- 文件名
  mime_type TEXT NOT NULL, -- 文件类型
  size_bytes BIGINT NOT NULL DEFAULT 0, -- 文件大小
  storage_path TEXT NOT NULL, -- 存储路径
  content_hash TEXT, -- 内容哈希
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('uploading','pending','processing','ready','failed')), -- 状态
  progress INT NOT NULL DEFAULT 0, -- 进度
  error TEXT, -- 错误
  embedding_model TEXT, -- 嵌入模型
  embedding_model_version TEXT, -- 嵌入模型版本
  chunk_count INT NOT NULL DEFAULT 0, -- 块数量
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), -- 创建时间
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(), -- 更新时间
  source_relative_path TEXT -- 源相对路径
);
CREATE INDEX IF NOT EXISTS idx_doc_owner_kb -- 用户名和知识库ID和创建时间索引
  ON documents(owner_username, knowledge_base_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_doc_content_hash -- 内容哈希索引
  ON documents(content_hash);

-- document_chunks
CREATE TABLE IF NOT EXISTS document_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), -- 文档块ID
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE, -- 文档ID
  knowledge_base_id UUID NOT NULL, -- 知识库ID
  owner_username TEXT NOT NULL, -- 用户名
  content TEXT NOT NULL, -- 内容
  embedding vector(1536), -- 嵌入向量
  fts_tokens TEXT DEFAULT '', -- 全文搜索分词
  search_tsv tsvector GENERATED ALWAYS AS (to_tsvector('simple', coalesce(fts_tokens, ''))) STORED, -- 全文搜索向量
  chunk_index INT NOT NULL DEFAULT 0, -- 块索引
  metadata JSONB DEFAULT '{}', -- 元数据
  embedding_model TEXT, -- 嵌入模型
  created_at TIMESTAMPTZ NOT NULL DEFAULT now() -- 创建时间
);
CREATE INDEX IF NOT EXISTS idx_chunk_owner_kb -- 用户名和知识库ID索引
  ON document_chunks(owner_username, knowledge_base_id);
CREATE INDEX IF NOT EXISTS idx_chunk_doc -- 文档ID索引
  ON document_chunks(document_id);
CREATE INDEX IF NOT EXISTS idx_chunk_fts -- 全文搜索索引
  ON document_chunks USING GIN(search_tsv);
CREATE INDEX IF NOT EXISTS idx_chunk_embedding -- 嵌入向量索引
  ON document_chunks USING hnsw(embedding vector_cosine_ops);
