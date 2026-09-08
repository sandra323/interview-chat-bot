import { Button, Input } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import styles from './index.module.less';

interface KbListToolbarProps {
  search: string;
  onSearchChange: (value: string) => void;
  onCreate: () => void;
}

export default function KbListToolbar({
  search,
  onSearchChange,
  onCreate,
}: KbListToolbarProps) {
  return (
    <div className={styles.toolbar}>
      <Input.Search
        className={styles.search}
        allowClear
        placeholder="搜索知识库名称"
        value={search}
        onChange={(event) => onSearchChange(event.target.value)}
        aria-label="搜索知识库"
      />
      <div className={styles.toolbarActions}>
        <Button type="primary" icon={<PlusOutlined />} onClick={onCreate}>
          新建知识库
        </Button>
      </div>
    </div>
  );
}
