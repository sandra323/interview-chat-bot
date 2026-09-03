/**
 * 使用服务端 `offset`（delta 之前的 buffer 长度）对齐流式 reply 分块。
 * 返回 apply / ignore / gap —— 不修改输入。
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

  // safeOffset 已等于 len
  return { action: 'apply', content: currentContent + delta };
}

/** 从 catchup 快照重建：保留 offset 前前缀，再接服务端尾部。 */
export function mergeCatchupContent(
  currentContent: string,
  catchupContent: string,
  offset: number,
): string {
  const safeOffset = Math.max(0, offset);
  return currentContent.slice(0, safeOffset) + catchupContent;
}
