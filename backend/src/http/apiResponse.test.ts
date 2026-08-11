import { describe, expect, it } from 'vitest';
import { ApiCode } from '@ai-chat/shared';
import { sendFail, sendSuccess } from './apiResponse.js';

function mockRes() {
  const res = {
    statusCode: 200,
    body: null as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
  };
  return res;
}

describe('apiResponse helpers', () => {
  it('sendSuccess wraps payload with code 0', () => {
    const res = mockRes();
    sendSuccess(res as never, { items: [1] });
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({
      code: ApiCode.SUCCESS,
      msg: 'success',
      data: { items: [1] },
    });
  });

  it('sendFail maps UNAUTHORIZED to HTTP 401', () => {
    const res = mockRes();
    sendFail(res as never, {
      code: ApiCode.UNAUTHORIZED,
      msg: '请先登录',
    });
    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({
      code: ApiCode.UNAUTHORIZED,
      msg: '请先登录',
      data: null,
    });
  });
});
