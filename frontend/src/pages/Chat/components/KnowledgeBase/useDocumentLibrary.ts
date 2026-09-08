import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { App } from 'antd';
import {
  DOCUMENT_PAGE_SIZE,
  type KnowledgeDocument,
} from '@ai-chat/shared';
import {
  deleteDocument,
  reprocessDocument,
} from '@/apis/documents';
import {
  fetchKnowledgeBaseDocuments,
  uploadKnowledgeBaseDocument,
} from '@/apis/knowledgeBases';
import { userFacingApiMessage } from '@/apis/http/client';
import { clientValidate, guessMimeType } from './clientValidate';
import { isServerBusyStatus } from './documentStatus';
import {
  computePageAfterServerDelete,
  isDuplicateUploadMessage,
  mergeTableDocs,
  summarizeBatchDelete,
} from './documentLibraryHelpers';

const SEARCH_DEBOUNCE_MS = 300;
export const POLL_MS = 2500;
export const MAX_PARALLEL_UPLOADS = 3;

type UploadJob = { file: File; localId: string };

export function useDocumentLibrary(knowledgeBaseId: string) {
  const { message, modal } = App.useApp();
  const [searchInput, setSearchInput] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<KnowledgeDocument[]>([]);
  const [total, setTotal] = useState(0);
  const [localDocs, setLocalDocs] = useState<KnowledgeDocument[]>([]);
  const [previewDoc, setPreviewDoc] = useState<KnowledgeDocument | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [selecting, setSelecting] = useState(false);
  const [selectedRowKeys, setSelectedRowKeys] = useState<string[]>([]);
  const queueRef = useRef<UploadJob[]>([]);
  const inflightRef = useRef(0);
  const queryRef = useRef(query);
  queryRef.current = query;
  const hasRowsRef = useRef(false);
  hasRowsRef.current = items.length > 0 || localDocs.length > 0;
  const aliveRef = useRef(true);
  const pollErrorToastRef = useRef(false);
  // 切库 = 卸载本 hook；进行中的上传仍写原库，setState 被 cancelled 忽略。
  const boundKbId = knowledgeBaseId;

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const next = searchInput.trim();
      if (next !== queryRef.current) {
        setQuery(next);
        setPage(1);
      }
    }, SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    let cancelled = false;
    if (!hasRowsRef.current) {
      setLoading(true);
    }
    void fetchKnowledgeBaseDocuments(boundKbId, {
      q: query,
      page,
      pageSize: DOCUMENT_PAGE_SIZE,
    })
      .then((data) => {
        if (cancelled || !aliveRef.current) return;
        pollErrorToastRef.current = false;
        setItems(data.items);
        setTotal(data.total);
        const serverIds = new Set(data.items.map((doc) => doc.id));
        setLocalDocs((prev) =>
          prev.filter((doc) => !serverIds.has(doc.id) && doc.status !== 'ready'),
        );
      })
      .catch((err: unknown) => {
        if (cancelled || !aliveRef.current) return;
        if (!pollErrorToastRef.current) {
          pollErrorToastRef.current = true;
          message.error(
            userFacingApiMessage(err, '哎呀，资料加载失败了，请稍后重试'),
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [boundKbId, query, page, refreshKey, message]);

  useEffect(() => {
    const busy = [...items, ...localDocs].some((doc) =>
      isServerBusyStatus(doc.status),
    );
    if (!busy) return;

    let timer: number | null = null;
    const start = () => {
      if (timer != null) return;
      timer = window.setInterval(() => {
        setRefreshKey((key) => key + 1);
      }, POLL_MS);
    };
    const stop = () => {
      if (timer != null) {
        window.clearInterval(timer);
        timer = null;
      }
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        stop();
        return;
      }
      setRefreshKey((key) => key + 1);
      start();
    };

    if (document.visibilityState !== 'hidden') {
      start();
    }
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [items, localDocs]);

  const patchLocal = useCallback(
    (id: string, patch: Partial<KnowledgeDocument>) => {
      if (!aliveRef.current) return;
      setLocalDocs((prev) =>
        prev.map((doc) => (doc.id === id ? { ...doc, ...patch } : doc)),
      );
    },
    [],
  );

  const pumpUploads = useCallback(() => {
    while (
      inflightRef.current < MAX_PARALLEL_UPLOADS &&
      queueRef.current.length > 0
    ) {
      const job = queueRef.current.shift();
      if (!job) break;
      inflightRef.current += 1;
      patchLocal(job.localId, { status: 'uploading', progress: 0 });
      void uploadKnowledgeBaseDocument(boundKbId, job.file, (percent) => {
        patchLocal(job.localId, { progress: percent, status: 'uploading' });
      })
        .then((uploaded) => {
          if (!aliveRef.current) return;
          setLocalDocs((prev) =>
            prev.map((doc) => (doc.id === job.localId ? uploaded : doc)),
          );
          setTotal((count) => count + 1);
        })
        .catch((err: unknown) => {
          if (!aliveRef.current) return;
          const msg = userFacingApiMessage(err, '哎呀，上传失败了，请稍后重试');
          if (isDuplicateUploadMessage(msg)) {
            message.warning(msg);
            setLocalDocs((prev) => prev.filter((doc) => doc.id !== job.localId));
            return;
          }
          patchLocal(job.localId, {
            status: 'failed',
            error: msg,
          });
        })
        .finally(() => {
          inflightRef.current -= 1;
          if (aliveRef.current) {
            pumpUploads();
          }
        });
    }
  }, [boundKbId, message, patchLocal]);

  const handleFilesSelected = useCallback(
    (fileList: FileList) => {
      const files = Array.from(fileList);
      void (async () => {
        for (const file of files) {
          const localId = `local-${crypto.randomUUID()}`;
          const clientError = await clientValidate(file);
          const base: KnowledgeDocument = {
            id: localId,
            filename: file.name,
            mimeType: guessMimeType(file.name, file.type),
            sizeBytes: file.size,
            status: clientError ? 'failed' : 'queued',
            progress: 0,
            error: clientError,
            createdAt: Date.now(),
            sourceRelativePath: null,
          };
          if (!aliveRef.current) return;
          setLocalDocs((prev) => [base, ...prev]);
          if (clientError) {
            continue;
          }
          queueRef.current.push({ file, localId });
        }
        pumpUploads();
      })();
    },
    [pumpUploads],
  );

  const handleCancelSelect = useCallback(() => {
    setSelectedRowKeys([]);
    setSelecting(false);
  }, []);

  const deleteByIds = useCallback(
    async (ids: string[]) => {
      if (ids.length === 0) return;
      const localIds = ids.filter((id) => id.startsWith('local-'));
      const serverIds = ids.filter((id) => !id.startsWith('local-'));

      if (localIds.length > 0) {
        setLocalDocs((prev) => prev.filter((row) => !localIds.includes(row.id)));
      }

      const results = await Promise.allSettled(
        serverIds.map((id) => deleteDocument(id).then(() => id)),
      );
      const { deletedServerIds, failures } = summarizeBatchDelete(results);

      const deletedIds = new Set([...localIds, ...deletedServerIds]);
      setPreviewDoc((current) =>
        current && deletedIds.has(current.id) ? null : current,
      );
      setLocalDocs((prev) => prev.filter((row) => !deletedIds.has(row.id)));
      setSelectedRowKeys((prev) => prev.filter((id) => !deletedIds.has(id)));

      if (deletedServerIds.length > 0) {
        const { nextPage, shouldRefresh } = computePageAfterServerDelete(
          page,
          total,
          deletedServerIds.length,
        );
        if (shouldRefresh) {
          setRefreshKey((key) => key + 1);
        } else if (nextPage !== page) {
          setPage(nextPage);
        }
      }

      if (failures.length > 0) {
        const first = failures[0];
        message.error(
          userFacingApiMessage(first, '哎呀，删除失败了，请稍后重试'),
        );
        if (deletedIds.size === 0) {
          throw first;
        }
      }
    },
    [message, page, total],
  );

  const handleReprocess = useCallback(
    async (doc: KnowledgeDocument) => {
      try {
        const updated = await reprocessDocument(doc.id);
        if (!aliveRef.current) return;
        setItems((prev) =>
          prev.map((row) => (row.id === doc.id ? updated : row)),
        );
        setLocalDocs((prev) =>
          prev.map((row) => (row.id === doc.id ? updated : row)),
        );
        setRefreshKey((key) => key + 1);
      } catch (err: unknown) {
        message.error(
          userFacingApiMessage(err, '哎呀，处理失败了，请稍后重试'),
        );
      }
    },
    [message],
  );

  const handleDelete = useCallback(
    (doc: KnowledgeDocument) => {
      modal.confirm({
        title: '删除文件',
        content: `确定从资料库删除「${doc.filename}」吗？删除后无法恢复。`,
        okText: '删除',
        cancelText: '取消',
        okButtonProps: { danger: true },
        cancelButtonProps: { type: 'default' },
        onOk: () => deleteByIds([doc.id]),
      });
    },
    [deleteByIds, modal],
  );

  const handleConfirmBatchDelete = useCallback(() => {
    if (selectedRowKeys.length === 0) {
      message.warning('请先勾选要删除的文件');
      return;
    }
    const selected = [...localDocs, ...items].find(
      (doc) => doc.id === selectedRowKeys[0],
    );
    const content =
      selectedRowKeys.length === 1 && selected
        ? `确定从资料库删除「${selected.filename}」吗？删除后无法恢复。`
        : `确定从资料库删除已选的 ${selectedRowKeys.length} 个文件吗？删除后无法恢复。`;
    modal.confirm({
      title: '删除文件',
      content,
      okText: '删除',
      cancelText: '取消',
      okButtonProps: { danger: true },
      cancelButtonProps: { type: 'default' },
      onOk: () => deleteByIds(selectedRowKeys),
    });
  }, [deleteByIds, items, localDocs, message, modal, selectedRowKeys]);

  const tableDocs = useMemo(
    () => mergeTableDocs(localDocs, items, query),
    [localDocs, items, query],
  );

  return {
    searchInput,
    setSearchInput,
    page,
    setPage,
    loading,
    total,
    localDocs,
    previewDoc,
    setPreviewDoc,
    selecting,
    setSelecting,
    selectedRowKeys,
    setSelectedRowKeys,
    tableDocs,
    handleFilesSelected,
    handleCancelSelect,
    handleReprocess,
    handleDelete,
    handleConfirmBatchDelete,
  };
}
