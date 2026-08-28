import {
  ApiOutlined,
  BarChartOutlined,
  BgColorsOutlined,
  CustomerServiceOutlined,
  AuditOutlined,
  DashboardOutlined,
  FileSearchOutlined,
  FlagOutlined,
  SettingOutlined,
  ShopOutlined,
  SoundOutlined,
  TeamOutlined,
  TrophyOutlined
} from '@ant-design/icons';
import type { MenuProps } from 'antd';
import type { ReactNode } from 'react';

export type PageKey =
  | 'dashboard'
  | 'stats'
  | 'settings'
  | 'platforms'
  | 'celebration'
  | 'music'
  | 'playback'
  | 'users'
  | 'themes'
  | 'system'
  | 'audit'
  | 'logs'
  | 'apis';

export interface PageMeta {
  title: string;
  sub: string;
  group: string;
  keywords: string;
}

interface NavGroup {
  key: string;
  label: string;
  items: Array<{ key: PageKey; label: string; icon: ReactNode }>;
}

export const navGroups: NavGroup[] = [
  {
    key: 'overview',
    label: '概览',
    items: [{ key: 'dashboard', label: '工作台', icon: <DashboardOutlined /> }]
  },
  {
    key: 'business',
    label: '业务运营',
    items: [
      { key: 'stats', label: '成交分析', icon: <BarChartOutlined /> },
      { key: 'settings', label: '经营目标', icon: <FlagOutlined /> },
      { key: 'platforms', label: '平台目标', icon: <ShopOutlined /> },
      { key: 'celebration', label: '庆祝语', icon: <TrophyOutlined /> }
    ]
  },
  {
    key: 'audio',
    label: '音频中心',
    items: [
      { key: 'music', label: '音乐管理', icon: <CustomerServiceOutlined /> },
      { key: 'playback', label: '播放配置', icon: <SoundOutlined /> }
    ]
  },
  {
    key: 'display',
    label: '团队与展示',
    items: [
      { key: 'users', label: '用户管理', icon: <TeamOutlined /> },
      { key: 'themes', label: '首页主题', icon: <BgColorsOutlined /> }
    ]
  },
  {
    key: 'maintenance',
    label: '系统管理',
    items: [
      { key: 'system', label: '系统设置', icon: <SettingOutlined /> },
      { key: 'audit', label: '操作日志', icon: <AuditOutlined /> },
      { key: 'logs', label: '运行日志', icon: <FileSearchOutlined /> },
      { key: 'apis', label: 'API 调试', icon: <ApiOutlined /> }
    ]
  }
];

export const pages: Record<PageKey, PageMeta> = {
  dashboard: {
    title: '工作台',
    sub: '业务数据、手动录入和配置状态检查',
    group: '概览',
    keywords: '首页 数据 成交 询盘 录入 校正'
  },
  stats: {
    title: '成交分析',
    sub: '按今日/本周/本月/今年聚合成交流水，支持导出 CSV',
    group: '业务运营',
    keywords: '统计 报表 分析 平台 负责人 导出 csv 走势'
  },
  settings: {
    title: '经营目标',
    sub: '询盘和成交总目标、重置周期与本周期进度校准',
    group: '业务运营',
    keywords: '目标 周期 进度 校准 首页设置'
  },
  platforms: {
    title: '平台目标',
    sub: '各平台目标、当前进度和首页滚动展示',
    group: '业务运营',
    keywords: '平台 独立站 目标 滚动 展示'
  },
  celebration: {
    title: '庆祝语',
    sub: '成交播报模板和变量占位符',
    group: '业务运营',
    keywords: '播报 模板 变量 成交 语音'
  },
  music: {
    title: '音乐管理',
    sub: '音乐库、音效库、歌词和网易云导入',
    group: '音频中心',
    keywords: '音乐 音效 歌词 lrc 导入 网易云'
  },
  playback: {
    title: '播放配置',
    sub: '默认战歌、询盘音效、语音播报、启动音频和个性化音频',
    group: '音频中心',
    keywords: '战歌 音效 tts 语音 启动 个性化 清理'
  },
  users: {
    title: '用户管理',
    sub: '团队成员、登录账号、照片和专属战歌',
    group: '团队与展示',
    keywords: '成员 员工 账号 照片 战歌 排序'
  },
  themes: {
    title: '首页主题',
    sub: '预览并切换首页主题、维护主题文案',
    group: '团队与展示',
    keywords: '主题 皮肤 预览 文案 大屏'
  },
  system: {
    title: '系统设置',
    sub: '登录密码、外部接口绑定和临时文件维护',
    group: '系统管理',
    keywords: '密码 token 钉钉 绑定 清理 维护'
  },
  audit: {
    title: '操作日志',
    sub: '谁在什么时候做了什么业务动作，支持按操作人、动作和时间筛选',
    group: '系统管理',
    keywords: '操作 审计 行为 记录 谁 成交 询盘 登录 授权 追责 复盘'
  },
  logs: {
    title: '运行日志',
    sub: '查看后台访问、错误与运行日志，支持按级别和关键字过滤',
    group: '系统管理',
    keywords: '日志 log 访问 错误 error 排查 requestId 追踪 技术'
  },
  apis: {
    title: 'API 调试',
    sub: '成交、询盘、TTS 和系统诊断接口测试',
    group: '系统管理',
    keywords: '接口 调试 测试 诊断'
  }
};

export function isVisiblePage(key: PageKey, debugEnabled: boolean) {
  return key !== 'apis' || debugEnabled;
}

function visibleGroups(debugEnabled: boolean) {
  return navGroups
    .map(group => ({ ...group, items: group.items.filter(item => isVisiblePage(item.key, debugEnabled)) }))
    .filter(group => group.items.length > 0);
}

export function buildMenuItems(debugEnabled: boolean, grouped: boolean): MenuProps['items'] {
  const groups = visibleGroups(debugEnabled);
  if (!grouped) {
    return groups.flatMap(group => group.items.map(item => ({ key: item.key, icon: item.icon, label: item.label })));
  }
  return groups.map(group => ({
    key: group.key,
    type: 'group' as const,
    label: group.label,
    children: group.items.map(item => ({ key: item.key, icon: item.icon, label: item.label }))
  }));
}

export interface PageSearchGroup {
  label: string;
  options: Array<{ value: PageKey; label: string; keyword: string }>;
}

export function buildSearchGroups(debugEnabled: boolean): PageSearchGroup[] {
  return visibleGroups(debugEnabled).map(group => ({
    label: group.label,
    options: group.items.map(item => ({
      value: item.key,
      label: pages[item.key].title,
      keyword: `${pages[item.key].title} ${pages[item.key].sub} ${pages[item.key].keywords}`
    }))
  }));
}

export const ADMIN_NAVIGATE_EVENT = 'bbzg-admin-navigate';

/** 页面内跳转：不做整页刷新，由 App 统一切换页面并同步 URL */
export function navigateToPage(key: PageKey) {
  window.dispatchEvent(new CustomEvent<PageKey>(ADMIN_NAVIGATE_EVENT, { detail: key }));
}
