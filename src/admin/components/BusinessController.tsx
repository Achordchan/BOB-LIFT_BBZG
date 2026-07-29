import { useEffect, useMemo, useState } from 'react';
import { App, AutoComplete, Button, Collapse, Form, InputNumber, Space, Typography } from 'antd';
import {
  DollarOutlined,
  MinusOutlined,
  PlusOutlined,
  TeamOutlined,
  ToolOutlined
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
      () => apiJson(`/api/inquiries/${direction}`, 'POST'),
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
    try {
      await run(
        'deal-add',
        () => apiJson('/api/deals/add', 'POST', {
          zongjine: amount,
          fuzeren: person,
          userName: person,
          laiyuanpingtai: platform
        }),
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
        {/* 询盘控制 - 紧凑视图 */}
        <section className="business-controller-section">
          <div className="business-controller-header">
            <div className="business-controller-icon"><TeamOutlined /></div>
            <div>
              <Typography.Text strong>询盘控制</Typography.Text>
              <Typography.Text type="secondary">当前 {dashboard.inquiryCount} 条</Typography.Text>
            </div>
          </div>

          <Space className="business-inquiry-actions" size="middle">
            <Button
              icon={<MinusOutlined />}
              disabled={dashboard.inquiryCount <= 0}
              loading={pending === 'inquiry-reduce'}
              onClick={() => changeInquiry('reduce')}
            >
              减少
            </Button>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              loading={pending === 'inquiry-add'}
              onClick={() => changeInquiry('add')}
            >
              增加
            </Button>
          </Space>

          {/* 高级功能：数量校正 */}
          <Collapse
            ghost
            size="small"
            items={[{
              key: 'inquiry-correct',
              label: <><ToolOutlined /> 数量校正</>,
              children: (
                <div className="business-adjustment-row">
                  <Typography.Text type="secondary">直接设置询盘数量（不触发音效）</Typography.Text>
                  <Space.Compact style={{ width: '100%' }}>
                    <InputNumber
                      style={{ flex: 1 }}
                      min={0}
                      precision={0}
                      value={inquiryCorrection}
                      onChange={value => setInquiryCorrection(Number(value || 0))}
                      placeholder="输入目标数量"
                    />
                    <Button type="primary" loading={pending === 'inquiry-set'} onClick={confirmInquiryCorrection}>
                      确认校正
                    </Button>
                  </Space.Compact>
                </div>
              )
            }]}
          />
        </section>

        {/* 成交录入 - 紧凑视图 */}
        <section className="business-controller-section business-controller-deal-section">
          <div className="business-controller-header">
            <div className="business-controller-icon business-controller-icon-deal"><DollarOutlined /></div>
            <div>
              <Typography.Text strong>成交录入</Typography.Text>
              <Typography.Text type="secondary">累计 {money(dashboard.dealAmount)}</Typography.Text>
            </div>
          </div>

          <Form form={dealForm} layout="inline" onFinish={addDeal} style={{ width: '100%' }}>
            <div className="business-deal-entry-compact">
              <Form.Item name="amount" rules={[{ required: true, message: '金额' }]}>
                <InputNumber min={0.01} precision={2} placeholder="金额" />
              </Form.Item>
              <Form.Item name="person" rules={[{ required: true, message: '负责人' }]}>
                <AutoComplete options={userOptions} placeholder="负责人" filterOption />
              </Form.Item>
              <Form.Item name="platform" rules={[{ required: true, message: '平台' }]}>
                <AutoComplete options={platformOptions} placeholder="来源平台" filterOption />
              </Form.Item>
              <Form.Item className="business-deal-submit">
                <Button type="primary" htmlType="submit" loading={pending === 'deal-add'}>
                  录入
                </Button>
              </Form.Item>
            </div>
          </Form>

          {/* 高级功能：总额校正 */}
          <Collapse
            ghost
            size="small"
            items={[{
              key: 'deal-correct',
              label: <><ToolOutlined /> 总额校正</>,
              children: (
                <div className="business-adjustment-row">
                  <Typography.Text type="secondary">直接修改累计总额（不生成成交记录）</Typography.Text>
                  <Space.Compact style={{ width: '100%' }}>
                    <InputNumber
                      style={{ flex: 1 }}
                      min={0}
                      precision={2}
                      value={dealCorrection}
                      onChange={value => setDealCorrection(Number(value || 0))}
                      placeholder="输入目标总额"
                    />
                    <Button type="primary" loading={pending === 'deal-set'} onClick={confirmDealCorrection}>
                      确认校正
                    </Button>
                  </Space.Compact>
                </div>
              )
            }]}
          />
        </section>
      </div>
    </SectionCard>
  );
}
