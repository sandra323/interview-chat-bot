export function isValidUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export function isConfigComplete(config: {
  apiUrl?: string;
  apiKey?: string;
  model?: string;
}): boolean {
  const apiUrl = config.apiUrl?.trim() ?? '';
  const apiKey = config.apiKey?.trim() ?? '';
  const model = config.model?.trim() ?? '';
  return apiUrl !== '' && apiKey !== '' && model !== '' && isValidUrl(apiUrl);
}

export function isValidMessage(content: string): boolean {
  const trimmed = content.trim();
  return trimmed.length > 0 && trimmed.length <= 10_000;
}

export function getWebSocketUrl(): string {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}/ws`;
}
