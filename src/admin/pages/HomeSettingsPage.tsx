import { useEffect, useState } from 'react';
import { Alert, App, Button, Form, InputNumber, Select, Space, Typography } from 'antd';
import { apiGet, apiJson, money } from '../api';
import { SectionCard } from '../components/SectionCard';

interface TargetSettings {
  inquiryTarget?: number;
  dealTarget?: number;
  resetPeriod?: string;
  periodKey?: string;
  periodInquiryCount?: number;
  periodDealAmount?: number;
  periodBaselineInquiryCount?: number;
  periodBaselineDealAmount?: number;
  migrationPending?: boolean;
  migrationNote?: string | null;
  lastResetTime?: string;
  inquiryCount?: number;
  dealAmount?: number;
  revision?: number;
}

export default function HomeSettingsPage() {
  const { message } = App.useApp();
  const [targetForm] = Form.useForm<Pick<TargetSettings, 'inquiryTarget' | 'dealTarget' | 'resetPeriod'>>();
  const [calibrateForm] = Form.useForm<Pick<TargetSettings, 'periodInquiryCount' | 'periodDealAmount'>>();
  const [meta, setMeta] = useState<TargetSettings | null>(null);
  const [loading, setLoading] = useState(false);
  const [savingTarget, setSavingTarget] = useState(false);
  const [savingCalibrate, setSavingCalibrate] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const targets = await apiGet<TargetSettings>('/api/targets');
      const merged: TargetSettings = {
        ...targets,
        inquiryCount: Number((targets as any).inquiryCount || 0),
        dealAmount: Number((targets as any).dealAmount || 0),
        revision: Number((targets as any).revision || 0)
      };
      setMeta(merged);
      targetForm.setFieldsValue({
        inquiryTarget: merged.inquiryTarget,
        dealTarget: merged.dealTarget,
        resetPeriod: merged.resetPeriod
      });
      calibrateForm.setFieldsValue({
        periodInquiryCount: merged.periodInquiryCount,
        periodDealAmount: merged.periodDealAmount
      });
    } catch (error: any) {
      message.error(error.message || '总目标加载失败');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function saveTarget(values: Pick<TargetSettings, 'inquiryTarget' | 'dealTarget' | 'resetPeriod'>) {
    setSavingTarget(true);
    try {
      // 只提交目标本身，绝不附带页面加载时的周期进度，避免覆盖线上最新进度
      await apiJson('/api/targets', 'POST', {
        inquiryTarget: values.inquiryTarget,
        dealTarget: values.dealTarget,
        resetPeriod: values.resetPeriod
      });
      message.success('总目标已保存');
      await load();
    } catch (error: any) {
      message.error(error.message || '保存失败');
    } finally {
      setSavingTarget(false);
    }
  }

  async function confirmPeriodProgress(values: Pick<TargetSettings, 'periodInquiryCount' | 'periodDealAmount'>) {
    setSavingCalibrate(true);
    try {
      const result = await apiJson<TargetSettings>('/api/targets', 'POST', {
        periodInquiryCount: values.periodInquiryCount,
        periodDealAmount: values.periodDealAmount,
        // 携带加载时快照，服务端用于 409 冲突检测
        expectedInquiryCount: meta?.inquiryCount,
        expectedDealAmount: meta?.dealAmount,
        expectedRevision: meta?.revision
      });
      message.success(result.migrationPending ? '已提交，但仍待确认' : '本周期进度已确认');
      await load();
    } catch (error: any) {
      const msg = error.message || '确认失败';
      message.error(msg);
      if (msg.includes('数据已变化') || msg.includes('版本信息') || msg.includes('刷新')) {
        await load();
      }
    } finally {
      setSavingCalibrate(false);
    }
  }

  return (
    <SectionCard title="总目标设置" description="所有首页主题共同使用，不跟随主题切换" extra={<Button onClick={load} loading={loading}>刷新</Button>}>
      {meta?.migrationPending ? (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
          message="本周期进度待校准"
          description={
            <div>
              <div>{meta.migrationNote || '首次迁移无法还原真实周期新增量，当前进度从部署/迁移时刻起计。'}</div>
              <div style={{ marginTop: 8 }}>
                累计询盘 {Number(meta.inquiryCount || 0)} 条，累计成交 {money(Number(meta.dealAmount || 0))}。
                周期 {meta.periodKey || '—'}。请在下方单独确认本周期进度，不要与目标数字一并误提交。
              </div>
            </div>
          }
        />
      ) : null}

      {meta?.periodKey ? (
        <Typography.Paragraph type="secondary" style={{ marginBottom: 16 }}>
          当前周期 {meta.periodKey}：询盘进度 {Number(meta.periodInquiryCount || 0)} / 目标 {Number(meta.inquiryTarget || 0)}，
          成交进度 {money(Number(meta.periodDealAmount || 0))} / 目标 {money(Number(meta.dealTarget || 0))}。
        </Typography.Paragraph>
      ) : null}

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
        <Button type="primary" htmlType="submit" loading={savingTarget}>
          保存总目标
        </Button>
      </Form>

      <div style={{ marginTop: 28, paddingTop: 20, borderTop: '1px solid rgba(0,0,0,0.06)' }}>
        <Typography.Title level={5} style={{ marginTop: 0 }}>本周期进度校准</Typography.Title>
        <Typography.Paragraph type="secondary">
          仅在需要修正本周期进度时使用。确认时会校验加载后数据是否变化；若期间有新询盘/成交，会要求刷新后再确认。
        </Typography.Paragraph>
        <Form form={calibrateForm} layout="vertical" onFinish={confirmPeriodProgress}>
          <div className="form-grid">
            <Form.Item
              name="periodInquiryCount"
              label="本周期询盘进度"
              extra={`范围 0 - ${Number(meta?.inquiryCount || 0)}，确认后按“累计询盘 - 本周期进度”反推基线`}
              rules={[{ required: true, message: '请填写本周期询盘进度' }]}
            >
              <InputNumber style={{ width: '100%' }} min={0} max={Math.max(0, Number(meta?.inquiryCount || 0))} />
            </Form.Item>
            <Form.Item
              name="periodDealAmount"
              label="本周期成交进度"
              extra={`范围 0 - ${money(Number(meta?.dealAmount || 0))}，确认后按“累计成交 - 本周期进度”反推基线`}
              rules={[{ required: true, message: '请填写本周期成交进度' }]}
            >
              <InputNumber style={{ width: '100%' }} min={0} max={Math.max(0, Number(meta?.dealAmount || 0))} precision={2} />
            </Form.Item>
          </div>
          <Space>
            <Button type="primary" danger={!!meta?.migrationPending} htmlType="submit" loading={savingCalibrate}>
              确认周期进度
            </Button>
          </Space>
        </Form>
      </div>
    </SectionCard>
  );
}
