import { App, Button, Form, Input, Space } from 'antd';
import { apiJson } from '../api';
import { SectionCard } from '../components/SectionCard';

export default function SystemPage() {
  const { message } = App.useApp();
  const [form] = Form.useForm();
  async function change(values: any) { try { await apiJson('/api/change-password', 'POST', values); message.success('密码已修改，请妥善保存'); form.resetFields(); } catch (e: any) { message.error(e.message || '修改失败'); } }
  return <Space direction="vertical" size={16} style={{ width: '100%' }}>
    <SectionCard title="管理员密码" description="复用现有登录系统和 session，不重做认证链路"><Form form={form} layout="vertical" onFinish={change} style={{ maxWidth: 520 }}><Form.Item name="currentPassword" label="当前密码" rules={[{ required: true }]}><Input.Password /></Form.Item><Form.Item name="newPassword" label="新密码" rules={[{ required: true }]}><Input.Password /></Form.Item><Button type="primary" htmlType="submit">修改密码</Button></Form></SectionCard>
    <SectionCard title="TTS 文件维护" description="清理超过保留周期的 TTS 临时音频"><Button onClick={async () => { try { const res = await apiJson('/api/cleanup-tts-files', 'POST', {}); message.success((res as any).message || '清理完成'); } catch (e: any) { message.error(e.message || '清理失败'); } }}>清理过期 TTS 文件</Button></SectionCard>
    <SectionCard title="运行说明" description="后台资源独立构建到 /admin-app，不覆盖首页资源"><p>退出登录使用 `/logout`；接口登录失效会自动跳转 `/login`。部署仍使用宝塔 Node 项目，不绕过面板。</p></SectionCard>
  </Space>;
}
