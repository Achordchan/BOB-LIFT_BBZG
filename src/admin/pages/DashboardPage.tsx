import { useEffect, useMemo, useState } from 'react';
import { Button, Card, Empty, Space, Statistic, Table, Tag, Typography, App } from 'antd';
import { CheckCircleFilled, ExclamationCircleFilled, ReloadOutlined, SettingOutlined } from '@ant-design/icons';
import { apiGet, dateTime, money } from '../api';
import { SectionCard } from '../components/SectionCard';
import type { DashboardData, UserItem, MusicItem } from '../types';

interface RecentDealItem {
  type?: string;
  person?: string;
  platform?: string;
  amount?: number;
  timestamp?: string;
}

interface StatusItem {
  label: string;
  value: string;
  ok: boolean;
  action: string;
  href: string;
}

function navigateTo(page: string) {
  const url = new URL(window.location.href);
  url.searchParams.set('page', page);
  window.location.href = url.toString();
}

export default function DashboardPage() {
  const { message } = App.useApp();
  const [loading, setLoading] = useState(false);
  const [dashboard, setDashboard] = useState<DashboardData>({ inquiryCount: 0, dealAmount: 0 });
  const [recentDeals, setRecentDeals] = useState<RecentDealItem[]>([]);
  const [users, setUsers] = useState<UserItem[]>([]);
  const [music, setMusic] = useState<MusicItem[]>([]);
  const [defaultSong, setDefaultSong] = useState<any>(null);
  const [tts, setTts] = useState<any>(null);

  async function load() {
    setLoading(true);
    try {
      const [dash, recent, us, mu, def, ttsCfg] = await Promise.all([
        apiGet<DashboardData>('/api/dashboard'),
        apiGet<{ deals: RecentDealItem[] }>('/api/deals/recent'),
        apiGet<{ users: UserItem[] }>('/api/users'),
        apiGet<{ music: MusicItem[] }>('/api/music'),
        apiGet<{ defaultBattleSong: any }>('/api/defaultBattleSong'),
        apiGet<{ config: any }>('/api/aliyun-tts-config')
      ]);
      setDashboard({
        inquiryCount: Number((dash as any).inquiryCount || 0),
        dealAmount: Number((dash as any).dealAmount || 0),
        latestDeal: (dash as any).latestDeal,
        latestInquiry: (dash as any).latestInquiry
      });
      setRecentDeals(((recent as any).deals || []).filter((item: RecentDealItem) => item.type === 'deal'));
      setUsers((us as any).users || []);
      setMusic((mu as any).music || []);
      setDefaultSong((def as any).defaultBattleSong || null);
      setTts((ttsCfg as any).config || null);
    } catch (e: any) {
      message.error(e.message || '工作台加载失败');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const configuredUsers = users.filter(u => u.musicName || u.musicId).length;
  const songs = music.filter(m => !m.isSound).length;
  const sounds = music.filter(m => m.isSound).length;
  const ttsReady = !!(tts && tts.accessKeyId && tts.appKey);
  const statusItems: StatusItem[] = useMemo(() => [
    {
      label: '默认战歌',
      value: defaultSong ? (defaultSong.name || defaultSong.filename || defaultSong.musicId) : '未设置',
      ok: !!defaultSong,
      action: '去配置',
      href: 'playback'
    },
    {
      label: '音乐库',
      value: `${songs} 首音乐 / ${sounds} 个音效`,
      ok: songs + sounds > 0,
      action: '管理音乐',
      href: 'music'
    },
    {
      label: 'TTS 播报',
      value: ttsReady ? '已配置' : '未完整配置',
      ok: ttsReady,
      action: '检查配置',
      href: 'playback'
    },
    {
      label: '成员配置',
      value: `${configuredUsers} / ${users.length} 已配置`,
      ok: users.length > 0 && configuredUsers === users.length,
      action: '维护成员',
      href: 'users'
    }
  ], [configuredUsers, defaultSong, songs, sounds, ttsReady, users.length]);

  return <Space direction="vertical" size={16} style={{ width: '100%' }}>
    <SectionCard
      title="工作台"
      description="核心运营数据与常用运维入口"
      extra={<Button icon={<ReloadOutlined />} onClick={load} loading={loading}>刷新数据</Button>}
    >
      <div className="metric-grid">
        <Card className="dashboard-kpi-card"><Statistic title="成交金额" value={money(dashboard.dealAmount)} /></Card>
        <Card className="dashboard-kpi-card"><Statistic title="询盘数量" value={dashboard.inquiryCount} suffix="条" /></Card>
        <Card className="dashboard-kpi-card"><Statistic title="成员战歌配置" value={configuredUsers} suffix={`/ ${users.length}`} /></Card>
        <Card className="dashboard-kpi-card"><Statistic title="音乐资产" value={music.length} suffix="个" /></Card>
      </div>
    </SectionCard>
    <div className="content-grid">
      <Space direction="vertical" size={16} style={{ width: '100%' }}>
        <SectionCard title="成交记录" description="最近成交数据">
          {recentDeals.length ? <Table
            rowKey={(row, index) => `${row.timestamp || 'deal'}-${index}`}
            className="recent-deal-table"
            size="middle"
            pagination={false}
            dataSource={recentDeals.slice(0, 8)}
            columns={[
              { title: '负责人', dataIndex: 'person', render: (v) => v || '—' },
              { title: '平台', dataIndex: 'platform', render: (v) => v || '—' },
              { title: '成交金额', dataIndex: 'amount', align: 'right' as const, render: (v) => <Typography.Text strong>{money(v)}</Typography.Text> },
              { title: '成交时间', dataIndex: 'timestamp', render: (v) => dateTime(v) }
            ]}
          /> : <Empty description="暂无成交记录" />}
        </SectionCard>
        <SectionCard title="常用操作">
          <div className="quick-action-grid">
            <Button icon={<SettingOutlined />} onClick={() => navigateTo('playback')}>播放配置</Button>
            <Button onClick={() => navigateTo('music')}>上传音乐</Button>
            <Button onClick={() => navigateTo('celebration')}>庆祝语管理</Button>
            <Button onClick={() => navigateTo('apis')}>接口调试</Button>
          </div>
        </SectionCard>
      </Space>
      <SectionCard title="系统状态" description="播放能力检查">
        <div className="system-status-grid">
          {statusItems.map(item => <div className="system-status-card" key={item.label}>
            <Space align="start" size={12}>
              {item.ok ? <CheckCircleFilled className="status-icon status-icon-ok" /> : <ExclamationCircleFilled className="status-icon status-icon-warn" />}
              <div className="status-body">
                <div className="status-title-row">
                  <Typography.Text strong>{item.label}</Typography.Text>
                  <Tag color={item.ok ? 'green' : 'orange'}>{item.ok ? '正常' : '待处理'}</Tag>
                </div>
                <Typography.Text type={item.ok ? undefined : 'secondary'} className="status-value">{item.value}</Typography.Text>
                <Button size="small" type="link" className="status-action" onClick={() => navigateTo(item.href)}>{item.action}</Button>
              </div>
            </Space>
          </div>)}
        </div>
      </SectionCard>
    </div>
  </Space>;
}
