import { useEffect, useRef, useState } from 'react';
import { Alert, App, Button, Empty, Form, Input, Space, Spin, Tag, Typography } from 'antd';
import { apiGet, apiJson } from '../api';
import type { ThemePageSettingsResponse } from '../types';

interface ThemePageSettingsFormProps {
  themeId: string;
}

export function ThemePageSettingsForm({ themeId }: ThemePageSettingsFormProps) {
  const { message } = App.useApp();
  const [form] = Form.useForm<Record<string, string>>();
  const [data, setData] = useState<ThemePageSettingsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const requestIdRef = useRef(0);

  useEffect(() => {
    if (!themeId) {
      setData(null);
      form.resetFields();
      return;
    }

    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;

    async function loadSettings() {
      setLoading(true);
      try {
        const result = await apiGet<ThemePageSettingsResponse>(
          `/api/page-settings?themeId=${encodeURIComponent(themeId)}`
        );
        if (requestIdRef.current !== requestId) return;
        setData(result);
        form.resetFields();
        form.setFieldsValue(result.settings);
      } catch (error: any) {
        if (requestIdRef.current !== requestId) return;
        message.error(error.message || '主题文案加载失败');
      } finally {
        if (requestIdRef.current === requestId) setLoading(false);
      }
    }

    loadSettings();
    return () => {
      if (requestIdRef.current === requestId) requestIdRef.current += 1;
    };
  }, [themeId]);

  async function saveSettings(values: Record<string, string>) {
    setSaving(true);
    try {
      const result = await apiJson<ThemePageSettingsResponse>('/api/page-settings', 'POST', {
        themeId,
        settings: values
      });
      setData(result);
      form.setFieldsValue(result.settings);
      message.success(result.message || '主题首页文案已保存');
    } catch (error: any) {
      message.error(error.message || '主题首页文案保存失败');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Spin spinning={loading}>
      {data ? (
        <Space direction="vertical" size={14} style={{ width: '100%' }}>
          <Space wrap>
            <Typography.Title level={5} style={{ margin: 0 }}>{data.definition.title}</Typography.Title>
            {data.theme.active ? <Tag color="success">当前主题</Tag> : <Tag>未启用</Tag>}
            <Tag>{data.definition.fields.length} 项设置</Tag>
          </Space>
          {data.definition.description ? (
            <Typography.Text type="secondary">{data.definition.description}</Typography.Text>
          ) : null}
          {!data.saved && data.definition.fields.length ? (
            <Alert
              type="info"
              showIcon
              message="当前为初始兼容值"
              description="首次保存后，这些文案将成为该主题的独立配置，不再跟随其他主题变化。"
            />
          ) : null}
          {data.definition.fields.length ? (
            <Form form={form} layout="vertical" onFinish={saveSettings}>
              <div className="form-grid">
                {data.definition.fields.map((field) => (
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
              <Button type="primary" htmlType="submit" loading={saving}>
                保存“{data.theme.name}”文案
              </Button>
            </Form>
          ) : (
            <Empty description="该主题没有可配置的首页文案" />
          )}
        </Space>
      ) : (
        <Empty description={themeId ? '主题文案加载中' : '请选择主题'} />
      )}
    </Spin>
  );
}
