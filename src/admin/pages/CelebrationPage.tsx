import { useEffect, useRef, useState } from 'react';
import { App, Button, Card, Form, Input, List, Popconfirm, Space, Tag, Typography } from 'antd';
import { DeleteOutlined, PlusOutlined, SoundOutlined } from '@ant-design/icons';
import { apiGet, apiJson, dateTime } from '../api';
import { SectionCard } from '../components/SectionCard';
import type { CelebrationMessage } from '../types';

const variableOptions = [
  { token: '{person}', label: '负责人', sample: '陈驰宇-Achord' },
  { token: '{platform}', label: '来源平台', sample: '独立站' },
  { token: '{amount}', label: '成交金额', sample: '192,689.04' }
];

function normalizeTemplate(text: string) {
  return String(text || '')
    .replace(/\{\s*person\s*\}/g, '{person}')
    .replace(/\{\s*platform\s*\}/g, '{platform}')
    .replace(/\{\s*amount\s*\}/g, '{amount}')
    .replace(/\s+/g, ' ')
    .trim();
}

function renderPreview(text: string) {
  let output = normalizeTemplate(text);
  for (const item of variableOptions) output = output.split(item.token).join(item.sample);
  return output;
}

export default function CelebrationPage() {
  const { message } = App.useApp();
  const [rows, setRows] = useState<CelebrationMessage[]>([]);
  const [form] = Form.useForm();
  const textAreaRef = useRef<any>(null);
  const messageValue = Form.useWatch('message', form) || '';
  const previewText = renderPreview(messageValue);

  async function load() {
    try {
      const res = await apiGet<{ messages: CelebrationMessage[] }>('/api/celebration-messages');
      setRows((res as any).messages || []);
    } catch (e: any) { message.error(e.message || '加载失败'); }
  }

  useEffect(() => { load(); }, []);

  async function add(values: any) {
    const cleanMessage = normalizeTemplate(values.message);
    try {
      await apiJson('/api/celebration-messages/add', 'POST', { message: cleanMessage });
      message.success('庆祝语已添加');
      form.resetFields();
      load();
    } catch (e: any) { message.error(e.message || '添加失败'); }
  }

  function insertVariable(token: string) {
    const current = String(form.getFieldValue('message') || '');
    const textarea = textAreaRef.current?.resizableTextArea?.textArea;
    const start = textarea?.selectionStart ?? current.length;
    const end = textarea?.selectionEnd ?? current.length;
    const next = `${current.slice(0, start)}${token}${current.slice(end)}`;
    form.setFieldsValue({ message: next });
    requestAnimationFrame(() => {
      textarea?.focus();
      const pos = start + token.length;
      textarea?.setSelectionRange(pos, pos);
    });
  }

  async function speakTemplate(text: string) {
    const spokenText = renderPreview(text);
    if (!spokenText) { message.warning('请输入庆祝语'); return; }
    try {
      const res = await apiJson('/api/text-to-speech', 'POST', { text: spokenText });
      const audio = new Audio((res as any).audioPath);
      await audio.play();
    } catch (e: any) { message.error(e.message || '试听失败'); }
  }

  return <Space direction="vertical" size={16} style={{ width: '100%' }}>
    <Card className="celebration-variable-card">
      <Space direction="vertical" size={10} style={{ width: '100%' }}>
        <Typography.Text strong>可插入变量</Typography.Text>
        <Space wrap>
          {variableOptions.map(item => <Button key={item.token} size="small" onClick={() => insertVariable(item.token)}>{item.token} · {item.label}</Button>)}
        </Space>
      </Space>
    </Card>

    <SectionCard title="新增庆祝语" description="点击变量即可插入，试听会自动替换为示例数据">
      <Form form={form} layout="vertical" onFinish={add}>
        <Form.Item name="message" label="庆祝语模板" rules={[{ required: true, message: '请输入庆祝语' }]}>
          <Input.TextArea ref={textAreaRef} rows={5} placeholder="恭喜{person}在{platform}成交{amount}元！" />
        </Form.Item>
        <Card size="small" className="celebration-preview-card">
          <Typography.Text type="secondary">试听内容</Typography.Text>
          <Typography.Paragraph style={{ margin: '6px 0 0' }}>{previewText || '输入模板后这里会显示替换变量后的播报内容'}</Typography.Paragraph>
        </Card>
        <Space wrap style={{ marginTop: 14 }}>
          <Button icon={<SoundOutlined />} onClick={() => speakTemplate(messageValue)}>试听</Button>
          <Button type="primary" icon={<PlusOutlined />} htmlType="submit">添加庆祝语</Button>
        </Space>
      </Form>
    </SectionCard>

    <SectionCard title="庆祝语列表" description="成交时随机抽取一条模板播报">
      <List
        dataSource={rows}
        locale={{ emptyText: '暂无庆祝语' }}
        renderItem={(item) => {
          const spokenText = renderPreview(item.message);
          return <List.Item actions={[
            <Button icon={<SoundOutlined />} onClick={() => speakTemplate(item.message)}>试听</Button>,
            <Popconfirm title="确认删除？" onConfirm={async () => { await apiJson(`/api/celebration-messages/${item.id}`, 'DELETE'); message.success('已删除'); load(); }}><Button danger icon={<DeleteOutlined />}>删除</Button></Popconfirm>
          ]}>
            <List.Item.Meta
              title={<Typography.Text strong>{item.message}</Typography.Text>}
              description={<Space direction="vertical" size={4}><Typography.Text type="secondary">播报示例：{spokenText}</Typography.Text>{item.createdAt && <Typography.Text type="secondary">创建时间：{dateTime(item.createdAt)}</Typography.Text>}</Space>}
            />
          </List.Item>;
        }}
      />
    </SectionCard>
  </Space>;
}
