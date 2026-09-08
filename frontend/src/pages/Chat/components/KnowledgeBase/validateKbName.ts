import { KB_NAME_MAX } from '@ai-chat/shared';

export const KB_DESCRIPTION_MAX = 2000;

/** trim、长度、与现有列表冲突（大小写敏感）。 */
export function validateKbName(
  raw: string,
  existingNames: string[],
  options?: { currentName?: string },
): string | null {
  const name = raw.trim();
  if (!name) {
    return '哎呀，知识库名称不对，请换个 1 到 100 字的名称';
  }
  if (name.length > KB_NAME_MAX) {
    return '哎呀，知识库名称不对，请换个 1 到 100 字的名称';
  }
  const current = options?.currentName?.trim();
  const conflict = existingNames.some(
    (existing) => existing === name && existing !== current,
  );
  if (conflict) {
    return '哎呀，已经有同名知识库了，请换个名称';
  }
  return null;
}

export function validateKbDescription(raw: string): string | null {
  if (raw.trim().length > KB_DESCRIPTION_MAX) {
    return '哎呀，描述太长了，请缩短后再试';
  }
  return null;
}
