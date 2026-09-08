import { useCallback, useEffect, useMemo, useState } from 'react';
import { App, Button, Empty, Spin } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import type { KnowledgeBase } from '@ai-chat/shared';
import {
  createKnowledgeBase,
  deleteKnowledgeBase,
  updateKnowledgeBase,
} from '@/apis/knowledgeBases';
import { patchConversation } from '@/apis/conversations';
import { unbindCurrentChatIfDeletedKb } from './knowledgeBaseBinding';
import {
  shouldLeaveDeletedKbDetail,
  shouldRestoreLibraryDetail,
} from './librarySessionRestore';
import { userFacingApiMessage } from '@/apis/http/client';
import { USE_MOCK } from '@/config/app';
import { useChatStore } from '@/store/useChatStore';
import { useKnowledgeBaseCatalog } from '@/store/useKnowledgeBaseCatalog';
import KbDetail from './KbDetail';
import KbList from './KbList';
import KbListToolbar from './KbListToolbar';
import KbRenameModal from './KbRenameModal';
import { kbDeleteConfirmContent } from './kbDeleteConfirm';
import {
  readLibraryActiveKb,
  writeLibraryActiveKb,
} from '@/store/librarySession';
import styles from './index.module.less';

type LibraryView = 'list' | 'detail';

/**
 * 两级资料库。进入某一库不会 PATCH 当前会话。
 * 删库不清其它会话 SQLite 绑定，陈旧 id 走 Phase 7 kb_missing。
 * 新 UI 不调用跨库 GET/POST /api/documents（会写入/复活「默认资料库」）。
 */
