import { useEffect } from 'react';
import { App, Button, Form, Input, InputNumber, Select, Space } from 'antd';
import { apiGet, apiJson } from '../api';
import { SectionCard } from '../components/SectionCard';

export default function HomeSettingsPage() {
  const { message } = App.useApp();
  const [pageForm] = Form.useForm();
  const [targetForm] = Form.useForm();
  useEffect(() => { Promise.all([apiGet('/api/page-settings'), apiGet('/api/targets')]).then(([p, t]) => { pageForm.setFieldsValue((p as any).settings); targetForm.setFieldsValue(t); }).catch((e) => message.error(e.message || '加载失败')); }, []);
  async function savePage(values: any) { try { await apiJson('/api/page-settings', 'POST', { settings: values }); message.success('首页文案已保存'); } catch (e: any) { message.error(e.message || '保存失败'); } }
  async function saveTarget(values: any) { try { await apiJson('/api/targets', 'POST', values); message.success('总目标已保存'); } catch (e: any) { message.error(e.message || '保存失败'); } }
  return <Space direction="vertical" size={16} style={{ width: '100%' }}>
    <SectionCard title="首页文案设置" description="只保存首页展示文案，不修改首页页面结构"><Form form={pageForm} layout="vertical" onFinish={savePage}><div className="form-grid">{['mainTitle','subTitle','inquiryTitle','dealTitle','progressTitle','teamTitle','activityTitle'].map(k => <Form.Item key={k} name={k} label={{ mainTitle: '主标题', subTitle: '副标题', inquiryTitle: '询盘标题', dealTitle: '成交标题', progressTitle: '进度标题', teamTitle: '团队标题', activityTitle: '动态标题' }[k]} rules={[{ required: true }]}><Input /></Form.Item>)}</div><Button type="primary" htmlType="submit">保存首页文案</Button></Form></SectionCard>
    <SectionCard title="总目标设置" description="控制首页总目标进度"><Form form={targetForm} layout="vertical" onFinish={saveTarget}><div className="form-grid"><Form.Item name="inquiryTarget" label="询盘目标"><InputNumber style={{ width: '100%' }} min={0} /></Form.Item><Form.Item name="dealTarget" label="成交目标"><InputNumber style={{ width: '100%' }} min={0} /></Form.Item><Form.Item name="resetPeriod" label="重置周期"><Select options={[{ label: '每日', value: 'daily' }, { label: '每周', value: 'weekly' }, { label: '每月', value: 'monthly' }, { label: '每年', value: 'yearly' }, { label: '永不', value: 'never' }]} /></Form.Item></div><Button type="primary" htmlType="submit">保存总目标</Button></Form></SectionCard>
  </Space>;
}
