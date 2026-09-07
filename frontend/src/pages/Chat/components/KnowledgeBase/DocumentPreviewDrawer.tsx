import { useEffect, useRef, useState } from 'react';
import { Drawer, Spin } from 'antd';
import { Streamdown } from 'streamdown';
import type { KnowledgeDocument } from '@ai-chat/shared';
import { fetchDocumentContent } from '@/apis/documents';
import { userFacingApiMessage } from '@/apis/http/client';
import styles from './index.module.less';

interface DocumentPreviewDrawerProps {
  preview: KnowledgeDocument | null;
  onClose: () => void;
}

function isPdf(doc: KnowledgeDocument, contentType: string): boolean {
  if (contentType.includes('pdf')) return true;
  return (
    doc.mimeType === 'application/pdf' ||
    doc.filename.toLowerCase().endsWith('.pdf')
  );
}

function isDocx(doc: KnowledgeDocument): boolean {
  return (
    doc.filename.toLowerCase().endsWith('.docx') ||
    doc.mimeType.includes('wordprocessingml')
  );
}

function revokeUrl(url: string | null): void {
  if (url) {
    URL.revokeObjectURL(url);
  }
}

export default function DocumentPreviewDrawer({
  preview,
  onClose,
}: DocumentPreviewDrawerProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [markdown, setMarkdown] = useState('');
  const [unsupported, setUnsupported] = useState(false);
  const pdfUrlRef = useRef<string | null>(null);

  useEffect(() => {
    if (!preview) {
      setLoading(false);
      setError(null);
      setPdfUrl(null);
      setMarkdown('');
      setUnsupported(false);
      return;
    }

    if (isDocx(preview)) {
      setLoading(false);
      setError(null);
      setPdfUrl(null);
      setMarkdown('');
      setUnsupported(true);
      return () => {
        revokeUrl(pdfUrlRef.current); // 撤销PDF URL
        pdfUrlRef.current = null; // 设置PDF URL为空
      };
    }

    let cancelled = false;
    setLoading(true);
    setError(null);
    setPdfUrl(null);
    setMarkdown('');
    setUnsupported(false);

    void fetchDocumentContent(preview.id)
      .then(async ({ blob, contentType }) => {
        if (cancelled) return;
        if (isPdf(preview, contentType)) {
          const url = URL.createObjectURL(blob);
          if (cancelled) {
            revokeUrl(url);
            return;
          }
          revokeUrl(pdfUrlRef.current);
          pdfUrlRef.current = url;
          setPdfUrl(url);
          return;
        }
        const text = await blob.text();
        if (cancelled) return;
        setMarkdown(text);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(userFacingApiMessage(err, '哎呀，文件预览失败了，请稍后重试'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
      revokeUrl(pdfUrlRef.current);
      pdfUrlRef.current = null;
    };
  }, [preview]);

  return (
    <Drawer
      title={preview?.filename ?? '预览'}
      open={Boolean(preview)}
      onClose={onClose}
      size="85vw"
      destroyOnHidden
      className={styles.previewDrawer}
    >
      {loading ? (
        <div className={styles.previewStatus}>
          <Spin />
        </div>
      ) : error ? (
        <p className={styles.previewError}>{error}</p>
      ) : unsupported ? (
        <p className={styles.previewError}>此类型暂不支持在线预览</p>
      ) : pdfUrl ? (
        <iframe
          className={styles.pdfFrame}
          src={pdfUrl}
          title={preview?.filename ?? 'PDF 预览'}
        />
      ) : (
        <div className={styles.markdown}>
          <Streamdown mode="static" skipHtml className={styles.streamdown}>
            {markdown}
          </Streamdown>
        </div>
      )}
    </Drawer>
  );
}
