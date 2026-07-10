import { useEffect } from 'react';
import { App, Button, Form, InputNumber, Select } from 'antd';
import { apiGet, apiJson } from '../api';
import { SectionCard } from '../components/SectionCard';

interface TargetSettings {
  inquiryTarget?: number;
  dealTarget?: number;
  resetPeriod?: string;
}

export default function HomeSettingsPage() {
  const { message } = App.useApp();
  const [targetForm] = Form.useForm<TargetSettings>();

  useEffect(() => {
    apiGet<TargetSettings>('/api/targets')
      .then((result) => targetForm.setFieldsValue(result))
      .catch((error) => message.error(error.message || '总目标加载失败'));
  }, []);

  async function saveTarget(values: TargetSettings) {
    try {
      await apiJson('/api/targets', 'POST', values);
      message.success('总目标已保存');
    } catch (error: any) {
      message.error(error.message || '保存失败');
    }
  }

  return (
    <SectionCard title="总目标设置" description="所有首页主题共同使用，不跟随主题切换">
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
  );
}
