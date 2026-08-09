import { useEffect } from 'react';
import { Button, Form, Input, Select, Space } from 'antd';
import type { Config } from '@ai-chat/shared';
import { MODEL_OPTIONS } from '@/config/models';
import {
  LLM_PROVIDERS,
  getProviderPreset,
} from '@/config/providers';
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

  const applyProviderPreset = (providerId: string) => {
    const preset = getProviderPreset(providerId);
    form.setFieldsValue({
      apiUrl: preset.apiUrl,
      model: preset.model,
      // Keep existing key if env did not provide one
      apiKey: preset.apiKey || form.getFieldValue('apiKey') || '',
    });
  };

  return (
    <section className={styles.panel} aria-label="API 配置">
      <h2 className={styles.title}>大模型 API 配置</h2>

      <div className={styles.presets}>
        <span className={styles.presetsLabel}>快捷填入</span>
        <Space wrap size={[8, 8]}>
          {LLM_PROVIDERS.map((provider) => (
            <Button
              key={provider.id}
              size="small"
              onClick={() => applyProviderPreset(provider.id)}
            >
              {provider.label} 默认
            </Button>
          ))}
        </Space>
      </div>

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
          <Input placeholder="https://api.deepseek.com/chat/completions" />
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
          rules={[{ required: true, message: '请选择或输入模型名称' }]}
        >
          <Select
            showSearch
            allowClear={false}
            placeholder="选择模型"
            options={MODEL_OPTIONS.map((m) => ({
              value: m.id,
              label: m.badge ? `${m.label} (${m.badge})` : m.label,
            }))}
          />
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
          API 密钥仅保存在本机浏览器中，并随每次请求发送。可从{' '}
          <code>frontend/.env.local</code> 的{' '}
          <code>VITE_DEEPSEEK_API_KEY</code> 预填 DeepSeek 密钥。历史消息会作为对话上下文一并提交。
        </p>
      </Form>
    </section>
  );
}
