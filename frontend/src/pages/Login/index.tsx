import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { App, BorderBeam, Button, Form, Input, Typography } from 'antd';
import { login, AUTH_FALLBACK_LOGIN } from '@/apis/auth';
import { userFacingApiMessage } from '@/apis/http/client';
import { useAuthStore } from '@/store/useAuthStore';
import styles from './index.module.less';

interface LoginFormValues {
  username: string;
  password: string;
}

export default function LoginPage() {
  const navigate = useNavigate();
  const { message } = App.useApp();
  const setSession = useAuthStore((s) => s.setSession);
  const [submitting, setSubmitting] = useState(false);
  const [form] = Form.useForm<LoginFormValues>();

  const onFinish = async (values: LoginFormValues) => {
    if (submitting) {
      return;
    }
    setSubmitting(true);
    try {
      const session = await login(values.username, values.password);
      setSession(session);
      navigate('/', { replace: true });
    } catch (err) {
      message.error(userFacingApiMessage(err, AUTH_FALLBACK_LOGIN));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className={styles.page}>
      <BorderBeam
        duration={8}
        size={200}
        lineWidth={1.5}
        color={[
          { color: '#3b82f6', percent: 0 },
          { color: '#06b6d4', percent: 55 },
          { color: '#0891b2', percent: 100 },
        ]}
      >
        <div className={styles.panel}>
          <Typography.Title level={2} className={styles.brand}>
            NeuralChat
          </Typography.Title>
          <Typography.Paragraph className={styles.subtitle}>
            登录后开始对话
          </Typography.Paragraph>

          <Form
            form={form}
            layout="vertical"
            requiredMark={false}
            onFinish={onFinish}
            disabled={submitting}
          >
            <Form.Item
              label="账号"
              name="username"
              rules={[{ required: true, message: '请输入账号' }]}
            >
              <Input
                autoComplete="username"
                placeholder="请输入账号"
                size="large"
              />
            </Form.Item>
            <Form.Item
              label="密码"
              name="password"
              rules={[{ required: true, message: '请输入密码' }]}
            >
              <Input.Password
                autoComplete="current-password"
                placeholder="请输入密码"
                size="large"
              />
            </Form.Item>
            <Form.Item className={styles.submitItem}>
              <Button
                type="primary"
                htmlType="submit"
                size="large"
                block
                loading={submitting}
              >
                登录
              </Button>
            </Form.Item>
          </Form>
        </div>
      </BorderBeam>
    </div>
  );
}
