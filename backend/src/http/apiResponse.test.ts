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

  it('sendFail returns null data and user msg', () => {
    const res = mockRes();
    sendFail(res as never, {
      code: ApiCode.INTERNAL_ERROR,
      msg: '哎呀，出错了',
    });
    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({
      code: ApiCode.INTERNAL_ERROR,
      msg: '哎呀，出错了',
      data: null,
    });
  });
});
