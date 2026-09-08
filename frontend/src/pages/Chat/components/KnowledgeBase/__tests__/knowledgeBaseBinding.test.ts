import { describe, expect, it, vi } from 'vitest';
import {
  bindKnowledgeBaseChange,
  syncStaleKnowledgeBaseBinding,
  unbindCurrentChatIfDeletedKb,
} from '../knowledgeBaseBinding';
import { useKnowledgeBaseCatalog } from '@/store/useKnowledgeBaseCatalog';

describe('bindKnowledgeBaseChange', () => {
  it('updates store without PATCH when there is no conversation', () => {
    const setKnowledgeBaseId = vi.fn();
    const patchConversation = vi.fn();

    bindKnowledgeBaseChange('kb-2', 'kb-1', {
      conversationId: null,
      useMock: false,
      setKnowledgeBaseId,
      patchConversation,
      onPatchError: vi.fn(),
    });

    expect(setKnowledgeBaseId).toHaveBeenCalledWith('kb-2');
    expect(patchConversation).not.toHaveBeenCalled();
  });

  it('rolls back when PATCH fails', async () => {
    const setKnowledgeBaseId = vi.fn();
    const patchConversation = vi
      .fn()
      .mockRejectedValue(new Error('network down'));
    const onPatchError = vi.fn();

    bindKnowledgeBaseChange('kb-2', 'kb-1', {
      conversationId: 'conv-1',
      useMock: false,
      setKnowledgeBaseId,
      patchConversation,
      onPatchError,
    });

    await Promise.resolve();
    await Promise.resolve();

    expect(setKnowledgeBaseId).toHaveBeenNthCalledWith(1, 'kb-2');
    expect(setKnowledgeBaseId).toHaveBeenNthCalledWith(2, 'kb-1');
    expect(onPatchError).toHaveBeenCalled();
  });

  it('does not PATCH in mock mode', () => {
    const setKnowledgeBaseId = vi.fn();
    const patchConversation = vi.fn();

    bindKnowledgeBaseChange('kb-2', null, {
      conversationId: 'conv-1',
      useMock: true,
      setKnowledgeBaseId,
      patchConversation,
      onPatchError: vi.fn(),
    });

    expect(setKnowledgeBaseId).toHaveBeenCalledWith('kb-2');
    expect(patchConversation).not.toHaveBeenCalled();
  });

  it('PATCHes null to unbind an existing conversation', async () => {
    const setKnowledgeBaseId = vi.fn();
    const patchConversation = vi.fn().mockResolvedValue({});

    bindKnowledgeBaseChange(null, 'kb-1', {
      conversationId: 'conv-1',
      useMock: false,
      setKnowledgeBaseId,
      patchConversation,
      onPatchError: vi.fn(),
    });

    await Promise.resolve();

    expect(setKnowledgeBaseId).toHaveBeenCalledWith(null);
    expect(patchConversation).toHaveBeenCalledWith('conv-1', {
      knowledgeBaseId: null,
    });
    expect(setKnowledgeBaseId).toHaveBeenCalledTimes(1);
  });
});

