export function isNearBottom(
  container: HTMLElement,
  threshold = 30,
): boolean {
  const { scrollTop, scrollHeight, clientHeight } = container;
  return scrollHeight - scrollTop - clientHeight < threshold;
}

export function scrollToBottom(container: HTMLElement): void {
  container.scrollTop = container.scrollHeight;
}

export function adjustTextareaHeight(
  textarea: HTMLTextAreaElement,
  maxHeight = 160,
): void {
  textarea.style.height = 'auto';
  textarea.style.height = `${Math.min(textarea.scrollHeight, maxHeight)}px`;
}
