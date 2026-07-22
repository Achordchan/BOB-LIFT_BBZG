import { useEffect, useMemo, useState } from 'react';
import { Alert, App, Button, Form, Input, Space, Typography } from 'antd';
import { CopyOutlined, KeyOutlined } from '@ant-design/icons';
import { apiGet, apiJson } from '../api';
import { SectionCard } from '../components/SectionCard';

interface AdminProfile {
  username?: string;
  mustChangePassword?: boolean;
}

interface ExternalTokenStatus {
  configured: boolean;
  preview?: string;
  updatedAt?: string | null;
  parameterName: string;
  parameterLocation: string;
  token?: string;
}

export default function SystemPage() {
  const { message, modal } = App.useApp();
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [profile, setProfile] = useState<AdminProfile>({});
  const [tokenStatus, setTokenStatus] = useState<ExternalTokenStatus | null>(null);
  const [generatedToken, setGeneratedToken] = useState('');
  const [tokenLoading, setTokenLoading] = useState(false);
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

  async function loadTokenStatus() {
    try {
      const res = await apiGet<ExternalTokenStatus>('/api/admin/external-write-token');
      setTokenStatus(res);
    } catch (e: any) {
      message.error(e.message || '绑定 Token 状态加载失败');
    }
  }

  useEffect(() => {
    loadProfile();
    loadTokenStatus();
  }, []);

  async function regenerateToken() {
    setTokenLoading(true);
    try {
      const res = await apiJson<ExternalTokenStatus>('/api/admin/external-write-token/regenerate', 'POST', {});
      setGeneratedToken(res.token || '');
      setTokenStatus(res);
      message.success('绑定 Token 已生成');
    } catch (e: any) {
      message.error(e.message || '生成绑定 Token 失败');
    } finally {
      setTokenLoading(false);
    }
  }

  function confirmRegenerate() {
    if (!tokenStatus?.configured) {
      regenerateToken();
      return;
    }
    modal.confirm({
      title: '重新生成绑定 Token？',
      content: '重新生成后旧 Token 立即失效，钉钉连接器需要同步更新。',
      okText: '重新生成',
      cancelText: '取消',
      onOk: regenerateToken
    });
  }

  async function copyToken() {
    if (!generatedToken) return;
    try {
      await navigator.clipboard.writeText(generatedToken);
      message.success('Token 已复制');
    } catch {
      message.error('复制失败，请手动复制');
    }
  }

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

      <SectionCard
        title="外部接口绑定"
        description="生成钉钉连接器使用的 Query Token，无需配置服务器环境变量"
        extra={tokenStatus?.configured ? <Typography.Text type="success">已绑定</Typography.Text> : <Typography.Text type="secondary">未生成</Typography.Text>}
      >
        <Space direction="vertical" size={14} style={{ width: '100%', maxWidth: 720 }}>
          <Alert
            type="info"
            showIcon
            message="钉钉连接器配置"
            description="身份验证类型选择 API 密钥，参数名称填写 token，参数位置选择 Query。现有询盘增加、询盘减少和成交 GET 地址可以继续使用。"
          />

          {tokenStatus?.configured ? (
            <Typography.Paragraph style={{ marginBottom: 0 }}>
              当前 Token：<Typography.Text code>{tokenStatus.preview || '已配置'}</Typography.Text>
              {tokenStatus.updatedAt ? `，生成时间：${new Date(tokenStatus.updatedAt).toLocaleString('zh-CN', { hour12: false })}` : ''}
            </Typography.Paragraph>
          ) : (
            <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
              尚未生成绑定 Token，钉钉外部请求不会获得写入权限。
            </Typography.Paragraph>
          )}

          {generatedToken ? (
            <Alert
              type="warning"
              showIcon
              message="请立即复制并保存"
              description="完整 Token 只在本次生成后显示，刷新页面后只能看到尾号。"
            />
          ) : null}

          {generatedToken ? (
            <Space.Compact style={{ width: '100%' }}>
              <Input value={generatedToken} readOnly aria-label="新生成的外部接口绑定 Token" />
              <Button icon={<CopyOutlined />} onClick={copyToken}>复制</Button>
            </Space.Compact>
          ) : null}

          <Button
            type="primary"
            icon={<KeyOutlined />}
            loading={tokenLoading}
            disabled={mustChange}
            onClick={confirmRegenerate}
          >
            {tokenStatus?.configured ? '重新生成 Token' : '生成绑定 Token'}
          </Button>
        </Space>
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
