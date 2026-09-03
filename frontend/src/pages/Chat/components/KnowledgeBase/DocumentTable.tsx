import { useMemo } from 'react';
import { Button, Progress, Table, Tooltip } from 'antd';
import type { TableColumnsType } from 'antd';
import { InfoCircleOutlined } from '@ant-design/icons';
import {
  DOCUMENT_PAGE_SIZE,
  type KnowledgeDocument,
} from '@ai-chat/shared';
import { formatDateYYYYMMDD, formatFileSize } from '@/utils/formatTime';
import styles from './index.module.less';

interface DocumentTableProps {
  documents: KnowledgeDocument[];
  loading: boolean;
  page: number;
  total: number;
  selecting: boolean;
  selectedRowKeys: string[];
  onSelectedRowKeysChange: (keys: string[]) => void;
  onPageChange: (page: number) => void;
  onPreview: (doc: KnowledgeDocument) => void;
  onDelete: (doc: KnowledgeDocument) => void;
}

function progressStatus(
  status: KnowledgeDocument['status'],
): 'active' | 'success' | 'exception' | 'normal' {
  if (status === 'failed') return 'exception';
  if (status === 'ready') return 'success';
  if (status === 'uploading') return 'active';
  return 'normal';
}

function isBusy(status: KnowledgeDocument['status']): boolean {
  return status === 'queued' || status === 'uploading';
}

export default function DocumentTable({
  documents,
  loading,
  page,
  total,
  selecting,
  selectedRowKeys,
  onSelectedRowKeysChange,
  onPageChange,
  onPreview,
  onDelete,
}: DocumentTableProps) {
  const columns: TableColumnsType<KnowledgeDocument> = useMemo(
    () => [
      {
        title: '文件名称',
        dataIndex: 'filename',
        ellipsis: true,
        shouldCellUpdate: (record, prev) =>
          record.id !== prev.id ||
          record.status !== prev.status ||
          record.filename !== prev.filename,
        render: (_value, record) =>
          record.status === 'ready' ? (
            <Button
              type="link"
              className={styles.fileLink}
              onClick={() => onPreview(record)}
            >
              {record.filename}
            </Button>
          ) : (
            <span className={styles.fileNameMuted} title={record.filename}>
              {record.filename}
            </span>
          ),
      },
      {
        title: '上传时间',
        dataIndex: 'createdAt',
        width: '20%',
        shouldCellUpdate: (record, prev) => record.createdAt !== prev.createdAt,
        render: (createdAt: number) => formatDateYYYYMMDD(createdAt),
      },
      {
        title: '大小',
        dataIndex: 'sizeBytes',
        width: '20%',
        shouldCellUpdate: (record, prev) => record.sizeBytes !== prev.sizeBytes,
        render: (sizeBytes: number) => formatFileSize(sizeBytes),
      },
      {
        title: '上传进度',
        dataIndex: 'progress',
        width: '20%',
        shouldCellUpdate: (record, prev) =>
          record.status !== prev.status ||
          record.progress !== prev.progress ||
          record.error !== prev.error,
        render: (_value, record) => (
          <div className={styles.progressCell}>
            {record.status === 'queued' ? (
              <span className={styles.queuedLabel}>排队中</span>
            ) : (
              <Progress
                percent={record.progress}
                size="small"
                status={progressStatus(record.status)}
              />
            )}
            {record.status === 'failed' ? (
              <Tooltip title={record.error?.trim() || '上传失败'}>
                <InfoCircleOutlined className={styles.errorIcon} />
              </Tooltip>
            ) : null}
          </div>
        ),
      },
      {
        title: '操作',
        key: 'actions',
        width: '15%',
        shouldCellUpdate: (record, prev) =>
          record.id !== prev.id || record.status !== prev.status,
        render: (_value, record) => (
          <Button
            type="link"
            className={styles.actionLink}
            disabled={isBusy(record.status)}
            onClick={() => onDelete(record)}
          >
            删除
          </Button>
        ),
      },
    ],
    [onDelete, onPreview],
  );

  return (
    <Table<KnowledgeDocument>
      className={styles.table}
      rowKey="id"
      columns={columns}
      dataSource={documents}
      loading={loading}
      tableLayout="fixed"
      rowSelection={
        selecting
          ? {
              selectedRowKeys,
              preserveSelectedRowKeys: true,
              columnWidth: 48,
              onChange: (keys) => onSelectedRowKeysChange(keys.map(String)),
              getCheckboxProps: (record) => ({
                disabled: isBusy(record.status),
              }),
            }
          : undefined
      }
      pagination={{
        current: page,
        pageSize: DOCUMENT_PAGE_SIZE,
        total,
        showSizeChanger: false,
        onChange: onPageChange,
      }}
      locale={{ emptyText: '暂无资料' }}
    />
  );
}
