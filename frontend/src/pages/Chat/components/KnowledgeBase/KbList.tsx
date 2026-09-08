import { useMemo } from 'react';
import { Button, Empty, Table } from 'antd';
import type { TableColumnsType } from 'antd';
import type { KnowledgeBase } from '@ai-chat/shared';
import { formatDateYYYYMMDD } from '@/utils/formatTime';
import { filterKbBySearch } from './filterKbBySearch';
import styles from './index.module.less';

interface KbListProps {
  items: KnowledgeBase[];
  loading: boolean;
  search: string;
  emptyText?: string;
  onEnter: (kb: KnowledgeBase) => void;
  onRename: (kb: KnowledgeBase) => void;
  onDelete: (kb: KnowledgeBase) => void;
}

export default function KbList({
  items,
  loading,
  search,
  emptyText = '还没有知识库',
  onEnter,
  onRename,
  onDelete,
}: KbListProps) {
  const filtered = useMemo(
    () => filterKbBySearch(items, search),
    [items, search],
  );

  const columns: TableColumnsType<KnowledgeBase> = useMemo(
    () => [
      {
        title: '名称',
        dataIndex: 'name',
        ellipsis: true,
      },
      {
        title: '描述',
        dataIndex: 'description',
        ellipsis: true,
        render: (description: string) => description || '—',
      },
      {
        title: '更新时间',
        dataIndex: 'updatedAt',
        width: '20%',
        render: (updatedAt: number) => formatDateYYYYMMDD(updatedAt),
      },
      {
        title: '操作',
        key: 'actions',
        width: '22%',
        render: (_value, record) => (
          <div className={styles.actions} onClick={(event) => event.stopPropagation()}>
            <Button
              type="link"
              className={styles.actionLink}
              onClick={() => onEnter(record)}
            >
              进入
            </Button>
            <Button
              type="link"
              className={styles.actionLink}
              onClick={() => onRename(record)}
            >
              重命名
            </Button>
            <Button
              type="link"
              className={styles.actionLink}
              onClick={() => onDelete(record)}
            >
              删除
            </Button>
          </div>
        ),
      },
    ],
    [onDelete, onEnter, onRename],
  );

  return (
    <Table<KnowledgeBase>
      className={styles.table}
      rowKey="id"
      columns={columns}
      dataSource={filtered}
      loading={loading}
      tableLayout="fixed"
      pagination={false}
      onRow={(record) => ({
        onClick: () => onEnter(record),
        className: styles.kbRow,
      })}
      locale={{
        emptyText: (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={emptyText} />
        ),
      }}
    />
  );
}
