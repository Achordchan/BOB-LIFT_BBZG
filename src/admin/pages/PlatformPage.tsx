import { useEffect, useState } from 'react';
import { App, Button, Form, InputNumber, Popconfirm, Space, Switch, Table, Input } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { apiGet, apiJson, money } from '../api';
import { SectionCard } from '../components/SectionCard';
import type { PlatformTarget } from '../types';

export default function PlatformPage() {
  const { message } = App.useApp();
  const [rows, setRows] = useState<PlatformTarget[]>([]);
  const [settings, setSettings] = useState<any>({});
  async function load() { const [p, s] = await Promise.all([apiGet('/api/platforms/targets'), apiGet('/api/platform-display-settings')]); setRows((p as any).platforms || []); setSettings((s as any).settings || {}); }
  useEffect(() => { load().catch((e) => message.error(e.message || '加载失败')); }, []);
  function update(index: number, patch: Partial<PlatformTarget>) { setRows(rows.map((r, i) => i === index ? { ...r, ...patch } : r)); }
  async function save() { try { await apiJson('/api/platforms/targets', 'POST', { platforms: rows }); message.success('平台目标已保存'); load(); } catch (e: any) { message.error(e.message || '保存失败'); } }
  async function saveDisplaySettings(patch: Record<string, unknown>) {
    const previous = settings;
    const next = { ...settings, ...patch };
    setSettings(next);
    try {
      await apiJson('/api/platform-display-settings', 'POST', { settings: next });
      message.success('显示设置已保存');
    } catch (e: any) {
      setSettings(previous);
      message.error(e.message || '保存失败');
    }
  }
  return <Space direction="vertical" size={16} style={{ width: '100%' }}>
    <SectionCard title="首页显示设置" description="控制首页是否展示平台目标滚动区域"><Space><span>展示平台目标</span><Switch checked={!!settings.showPlatformTargets} onChange={(v) => saveDisplaySettings({ showPlatformTargets: v })} /><span>自动滚动</span><Switch checked={settings.autoScroll !== false} onChange={(v) => saveDisplaySettings({ autoScroll: v })} /></Space></SectionCard>
    <SectionCard title="平台目标" description="维护各平台目标与当前进度" extra={<Space><Button icon={<PlusOutlined />} onClick={() => setRows([...rows, { name: '新平台', target: 0, current: 0, enabled: true }])}>添加平台</Button><Popconfirm title="确认重置所有平台 current？" onConfirm={async () => { await apiJson('/api/platforms/reset', 'POST', {}); message.success('已重置'); load(); }}><Button danger>重置当前值</Button></Popconfirm><Button type="primary" onClick={save}>保存全部</Button></Space>}>
      <Table rowKey={(r, i) => r.id || String(i)} pagination={false} dataSource={rows} columns={[{ title: '平台', render: (_, r, i) => <Input value={r.name} onChange={(e) => update(i, { name: e.target.value })} /> }, { title: '目标', render: (_, r, i) => <InputNumber style={{ width: '100%' }} min={0} value={r.target} onChange={(v) => update(i, { target: Number(v || 0) })} /> }, { title: '当前', render: (_, r, i) => <InputNumber style={{ width: '100%' }} min={0} value={r.current} onChange={(v) => update(i, { current: Number(v || 0) })} /> }, { title: '完成', render: (_, r) => r.target ? `${Math.round(Number(r.current || 0) / Number(r.target) * 100)}%` : '—' }, { title: '状态', render: (_, r, i) => <Switch checked={r.enabled !== false} onChange={(v) => update(i, { enabled: v })} /> }, { title: '操作', render: (_, r, i) => <Button danger onClick={() => setRows(rows.filter((_, idx) => idx !== i))}>删除</Button> }]} summary={() => <Table.Summary><Table.Summary.Row><Table.Summary.Cell index={0}>合计</Table.Summary.Cell><Table.Summary.Cell index={1}>{money(rows.reduce((s, r) => s + Number(r.target || 0), 0))}</Table.Summary.Cell><Table.Summary.Cell index={2}>{money(rows.reduce((s, r) => s + Number(r.current || 0), 0))}</Table.Summary.Cell><Table.Summary.Cell index={3} colSpan={3} /></Table.Summary.Row></Table.Summary>} />
    </SectionCard>
  </Space>;
}
