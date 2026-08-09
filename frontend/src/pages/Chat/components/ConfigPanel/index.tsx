import { useEffect } from 'react';
import { Button, Form, Input } from 'antd';
import type { Config } from '@ai-chat/shared';
import { isConfigComplete } from '@/utils/validators';
import styles from './index.module.less';

interface ConfigPanelProps {
  config: Config;
  onSave: (config: Config) => void;
  onReconnect: () => void;
}

export default function ConfigPanel({
  config,
  onSave,
  onReconnect,
}: ConfigPanelProps) {
  const [form] = Form.useForm<Config>();

  useEffect(() => {
    form.setFieldsValue(config);
  }, [config, form]);

  const handleFinish = (values: Config) => {
    if (!isConfigComplete(values)) return;
    onSave(values);
    onReconnect();
  };

  return (
    <section className={styles.panel} aria-label="API 配置">
      <h2 className={styles.title}>大模型 API 配置</h2>
      <Form
        form={form}
        layout="vertical"
        initialValues={config}
        onFinish={handleFinish}
        requiredMark={false}
        className={styles.form}
      >
        <Form.Item
          label="接口地址"
          name="apiUrl"
          rules={[{ required: true, message: '请输入接口地址' }]}
        >
          <Input placeholder="https://api.openai.com/v1/chat/completions" />
        </Form.Item>

        <Form.Item
          label="API 密钥"
          name="apiKey"
          rules={[{ required: true, message: '请输入 API 密钥' }]}
        >
          <Input.Password placeholder="sk-..." autoComplete="off" />
        </Form.Item>

        <Form.Item
          label="模型"
          name="model"
          rules={[{ required: true, message: '请输入模型名称' }]}
        >
          <Input placeholder="gpt-4o-mini" />
        </Form.Item>

        <Form.Item shouldUpdate>
          {() => {
            const values = form.getFieldsValue(true) as Partial<Config>;
            const canSave = isConfigComplete({
              apiUrl: values.apiUrl ?? '',
              apiKey: values.apiKey ?? '',
              model: values.model ?? '',
            });
            return (
              <Button type="primary" htmlType="submit" disabled={!canSave}>
                保存并重连
              </Button>
            );
          }}
        </Form.Item>

        <p className={styles.hint}>
          API 密钥仅保存在本机浏览器中，并随每次请求发送。历史消息会作为对话上下文一并提交。
        </p>
      </Form>
    </section>
  );
}
