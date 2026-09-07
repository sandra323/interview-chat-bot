import { describe, expect, it } from 'vitest';
import {
  isSafeTestDatabaseUrl,
  resolvePgTestDatabaseUrl,
  toTestDatabaseUrl,
} from './testDatabase.js';

describe('testDatabase URL safety', () => {
  it('only treats *_test names as safe', () => {
    expect(
      isSafeTestDatabaseUrl(
        'postgresql://chatbot:x@localhost:5433/interview_chat',
      ),
    ).toBe(false);
    expect(
      isSafeTestDatabaseUrl(
        'postgresql://chatbot:x@localhost:5433/interview_chat_test',
      ),
    ).toBe(true);
  });

  it('derives a _test URL from the business database', () => {
    expect(
      toTestDatabaseUrl('postgresql://chatbot:x@localhost:5433/interview_chat'),
    ).toBe('postgresql://chatbot:x@localhost:5433/interview_chat_test');
  });

  it('never resolves the business database name', () => {
    const resolved = resolvePgTestDatabaseUrl({
      DATABASE_URL: 'postgresql://chatbot:x@localhost:5433/interview_chat',
    });
    expect(resolved).toContain('/interview_chat_test');
    expect(resolved.endsWith('/interview_chat')).toBe(false);
  });

  it('rejects an unsafe explicit TEST_DATABASE_URL', () => {
    expect(
      resolvePgTestDatabaseUrl({
        TEST_DATABASE_URL:
          'postgresql://chatbot:x@localhost:5433/interview_chat',
      }),
    ).toBe('');
  });
});