export default function KnowledgeBase() {
  const { message, modal } = App.useApp();
  const items = useKnowledgeBaseCatalog((s) => s.items);
  const status = useKnowledgeBaseCatalog((s) => s.status);
  const upsert = useKnowledgeBaseCatalog((s) => s.upsert);
  const remove = useKnowledgeBaseCatalog((s) => s.remove);
  const load = useKnowledgeBaseCatalog((s) => s.load);

  const [view, setView] = useState<LibraryView>('list');
  const [activeKbId, setActiveKbId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'create' | 'rename'>('create');
  const [editing, setEditing] = useState<KnowledgeBase | null>(null);
  const [saving, setSaving] = useState(false);

  const goList = useCallback(() => {
    setView('list');
    setActiveKbId(null);
    writeLibraryActiveKb(null);
  }, []);

  const enterKb = useCallback((kb: KnowledgeBase) => {
    setActiveKbId(kb.id);
    setView('detail');
    writeLibraryActiveKb(kb.id);
  }, []);

  useEffect(() => {
    if (USE_MOCK) return;
    if (status === 'idle') {
      void load().catch((err: unknown) => {
        message.error(
          userFacingApiMessage(err, '哎呀，知识库列表加载失败了'),
        );
      });
    }
  }, [load, message, status]);

  useEffect(() => {
    if (status !== 'ready' || view !== 'list' || activeKbId) return;
    const stored = readLibraryActiveKb();
    if (shouldRestoreLibraryDetail(stored, items.map((kb) => kb.id))) {
      setActiveKbId(stored);
      setView('detail');
    }
  }, [activeKbId, items, status, view]);

  useEffect(() => {
    if (view !== 'detail' || !activeKbId || status !== 'ready') return;
    if (!shouldLeaveDeletedKbDetail(activeKbId, items.map((kb) => kb.id))) {
      return;
    }
    message.error('找不到这个知识库');
    remove(activeKbId);
    goList();
  }, [activeKbId, goList, items, message, remove, status, view]);

  const activeKb = useMemo(
    () => items.find((kb) => kb.id === activeKbId) ?? null,
    [activeKbId, items],
  );

  const existingNames = useMemo(
    () => items.map((kb) => kb.name),
    [items],
  );

  const openCreate = useCallback(() => {
    setModalMode('create');
    setEditing(null);
    setModalOpen(true);
  }, []);

  const openRename = useCallback((kb: KnowledgeBase) => {
    setModalMode('rename');
    setEditing(kb);
    setModalOpen(true);
  }, []);

  const handleSubmit = useCallback(
    async (values: { name: string; description: string }) => {
      setSaving(true);
      try {
        if (modalMode === 'create') {
          const created = await createKnowledgeBase({
            name: values.name,
            description: values.description || undefined,
          });
          upsert(created);
          setModalOpen(false);
          message.success('已创建知识库');
          return;
        }
        if (!editing) return;
        const updated = await updateKnowledgeBase(editing.id, {
          name: values.name,
          description: values.description,
        });
        upsert(updated);
        setModalOpen(false);
        message.success('已更新知识库');
      } catch (err: unknown) {
        message.error(
          userFacingApiMessage(err, '哎呀，知识库保存失败了，请稍后重试'),
        );
      } finally {
        setSaving(false);
      }
    },
    [editing, message, modalMode, upsert],
  );

  const handleDelete = useCallback(
    (kb: KnowledgeBase) => {
      const isLast = items.length === 1;
      modal.confirm({
        title: '删除知识库',
        content: kbDeleteConfirmContent(kb.name, isLast),
        okText: '删除',
        cancelText: '取消',
        okButtonProps: { danger: true },
        cancelButtonProps: { type: 'default' },
        onOk: async () => {
          try {
            // remove() 会先把当前绑定清成 null，必须在此之前记下原绑定，否则解绑 PATCH 会被跳过。
            const boundBeforeRemove = useChatStore.getState().knowledgeBaseId;
            const conversationId = useChatStore.getState().conversationId;
            await deleteKnowledgeBase(kb.id);
            remove(kb.id);
            if (activeKbId === kb.id) {
              goList();
            }
            await unbindCurrentChatIfDeletedKb(
              kb.id,
              boundBeforeRemove,
              conversationId,
              {
                useMock: USE_MOCK,
                setKnowledgeBaseId: useChatStore.getState().setKnowledgeBaseId,
                patchConversation,
                onPatchError: (err: unknown) => {
                  message.error(
                    userFacingApiMessage(err, '哎呀，知识库绑定失败了'),
                  );
                },
              },
            );
          } catch (err: unknown) {
            message.error(
              userFacingApiMessage(err, '哎呀，知识库删除失败了，请稍后重试'),
            );
            throw err;
          }
        },
      });
    },
    [activeKbId, goList, items.length, message, modal, remove],
  );

  if (view === 'detail' && activeKb) {
    return (
      <KbDetail
        key={activeKb.id}
        knowledgeBase={activeKb}
        onBack={goList}
      />
    );
  }

  const loading = status === 'loading' && items.length === 0;
  const unavailable = status === 'error' && items.length === 0;
  const emptyReady = status === 'ready' && items.length === 0;

  return (
    <section className={styles.page} aria-label="资料库">
      {unavailable ? (
        <div className={styles.emptyWrap}>
          <Empty description="知识库服务未启用" />
        </div>
      ) : emptyReady ? (
        <div className={styles.emptyWrap}>
          <Empty description="还没有知识库">
            <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
              新建知识库
            </Button>
          </Empty>
        </div>
      ) : (
        <>
          <KbListToolbar
            search={search}
            onSearchChange={setSearch}
            onCreate={openCreate}
          />
          <div className={styles.tableWrap}>
            {loading ? (
              <div className={styles.emptyWrap}>
                <Spin />
              </div>
            ) : (
              <KbList
                items={items}
                loading={false}
                search={search}
                emptyText={search.trim() ? '没有匹配的知识库' : '还没有知识库'}
                onEnter={enterKb}
                onRename={openRename}
                onDelete={handleDelete}
              />
            )}
          </div>
        </>
      )}
      <KbRenameModal
        open={modalOpen}
        mode={modalMode}
        initial={editing}
        existingNames={existingNames}
        confirmLoading={saving}
        onCancel={() => setModalOpen(false)}
        onSubmit={(values) => {
          void handleSubmit(values);
        }}
      />
    </section>
  );
}
