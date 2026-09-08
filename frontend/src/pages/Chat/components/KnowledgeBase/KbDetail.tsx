import type { KnowledgeBase } from '@ai-chat/shared';
import { Button } from 'antd';
import { ArrowLeftOutlined } from '@ant-design/icons';
import Toolbar from './Toolbar';
import DocumentTable from './DocumentTable';
import DocumentPreviewDrawer from './DocumentPreviewDrawer';
import { useDocumentLibrary } from './useDocumentLibrary';
import styles from './index.module.less';

interface KbDetailProps {
  knowledgeBase: KnowledgeBase;
  onBack: () => void;
}

export default function KbDetail({ knowledgeBase, onBack }: KbDetailProps) {
  const lib = useDocumentLibrary(knowledgeBase.id);

  return (
    <section className={styles.page} aria-label={knowledgeBase.name}>
      <div className={styles.detailHeader}>
        <Button
          type="text"
          icon={<ArrowLeftOutlined />}
          onClick={onBack}
          className={styles.backBtn}
        >
          返回
        </Button>
        <h2 className={styles.detailTitle} title={knowledgeBase.name}>
          {knowledgeBase.name}
        </h2>
      </div>
      <Toolbar
        search={lib.searchInput}
        onSearchChange={lib.setSearchInput}
        onFilesSelected={lib.handleFilesSelected}
        selecting={lib.selecting}
        confirmDisabled={lib.selectedRowKeys.length === 0}
        onEnterSelect={() => lib.setSelecting(true)}
        onConfirmDelete={lib.handleConfirmBatchDelete}
        onCancelSelect={lib.handleCancelSelect}
      />
      <div className={styles.tableWrap}>
        <DocumentTable
          documents={lib.tableDocs}
          loading={lib.loading && lib.localDocs.length === 0}
          page={lib.page}
          total={lib.total}
          selecting={lib.selecting}
          selectedRowKeys={lib.selectedRowKeys}
          onSelectedRowKeysChange={lib.setSelectedRowKeys}
          onPageChange={lib.setPage}
          onPreview={lib.setPreviewDoc}
          onDelete={lib.handleDelete}
          onReprocess={lib.handleReprocess}
        />
      </div>
      <DocumentPreviewDrawer
        preview={lib.previewDoc}
        onClose={() => lib.setPreviewDoc(null)}
      />
    </section>
  );
}
