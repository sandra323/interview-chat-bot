import { describe, expect, it } from 'vitest';
import { toApiBaseUrl } from './createInterviewAgent.js';

describe('toApiBaseUrl', () => {
  it('converts an existing Chat Completions endpoint to a base URL', () => {
    expect(
      toApiBaseUrl('https://api.deepseek.com/chat/completions'),
    ).toBe('https://api.deepseek.com');
  });

  it('keeps an already normalized base URL unchanged', () => {
    expect(toApiBaseUrl('https://example.com/v1')).toBe(
      'https://example.com/v1',
    );
  });
});
