import { useRef } from 'react';
import { Button, Input } from 'antd';
import { UploadOutlined } from '@ant-design/icons';
import { DOCUMENT_FILE_ACCEPT } from '@ai-chat/shared';
import styles from './index.module.less';

interface ToolbarProps {
  search: string;
  onSearchChange: (value: string) => void;
  onFilesSelected: (files: FileList) => void;
  selecting: boolean;
  confirmDisabled: boolean;
  onEnterSelect: () => void;
  onConfirmDelete: () => void;
  onCancelSelect: () => void;
}

export default function Toolbar({
  search,
  onSearchChange,
  onFilesSelected,
  selecting,
  confirmDisabled,
  onEnterSelect,
  onConfirmDelete,
  onCancelSelect,
}: ToolbarProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  return (
    <div className={styles.toolbar}>
      <Input.Search
        className={styles.search}
        allowClear
        placeholder="搜索文件名称"
        value={search}
        onChange={(event) => onSearchChange(event.target.value)}
        aria-label="搜索资料"
      />
      <div className={styles.toolbarActions}>
        <input
          ref={fileInputRef}
          type="file"
          accept={DOCUMENT_FILE_ACCEPT}
          multiple
          className={styles.fileInput}
          onChange={(event) => {
            if (event.target.files && event.target.files.length > 0) {
              onFilesSelected(event.target.files);
            }
            event.target.value = '';
          }}
        />
        <Button
          type="primary"
          icon={<UploadOutlined />}
          onClick={() => fileInputRef.current?.click()}
        >
          上传
        </Button>
        {selecting ? (
          <>
            <Button
              type="primary"
              disabled={confirmDisabled}
              onClick={onConfirmDelete}
            >
              确认删除
            </Button>
            <Button onClick={onCancelSelect}>取消</Button>
          </>
        ) : (
          <Button type="primary" ghost onClick={onEnterSelect}>
            批量删除
          </Button>
        )}
      </div>
    </div>
  );
}
