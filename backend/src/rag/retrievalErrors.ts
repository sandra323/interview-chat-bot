/** 调用方参数不合法（非法 UUID、向量维度/非有限值等）。 */
export class RetrievalQueryError extends Error {
  readonly userMessage = '检索参数无效';

  constructor(detail = 'retrieval-query-invalid') {
    super(detail);
    this.name = 'RetrievalQueryError';
  }
}

/** PostgreSQL / 基础设施不可用。不要与 PersistError（入库失败）混用。 */
export class RetrievalUnavailableError extends Error {
  readonly userMessage = '知识库检索暂时不可用';

  constructor(cause?: unknown) {
    super('retrieval-unavailable');
    this.name = 'RetrievalUnavailableError';
    if (cause instanceof Error) {
      this.cause = cause;
    }
  }
}
