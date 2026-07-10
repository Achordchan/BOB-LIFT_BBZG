import { useEffect, useMemo, useState } from 'react';
import { App, AutoComplete, Button, Form, InputNumber, Typography } from 'antd';
import {
  DollarOutlined,
  MinusOutlined,
  PlusOutlined,
  TeamOutlined
} from '@ant-design/icons';
import { apiGet, apiJson, money } from '../api';
import type { DashboardData, PlatformTarget, UserItem } from '../types';
import { SectionCard } from './SectionCard';

interface DealFormValues {
  amount: number;
  person: string;
  platform: string;
}

interface BusinessControllerProps {
  dashboard: DashboardData;
  users: UserItem[];
  platforms: PlatformTarget[];
  onChanged: () => Promise<void>;
}

type PendingAction = 'inquiry-add' | 'inquiry-reduce' | 'inquiry-set' | 'deal-add' | 'deal-set' | null;

export function BusinessController({ dashboard, users, platforms, onChanged }: BusinessControllerProps) {
  const { message, modal } = App.useApp();
  const [dealForm] = Form.useForm<DealFormValues>();
  const [pending, setPending] = useState<PendingAction>(null);
  const [inquiryCorrection, setInquiryCorrection] = useState<number>(dashboard.inquiryCount);
  const [dealCorrection, setDealCorrection] = useState<number>(dashboard.dealAmount);

  useEffect(() => {
    setInquiryCorrection(dashboard.inquiryCount);
  }, [dashboard.inquiryCount]);

  useEffect(() => {
    setDealCorrection(dashboard.dealAmount);
  }, [dashboard.dealAmount]);

  const userOptions = useMemo(
    () => Array.from(new Set(users.map(item => item.name.trim()).filter(Boolean))).map(value => ({ value })),
    [users]
  );
  const platformOptions = useMemo(
    () => Array.from(new Set(platforms.map(item => item.name.trim()).filter(Boolean))).map(value => ({ value })),
    [platforms]
  );

  async function run(action: Exclude<PendingAction, null>, request: () => Promise<any>, successText: (result: any) => string) {
    setPending(action);
    try {
      const result = await request();
      message.success(successText(result));
      await onChanged();
      return result;
    } catch (error: any) {
      message.error(error.message || '操作失败');
      throw error;
    } finally {
      setPending(null);
    }
  }

  async function changeInquiry(direction: 'add' | 'reduce') {
    await run(
      direction === 'add' ? 'inquiry-add' : 'inquiry-reduce',
      () => apiGet(`/api/inquiries/${direction}`),
      result => `${direction === 'add' ? '询盘已增加' : '询盘已减少'}，当前 ${Number(result.count || 0)} 条`
    ).catch(() => undefined);
  }

  function confirmInquiryCorrection() {
    const nextCount = Math.max(0, Math.floor(Number(inquiryCorrection || 0)));
    modal.confirm({
      title: '确认校正询盘数量？',
      content: `当前为 ${dashboard.inquiryCount} 条，将修改为 ${nextCount} 条。校正不会触发询盘音效。`,
      okText: '确认校正',
      cancelText: '取消',
      onOk: () => run(
        'inquiry-set',
        () => apiJson('/api/inquiries/set', 'POST', { count: nextCount }),
        result => `询盘数量已校正为 ${Number(result.count || 0)} 条`
      )
    });
  }

  async function addDeal(values: DealFormValues) {
    const person = String(values.person || '').trim();
    const platform = String(values.platform || '').trim();
    const amount = Number(values.amount);
    const params = new URLSearchParams({
      zongjine: String(amount),
      fuzeren: person,
      userName: person,
      laiyuanpingtai: platform
    });

    try {
      await run(
        'deal-add',
        () => apiGet(`/api/deals/add?${params.toString()}`),
        result => `成交已录入，累计 ${money(Number(result.amount || 0))}`
      );
      dealForm.setFieldValue('amount', undefined);
    } catch {
      return;
    }
  }

  function confirmDealCorrection() {
    const nextAmount = Math.max(0, Number(dealCorrection || 0));
    modal.confirm({
      title: '确认校正成交总额？',
      content: `当前为 ${money(dashboard.dealAmount)}，将修改为 ${money(nextAmount)}。校正只调整累计总额，不生成成交记录。`,
      okText: '确认校正',
      cancelText: '取消',
      onOk: () => run(
        'deal-set',
        () => apiJson('/api/deals/set', 'POST', { amount: nextAmount }),
        result => `成交总额已校正为 ${money(Number(result.amount || 0))}`
      )
    });
  }

  return (
    <SectionCard title="业务控制器" description="手动记录询盘与成交，保存后立即同步首页">
      <div className="business-controller-layout">
        <section className="business-controller-section">
          <div className="business-controller-header">
            <div className="business-controller-icon"><TeamOutlined /></div>
            <div>
              <Typography.Text strong>询盘控制</Typography.Text>
              <Typography.Text type="secondary">即时调整首页询盘数量</Typography.Text>
            </div>
          </div>

          <div className="inquiry-control-row">
            <Button
              size="large"
              icon={<MinusOutlined />}
              aria-label="减少一条询盘"
              disabled={dashboard.inquiryCount <= 0}
              loading={pending === 'inquiry-reduce'}
              onClick={() => changeInquiry('reduce')}
            />
            <div className="inquiry-control-value">
              <span>当前询盘</span>
              <strong>{dashboard.inquiryCount}</strong>
              <em>条</em>
            </div>
            <Button
              type="primary"
              size="large"
              icon={<PlusOutlined />}
              aria-label="增加一条询盘"
              loading={pending === 'inquiry-add'}
              onClick={() => changeInquiry('add')}
            />
          </div>

          <div className="business-adjustment-row">
            <Typography.Text type="secondary">数量校正</Typography.Text>
            <InputNumber
              min={0}
              precision={0}
              value={inquiryCorrection}
              onChange={value => setInquiryCorrection(Number(value || 0))}
              aria-label="校正询盘数量"
            />
            <Button loading={pending === 'inquiry-set'} onClick={confirmInquiryCorrection}>校正数量</Button>
          </div>
        </section>

        <section className="business-controller-section business-controller-deal-section">
          <div className="business-controller-header">
            <div className="business-controller-icon business-controller-icon-deal"><DollarOutlined /></div>
            <div>
              <Typography.Text strong>成交录入</Typography.Text>
              <Typography.Text type="secondary">当前累计 {money(dashboard.dealAmount)}</Typography.Text>
            </div>
          </div>

          <Form form={dealForm} layout="vertical" onFinish={addDeal}>
            <div className="business-deal-entry-row">
              <Form.Item name="amount" label="成交金额" rules={[{ required: true, message: '请输入成交金额' }]}>
                <InputNumber min={0.01} precision={2} placeholder="0.00" />
              </Form.Item>
              <Form.Item name="person" label="负责人" rules={[{ required: true, message: '请选择或输入负责人' }]}>
                <AutoComplete options={userOptions} placeholder="请选择或输入负责人" filterOption />
              </Form.Item>
              <Form.Item name="platform" label="来源平台" rules={[{ required: true, message: '请选择或输入平台' }]}>
                <AutoComplete options={platformOptions} placeholder="请选择或输入平台" filterOption />
              </Form.Item>
              <Button type="primary" htmlType="submit" className="business-deal-submit" loading={pending === 'deal-add'}>录入成交</Button>
            </div>
          </Form>

          <div className="business-adjustment-row business-deal-adjustment-row">
            <Typography.Text type="secondary">累计总额校正</Typography.Text>
            <InputNumber
              min={0}
              precision={2}
              value={dealCorrection}
              onChange={value => setDealCorrection(Number(value || 0))}
              aria-label="校正成交总额"
            />
            <Button loading={pending === 'deal-set'} onClick={confirmDealCorrection}>校正总额</Button>
          </div>
        </section>
      </div>
    </SectionCard>
  );
}
