import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { OpenAICompatibleAdapter } from './openaiCompatible.js';
import { LLMAdapterError } from './types.js';

const config = {
  apiUrl: 'https://api.openai.com/v1/chat/completions',
  apiKey: 'sk-test',
  model: 'gpt-4o-mini',
};

describe('OpenAICompatibleAdapter', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns reply content on success', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: 'Hello from AI' } }],
        }),
        { status: 200 },
      ),
    );

    const adapter = new OpenAICompatibleAdapter();
    const result = await adapter.chat(
      [{ role: 'user', content: 'Hi' }],
      config,
    );

    expect(result).toBe('Hello from AI');
    expect(fetch).toHaveBeenCalledWith(
      config.apiUrl,
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer sk-test',
        }),
      }),
    );
  });

  it('throws LLM_API_ERROR on non-2xx response', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response('Unauthorized', { status: 401 }),
    );

    const adapter = new OpenAICompatibleAdapter();

    await expect(
      adapter.chat([{ role: 'user', content: 'Hi' }], config),
    ).rejects.toMatchObject({
      code: 'LLM_API_ERROR',
    });
  });

  it('throws NETWORK_ERROR on fetch failure', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error('Network down'));

    const adapter = new OpenAICompatibleAdapter();

    await expect(
      adapter.chat([{ role: 'user', content: 'Hi' }], config),
    ).rejects.toMatchObject({
      code: 'NETWORK_ERROR',
    });
  });

  it('throws REQUEST_TIMEOUT on abort', async () => {
    vi.mocked(fetch).mockImplementationOnce(
      () =>
        new Promise((_resolve, reject) => {
          const error = new Error('Aborted');
          error.name = 'AbortError';
          reject(error);
        }),
    );

    const adapter = new OpenAICompatibleAdapter();

    await expect(
      adapter.chat([{ role: 'user', content: 'Hi' }], config),
    ).rejects.toMatchObject({
      code: 'REQUEST_TIMEOUT',
    });
  });

  it('throws LLM_API_ERROR when response has no content', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ choices: [] }), { status: 200 }),
    );

    const adapter = new OpenAICompatibleAdapter();

    await expect(
      adapter.chat([{ role: 'user', content: 'Hi' }], config),
    ).rejects.toBeInstanceOf(LLMAdapterError);
  });

  it('yields streamed delta content from SSE', async () => {
    const sse = [
      'data: {"choices":[{"delta":{"content":"Hel"}}]}',
      '',
      'data: {"choices":[{"delta":{"content":"lo"}}]}',
      '',
      'data: [DONE]',
      '',
    ].join('\n');

    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(sse, {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' },
      }),
    );

    const adapter = new OpenAICompatibleAdapter();
    const chunks: string[] = [];
    for await (const delta of adapter.chatStream(
      [{ role: 'user', content: 'Hi' }],
      config,
    )) {
      chunks.push(delta);
    }

    expect(chunks.join('')).toBe('Hello');
    const body = JSON.parse(
      vi.mocked(fetch).mock.calls[0][1]?.body as string,
    ) as { stream: boolean };
    expect(body.stream).toBe(true);
  });

  it('throws LLM_API_ERROR on non-2xx stream response', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response('Unauthorized', { status: 401 }),
    );

    const adapter = new OpenAICompatibleAdapter();

    await expect(async () => {
      for await (const _ of adapter.chatStream(
        [{ role: 'user', content: 'Hi' }],
        config,
      )) {
        // drain
      }
    }).rejects.toMatchObject({
      code: 'LLM_API_ERROR',
    });
  });

  it('throws LLM_API_ERROR when stream yields no content', async () => {
    const sse = ['data: {"choices":[{"delta":{}}]}', '', 'data: [DONE]', ''].join(
      '\n',
    );

    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(sse, {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' },
      }),
    );

    const adapter = new OpenAICompatibleAdapter();

    await expect(async () => {
      for await (const _ of adapter.chatStream(
        [{ role: 'user', content: 'Hi' }],
        config,
      )) {
        // drain
      }
    }).rejects.toBeInstanceOf(LLMAdapterError);
  });

  it('throws REQUEST_TIMEOUT on stream abort', async () => {
    vi.mocked(fetch).mockImplementationOnce(
      () =>
        new Promise((_resolve, reject) => {
          const error = new Error('Aborted');
          error.name = 'AbortError';
          reject(error);
        }),
    );

    const adapter = new OpenAICompatibleAdapter();

    await expect(async () => {
      for await (const _ of adapter.chatStream(
        [{ role: 'user', content: 'Hi' }],
        config,
      )) {
        // drain
      }
    }).rejects.toMatchObject({
      code: 'REQUEST_TIMEOUT',
    });
  });
});
