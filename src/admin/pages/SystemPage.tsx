import { App, Button, Space } from 'antd';
import { apiJson } from '../api';
import { SectionCard } from '../components/SectionCard';

export default function SystemPage() {
  const { message } = App.useApp();
  return <Space direction="vertical" size={16} style={{ width: '100%' }}>
    <SectionCard title="TTS 文件维护" description="清理超过保留周期的 TTS 临时音频"><Button onClick={async () => { try { const res = await apiJson('/api/cleanup-tts-files', 'POST', {}); message.success((res as any).message || '清理完成'); } catch (e: any) { message.error(e.message || '清理失败'); } }}>清理过期 TTS 文件</Button></SectionCard>
  </Space>;
}
