import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { App } from 'antd';
import {
  DOCUMENT_MAX_BYTES,
  DOCUMENT_PAGE_SIZE,
  type KnowledgeDocument,
} from '@ai-chat/shared';
import {
  deleteDocument,
  fetchDocuments,
  reprocessDocument,
  uploadDocument,
} from '@/apis/documents';
import { userFacingApiMessage } from '@/apis/http/client';
import Toolbar from './Toolbar';
import DocumentTable from './DocumentTable';
import DocumentPreviewDrawer from './DocumentPreviewDrawer';
import styles from './index.module.less';

const SEARCH_DEBOUNCE_MS = 300;
const POLL_MS = 2500;
const MAX_PARALLEL_UPLOADS = 3;
const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46];
const ZIP_MAGIC = [0x50, 0x4b];
const UNSUPPORTED_TYPE_MSG =
  '哎呀，只支持 PDF、Markdown、TXT 或 Word（.docx）';

type UploadJob = { file: File; localId: string };

function hasPdfMagic(bytes: Uint8Array): boolean {
  if (bytes.length < PDF_MAGIC.length) return false;
  return PDF_MAGIC.every((b, i) => bytes[i] === b);
}

function hasZipMagic(bytes: Uint8Array): boolean {
  if (bytes.length < ZIP_MAGIC.length) return false;
  return ZIP_MAGIC.every((b, i) => bytes[i] === b);
}

function hasNulByte(bytes: Uint8Array): boolean {
  return bytes.subarray(0, 512).includes(0);
}

function guessMimeType(filename: string, fileType: string): string {
  if (fileType) return fileType;
  const name = filename.toLowerCase();
  if (name.endsWith('.pdf')) return 'application/pdf';
  if (name.endsWith('.txt')) return 'text/plain';
  if (name.endsWith('.docx')) {
    return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  }
  return 'text/markdown';
}

function isProcessingStatus(status: KnowledgeDocument['status']): boolean {
  return status === 'pending' || status === 'processing';
}

async function clientValidate(file: File): Promise<string | null> {
  const name = file.name.toLowerCase();
  if (
    !name.endsWith('.pdf') &&
    !name.endsWith('.md') &&
    !name.endsWith('.txt') &&
    !name.endsWith('.docx')
  ) {
    return UNSUPPORTED_TYPE_MSG;
  }
  if (file.size > DOCUMENT_MAX_BYTES) {
    return '哎呀，文件太大了，请上传 20MB 以内的文件';
  }
  if (file.size === 0) {
    return '哎呀，空文件不能上传，请换个文件再试';
  }
  const head = new Uint8Array(await file.slice(0, 512).arrayBuffer());
  if (name.endsWith('.pdf') && !hasPdfMagic(head)) {
    return '哎呀，文件内容不是有效的 PDF';
  }
  if (name.endsWith('.docx') && !hasZipMagic(head)) {
    return '哎呀，文件内容不是有效的 Word 文档';
  }
  if (
    (name.endsWith('.md') || name.endsWith('.txt')) &&
    (hasPdfMagic(head) || hasNulByte(head))
  ) {
    return UNSUPPORTED_TYPE_MSG;
  }
  return null;
}

function matchesQuery(filename: string, query: string): boolean {
  if (!query) return true;
  return filename.toLowerCase().includes(query.toLowerCase());
}

export default function KnowledgeBase() {
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
    void fetchDocuments({ q: query, page, pageSize: DOCUMENT_PAGE_SIZE })
      .then((data) => {
        if (cancelled) return;
        setItems(data.items);
        setTotal(data.total);
        const serverIds = new Set(data.items.map((doc) => doc.id));
        setLocalDocs((prev) =>
          prev.filter((doc) => !serverIds.has(doc.id) && doc.status !== 'ready'),
        );
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        message.error(userFacingApiMessage(err, '哎呀，资料加载失败了，请稍后重试'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [query, page, refreshKey, message]);

  useEffect(() => {
    const busy = [...items, ...localDocs].some((doc) =>
      isProcessingStatus(doc.status),
    );
    if (!busy) return;
    const timer = window.setInterval(() => {
      setRefreshKey((key) => key + 1);
    }, POLL_MS);
    return () => window.clearInterval(timer);
  }, [items, localDocs]);

  const patchLocal = useCallback(
    (id: string, patch: Partial<KnowledgeDocument>) => {
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
      void uploadDocument(job.file, (percent) => {
        patchLocal(job.localId, { progress: percent, status: 'uploading' });
      })
        .then((uploaded) => {
          setLocalDocs((prev) =>
            prev.map((doc) => (doc.id === job.localId ? uploaded : doc)),
          );
          setTotal((count) => count + 1);
        })
        .catch((err: unknown) => {
          patchLocal(job.localId, {
            status: 'failed',
            error: userFacingApiMessage(err, '哎呀，上传失败了，请稍后重试'),
          });
        })
        .finally(() => {
          inflightRef.current -= 1;
          pumpUploads();
        });
    }
  }, [patchLocal]);

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

      const deletedServerIds: string[] = [];
      const failures: unknown[] = [];
      const results = await Promise.allSettled(
        serverIds.map((id) => deleteDocument(id).then(() => id)),
      );
      for (const result of results) {
        if (result.status === 'fulfilled') {
          deletedServerIds.push(result.value);
        } else {
          failures.push(result.reason);
        }
      }

      const deletedIds = new Set([...localIds, ...deletedServerIds]);
      setPreviewDoc((current) =>
        current && deletedIds.has(current.id) ? null : current,
      );
      setLocalDocs((prev) => prev.filter((row) => !deletedIds.has(row.id)));
      setSelectedRowKeys((prev) => prev.filter((id) => !deletedIds.has(id)));

      if (deletedServerIds.length > 0) {
        const nextTotal = Math.max(0, total - deletedServerIds.length);
        const maxPage = Math.max(
          1,
          Math.ceil(nextTotal / DOCUMENT_PAGE_SIZE),
        );
        if (page > maxPage) {
          setPage(maxPage);
        } else {
          setRefreshKey((key) => key + 1);
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

  const tableDocs = useMemo(() => {
    const visibleLocal = localDocs.filter((doc) =>
      matchesQuery(doc.filename, query),
    );
    const localIds = new Set(visibleLocal.map((doc) => doc.id));
    const serverItems = items.filter((doc) => !localIds.has(doc.id));
    return [...visibleLocal, ...serverItems];
  }, [localDocs, items, query]);

  return (
    <section className={styles.page} aria-label="资料库">
      <Toolbar
        search={searchInput}
        onSearchChange={setSearchInput}
        onFilesSelected={handleFilesSelected}
        selecting={selecting}
        confirmDisabled={selectedRowKeys.length === 0}
        onEnterSelect={() => setSelecting(true)}
        onConfirmDelete={handleConfirmBatchDelete}
        onCancelSelect={handleCancelSelect}
      />
      <div className={styles.tableWrap}>
        <DocumentTable
          documents={tableDocs}
          loading={loading && localDocs.length === 0}
          page={page}
          total={total}
          selecting={selecting}
          selectedRowKeys={selectedRowKeys}
          onSelectedRowKeysChange={setSelectedRowKeys}
          onPageChange={setPage}
          onPreview={setPreviewDoc}
          onDelete={handleDelete}
          onReprocess={handleReprocess}
        />
      </div>
      <DocumentPreviewDrawer
        preview={previewDoc}
        onClose={() => setPreviewDoc(null)}
      />
    </section>
  );
}
