import { useEffect, useRef, useState } from 'react';
import { App, Button, Card, Empty, Modal, Segmented, Space, Spin, Tag, Typography } from 'antd';
import { CheckCircleFilled, DesktopOutlined, EyeOutlined, SettingOutlined } from '@ant-design/icons';
import { apiGet, apiJson } from '../api';
import { ThemePageSettingsForm } from '../components/ThemePageSettingsForm';
import type { ThemeItem, ThemesResponse } from '../types';

const previewSizes = {
  large: { label: '大屏 1920×1080', width: 1920, height: 1080 },
  desktop: { label: '桌面 1366×768', width: 1366, height: 768 },
  tablet: { label: '平板 1024×768', width: 1024, height: 768 }
};

type PreviewSize = keyof typeof previewSizes;

function ThemePreviewFrame(props: { themeId: string; size: PreviewSize }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const viewport = previewSizes[props.size];

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const updateScale = () => setScale(Math.min(1, element.clientWidth / viewport.width));
    updateScale();
    const observer = new ResizeObserver(updateScale);
    observer.observe(element);
    return () => observer.disconnect();
  }, [viewport.width]);

  return (
    <div ref={containerRef} className="theme-preview-stage" style={{ height: viewport.height * scale }}>
      <iframe
        key={`${props.themeId}-${props.size}`}
        className="theme-preview-frame"
        src={`/theme-preview/${encodeURIComponent(props.themeId)}`}
        title={`${props.themeId} 主题预览`}
        style={{
          width: viewport.width,
          height: viewport.height,
          transform: `scale(${scale})`
        }}
      />
    </div>
  );
}

export default function ThemesPage() {
  const { message, modal } = App.useApp();
  const [loading, setLoading] = useState(true);
  const [activatingId, setActivatingId] = useState('');
  const [themes, setThemes] = useState<ThemeItem[]>([]);
  const [previewTheme, setPreviewTheme] = useState<ThemeItem | null>(null);
  const [settingsTheme, setSettingsTheme] = useState<ThemeItem | null>(null);
  const [previewSize, setPreviewSize] = useState<PreviewSize>('large');

  async function loadThemes() {
    setLoading(true);
    try {
      const result = await apiGet<ThemesResponse>('/api/themes');
      setThemes(result.themes || []);
    } catch (error: any) {
      message.error(error.message || '主题列表加载失败');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadThemes();
  }, []);

  function activateTheme(theme: ThemeItem) {
    modal.confirm({
      title: `启用“${theme.name}”主题？`,
      content: '启用后，正在展示的首页将自动刷新并切换主题。',
      okText: '确认启用',
      cancelText: '取消',
      async onOk() {
        setActivatingId(theme.id);
        try {
          const result = await apiJson<ThemesResponse>('/api/themes/activate', 'POST', { themeId: theme.id });
          setThemes(result.themes || []);
          message.success(result.message || '主题已启用');
        } catch (error: any) {
          message.error(error.message || '启用主题失败');
          throw error;
        } finally {
          setActivatingId('');
        }
      }
    });
  }

  return (
    <Spin spinning={loading}>
      <div className="theme-center-grid">
        {themes.map((theme) => (
          <Card
            key={theme.id}
            className={theme.active ? 'theme-card theme-card-active' : 'theme-card'}
            cover={(
              <button className="theme-card-cover" type="button" onClick={() => setPreviewTheme(theme)} aria-label={`预览${theme.name}`}>
                <img src={theme.previewImage} alt={`${theme.name}预览图`} />
                <span className="theme-card-preview-action"><EyeOutlined /> 预览主题</span>
              </button>
            )}
            actions={[
              <Button key="preview" type="text" icon={<EyeOutlined />} onClick={() => setPreviewTheme(theme)}>预览</Button>,
              theme.pageSettings.fields.length
                ? (
                  <Button
                    key="settings"
                    type="text"
                    icon={<SettingOutlined />}
                    onClick={() => setSettingsTheme(theme)}
                  >
                    设置文案
                  </Button>
                )
                : <Button key="settings" type="text" disabled>无文案设置</Button>,
              theme.active
                ? <Button key="active" type="text" icon={<CheckCircleFilled />} disabled>当前主题</Button>
                : <Button key="activate" type="link" loading={activatingId === theme.id} onClick={() => activateTheme(theme)}>启用主题</Button>
            ]}
          >
            <Card.Meta
              title={(
                <Space wrap>
                  <span>{theme.name}</span>
                  {theme.active ? <Tag color="success">使用中</Tag> : null}
                  <Tag>{theme.scene}</Tag>
                </Space>
              )}
              description={(
                <Space direction="vertical" size={6}>
                  <Typography.Text type="secondary">{theme.description}</Typography.Text>
                  <Typography.Text type="secondary" className="theme-card-version">
                    版本 {theme.version} · 主题协议 v{theme.contractVersion} · {theme.pageSettings.fields.length} 项文案设置
                  </Typography.Text>
                </Space>
              )}
            />
          </Card>
        ))}
      </div>
      {!loading && themes.length === 0 ? <Empty description="暂无可用主题" /> : null}

      <Modal
        className="theme-settings-modal"
        open={Boolean(settingsTheme)}
        title={settingsTheme ? `设置文案：${settingsTheme.name}` : '设置主题文案'}
        width={780}
        footer={null}
        destroyOnHidden
        onCancel={() => setSettingsTheme(null)}
      >
        {settingsTheme ? <ThemePageSettingsForm themeId={settingsTheme.id} /> : null}
      </Modal>

      <Modal
        open={Boolean(previewTheme)}
        title={previewTheme ? `预览主题：${previewTheme.name}` : '主题预览'}
        width="min(1480px, 96vw)"
        footer={null}
        destroyOnHidden
        onCancel={() => setPreviewTheme(null)}
      >
        {previewTheme ? (
          <Space direction="vertical" size={14} className="theme-preview-layout">
            <Space wrap className="theme-preview-toolbar">
              <Segmented
                value={previewSize}
                options={Object.entries(previewSizes).map(([value, item]) => ({ value, label: item.label }))}
                onChange={(value) => setPreviewSize(value as PreviewSize)}
              />
              <Button
                icon={<DesktopOutlined />}
                href={`/theme-preview/${encodeURIComponent(previewTheme.id)}`}
                target="_blank"
              >新窗口预览</Button>
            </Space>
            <ThemePreviewFrame themeId={previewTheme.id} size={previewSize} />
          </Space>
        ) : null}
      </Modal>
    </Spin>
  );
}
