import { useEffect, useState } from 'react';
import { App, Button, Card, Form, Input, List, Popconfirm, Space, Tag } from 'antd';
import { DeleteOutlined, SoundOutlined } from '@ant-design/icons';
import { apiGet, apiJson } from '../api';
import { SectionCard } from '../components/SectionCard';
import type { CelebrationMessage } from '../types';

export default function CelebrationPage() {
  const { message } = App.useApp();
  const [rows, setRows] = useState<CelebrationMessage[]>([]);
  const [form] = Form.useForm();
  async function load() { try { const res = await apiGet<{ messages: CelebrationMessage[] }>('/api/celebration-messages'); setRows((res as any).messages || []); } catch (e: any) { message.error(e.message || '加载失败'); } }
  useEffect(() => { load(); }, []);
  async function add(values: any) { try { await apiJson('/api/celebration-messages/add', 'POST', values); message.success('庆祝语已添加'); form.resetFields(); load(); } catch (e: any) { message.error(e.message || '添加失败'); } }
  async function speak(text: string) { try { const res = await apiJson('/api/text-to-speech', 'POST', { text }); const audio = new Audio((res as any).audioPath); audio.play(); } catch (e: any) { message.error(e.message || '试听失败'); } }
  return <Space direction="vertical" size={16} style={{ width: '100%' }}>
    <Card><Space wrap><Tag>{'{person}'} 负责人</Tag><Tag>{'{platform}'} 来源平台</Tag><Tag>{'{amount}'} 成交金额</Tag></Space></Card>
    <SectionCard title="新增庆祝语" description="文案会自动规范变量空格，避免播报异常"><Form form={form} layout="vertical" onFinish={add}><Form.Item name="message" rules={[{ required: true, message: '请输入庆祝语' }]}><Input.TextArea rows={4} placeholder="恭喜{person}在{platform}成交{amount}元！" /></Form.Item><Button type="primary" htmlType="submit">添加庆祝语</Button></Form></SectionCard>
    <SectionCard title="庆祝语列表" description="成交时随机抽取一条模板播报"><List dataSource={rows} locale={{ emptyText: '暂无庆祝语' }} renderItem={(item) => <List.Item actions={[<Button icon={<SoundOutlined />} onClick={() => speak(item.message)}>试听</Button>, <Popconfirm title="确认删除？" onConfirm={async () => { await apiJson(`/api/celebration-messages/${item.id}`, 'DELETE'); message.success('已删除'); load(); }}><Button danger icon={<DeleteOutlined />}>删除</Button></Popconfirm>]}><List.Item.Meta title={item.message} /></List.Item>} /></SectionCard>
  </Space>;
}
