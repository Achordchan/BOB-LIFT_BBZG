import { useEffect, useState } from 'react';
import { Alert, Button, Card, Empty, List, Progress, Space, Statistic, Table, Tag, Typography, App } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import { apiGet, dateTime, money } from '../api';
import { SectionCard } from '../components/SectionCard';
import type { DashboardData, PlatformTarget, UserItem, MusicItem } from '../types';

export default function DashboardPage() {
  const { message } = App.useApp();
  const [loading, setLoading] = useState(false);
  const [dashboard, setDashboard] = useState<DashboardData>({ inquiryCount: 0, dealAmount: 0 });
  const [activities, setActivities] = useState<any[]>([]);
  const [platforms, setPlatforms] = useState<PlatformTarget[]>([]);
  const [users, setUsers] = useState<UserItem[]>([]);
  const [music, setMusic] = useState<MusicItem[]>([]);
  const [defaultSong, setDefaultSong] = useState<any>(null);
  const [tts, setTts] = useState<any>(null);

  async function load() {
    setLoading(true);
    try {
      const [dash, act, pf, us, mu, def, ttsCfg] = await Promise.all([
        apiGet<DashboardData>('/api/dashboard'),
        apiGet<{ activities: any[] }>('/api/activities'),
        apiGet<{ platforms: PlatformTarget[] }>('/api/platforms/targets'),
        apiGet<{ users: UserItem[] }>('/api/users'),
        apiGet<{ music: MusicItem[] }>('/api/music'),
        apiGet<{ defaultBattleSong: any }>('/api/defaultBattleSong'),
        apiGet<{ config: any }>('/api/aliyun-tts-config')
      ]);
      setDashboard({ inquiryCount: Number((dash as any).inquiryCount || 0), dealAmount: Number((dash as any).dealAmount || 0), latestDeal: (dash as any).latestDeal, latestInquiry: (dash as any).latestInquiry });
      setActivities((act as any).activities || []);
      setPlatforms((pf as any).platforms || []);
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

  const dealTarget = platforms.reduce((sum, p) => sum + Number(p.target || 0), 0);
  const current = platforms.reduce((sum, p) => sum + Number(p.current || 0), 0);
  const completion = dealTarget > 0 ? Math.round((current / dealTarget) * 100) : 0;
  const configuredUsers = users.filter(u => u.musicName || u.musicId).length;
  const songs = music.filter(m => !m.isSound).length;
  const sounds = music.filter(m => m.isSound).length;

  return <Space direction="vertical" size={16} style={{ width: '100%' }}>
    <Alert type="info" showIcon message="后台已按成熟 B 端信息架构重组" description="本页集中呈现成交、询盘、平台目标、音乐配置和系统状态；首页页面代码不在本次改造范围内。" />
    <div className="toolbar"><span /> <Button icon={<ReloadOutlined />} onClick={load} loading={loading}>刷新数据</Button></div>
    <div className="metric-grid">
      <Card><Statistic title="成交金额" value={money(dashboard.dealAmount)} /></Card>
      <Card><Statistic title="询盘数量" value={dashboard.inquiryCount} suffix="条" /></Card>
      <Card><Statistic title="目标完成率" value={completion} suffix="%" /></Card>
      <Card><Statistic title="成员战歌配置" value={configuredUsers} suffix={`/ ${users.length}`} /></Card>
    </div>
    <div className="content-grid">
      <SectionCard title="平台目标进度" description="按各平台 current / target 计算展示">
        {platforms.length ? <Table rowKey={(r) => r.id || r.name} size="middle" pagination={false} dataSource={platforms} columns={[
          { title: '平台', dataIndex: 'name' },
          { title: '当前成交', dataIndex: 'current', render: (v) => money(v) },
          { title: '目标', dataIndex: 'target', render: (v) => money(v) },
          { title: '进度', render: (_, r) => <Progress percent={Math.min(100, Number(r.percentage || 0))} size="small" /> },
          { title: '状态', dataIndex: 'enabled', render: (v) => <Tag color={v !== false ? 'green' : 'default'}>{v !== false ? '启用' : '停用'}</Tag> }
        ]} /> : <Empty description="暂无平台目标" />}
      </SectionCard>
      <SectionCard title="系统状态" description="播放和 TTS 关键能力">
        <List dataSource={[
          { label: '默认战歌', value: defaultSong ? (defaultSong.name || defaultSong.filename || defaultSong.musicId) : '未设置', ok: !!defaultSong },
          { label: '音乐库', value: `${songs} 首音乐 / ${sounds} 个音效`, ok: songs + sounds > 0 },
          { label: 'TTS 配置', value: tts && tts.accessKeyId && tts.appKey ? '已配置' : '未完整配置', ok: !!(tts && tts.accessKeyId && tts.appKey) },
          { label: '最近成交', value: dashboard.latestDeal?.announcement || '暂无成交记录', ok: !!dashboard.latestDeal }
        ]} renderItem={(item) => <List.Item><Space direction="vertical" size={2}><Typography.Text strong>{item.label}</Typography.Text><Typography.Text type={item.ok ? undefined : 'secondary'}>{item.value}</Typography.Text></Space></List.Item>} />
      </SectionCard>
    </div>
    <SectionCard title="最近动态" description="来自成交和询盘历史记录">
      {activities.length ? <List dataSource={activities} renderItem={(item) => <List.Item><List.Item.Meta title={item.message} description={dateTime(item.timestamp)} /></List.Item>} /> : <Empty description="暂无动态" />}
    </SectionCard>
  </Space>;
}
