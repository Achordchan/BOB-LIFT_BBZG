import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import { Layout, Menu, Button, Typography, Space, Grid, AutoComplete, App as AntApp, Spin, Drawer, Breadcrumb, Tooltip } from 'antd';
import {
  LinkOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  MenuOutlined,
  SearchOutlined
} from '@ant-design/icons';
const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const UsersPage = lazy(() => import('./pages/UsersPage'));
const MusicPage = lazy(() => import('./pages/MusicPage'));
const PlaybackPage = lazy(() => import('./pages/PlaybackPage'));
const CelebrationPage = lazy(() => import('./pages/CelebrationPage'));
const PlatformPage = lazy(() => import('./pages/PlatformPage'));
const HomeSettingsPage = lazy(() => import('./pages/HomeSettingsPage'));
const ThemesPage = lazy(() => import('./pages/ThemesPage'));
const ApiDebugPage = lazy(() => import('./pages/ApiDebugPage'));
const SystemPage = lazy(() => import('./pages/SystemPage'));
import { GlobalAudioPlayer } from './components/GlobalAudioPlayer';
import { apiGet, apiText, isRedirectingToLogin } from './api';
import { AdminAccountMenu } from './components/AdminAccountMenu';
import { ADMIN_NAVIGATE_EVENT, buildMenuItems, buildSearchGroups, isVisiblePage, pages } from './navigation';
import type { PageKey } from './navigation';
import {
  keepLyricsForReplay,
  keepLyricsWhenReloadHasNoContent
} from './lyrics-state';
import type { TrackLyricsState } from './lyrics-state';
import type { AdminAudioTrack, PlayAdminTrackInput } from './types';

const { Header, Sider, Content } = Layout;

interface LyricLine {
  time: number;
  text: string;
}

type AdminLyricsPanelState = TrackLyricsState<LyricLine>;


function parseLrc(content: string): LyricLine[] {
  const lines = String(content || '').split(/\r?\n/);
  const result: LyricLine[] = [];
  const timeRegex = /\[(\d{1,}):(\d{2})(?:[.:](\d{1,3}))?\]/g;

  for (const raw of lines) {
    const text = raw ? raw.replace(timeRegex, '').trim() : '';
    if (!text) continue;

    const matches = raw.matchAll(timeRegex);
    for (const match of matches) {
      const minute = parseInt(match[1], 10);
      const second = parseInt(match[2], 10);
      const msRaw = match[3] || '';
      const ms = msRaw ? parseInt(msRaw.padEnd(3, '0').slice(0, 3), 10) : 0;
      if (Number.isFinite(minute) && Number.isFinite(second)) {
        result.push({
          time: minute * 60 + second + (msRaw ? ms / 1000 : 0),
          text
        });
      }
    }
  }

  return result.sort((a, b) => a.time - b.time);
}

