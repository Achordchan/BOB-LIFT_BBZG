import { useEffect, useState } from 'react';
import { App, Avatar, Button, Descriptions, Drawer, Form, Input, List, Space, Tabs, Tag, Typography } from 'antd';
import { LogoutOutlined, UserOutlined } from '@ant-design/icons';
import { apiGet, apiJson, dateTime } from '../api';
import type { AdminOperationLog } from '../types';

interface AdminProfile {
  username: string;
  role: string;
  operationLogs: AdminOperationLog[];
}

export function AdminAccountMenu() {
  const { message } = App.useApp();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [profile, setProfile] = useState<AdminProfile>({ username: '管理员', role: '管理员', operationLogs: [] });
  const [form] = Form.useForm();

  async function loadProfile() {
    setLoading(true);
    try {
      const res = await apiGet<AdminProfile>('/api/admin/profile');
      const next = res as any;
      setProfile({ username: next.username || '管理员', role: next.role || '管理员', operationLogs: next.operationLogs || [] });
      form.setFieldsValue({ username: next.username || '' });
    } catch (e: any) {
      message.error(e.message || '账号信息加载失败');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadProfile(); }, []);

  async function saveAccount(values: any) {
    try {
      const res = await apiJson('/api/admin/account', 'POST', values);
      message.success((res as any).message || '账号信息已更新');
      form.resetFields(['currentPassword', 'newPassword']);
      await loadProfile();
    } catch (e: any) {
      message.error(e.message || '保存失败');
    }
  }

  return <>
    <Button className="admin-account-trigger" icon={<Avatar size={22} icon={<UserOutlined />} />} onClick={() => { setOpen(true); loadProfile(); }}>
      {profile.username}
    </Button>
    <Drawer
      title="账号中心"
      width={520}
      open={open}
      onClose={() => setOpen(false)}
      extra={<Button icon={<LogoutOutlined />} href="/logout">退出登录</Button>}
      destroyOnClose={false}
    >
      <Space direction="vertical" size={16} style={{ width: '100%' }}>
        <Descriptions size="small" bordered column={1}>
          <Descriptions.Item label="当前账号">{profile.username}</Descriptions.Item>
          <Descriptions.Item label="权限角色"><Tag color="blue">{profile.role}</Tag></Descriptions.Item>
        </Descriptions>
        <Tabs
          items={[
            {
              key: 'logs',
              label: '操作记录',
              children: <List
                loading={loading}
                dataSource={profile.operationLogs}
                locale={{ emptyText: '暂无操作记录' }}
                renderItem={(item) => <List.Item>
                  <List.Item.Meta
                    title={<Space><span>{item.action}</span><Typography.Text type="secondary">{dateTime(item.createdAt)}</Typography.Text></Space>}
                    description={<Space direction="vertical" size={2}>
                      <span>{item.detail || '—'}</span>
                      <Typography.Text type="secondary">IP：{item.ip || '—'}</Typography.Text>
                    </Space>}
                  />
                </List.Item>}
              />
            },
            {
              key: 'account',
              label: '账号密码',
              children: <Form form={form} layout="vertical" onFinish={saveAccount}>
                <Form.Item name="username" label="登录账号" rules={[{ required: true, message: '请输入登录账号' }]}><Input /></Form.Item>
                <Form.Item name="currentPassword" label="当前密码" rules={[{ required: true, message: '请输入当前密码' }]}><Input.Password /></Form.Item>
                <Form.Item name="newPassword" label="新密码" extra="不修改密码时留空；填写后至少 6 位。"><Input.Password /></Form.Item>
                <Button type="primary" htmlType="submit">保存账号信息</Button>
              </Form>
            }
          ]}
        />
      </Space>
    </Drawer>
  </>;
}
