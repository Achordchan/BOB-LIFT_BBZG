import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Button, Drawer, Empty, Progress, Space, Statistic, Table, Tag, Tooltip, Typography, App } from 'antd';
import {
  CheckCircleFilled,
  ClockCircleOutlined,
  CloudServerOutlined,
  DatabaseOutlined,
  DeleteOutlined,
  ExclamationCircleFilled,
  LaptopOutlined,
  ReloadOutlined,
  WifiOutlined,
} from '@ant-design/icons';
import { apiGet, apiJson, dateTime, money } from '../api';
import { BusinessController } from '../components/BusinessController';
import { SectionCard } from '../components/SectionCard';
import { navigateToPage } from '../navigation';
import type { DashboardData, UserItem, MusicItem, PlatformTarget } from '../types';
import type { PageKey } from '../navigation';

interface RecentDealItem {
  type?: string;
  person?: string;
  platform?: string;
  amount?: number;
  timestamp?: string;
}

interface ConfigCheckItem {
  label: string;
  ok: boolean;
  page: PageKey;
}

interface SessionInfo {
  sid: string;
  username: string;
  loginAt: string | null;
  loginIp: string | null;
  loginUserAgent: string | null;
  expiresAt: string | null;
  isCurrent: boolean;
}

interface SystemStatus {
  success: boolean;
  timestamp?: string;
  process?: { uptime: number; nodeVersion: string; platform: string; pid: number };
  memory?: { rss: number; heapUsed: number; heapTotal: number; external: number; usagePercent: number };
  cpu?: { cores: number; loadAvg1min: number; loadAvg5min: number; loadAvg15min: number };
  dataFile?: { exists: boolean; readable?: boolean; valid?: boolean; size?: number; mtime?: string; recordCount?: { users: number; music: number; platforms: number; dealsLedger: number } };
  sessions?: { count: number; error?: string };
  sse?: { clients: number };
  externalServices?: { musicApi?: { baseUrl: string; configured: boolean } };
}

