import { useEffect, useState } from 'react';
import { Alert, App, Button, Col, Row, Segmented, Space, Statistic, Table } from 'antd';
import { DownloadOutlined, ReloadOutlined } from '@ant-design/icons';
import { apiGet, dateTime, money } from '../api';
import { SectionCard } from '../components/SectionCard';

type Period = 'daily' | 'weekly' | 'monthly' | 'yearly' | 'all';

interface StatsPayload {
  period: Period;
  coverage: { earliestTimestamp: string | null; mayBeIncomplete: boolean };
  stats: {
    totalAmount: number;
    dealCount: number;
    byPlatform: Array<{ platform: string; amount: number; count: number }>;
    byPerson: Array<{ person: string; amount: number; count: number }>;
    byDay: Array<{ day: string; amount: number; count: number }>;
  };
}

const periodOptions = [
  { label: '今日', value: 'daily' },
  { label: '本周', value: 'weekly' },
  { label: '本月', value: 'monthly' },
  { label: '今年', value: 'yearly' },
  { label: '全部', value: 'all' }
];

export default function StatsPage() {
  const { message } = App.useApp();
  const [period, setPeriod] = useState<Period>('monthly');
  const [payload, setPayload] = useState<StatsPayload | null>(null);
  const [loading, setLoading] = useState(false);

  async function load(p: Period) {
    setLoading(true);
    try {
      const result = await apiGet<StatsPayload>(`/api/deals/stats?period=${p}`);
      setPayload(result as unknown as StatsPayload);
    } catch (e: any) {
      message.error(e.message || '加载成交统计失败');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(period); }, [period]);

  const stats = payload?.stats;
  const avg = stats && stats.dealCount ? stats.totalAmount / stats.dealCount : 0;

  return <Space direction="vertical" size={16} style={{ width: '100%' }}>
    <SectionCard
      title="成交统计"
      description="基于成交流水（dealsLedger）按周期聚合"
      extra={<Space>
        <Segmented options={periodOptions} value={period} onChange={(v) => setPeriod(v as Period)} />
        <Button icon={<ReloadOutlined />} onClick={() => load(period)} loading={loading}>刷新</Button>
        <Button icon={<DownloadOutlined />} href={`/api/deals/export?period=${period}`}>导出 CSV</Button>
      </Space>}
    >
      {payload?.coverage.mayBeIncomplete ? (
        <Alert
          style={{ marginBottom: 16 }}
          type="warning"
          showIcon
          message="该区间可能不完整"
          description={`成交流水最早记录于 ${dateTime(payload.coverage.earliestTimestamp || undefined)}，此前的成交（如迁移前的历史数据）不在流水中，统计不含这些记录。累计总额请以工作台为准。`}
        />
      ) : null}
      <Row gutter={16}>
        <Col xs={24} sm={8}><Statistic title="成交总额" value={money(stats?.totalAmount)} /></Col>
        <Col xs={24} sm={8}><Statistic title="成交笔数" value={stats?.dealCount ?? 0} /></Col>
        <Col xs={24} sm={8}><Statistic title="平均单笔" value={money(avg)} /></Col>
      </Row>
    </SectionCard>

    <Row gutter={16}>
      <Col xs={24} lg={12}>
        <SectionCard title="按平台" description="各来源平台的成交金额与笔数">
          <Table
            rowKey="platform"
            size="small"
            pagination={false}
            loading={loading}
            dataSource={stats?.byPlatform || []}
            columns={[
              { title: '平台', dataIndex: 'platform' },
              { title: '金额', dataIndex: 'amount', align: 'right', render: (v: number) => money(v) },
              { title: '笔数', dataIndex: 'count', align: 'right' },
              { title: '占比', align: 'right', render: (_, r) => stats && stats.totalAmount ? `${(r.amount / stats.totalAmount * 100).toFixed(1)}%` : '—' }
            ]}
          />
        </SectionCard>
      </Col>
      <Col xs={24} lg={12}>
        <SectionCard title="按负责人" description="各负责人的成交金额与笔数">
          <Table
            rowKey="person"
            size="small"
            pagination={false}
            loading={loading}
            dataSource={stats?.byPerson || []}
            columns={[
              { title: '负责人', dataIndex: 'person' },
              { title: '金额', dataIndex: 'amount', align: 'right', render: (v: number) => money(v) },
              { title: '笔数', dataIndex: 'count', align: 'right' },
              { title: '占比', align: 'right', render: (_, r) => stats && stats.totalAmount ? `${(r.amount / stats.totalAmount * 100).toFixed(1)}%` : '—' }
            ]}
          />
        </SectionCard>
      </Col>
    </Row>

    <SectionCard title="按日走势" description="区间内每天的成交金额与笔数（最新在前）">
      <Table
        rowKey="day"
        size="small"
        loading={loading}
        pagination={{ pageSize: 10, hideOnSinglePage: true }}
        dataSource={(stats?.byDay || []).slice().reverse()}
        columns={[
          { title: '日期', dataIndex: 'day' },
          { title: '金额', dataIndex: 'amount', align: 'right', render: (v: number) => money(v) },
          { title: '笔数', dataIndex: 'count', align: 'right' }
        ]}
      />
    </SectionCard>
  </Space>;
}
