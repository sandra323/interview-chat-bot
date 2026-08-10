/**
 * Unified HTTP API envelope for frontend-facing routes under `/api/*`.
 *
 * Success:  { code: 0, msg: "success", data: { ... } }
 * Failure:  { code: <non-zero>, msg: "<user-facing hint>", data: null }
 *
 * Probe routes like `/health` stay outside this shape so load balancers
 * can keep checking a simple status payload.
 */

/** Business / protocol codes (not always identical to HTTP status). */
export const ApiCode = {
  SUCCESS: 0,
  BAD_REQUEST: 40000,
  NOT_FOUND: 40400,
  INTERNAL_ERROR: 50000,
} as const;

export type ApiCodeValue = (typeof ApiCode)[keyof typeof ApiCode];

export interface ApiResponse<T = unknown> {
  code: number;
  msg: string;
  data: T | null;
}
