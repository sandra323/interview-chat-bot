/** 未配置 VOYAGE_API_KEY，或生产环境 URL 非 https。编排层降级为 RRF。 */
export class RerankConfigError extends Error {
  constructor(detail = 'rerank-not-configured') {
    super(detail);
    this.name = 'RerankConfigError';
  }
}

/** 超时 / 429 / 5xx 等基础设施失败。编排层 fail-open，不穿透到 Phase 7。 */
export class RerankUnavailableError extends Error {
  constructor(cause?: unknown) {
    super('rerank-unavailable');
    this.name = 'RerankUnavailableError';
    if (cause instanceof Error) {
      this.cause = cause;
    }
  }
}

/** 响应缺 data、index 非法、分数非有限。编排层 fail-open。 */
export class RerankResponseError extends Error {
  constructor(detail = 'rerank-response-invalid') {
    super(detail);
    this.name = 'RerankResponseError';
  }
}

/** 配额/余额不足。不重试；编排层 fail-open。不要与 EmbedQuotaError 混用。 */
export class RerankQuotaError extends Error {
  constructor() {
    super('rerank-quota-exhausted');
    this.name = 'RerankQuotaError';
  }
}
