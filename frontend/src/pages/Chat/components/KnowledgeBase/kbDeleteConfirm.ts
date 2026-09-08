export function kbDeleteConfirmContent(name: string, isLast: boolean): string {
  const base = `确定删除「${name}」吗？库中的全部文件将一并删除，且无法恢复。正在使用该库的对话会在下次提问时按未绑定知识库处理。`;
  if (!isLast) {
    return base;
  }
  return `${base}这是你仅剩的知识库。删除后聊天将无法选择资料库，直到你重新创建。`;
}
