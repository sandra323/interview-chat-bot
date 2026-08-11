/**
 * Align streaming reply chunks using server `offset` (buffer length *before* delta).
 * Returns apply / ignore / gap — never mutates inputs.
 */
export type AlignDeltaResult =
  | { action: 'apply'; content: string }
  | { action: 'ignore' }
  | { action: 'gap' };

export function alignReplyDelta(
  currentContent: string,
  delta: string,
  offset: number,
): AlignDeltaResult {
  const len = currentContent.length;
  const safeOffset = Math.max(0, offset);

  if (safeOffset > len) {
    return { action: 'gap' };
  }

  const end = safeOffset + delta.length;
  if (end <= len) {
    return { action: 'ignore' };
  }

  if (safeOffset < len) {
    const suffix = delta.slice(len - safeOffset);
    if (!suffix) return { action: 'ignore' };
    return { action: 'apply', content: currentContent + suffix };
  }

  // safeOffset === len
  return { action: 'apply', content: currentContent + delta };
}

/** Rebuild from catchup snapshot: keep prefix before offset, then server tail. */
export function mergeCatchupContent(
  currentContent: string,
  catchupContent: string,
  offset: number,
): string {
  const safeOffset = Math.max(0, offset);
  return currentContent.slice(0, safeOffset) + catchupContent;
}
