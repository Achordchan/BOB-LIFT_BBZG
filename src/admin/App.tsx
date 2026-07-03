import { useEffect, useMemo, useState } from 'react';
import { Layout, Menu, Button, Typography, Space, Input, App as AntApp } from 'antd';
import {
  ApiOutlined,
  AudioOutlined,
  CustomerServiceOutlined,
  DashboardOutlined,
  HomeOutlined,
  LinkOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  SettingOutlined,
  SoundOutlined,
  TeamOutlined,
  TrophyOutlined
} from '@ant-design/icons';
import DashboardPage from './pages/DashboardPage';
import UsersPage from './pages/UsersPage';
import MusicPage from './pages/MusicPage';
import PlaybackPage from './pages/PlaybackPage';
import CelebrationPage from './pages/CelebrationPage';
import PlatformPage from './pages/PlatformPage';
import HomeSettingsPage from './pages/HomeSettingsPage';
import ApiDebugPage from './pages/ApiDebugPage';
import SystemPage from './pages/SystemPage';
import { GlobalAudioPlayer } from './components/GlobalAudioPlayer';
import { AdminAccountMenu } from './components/AdminAccountMenu';
import type { AdminAudioTrack, PlayAdminTrackInput } from './types';

const { Header, Sider, Content } = Layout;

type PageKey = 'dashboard' | 'users' | 'music' | 'playback' | 'celebration' | 'platforms' | 'settings' | 'apis' | 'system';

const pages: Record<PageKey, { title: string; sub: string }> = {
  dashboard: { title: '工作台', sub: '成交、询盘、音乐配置和系统状态' },
  users: { title: '用户管理', sub: '维护团队成员、登录账号、照片和专属战歌' },
  music: { title: '音乐管理', sub: '管理成交音乐、音效库、歌词和网易云导入' },
  playback: { title: '播放配置', sub: '配置默认战歌、询盘音效、TTS、启动音频和个性化音频' },
  celebration: { title: '庆祝语管理', sub: '维护成交播报模板和变量占位符' },
  platforms: { title: '平台目标', sub: '维护平台销售目标、当前进度和首页展示方式' },
  settings: { title: '首页设置', sub: '只管理首页文案配置，不改首页页面代码' },
  apis: { title: 'API 调试', sub: '集中测试成交、询盘、TTS 和系统诊断接口' },
  system: { title: '系统设置', sub: '系统维护' }
};

export default function App() {
  const { message } = AntApp.useApp();
  const [collapsed, setCollapsed] = useState(false);
  const [debugEnabled] = useState(() => new URLSearchParams(window.location.search).get('debug') === '1' || window.localStorage.getItem('bbzg-admin-debug') === '1');
  const [page, setPage] = useState<PageKey>('dashboard');
  const [playerTrack, setPlayerTrack] = useState<AdminAudioTrack | null>(null);
  const current = pages[page];
  const menuItems = useMemo(() => [
    { key: 'dashboard', icon: <DashboardOutlined />, label: '工作台' },
    { key: 'users', icon: <TeamOutlined />, label: '用户管理' },
    { key: 'music', icon: <CustomerServiceOutlined />, label: '音乐管理' },
    { key: 'playback', icon: <SoundOutlined />, label: '播放配置' },
    { key: 'celebration', icon: <TrophyOutlined />, label: '庆祝语' },
    { key: 'platforms', icon: <AudioOutlined />, label: '平台目标' },
    { key: 'settings', icon: <HomeOutlined />, label: '首页设置' },
    ...(debugEnabled ? [{ key: 'apis', icon: <ApiOutlined />, label: 'API 调试' }] : []),
    { key: 'system', icon: <SettingOutlined />, label: '系统设置' }
  ], [debugEnabled]);

  useEffect(() => {
    const raw = new URLSearchParams(window.location.search).get('page') as PageKey | null;
    if (raw && pages[raw] && (raw !== 'apis' || debugEnabled)) setPage(raw);
    if (raw === 'apis' && !debugEnabled) switchPage('dashboard');
    const media = window.matchMedia('(max-width: 720px)');
    const sync = () => setCollapsed(media.matches);
    sync();
    media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
  }, [debugEnabled]);

  function switchPage(key: PageKey) {
    setPage(key);
    const url = new URL(window.location.href);
    url.searchParams.set('page', key);
    window.history.replaceState({}, '', url.toString());
  }

  function playTrack(input: PlayAdminTrackInput) {
    const sources = Array.from(new Set(input.sources.filter(Boolean)));
    if (!sources.length) {
      message.warning('当前音频没有可播放文件');
      return;
    }
    setPlayerTrack({ ...input, sources, sourceIndex: 0 });
  }

  function handlePlayerError() {
    setPlayerTrack((currentTrack) => {
      if (!currentTrack) return null;
      const nextIndex = (currentTrack.sourceIndex || 0) + 1;
      if (currentTrack.sources[nextIndex]) return { ...currentTrack, sourceIndex: nextIndex };
      window.setTimeout(() => message.error('播放失败'), 0);
      return null;
    });
  }

  function renderPage() {
    const playerProps = { playTrack, activeTrackId: playerTrack?.id };
    switch (page) {
      case 'users': return <UsersPage {...playerProps} />;
      case 'music': return <MusicPage {...playerProps} />;
      case 'playback': return <PlaybackPage {...playerProps} />;
      case 'celebration': return <CelebrationPage {...playerProps} />;
      case 'platforms': return <PlatformPage />;
      case 'settings': return <HomeSettingsPage />;
      case 'apis': return <ApiDebugPage />;
      case 'system': return <SystemPage />;
      default: return <DashboardPage />;
    }
  }

  return (
    <Layout className={collapsed ? 'admin-shell admin-shell-collapsed' : 'admin-shell'}>
      <Sider collapsible collapsed={collapsed} trigger={null} width={244} className="admin-sider">
        <div className="brand">
          <div className="brand-mark">B</div>
          {!collapsed && <div><strong>巴布之光</strong><span>管理后台</span></div>}
        </div>
        <Menu theme="dark" mode="inline" selectedKeys={[page]} items={menuItems} onClick={(e) => switchPage(e.key as PageKey)} />
      </Sider>
      <Layout>
        <Header className="admin-header">
          <Space size={16} className="header-left">
            <Button type="text" icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />} onClick={() => setCollapsed(!collapsed)} />
            <div>
              <Typography.Title level={4} className="page-title">{current.title}</Typography.Title>
              <Typography.Text type="secondary">{current.sub}</Typography.Text>
            </div>
          </Space>
          <Space className="header-right">
            <Input.Search className="global-search" placeholder="搜索后台功能" allowClear onSearch={(v) => {
              const hit = Object.entries(pages).filter(([key]) => key !== 'apis' || debugEnabled).find(([, item]) => item.title.includes(v) || item.sub.includes(v));
              if (hit) switchPage(hit[0] as PageKey);
            }} />
            <Button icon={<LinkOutlined />} href="/" target="_blank">访问主页</Button>
            <AdminAccountMenu />
          </Space>
        </Header>
        <Content className={playerTrack ? 'admin-content admin-content-with-player' : 'admin-content'}>{renderPage()}</Content>
      </Layout>
      {playerTrack ? <GlobalAudioPlayer track={playerTrack} onError={handlePlayerError} onClose={() => setPlayerTrack(null)} /> : null}
    </Layout>
  );
}
