import { describe, expect, it } from 'vitest';
import { formatDateYYYYMMDD, formatFileSize } from './formatTime';

describe('formatDateYYYYMMDD', () => {
  it('formats a timestamp as YYYY-MM-DD', () => {
    expect(formatDateYYYYMMDD(Date.UTC(2026, 8, 3, 12, 0, 0))).toMatch(
      /^\d{4}-\d{2}-\d{2}$/,
    );
    expect(formatDateYYYYMMDD(new Date(2026, 0, 5).getTime())).toBe(
      '2026-01-05',
    );
  });
});

describe('formatFileSize', () => {
  it('formats bytes, KB and MB', () => {
    expect(formatFileSize(512)).toBe('512 B');
    expect(formatFileSize(2048)).toBe('2.0 KB');
    expect(formatFileSize(5 * 1024)).toBe('5.0 KB');
    expect(formatFileSize(2.5 * 1024 * 1024)).toBe('2.5 MB');
  });
});
