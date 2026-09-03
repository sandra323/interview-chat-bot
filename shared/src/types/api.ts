/**
 * 面向 `/api/*` 前端路由的统一 HTTP API 响应封装。
 *
 * 成功：{ code: 0, msg: "success", data: { ... } }
 * 失败：{ code: <非零>, msg: "<面向用户的提示>", data: null }
 *
 * `/health` 等探测路由不采用此结构，以便负载均衡器
 * 仍可检查简单的状态负载。
 */

/** 业务 / 协议错误码（不一定与 HTTP 状态码一一对应）。 */
export const ApiCode = {
  SUCCESS: 0,
  BAD_REQUEST: 40000,
  UNAUTHORIZED: 40100,
  /** 请求过多（例如登录暴力破解 / DoS 防护）。 */
  RATE_LIMITED: 42900,
  NOT_FOUND: 40400,
  INTERNAL_ERROR: 50000,
} as const;

export type ApiCodeValue = (typeof ApiCode)[keyof typeof ApiCode];

export interface ApiResponse<T = unknown> {
  code: number;
  msg: string;
  data: T | null;
}
