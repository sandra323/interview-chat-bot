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
  it('PATCHes null when server id is absent from catalog', async () => {
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
});
