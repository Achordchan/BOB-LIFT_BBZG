import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  App,
  Button,
  Empty,
  Form,
  Input,
  InputNumber,
  Select,
  Space,
  Spin,
  Tag,
  Typography
} from 'antd';
import { apiGet, apiJson } from '../api';
import { SectionCard } from '../components/SectionCard';
import type {
  ThemeItem,
  ThemePageSettingsDefinition,
  ThemePageSettingsResponse,
  ThemesResponse
} from '../types';

interface TargetSettings {
  inquiryTarget?: number;
  dealTarget?: number;
  resetPeriod?: string;
}

export default function HomeSettingsPage() {
  const { message } = App.useApp();
  const [pageForm] = Form.useForm<Record<string, string>>();
  const [targetForm] = Form.useForm<TargetSettings>();
  const [themes, setThemes] = useState<ThemeItem[]>([]);
  const [selectedThemeId, setSelectedThemeId] = useState('');
  const [definition, setDefinition] = useState<ThemePageSettingsDefinition | null>(null);
  const [pageLoading, setPageLoading] = useState(false);
  const [pageSaving, setPageSaving] = useState(false);
  const [settingsSaved, setSettingsSaved] = useState(false);

  const selectedTheme = useMemo(
    () => themes.find((theme) => theme.id === selectedThemeId) || null,
    [themes, selectedThemeId]
  );

  useEffect(() => {
    async function initialize() {
      try {
        const [themesResult, targetsResult] = await Promise.all([
          apiGet<ThemesResponse>('/api/themes'),
          apiGet<TargetSettings>('/api/targets')
        ]);
        const availableThemes = themesResult.themes || [];
        const requestedThemeId = new URLSearchParams(window.location.search).get('themeId');
        const initialTheme = availableThemes.find((theme) => theme.id === requestedThemeId)
          || availableThemes.find((theme) => theme.active)
          || availableThemes[0];

        setThemes(availableThemes);
        setSelectedThemeId(initialTheme ? initialTheme.id : '');
        targetForm.setFieldsValue(targetsResult);
      } catch (error: any) {
        message.error(error.message || '首页设置加载失败');
      }
    }
    initialize();
  }, []);

  useEffect(() => {
    if (!selectedThemeId) {
      setDefinition(null);
      pageForm.resetFields();
      return;
    }

    async function loadThemeSettings() {
      setPageLoading(true);
      try {
        const result = await apiGet<ThemePageSettingsResponse>(
          `/api/page-settings?themeId=${encodeURIComponent(selectedThemeId)}`
        );
        setDefinition(result.definition);
        setSettingsSaved(result.saved);
        pageForm.resetFields();
        pageForm.setFieldsValue(result.settings);
      } catch (error: any) {
        message.error(error.message || '主题文案加载失败');
      } finally {
        setPageLoading(false);
      }
    }

    loadThemeSettings();
  }, [selectedThemeId]);

  function selectTheme(themeId: string) {
    setSelectedThemeId(themeId);
    const url = new URL(window.location.href);
    url.searchParams.set('page', 'settings');
    url.searchParams.set('themeId', themeId);
    window.history.replaceState({}, '', url.toString());
  }

  async function savePage(values: Record<string, string>) {
    if (!selectedThemeId) return;
    setPageSaving(true);
    try {
      const result = await apiJson<ThemePageSettingsResponse>('/api/page-settings', 'POST', {
        themeId: selectedThemeId,
        settings: values
      });
      pageForm.setFieldsValue(result.settings);
      setSettingsSaved(true);
      message.success(result.message || '主题首页文案已保存');
    } catch (error: any) {
      message.error(error.message || '主题首页文案保存失败');
    } finally {
      setPageSaving(false);
    }
  }

  async function saveTarget(values: TargetSettings) {
    try {
      await apiJson('/api/targets', 'POST', values);
      message.success('总目标已保存');
    } catch (error: any) {
      message.error(error.message || '保存失败');
    }
  }

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <SectionCard
        title="主题首页文案"
        description="每套主题只显示自己声明支持的设置项，保存结果互不影响"
      >
        <div className="theme-settings-toolbar">
          <div>
            <Typography.Text strong>选择主题</Typography.Text>
            <Typography.Text type="secondary" className="theme-settings-hint">
              切换这里只编辑配置，不会启用主题
            </Typography.Text>
          </div>
          <Select
            className="theme-settings-select"
            value={selectedThemeId || undefined}
            placeholder="选择要配置的主题"
            onChange={selectTheme}
            options={themes.map((theme) => ({
              value: theme.id,
              label: `${theme.name}${theme.active ? '（当前使用）' : ''}`
            }))}
          />
        </div>

        <Spin spinning={pageLoading}>
          {selectedTheme && definition ? (
            <Space direction="vertical" size={14} style={{ width: '100%' }}>
              <Space wrap>
                <Typography.Title level={5} style={{ margin: 0 }}>{definition.title}</Typography.Title>
                {selectedTheme.active ? <Tag color="success">当前主题</Tag> : <Tag>未启用</Tag>}
                <Tag>{definition.fields.length} 项设置</Tag>
              </Space>
              {definition.description ? (
                <Typography.Text type="secondary">{definition.description}</Typography.Text>
              ) : null}
              {!settingsSaved && definition.fields.length ? (
                <Alert
                  type="info"
                  showIcon
                  message="当前为初始兼容值"
                  description="首次保存后，这些文案将成为该主题的独立配置，不再跟随其他主题变化。"
                />
              ) : null}
              {definition.fields.length ? (
                <Form form={pageForm} layout="vertical" onFinish={savePage}>
                  <div className="form-grid">
                    {definition.fields.map((field) => (
                      <Form.Item
                        key={field.key}
                        name={field.key}
                        label={field.label}
                        extra={field.description || undefined}
                        rules={[
                          { required: field.required, message: `请输入${field.label}` },
                          { max: field.maxLength, message: `不能超过 ${field.maxLength} 个字符` }
                        ]}
                      >
                        <Input maxLength={field.maxLength} />
                      </Form.Item>
                    ))}
                  </div>
                  <Button type="primary" htmlType="submit" loading={pageSaving}>
                    保存“{selectedTheme.name}”文案
                  </Button>
                </Form>
              ) : (
                <Empty description="该主题没有可配置的首页文案" />
              )}
            </Space>
          ) : (
            <Empty description={themes.length ? '请选择主题' : '暂无可用主题'} />
          )}
        </Spin>
      </SectionCard>

      <SectionCard title="总目标设置" description="总目标属于经营数据，继续由所有主题共同使用">
        <Form form={targetForm} layout="vertical" onFinish={saveTarget}>
          <div className="form-grid">
            <Form.Item name="inquiryTarget" label="询盘目标">
              <InputNumber style={{ width: '100%' }} min={0} />
            </Form.Item>
            <Form.Item name="dealTarget" label="成交目标">
              <InputNumber style={{ width: '100%' }} min={0} />
            </Form.Item>
            <Form.Item name="resetPeriod" label="重置周期">
              <Select options={[
                { label: '每日', value: 'daily' },
                { label: '每周', value: 'weekly' },
                { label: '每月', value: 'monthly' },
                { label: '每年', value: 'yearly' },
                { label: '永不', value: 'never' }
              ]} />
            </Form.Item>
          </div>
          <Button type="primary" htmlType="submit">保存总目标</Button>
        </Form>
      </SectionCard>
    </Space>
  );
}
