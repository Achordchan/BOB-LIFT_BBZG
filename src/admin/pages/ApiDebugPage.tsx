import { useState } from 'react';
import { Alert, App, Button, Card, Form, Input, InputNumber, Space, Tabs } from 'antd';
import { apiGet, apiJson } from '../api';
import { SectionCard } from '../components/SectionCard';

function JsonResult({ value }: { value: any }) { return <pre style={{ margin: 0, whiteSpace: 'pre-wrap', maxHeight: 360, overflow: 'auto' }}>{value ? JSON.stringify(value, null, 2) : '暂无结果'}</pre>; }

export default function ApiDebugPage() {
  const { message } = App.useApp();
  const [result, setResult] = useState<any>(null);
  const [enabled, setEnabled] = useState(false);
  async function run(fn: () => Promise<any>) { try { const res = await fn(); setResult(res); message.success('请求成功'); } catch (e: any) { setResult({ success: false, message: e.message }); message.error(e.message || '请求失败'); } }
  if (!enabled) return <SectionCard title="API 调试" description="调试操作默认收起，避免误写真实数据"><Alert type="warning" showIcon message="API 调试会写入真实数据" description="增加成交、增减询盘、设置金额等操作会直接影响 data.json 和首页展示。确认需要排查时再开启。" /><Button type="primary" style={{ marginTop: 16 }} onClick={() => setEnabled(true)}>开启调试模式</Button></SectionCard>;

  return <Space direction="vertical" size={16} style={{ width: '100%' }}>
    <Alert type="warning" showIcon message="API 调试已开启" description="当前页面会直接调用真实接口，完成排查后请离开本页。" />
    <div className="content-grid">
      <SectionCard title="调试面板" description="集中测试现有接口">
        <Tabs items={[
          { key: 'base', label: '基础诊断', children: <Space wrap><Button onClick={() => run(() => apiGet('/api/ping'))}>健康检查</Button><Button onClick={() => run(() => apiGet('/api/debug/routes'))}>路由清单</Button><Button onClick={() => run(() => apiGet('/api/dashboard'))}>工作台数据</Button></Space> },
          { key: 'inquiry', label: '询盘', children: <Space direction="vertical"><Space wrap><Button onClick={() => run(() => apiGet('/api/inquiries/add'))}>新增询盘</Button><Button onClick={() => run(() => apiGet('/api/inquiries/reduce'))}>减少询盘</Button><Button onClick={() => run(() => apiGet('/api/inquiries/latest'))}>最近询盘</Button></Space><Form layout="inline" onFinish={(v) => run(() => apiJson('/api/inquiries/set', 'POST', v))}><Form.Item name="count" rules={[{ required: true }]}><InputNumber min={0} placeholder="询盘总数" /></Form.Item><Button type="primary" htmlType="submit">设置询盘</Button></Form></Space> },
          {
            key: 'deal',
            label: '成交',
            children: (
              <Space direction="vertical">
                <Form
                  layout="inline"
                  onFinish={(v) => run(() => apiGet(`/api/deals/add?zongjine=${v.amount}&fuzeren=${encodeURIComponent(v.person)}&laiyuanpingtai=${encodeURIComponent(v.platform)}`))}
                >
                  <Form.Item name="amount" rules={[{ required: true }]}><InputNumber min={1} placeholder="成交金额" /></Form.Item>
                  <Form.Item name="person" rules={[{ required: true, message: '请输入真实负责人' }]}><Input placeholder="负责人" /></Form.Item>
                  <Form.Item name="platform" rules={[{ required: true, message: '请输入真实平台' }]}><Input placeholder="平台" /></Form.Item>
                  <Button type="primary" htmlType="submit">增加成交</Button>
                </Form>
                <Form layout="inline" onFinish={(v) => run(() => apiJson('/api/deals/set', 'POST', v))}>
                  <Form.Item name="amount" rules={[{ required: true }]}><InputNumber min={0} placeholder="成交总额" /></Form.Item>
                  <Button htmlType="submit">设置总额</Button>
                </Form>
                <Space wrap>
                  <Button onClick={() => run(() => apiGet('/api/deals/latest'))}>最近成交</Button>
                  <Button onClick={() => run(() => apiGet('/api/deals/leaderboard'))}>排行榜</Button>
                  <Button onClick={() => run(() => apiGet('/api/deals/recent'))}>成交记录</Button>
                </Space>
              </Space>
            )
          },
          { key: 'tts', label: 'TTS', children: <Form layout="vertical" onFinish={(v) => run(() => apiJson('/api/text-to-speech', 'POST', v))}><Form.Item name="text" label="播报文本" rules={[{ required: true }]}><Input.TextArea rows={3} /></Form.Item><Button type="primary" htmlType="submit">生成语音</Button></Form> },
          { key: 'read', label: '配置读取', children: <Space wrap><Button onClick={() => run(() => apiGet('/api/targets'))}>总目标</Button><Button onClick={() => run(() => apiGet('/api/page-settings'))}>首页文案</Button><Button onClick={() => run(() => apiGet('/api/platform-display-settings'))}>平台显示</Button><Button onClick={() => run(() => apiGet('/api/aliyun-tts-config'))}>TTS 配置</Button></Space> }
        ]} />
      </SectionCard>
      <Card title="返回结果"><JsonResult value={result} /></Card>
    </div>
  </Space>;
}
