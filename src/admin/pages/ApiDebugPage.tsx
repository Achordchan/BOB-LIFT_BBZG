import { useState } from 'react';
import { Alert, App, Button, Form, Input, Space, Tabs } from 'antd';
import { apiGet, apiJson } from '../api';
import { SectionCard } from '../components/SectionCard';

function JsonResult({ value }: { value: any }) { return <pre style={{ margin: 0, whiteSpace: 'pre-wrap', maxHeight: 360, overflow: 'auto' }}>{value ? JSON.stringify(value, null, 2) : '暂无结果'}</pre>; }

export default function ApiDebugPage() {
  const { message } = App.useApp();
  const [result, setResult] = useState<any>(null);
  const [enabled, setEnabled] = useState(false);

  async function run(fn: () => Promise<any>) { try { const res = await fn(); setResult(res); message.success('请求成功'); } catch (e: any) { setResult({ success: false, message: e.message }); message.error(e.message || '请求失败'); } }

  if (!enabled) return <SectionCard
    title="API 调试"
    description="诊断入口默认收起，避免干扰日常后台"
    extra={<Button type="primary" onClick={() => setEnabled(true)}>开启调试模式</Button>}
  >
    <Alert
      type="warning"
      showIcon
      message="业务操作已移至工作台"
      description="这里仅保留接口诊断与 TTS 测试。询盘和成交请统一在工作台的业务控制器中维护。"
    />
  </SectionCard>;

  return <Space direction="vertical" size={16} style={{ width: '100%' }}>
    <SectionCard
      title="API 调试"
      description="用于读取接口状态和测试 TTS，不维护业务数据。"
      extra={<Button danger onClick={() => setEnabled(false)}>退出调试</Button>}
    >
      <Space direction="vertical" size={16} style={{ width: '100%' }}>
        <Alert type="info" showIcon message="API 调试已开启" description="询盘和成交写操作已集中到工作台，避免出现多个业务入口。" />
        <div className="content-grid">
          <SectionCard title="调试面板" description="集中测试现有接口">
            <Tabs items={[
              { key: 'base', label: '基础诊断', children: <Space wrap><Button onClick={() => run(() => apiGet('/api/ping'))}>健康检查</Button><Button onClick={() => run(() => apiGet('/api/debug/routes'))}>路由清单</Button><Button onClick={() => run(() => apiGet('/api/dashboard'))}>工作台数据</Button></Space> },
              { key: 'inquiry', label: '询盘诊断', children: <Space wrap><Button onClick={() => run(() => apiGet('/api/inquiries'))}>询盘数据</Button><Button onClick={() => run(() => apiGet('/api/inquiries/latest'))}>最近询盘</Button></Space> },
              {
                key: 'deal',
                label: '成交诊断',
                children: (
                  <Space wrap>
                    <Button onClick={() => run(() => apiGet('/api/deals'))}>成交总额</Button>
                    <Button onClick={() => run(() => apiGet('/api/deals/latest'))}>最近成交</Button>
                    <Button onClick={() => run(() => apiGet('/api/deals/leaderboard'))}>排行榜</Button>
                    <Button onClick={() => run(() => apiGet('/api/deals/recent'))}>成交记录</Button>
                  </Space>
                )
              },
              { key: 'tts', label: 'TTS', children: <Form layout="vertical" onFinish={(v) => run(() => apiJson('/api/text-to-speech', 'POST', v))}><Form.Item name="text" label="播报文本" rules={[{ required: true }]}><Input.TextArea rows={3} /></Form.Item><Button type="primary" htmlType="submit">生成语音</Button></Form> },
              { key: 'read', label: '配置读取', children: <Space wrap><Button onClick={() => run(() => apiGet('/api/targets'))}>总目标</Button><Button onClick={() => run(() => apiGet('/api/page-settings'))}>首页文案</Button><Button onClick={() => run(() => apiGet('/api/platform-display-settings'))}>平台显示</Button><Button onClick={() => run(() => apiGet('/api/aliyun-tts-config'))}>TTS 配置</Button></Space> }
            ]} />
          </SectionCard>
          <SectionCard title="返回结果" description="最近一次请求结果（JSON）">
            <JsonResult value={result} />
          </SectionCard>
        </div>
      </Space>
    </SectionCard>
  </Space>;
}