export default function App() {
  const { message } = AntApp.useApp();
  const screens = Grid.useBreakpoint();
  const isMobile = !screens.lg;
  const [collapsed, setCollapsed] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [searchValue, setSearchValue] = useState('');
  const [debugEnabled] = useState(() => new URLSearchParams(window.location.search).get('debug') === '1' || window.localStorage.getItem('bbzg-admin-debug') === '1');
  const [page, setPage] = useState<PageKey>('dashboard');
  const [mustChangePassword, setMustChangePassword] = useState(false);
  const [playerTrack, setPlayerTrack] = useState<AdminAudioTrack | null>(null);
  const [adminAudioCurrentTime, setAdminAudioCurrentTime] = useState(0);
  const [lyricsPanel, setLyricsPanel] = useState<AdminLyricsPanelState | null>(null);
  const lyricsRequestRef = useRef(0);
  const current = pages[page];
  const menuItems = useMemo(() => buildMenuItems(debugEnabled, !collapsed || isMobile), [collapsed, debugEnabled, isMobile]);
  const searchGroups = useMemo(() => buildSearchGroups(debugEnabled), [debugEnabled]);
  const searchOptions = useMemo(() => {
    const keyword = searchValue.trim().toLowerCase();
    return searchGroups
      .map(group => ({
        label: group.label,
        options: group.options.filter(option => !keyword || option.keyword.toLowerCase().includes(keyword))
      }))
      .filter(group => group.options.length > 0);
  }, [searchGroups, searchValue]);

  useEffect(() => {
    const raw = new URLSearchParams(window.location.search).get('page') as PageKey | null;
    if (raw && pages[raw] && isVisiblePage(raw, debugEnabled)) setPage(raw);
    if (raw === 'apis' && !debugEnabled) switchPage('dashboard');
  }, [debugEnabled]);

  useEffect(() => {
    if (!isMobile) setMobileNavOpen(false);
  }, [isMobile]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const profile = await apiGet<any>('/api/admin/profile');
        if (cancelled) return;
        const force = new URLSearchParams(window.location.search).get('forcePassword') === '1';
        const must = !!(profile && profile.mustChangePassword) || force;
        setMustChangePassword(must);
        if (must) {
          setPage('system');
          const url = new URL(window.location.href);
          url.searchParams.set('page', 'system');
          if (force) url.searchParams.set('forcePassword', '1');
          window.history.replaceState({}, '', url.toString());
        }
      } catch {
        // 未拿到 profile 时不阻断页面
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    let checking = false;

    async function checkSession() {
      if (cancelled || checking || isRedirectingToLogin()) return;
      checking = true;
      try {
        await apiGet('/api/admin/profile?sessionCheck=1', { cache: 'no-store' });
      } catch {
        // 401 由 apiGet 统一跳转，网络错误留待下一次检查。
      } finally {
        checking = false;
      }
    }

    const timer = window.setInterval(checkSession, 15000);
    const onFocus = () => { void checkSession(); };
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') void checkSession();
    };

    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, []);

  useEffect(() => {
    function onNavigate(event: Event) {
      const key = (event as CustomEvent<PageKey>).detail;
      if (key && pages[key] && isVisiblePage(key, debugEnabled)) switchPage(key);
    }
    window.addEventListener(ADMIN_NAVIGATE_EVENT, onNavigate);
    return () => window.removeEventListener(ADMIN_NAVIGATE_EVENT, onNavigate);
  }, [debugEnabled, mustChangePassword]);

  useEffect(() => {
    function onPasswordChanged() {
      setMustChangePassword(false);
    }
    window.addEventListener('bbzg-password-changed', onPasswordChanged);
    return () => window.removeEventListener('bbzg-password-changed', onPasswordChanged);
  }, []);


  useEffect(() => {
    if (!playerTrack) return;
    const requestId = lyricsRequestRef.current + 1;
    lyricsRequestRef.current = requestId;
    const trackId = playerTrack.id;
    const title = playerTrack.title;

    async function loadPlayerLyrics() {
      try {
        let content = '';
        if (trackId.startsWith('music-')) {
          const musicId = trackId.slice('music-'.length);
          if (!musicId) return;
          content = await apiText(`/api/music/${encodeURIComponent(musicId)}/lrc`);
        } else if (trackId.startsWith('netease-')) {
          const neteaseId = trackId.slice('netease-'.length);
          if (!/^\d+$/.test(neteaseId)) return;
          const data = await apiGet<{ success: boolean; lyric?: string; tLyric?: string; message?: string }>(`/api/public/music/lyric?id=${encodeURIComponent(neteaseId)}`);
          content = data && data.success ? (data.lyric || data.tLyric || '') : '';
        } else {
          return;
        }

        if (lyricsRequestRef.current !== requestId) return;
        const normalized = content && content.trim();
        const fallback = {
          title,
          rawContent: '暂无歌词',
          lines: [],
          trackId
        };
        setLyricsPanel((currentLyrics) => {
          if (!normalized) {
            return keepLyricsWhenReloadHasNoContent(currentLyrics, trackId, fallback);
          }
          return {
            title,
            rawContent: normalized,
            lines: parseLrc(normalized),
            trackId
          };
        });
      } catch {
        if (lyricsRequestRef.current !== requestId) return;
        const fallback = { title, rawContent: '暂无歌词', lines: [], trackId };
        setLyricsPanel((currentLyrics) => (
          keepLyricsWhenReloadHasNoContent(currentLyrics, trackId, fallback)
        ));
      }
    }

    loadPlayerLyrics();
  }, [playerTrack]);

  function switchPage(key: PageKey) {
    if (mustChangePassword && key !== 'system') {
      message.warning('请先修改默认密码');
      key = 'system';
    }
    setPage(key);
    setMobileNavOpen(false);
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
    setAdminAudioCurrentTime(0);
    setLyricsPanel((currentLyrics) => keepLyricsForReplay(currentLyrics, input.id));
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
      case 'music': return <MusicPage
        {...playerProps}
        onLyricsPanelChange={(value) => {
          if (!value) {
            setLyricsPanel(null);
            return;
          }
          setLyricsPanel(value);
        }}
      />;
      case 'playback': return <PlaybackPage {...playerProps} />;
      case 'celebration': return <CelebrationPage {...playerProps} />;
      case 'platforms': return <PlatformPage />;
      case 'settings': return <HomeSettingsPage />;
      case 'themes': return <ThemesPage />;
      case 'apis': return <ApiDebugPage />;
      case 'system': return <SystemPage />;
      default: return <DashboardPage />;
    }
  }

  const brand = (
    <div className="brand">
      <div className="brand-mark">B</div>
      {(!collapsed || isMobile) && <div className="brand-text"><strong>巴布之光</strong><span>管理后台</span></div>}
    </div>
  );

  const navMenu = (
    <Menu
      theme="dark"
      mode="inline"
      className="admin-menu"
      selectedKeys={[page]}
      items={menuItems}
      onClick={(e) => switchPage(e.key as PageKey)}
    />
  );

  const shellClassName = [
    'admin-shell',
    collapsed && !isMobile ? 'admin-shell-collapsed' : '',
    isMobile ? 'admin-shell-mobile' : ''
  ].filter(Boolean).join(' ');

  return (
    <Layout className={shellClassName}>
      {!isMobile && (
        <Sider collapsible collapsed={collapsed} trigger={null} width={228} collapsedWidth={72} className="admin-sider">
          {brand}
          <div className="admin-sider-nav">{navMenu}</div>
        </Sider>
      )}
      {isMobile && (
        <Drawer
          placement="left"
          width={252}
          open={mobileNavOpen}
          onClose={() => setMobileNavOpen(false)}
          closable={false}
          styles={{ body: { padding: 0, background: '#08111f' } }}
          className="admin-nav-drawer"
        >
          {brand}
          <div className="admin-sider-nav">{navMenu}</div>
        </Drawer>
      )}
      <Layout>
        <Header className="admin-header">
          <div className="header-left">
            <Button
              type="text"
              className="admin-nav-toggle"
              aria-label={isMobile ? '打开导航' : (collapsed ? '展开导航' : '收起导航')}
              icon={isMobile ? <MenuOutlined /> : (collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />)}
              onClick={() => (isMobile ? setMobileNavOpen(true) : setCollapsed(!collapsed))}
            />
            <div className="header-title">
              <Breadcrumb
                className="header-breadcrumb"
                items={[{ title: current.group }, { title: current.title }]}
              />
              <Typography.Title level={4} className="page-title">{current.title}</Typography.Title>
            </div>
          </div>
          <Space className="header-right" size={8}>
            <AutoComplete
              className="global-search"
              value={searchValue}
              options={searchOptions}
              onChange={setSearchValue}
              onSelect={(value) => { switchPage(value as PageKey); setSearchValue(''); }}
              placeholder="搜索后台功能"
              allowClear
              filterOption={false}
              notFoundContent="未匹配到功能"
              suffixIcon={<SearchOutlined />}
            />
            <Tooltip title="在新标签打开首页大屏">
              <Button icon={<LinkOutlined />} href="/" target="_blank" className="header-home-link">访问主页</Button>
            </Tooltip>
            <AdminAccountMenu />
          </Space>
        </Header>
        <Content className={playerTrack ? 'admin-content admin-content-with-player' : 'admin-content'}>
          <div className="admin-page-intro">
            <Typography.Text type="secondary">{current.sub}</Typography.Text>
          </div>
          <Suspense fallback={<div className="admin-page-loading"><Spin tip="页面加载中" /></div>}>
            {renderPage()}
          </Suspense>
        </Content>
      </Layout>
      {playerTrack ? <GlobalAudioPlayer
        track={playerTrack}
        onError={handlePlayerError}
        onClose={() => {
          setPlayerTrack(null);
          setAdminAudioCurrentTime(0);
          setLyricsPanel(null);
        }}
        onListen={(time) => setAdminAudioCurrentTime(time)}
        currentTime={adminAudioCurrentTime}
        lyricsPanel={lyricsPanel}
      /> : null}
    </Layout>
  );
}
