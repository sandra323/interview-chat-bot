import { useEffect } from 'react';
import { Form, Input, Modal } from 'antd';
import type { KnowledgeBase } from '@ai-chat/shared';
import { KB_NAME_MAX } from '@ai-chat/shared';
import {
  KB_DESCRIPTION_MAX,
  validateKbDescription,
  validateKbName,
} from './validateKbName';

interface KbRenameModalProps {
  open: boolean;
  mode: 'create' | 'rename';
  initial?: KnowledgeBase | null;
  existingNames: string[];
  confirmLoading?: boolean;
  onCancel: () => void;
  onSubmit: (values: { name: string; description: string }) => void;
}

export default function KbRenameModal({
  open,
  mode,
  initial,
  existingNames,
  confirmLoading = false,
  onCancel,
  onSubmit,
}: KbRenameModalProps) {
  const [form] = Form.useForm<{ name: string; description: string }>();

  useEffect(() => {
    if (!open) return;
    form.setFieldsValue({
      name: initial?.name ?? '',
      description: initial?.description ?? '',
    });
  }, [form, initial, open]);

  return (
    <Modal
      title={mode === 'create' ? '新建知识库' : '重命名知识库'}
      open={open}
      okText={mode === 'create' ? '创建' : '保存'}
      cancelText="取消"
      confirmLoading={confirmLoading}
      onCancel={onCancel}
      onOk={() => {
        const name = String(form.getFieldValue('name') ?? '');
        const description = String(form.getFieldValue('description') ?? '');
        const nameMsg = validateKbName(name, existingNames, {
          currentName: mode === 'rename' ? initial?.name : undefined,
        });
        const descMsg = validateKbDescription(description);
        form.setFields([
          { name: 'name', errors: nameMsg ? [nameMsg] : [] },
          { name: 'description', errors: descMsg ? [descMsg] : [] },
        ]);
        if (nameMsg || descMsg) return;
        onSubmit({ name: name.trim(), description: description.trim() });
      }}
      destroyOnClose
    >
      <Form form={form} layout="vertical">
        <Form.Item name="name" label="名称">
          <Input maxLength={KB_NAME_MAX} placeholder="1–100 个字" />
        </Form.Item>
        <Form.Item name="description" label="描述（可选）">
          <Input.TextArea
            rows={3}
            maxLength={KB_DESCRIPTION_MAX}
            placeholder="可选"
          />
        </Form.Item>
      </Form>
    </Modal>
  );
}