describe('unbindCurrentChatIfDeletedKb', () => {
  it('clears binding and PATCHes null for the current conversation', async () => {
    const setKnowledgeBaseId = vi.fn();
    const patchConversation = vi.fn().mockResolvedValue({});

    await unbindCurrentChatIfDeletedKb('kb-1', 'kb-1', 'conv-1', {
      useMock: false,
      setKnowledgeBaseId,
      patchConversation,
      onPatchError: vi.fn(),
    });

    expect(setKnowledgeBaseId).toHaveBeenCalledWith(null);
    expect(patchConversation).toHaveBeenCalledWith('conv-1', {
      knowledgeBaseId: null,
    });
  });

  it('does nothing when another kb is bound', async () => {
    const setKnowledgeBaseId = vi.fn();
    const patchConversation = vi.fn();

    await unbindCurrentChatIfDeletedKb('kb-1', 'kb-2', 'conv-1', {
      useMock: false,
      setKnowledgeBaseId,
      patchConversation,
      onPatchError: vi.fn(),
    });

    expect(setKnowledgeBaseId).not.toHaveBeenCalled();
    expect(patchConversation).not.toHaveBeenCalled();
  });

  it('clears UI without PATCH when there is no conversation', async () => {
    const setKnowledgeBaseId = vi.fn();
    const patchConversation = vi.fn();

    await unbindCurrentChatIfDeletedKb('kb-1', 'kb-1', null, {
      useMock: false,
      setKnowledgeBaseId,
      patchConversation,
      onPatchError: vi.fn(),
    });

    expect(setKnowledgeBaseId).toHaveBeenCalledWith(null);
    expect(patchConversation).not.toHaveBeenCalled();
  });

  it('clears UI without PATCH in mock mode', async () => {
    const setKnowledgeBaseId = vi.fn();
    const patchConversation = vi.fn();

    await unbindCurrentChatIfDeletedKb('kb-1', 'kb-1', 'conv-1', {
      useMock: true,
      setKnowledgeBaseId,
      patchConversation,
      onPatchError: vi.fn(),
    });

    expect(setKnowledgeBaseId).toHaveBeenCalledWith(null);
    expect(patchConversation).not.toHaveBeenCalled();
  });

  it('does nothing when the current binding is already empty', async () => {
    const setKnowledgeBaseId = vi.fn();
    const patchConversation = vi.fn();

    await unbindCurrentChatIfDeletedKb('kb-1', null, 'conv-1', {
      useMock: false,
      setKnowledgeBaseId,
      patchConversation,
      onPatchError: vi.fn(),
    });

    expect(setKnowledgeBaseId).not.toHaveBeenCalled();
    expect(patchConversation).not.toHaveBeenCalled();
  });

  it('still clears UI when PATCH fails after delete', async () => {
    const setKnowledgeBaseId = vi.fn();
    const patchConversation = vi.fn().mockRejectedValue(new Error('offline'));
    const onPatchError = vi.fn();

    await unbindCurrentChatIfDeletedKb('kb-1', 'kb-1', 'conv-1', {
      useMock: false,
      setKnowledgeBaseId,
      patchConversation,
      onPatchError,
    });

    expect(setKnowledgeBaseId).toHaveBeenCalledWith(null);
    expect(onPatchError).toHaveBeenCalled();
  });
});

describe('syncStaleKnowledgeBaseBinding', () => {
  it('PATCHes null when server id is absent from a ready catalog', async () => {
    useKnowledgeBaseCatalog.setState({
      items: [],
      status: 'ready',
      error: null,
    });
    const patchConversation = vi.fn().mockResolvedValue({});

    await syncStaleKnowledgeBaseBinding('conv-1', 'gone-id', {
      useMock: false,
      patchConversation,
    });

    expect(patchConversation).toHaveBeenCalledWith('conv-1', {
      knowledgeBaseId: null,
    });
  });

  it('does not PATCH while the catalog is still loading', async () => {
    useKnowledgeBaseCatalog.setState({
      items: [],
      status: 'loading',
      error: null,
    });
    const patchConversation = vi.fn();

    await syncStaleKnowledgeBaseBinding('conv-1', 'gone-id', {
      useMock: false,
      patchConversation,
    });

    expect(patchConversation).not.toHaveBeenCalled();
  });

  it('does not PATCH when the server id is still in the catalog', async () => {
    useKnowledgeBaseCatalog.setState({
      items: [
        {
          id: 'kb-1',
          name: '库A',
          description: '',
          createdAt: 0,
          updatedAt: 0,
        },
      ],
      status: 'ready',
      error: null,
    });
    const patchConversation = vi.fn();

    await syncStaleKnowledgeBaseBinding('conv-1', 'kb-1', {
      useMock: false,
      patchConversation,
    });

    expect(patchConversation).not.toHaveBeenCalled();
  });

  it('does not PATCH without a conversation or server id', async () => {
    useKnowledgeBaseCatalog.setState({
      items: [],
      status: 'ready',
      error: null,
    });
    const patchConversation = vi.fn();

    await syncStaleKnowledgeBaseBinding(null, 'gone-id', {
      useMock: false,
      patchConversation,
    });
    await syncStaleKnowledgeBaseBinding('conv-1', null, {
      useMock: false,
      patchConversation,
    });
    await syncStaleKnowledgeBaseBinding('conv-1', 'gone-id', {
      useMock: true,
      patchConversation,
    });

    expect(patchConversation).not.toHaveBeenCalled();
  });

  it('swallows PATCH failures', async () => {
    useKnowledgeBaseCatalog.setState({
      items: [],
      status: 'ready',
      error: null,
    });
    const patchConversation = vi.fn().mockRejectedValue(new Error('offline'));

    await expect(
      syncStaleKnowledgeBaseBinding('conv-1', 'gone-id', {
        useMock: false,
        patchConversation,
      }),
    ).resolves.toBeUndefined();
  });
});