function formatUptime(seconds: number): string {
  if (seconds < 60) return `${seconds} 秒`;
  const m = Math.floor(seconds / 60);
  if (m < 60) return `${m} 分钟`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  if (h < 24) return rm > 0 ? `${h} 小时 ${rm} 分钟` : `${h} 小时`;
  const d = Math.floor(h / 24);
  const rh = h % 24;
  return rh > 0 ? `${d} 天 ${rh} 小时` : `${d} 天`;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** 从 User-Agent 提取简短的浏览器+操作系统描述 */
function parseUA(ua: string | null): string {
  if (!ua) return '未知设备';
  const os = /iPhone|iPad/.test(ua) ? 'iOS'
    : /Android/.test(ua) ? 'Android'
    : /Macintosh/.test(ua) ? 'macOS'
    : /Windows/.test(ua) ? 'Windows'
    : /Linux/.test(ua) ? 'Linux' : '';
  const browser = /Edg\//.test(ua) ? 'Edge'
    : /Chrome\//.test(ua) ? 'Chrome'
    : /Safari\//.test(ua) && !/Chrome/.test(ua) ? 'Safari'
    : /Firefox\//.test(ua) ? 'Firefox' : '';
  return [browser, os].filter(Boolean).join(' / ') || '未知设备';
}

export default function DashboardPage() {
  const { message, modal } = App.useApp();
  const [loading, setLoading] = useState(false);
  const [dashboard, setDashboard] = useState<DashboardData>({ inquiryCount: 0, dealAmount: 0 });
  const [recentDeals, setRecentDeals] = useState<RecentDealItem[]>([]);
  const [users, setUsers] = useState<UserItem[]>([]);
  const [platforms, setPlatforms] = useState<PlatformTarget[]>([]);
  const [music, setMusic] = useState<MusicItem[]>([]);
  const [defaultSong, setDefaultSong] = useState<any>(null);
  const [tts, setTts] = useState<any>(null);
  const [systemStatus, setSystemStatus] = useState<SystemStatus | null>(null);
  const [statusError, setStatusError] = useState(false);
  // SSE 实时客户端数（来自主 SSE 流，无需轮询）
  const [sseClients, setSseClients] = useState<number | null>(null);
  // 会话管理抽屉
  const [sessionDrawer, setSessionDrawer] = useState(false);
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const statusTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  async function load() {
    setLoading(true);
    try {
      const [dash, recent, us, platformData, mu, def, ttsCfg] = await Promise.all([
        apiGet<DashboardData>('/api/dashboard'),
        apiGet<{ deals: RecentDealItem[] }>('/api/deals/recent?type=deal&limit=8'),
        apiGet<{ users: UserItem[] }>('/api/users'),
        apiGet<{ platforms: PlatformTarget[] }>('/api/platforms/targets'),
        apiGet<{ music: MusicItem[] }>('/api/music'),
        apiGet<{ defaultBattleSong: any }>('/api/defaultBattleSong'),
        apiGet<{ config: any }>('/api/aliyun-tts-config')
      ]);
      setDashboard({ inquiryCount: Number((dash as any).inquiryCount || 0), dealAmount: Number((dash as any).dealAmount || 0), latestDeal: (dash as any).latestDeal, latestInquiry: (dash as any).latestInquiry });
      setRecentDeals(((recent as any).deals || []).filter((item: RecentDealItem) => item.type === 'deal'));
      setUsers((us as any).users || []);
      setPlatforms((platformData as any).platforms || []);
      setMusic((mu as any).music || []);
      setDefaultSong((def as any).defaultBattleSong || null);
      setTts((ttsCfg as any).config || null);
    } catch (e: any) {
      message.error(e.message || '工作台加载失败');
    } finally {
      setLoading(false);
    }
  }

  const loadStatus = useCallback(async () => {
    setStatusError(false);
    try {
      const res = await apiGet<SystemStatus>('/api/system/status');
      setSystemStatus(res as SystemStatus);
    } catch {
      setStatusError(true);
    }
  }, []);

  const loadSessions = useCallback(async () => {
    setSessionsLoading(true);
    try {
      const res = await apiGet<{ sessions: SessionInfo[] }>('/api/admin/sessions');
      setSessions((res as any).sessions || []);
    } catch (e: any) {
      message.error(e.message || '加载会话列表失败');
    } finally {
      setSessionsLoading(false);
    }
  }, []);

  async function deleteSession(sid: string) {
    modal.confirm({
      title: '确认删除该会话？',
      content: '该用户将被立即踢出，需要重新登录。',
      okText: '确认删除',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: async () => {
        setDeletingId(sid);
        try {
          await apiJson(`/api/admin/sessions/${encodeURIComponent(sid)}`, 'DELETE');
          message.success('会话已删除');
          await loadSessions();
          await loadStatus();
        } catch (e: any) {
          message.error(e.message || '删除失败');
        } finally {
          setDeletingId(null);
        }
      }
    });
  }

  // 接入主 SSE 流获取实时大屏连接数（事件驱动，无需轮询）
  useEffect(() => {
    if (typeof EventSource === 'undefined') return;
    const source = new EventSource('/api/stream/main?client=admin');

    function handlePayload(payload: any) {
      if (payload?.snapshot?.sseClients != null) {
        setSseClients(Number(payload.snapshot.sseClients));
      }
    }

    source.addEventListener('snapshot', (e: MessageEvent) => {
      try { handlePayload(JSON.parse(e.data)); } catch {}
    });
    source.onmessage = (e: MessageEvent) => {
      try { handlePayload(JSON.parse(e.data)); } catch {}
    };

    return () => {
      source.close();
    };
  }, []);

  useEffect(() => {
    load();
    loadStatus();
    // 系统指标 5 秒自动刷新（CPU/内存/进程状态需要持续采样，没有可复用的变更事件）
    statusTimerRef.current = setInterval(loadStatus, 5000);
    return () => {
      if (statusTimerRef.current) clearInterval(statusTimerRef.current);
    };
  }, []);

  const configuredUsers = users.filter(u => u.musicName || u.musicId).length;
  const songs = music.filter(m => !m.isSound).length;
  const sounds = music.filter(m => m.isSound).length;
  const ttsReady = !!(tts && tts.accessKeyId && tts.appKey);

  const configChecks: ConfigCheckItem[] = useMemo(() => [
    { label: '默认战歌未设置', ok: !!defaultSong, page: 'playback' },
    { label: 'TTS 播报未完整配置', ok: ttsReady, page: 'playback' },
    { label: '暂无成员配置专属战歌', ok: configuredUsers > 0, page: 'users' }
  ], [defaultSong, ttsReady, configuredUsers]);
  const pendingConfig = configChecks.filter(item => !item.ok);

  const memPercent = systemStatus?.memory?.usagePercent ?? 0;
  const memStatus = memPercent >= 90 ? 'exception' : memPercent >= 75 ? 'normal' : 'success';
  const dataOk = !!(systemStatus?.dataFile?.exists && systemStatus?.dataFile?.valid);
  const serviceOnline = !statusError && !!systemStatus;

  // SSE 客户端数优先用 SSE 推送值，其次回退轮询值
  const displaySseClients = sseClients ?? systemStatus?.sse?.clients ?? null;

  const kpiCards = useMemo(() => [
    { title: '成交金额', value: money(dashboard.dealAmount), suffix: undefined as string | undefined, foot: `最近成交 ${dateTime(dashboard.latestDeal?.timestamp)}` },
    { title: '询盘数量', value: dashboard.inquiryCount, suffix: '条', foot: `最近询盘 ${dateTime(dashboard.latestInquiry?.timestamp)}` },
    { title: '专属战歌', value: configuredUsers, suffix: '人', foot: `全队共 ${users.length} 位成员` },
    { title: '音乐资产', value: music.length, suffix: '个', foot: `音乐 ${songs} / 音效 ${sounds}` }
  ], [dashboard, configuredUsers, users.length, music.length, songs, sounds]);

  return (
    <Space direction="vertical" size={16} className="admin-page-stack">
      <div className="dashboard-toolbar">
        <Typography.Text type="secondary">数据来自当前周期累计值，成交记录取最近 8 条。</Typography.Text>
        <Button icon={<ReloadOutlined />} onClick={() => { load(); loadStatus(); }} loading={loading}>刷新数据</Button>
      </div>

      {pendingConfig.length > 0 && (
        <Alert type="warning" showIcon className="dashboard-config-alert"
          message={`有 ${pendingConfig.length} 项业务配置待处理`}
          description={<Space size={[8, 8]} wrap>{pendingConfig.map(item => <Button key={item.label} size="small" onClick={() => navigateToPage(item.page)}>{item.label} →</Button>)}</Space>}
        />
      )}

      <div className="metric-grid">
        {kpiCards.map(card => (
          <div className="dashboard-kpi-card" key={card.title}>
            <Statistic title={card.title} value={card.value} suffix={card.suffix} />
            <Typography.Text type="secondary" className="dashboard-kpi-foot">{card.foot}</Typography.Text>
          </div>
        ))}
      </div>

      <BusinessController dashboard={dashboard} users={users} platforms={platforms} onChanged={load} />

      <div className="content-grid">
        <SectionCard title="成交记录" description="最近 8 条成交明细">
          {recentDeals.length ? (
            <Table rowKey={(row, index) => `${row.timestamp || 'deal'}-${index}`} className="recent-deal-table" size="middle" pagination={false} dataSource={recentDeals.slice(0, 8)} columns={[
              { title: '负责人', dataIndex: 'person', render: (v) => v || '—' },
              { title: '平台', dataIndex: 'platform', render: (v) => v || '—' },
              { title: '成交金额', dataIndex: 'amount', align: 'right' as const, render: (v) => <Typography.Text strong>{money(v)}</Typography.Text> },
              { title: '成交时间', dataIndex: 'timestamp', render: (v) => dateTime(v) }
            ]} />
          ) : <Empty description="暂无成交记录" />}
        </SectionCard>

        <SectionCard title="系统状态" description="自动每 5 秒刷新，实时连接通过 SSE 推送"
          extra={serviceOnline ? <Tag color="green" icon={<CheckCircleFilled />}>服务正常</Tag> : <Tag color="red" icon={<ExclamationCircleFilled />}>连接异常</Tag>}
        >
          <div className="system-status-grid">
            <div className="sysstat-row">
              <ClockCircleOutlined className="sysstat-icon" style={{ color: '#155eef' }} />
              <div className="sysstat-body">
                <div className="sysstat-label">运行时长</div>
                <div className="sysstat-value">{systemStatus?.process ? formatUptime(systemStatus.process.uptime) : '—'}</div>
              </div>
              <div className="sysstat-meta">{systemStatus?.process ? `Node ${systemStatus.process.nodeVersion}` : '加载中…'}</div>
            </div>

            <div className="sysstat-row">
              <CloudServerOutlined className="sysstat-icon" style={{ color: '#7c3aed' }} />
              <div className="sysstat-body">
                <div className="sysstat-label-row">
                  <span className="sysstat-label">进程内存（堆使用率）</span>
                  <span className="sysstat-badge">{systemStatus?.memory ? `${memPercent}%` : '—'}</span>
                </div>
                <Progress percent={memPercent} size="small" status={memStatus} showInfo={false} className="sysstat-progress" />
              </div>
              <div className="sysstat-meta">{systemStatus?.memory ? `RSS ${formatBytes(systemStatus.memory.rss)}` : ''}</div>
            </div>

            <div className="sysstat-row">
              <DatabaseOutlined className="sysstat-icon" style={{ color: '#0891b2' }} />
              <div className="sysstat-body">
                <div className="sysstat-label">数据存储</div>
                <div className="sysstat-value">
                  {systemStatus?.dataFile?.exists === false ? <span className="sysstat-bad">文件不存在</span> : dataOk ? <span className="sysstat-good">健康</span> : systemStatus ? <span className="sysstat-bad">读取异常</span> : '—'}
                </div>
              </div>
              <div className="sysstat-meta">{systemStatus?.dataFile?.size != null ? `${formatBytes(systemStatus.dataFile.size)} · ${systemStatus.dataFile.recordCount?.dealsLedger ?? 0} 条成交` : ''}</div>
            </div>

            {/* 实时连接：数据来自 SSE 推送，不依赖轮询 */}
            <div className="sysstat-row">
              <WifiOutlined className="sysstat-icon" style={{ color: '#16a34a' }} />
              <div className="sysstat-body">
                <div className="sysstat-label-row">
                  <span className="sysstat-label">实时连接</span>
                  {sseClients !== null && <span className="sysstat-badge sysstat-badge-live">LIVE</span>}
                </div>
                <div className="sysstat-value">{displaySseClients != null ? `${displaySseClients} 个大屏在线` : '—'}</div>
              </div>
              <Button type="link" size="small" className="sysstat-action" onClick={() => navigateToPage('themes')}>查看主题</Button>
            </div>

            <div className="sysstat-row">
              <div className={`sysstat-dot ${systemStatus?.externalServices?.musicApi?.configured ? 'sysstat-dot-ok' : 'sysstat-dot-warn'}`} />
              <div className="sysstat-body">
                <div className="sysstat-label">网易云 API</div>
                <div className="sysstat-value">{systemStatus?.externalServices?.musicApi?.configured ? <span className="sysstat-good">已配置</span> : <span className="sysstat-warn">未配置</span>}</div>
              </div>
              <Button type="link" size="small" className="sysstat-action" onClick={() => navigateToPage('music')}>音乐管理</Button>
            </div>

            {/* 登录会话：点击展开管理 */}
            <div className="sysstat-row sysstat-row-last">
              <div className={`sysstat-dot ${(systemStatus?.sessions?.count ?? 0) > 0 ? 'sysstat-dot-ok' : 'sysstat-dot-warn'}`} />
              <div className="sysstat-body">
                <div className="sysstat-label">登录会话</div>
                <div className="sysstat-value">{systemStatus?.sessions != null ? `${systemStatus.sessions.count} 个活跃会话` : '—'}</div>
              </div>
              <Button type="link" size="small" className="sysstat-action" onClick={() => { setSessionDrawer(true); loadSessions(); }}>管理会话</Button>
            </div>
          </div>

          {systemStatus?.process && (
            <div className="sysstat-footer">
              <Typography.Text type="secondary">CPU {systemStatus.cpu?.cores ?? '?'} 核 · 负载 {systemStatus.cpu?.loadAvg1min.toFixed(2) ?? '—'} · PID {systemStatus.process.pid}</Typography.Text>
            </div>
          )}
        </SectionCard>
      </div>

      {/* 会话管理抽屉 */}
      <Drawer
        title={<Space><LaptopOutlined />登录会话管理</Space>}
        width={560}
        open={sessionDrawer}
        onClose={() => setSessionDrawer(false)}
        extra={<Button size="small" icon={<ReloadOutlined />} loading={sessionsLoading} onClick={loadSessions}>刷新</Button>}
      >
        <Table
          rowKey="sid"
          loading={sessionsLoading}
          dataSource={sessions}
          pagination={false}
          locale={{ emptyText: '暂无活跃会话' }}
          columns={[
            {
              title: '账号 / 状态',
              dataIndex: 'username',
              render: (v: string, row: SessionInfo) => (
                <Space direction="vertical" size={2}>
                  <Space size={6}>
                    <Typography.Text strong>{v}</Typography.Text>
                    {row.isCurrent && <Tag color="blue" style={{ fontSize: 11 }}>当前会话</Tag>}
                  </Space>
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    {row.loginIp || '未知IP'}
                  </Typography.Text>
                </Space>
              )
            },
            {
              title: '设备',
              dataIndex: 'loginUserAgent',
              render: (v: string | null) => (
                <Tooltip title={v || '未记录'}>
                  <Typography.Text style={{ fontSize: 12, maxWidth: 140, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {parseUA(v)}
                  </Typography.Text>
                </Tooltip>
              )
            },
            {
              title: '登录时间',
              dataIndex: 'loginAt',
              render: (v: string | null) => <Typography.Text style={{ fontSize: 12 }}>{v ? dateTime(v) : '旧会话'}</Typography.Text>
            },
            {
              title: '操作',
              width: 70,
              render: (_: any, row: SessionInfo) => (
                <Button
                  size="small"
                  danger
                  icon={<DeleteOutlined />}
                  loading={deletingId === row.sid}
                  disabled={row.isCurrent}
                  onClick={() => deleteSession(row.sid)}
                >
                  踢出
                </Button>
              )
            }
          ]}
        />
        <div style={{ marginTop: 12, color: '#94a3b8', fontSize: 12 }}>
          当前会话不可删除。踢出后对方下次请求时将跳转至登录页。
        </div>
      </Drawer>
    </Space>
  );
}
