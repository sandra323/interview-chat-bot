/** 固定文案，不经过模型改写。 */

export const LIBRARY_NO_HIT_REPLY =
  '知识库中没有查询到与这个问题相关的信息，因此无法回答。我不会根据聊天记录或常识进行推测。';

export const LIBRARY_GONE_REPLY =
  '知识库已删除或不可用，查询不到相关信息。我不会根据聊天记录推测或补全资料内容。';

export const LIBRARY_UNAVAILABLE_REPLY =
  '知识库暂时无法检索，不能确认资料中是否有相关信息，因此不会推测回答。';

export type LibraryRefusalReason = 'no_hit' | 'gone' | 'unavailable';

export function libraryRefusalText(reason: LibraryRefusalReason): string {
  if (reason === 'no_hit') return LIBRARY_NO_HIT_REPLY;
  if (reason === 'gone') return LIBRARY_GONE_REPLY;
  return LIBRARY_UNAVAILABLE_REPLY;
}
