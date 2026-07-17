import { useEffect, useMemo, useState } from 'react';
import { Alert, App, Button, Form, Input, Space, Typography } from 'antd';
import { apiGet, apiJson } from '../api';
import { SectionCard } from '../components/SectionCard';

interface AdminProfile {
  username?: string;
  mustChangePassword?: boolean;
}

export default function SystemPage() {
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [profile, setProfile] = useState<AdminProfile>({});
  const forcePassword = useMemo(() => {
    if (typeof window === 'undefined') return false;
    return new URLSearchParams(window.location.search).get('forcePassword') === '1';
  }, []);

  async function loadProfile() {
    try {
      const res = await apiGet<AdminProfile>('/api/admin/profile');
      setProfile(res || {});
      form.setFieldsValue({ username: (res as any)?.username || '' });
    } catch (e: any) {
      message.error(e.message || '账号信息加载失败');
    }
  }

  useEffect(() => {
    loadProfile();
  }, []);

  async function savePassword(values: any) {
    setLoading(true);
    try {
      const res = await apiJson('/api/admin/account', 'POST', {
        username: values.username,
        currentPassword: values.currentPassword,
        newPassword: values.newPassword
      });
      message.success((res as any).message || '密码已更新');
      form.resetFields(['currentPassword', 'newPassword', 'confirmPassword']);
      const url = new URL(window.location.href);
      url.searchParams.delete('forcePassword');
      window.history.replaceState({}, '', url.toString());
      setProfile((current) => ({ ...current, mustChangePassword: false }));
      window.dispatchEvent(new Event('bbzg-password-changed'));
      await loadProfile();
    } catch (e: any) {
      message.error(e.message || '修改密码失败');
    } finally {
      setLoading(false);
    }
  }

  const mustChange = !!profile.mustChangePassword || forcePassword;

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      {mustChange ? (
        <Alert
          type="warning"
          showIcon
          message="需要先修改默认密码"
          description="当前账号仍在使用默认凭据或被标记为必须改密。请先更新登录密码后再继续使用后台。"
        />
      ) : null}

      <SectionCard title="修改登录密码" description="更新后台管理员账号和密码">
        <Form form={form} layout="vertical" onFinish={savePassword} style={{ maxWidth: 480 }}>
          <Form.Item name="username" label="登录账号" rules={[{ required: true, message: '请输入登录账号' }]}>
            <Input autoComplete="username" />
          </Form.Item>
          <Form.Item name="currentPassword" label="当前密码" rules={[{ required: true, message: '请输入当前密码' }]}>
            <Input.Password autoComplete="current-password" />
          </Form.Item>
          <Form.Item
            name="newPassword"
            label="新密码"
            rules={[
              { required: true, message: '请输入新密码' },
              { min: 6, message: '新密码至少 6 位' }
            ]}
          >
            <Input.Password autoComplete="new-password" />
          </Form.Item>
          <Form.Item
            name="confirmPassword"
            label="确认新密码"
            dependencies={['newPassword']}
            rules={[
              { required: true, message: '请再次输入新密码' },
              ({ getFieldValue }) => ({
                validator(_, value) {
                  if (!value || getFieldValue('newPassword') === value) return Promise.resolve();
                  return Promise.reject(new Error('两次输入的新密码不一致'));
                }
              })
            ]}
          >
            <Input.Password autoComplete="new-password" />
          </Form.Item>
          <Button type="primary" htmlType="submit" loading={loading}>
            保存新密码
          </Button>
        </Form>
      </SectionCard>

      <SectionCard title="TTS 文件维护" description="清理超过保留周期的 TTS 临时音频">
        <Typography.Paragraph type="secondary" style={{ marginBottom: 12 }}>
          仅删除过期临时语音文件，不影响业务数据。
        </Typography.Paragraph>
        <Button
          disabled={mustChange}
          onClick={async () => {
            try {
              const res = await apiJson('/api/cleanup-tts-files', 'POST', {});
              message.success((res as any).message || '清理完成');
            } catch (e: any) {
              message.error(e.message || '清理失败');
            }
          }}
        >
          清理过期 TTS 文件
        </Button>
      </SectionCard>
    </Space>
  );
}
