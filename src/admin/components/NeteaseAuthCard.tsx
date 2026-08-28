import { useEffect, useRef, useState } from 'react';
import { App, Alert, Button, Input, Modal, Popconfirm, Space, Spin, Tag, Typography } from 'antd';
import { LoginOutlined, ReloadOutlined } from '@ant-design/icons';
import { apiGet, apiJson, dateTime } from '../api';

interface CookieStatus {
  logged_in: boolean;
  cookie_present: boolean;
  important_cookies_present?: string[];
  missing_important_cookies?: string[];
  last_modified?: string | null;
}

interface QrCreateData {
  key: string;
  login_url: string;
  qr_image: string;
  expires_in: number;
}

const POLL_INTERVAL_MS = 3000;
const STATUS_TEXT: Record<string, string> = {
  waiting: '等待扫码…',
  scanned: '已扫码，请在手机上确认登录',
  success: '登录成功',
  expired: '二维码已过期，请重新获取',
  unknown: '状态未知，请重试'
};

export function NeteaseAuthCard() {
  const { message } = App.useApp();
  const [status, setStatus] = useState<CookieStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(false);
  const [qr, setQr] = useState<QrCreateData | null>(null);
  const [qrLoading, setQrLoading] = useState(false);
  const [scanState, setScanState] = useState<string>('waiting');
  const [manualOpen, setManualOpen] = useState(false);
  const [manualValue, setManualValue] = useState('');
  const [manualLoading, setManualLoading] = useState(false);
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stoppedRef = useRef(false);

  function stopPolling() {
    stoppedRef.current = true;
    if (pollTimer.current) {
      clearTimeout(pollTimer.current);
      pollTimer.current = null;
    }
  }

  async function loadStatus() {
    setStatusLoading(true);
    try {
      const res = await apiGet<CookieStatus>('/api/netease/cookie');
      setStatus((res as any).data || null);
    } catch (e: any) {
      message.error(e.message || '获取授权状态失败');
    } finally {
      setStatusLoading(false);
    }
  }

  useEffect(() => {
    loadStatus();
    return () => stopPolling();
  }, []);

  async function poll(key: string) {
    if (stoppedRef.current) return;
    try {
      const res = await apiGet<{ code: number; status: string; cookie_saved: boolean }>(
        `/api/netease/qr/check?key=${encodeURIComponent(key)}`
      );
      const data = (res as any).data || {};
      const state = String(data.status || 'unknown');
      setScanState(state);

      if (state === 'success') {
        stopPolling();
        setQr(null);
        message.success('授权成功，已保存登录状态');
        loadStatus();
        return;
      }
      if (state === 'expired') {
        stopPolling();
        return;
      }
    } catch (e: any) {
      // 单次轮询失败不终止，继续下一轮
    }
    if (!stoppedRef.current) {
      pollTimer.current = setTimeout(() => poll(key), POLL_INTERVAL_MS);
    }
  }

  async function startQrLogin() {
    stopPolling();
    stoppedRef.current = false;
    setQrLoading(true);
    setScanState('waiting');
    try {
      const res = await apiJson<QrCreateData>('/api/netease/qr/create', 'POST');
      const data = (res as any).data as QrCreateData;
      if (!data || !data.key || !data.qr_image) throw new Error('二维码生成失败');
      setQr(data);
      pollTimer.current = setTimeout(() => poll(data.key), POLL_INTERVAL_MS);
    } catch (e: any) {
      message.error(e.message || '生成二维码失败');
    } finally {
      setQrLoading(false);
    }
  }

  async function submitManual() {
    const cookie = manualValue.trim();
    if (!cookie) {
      message.warning('请粘贴 Cookie 内容');
      return;
    }
    setManualLoading(true);
    try {
      await apiJson('/api/netease/cookie', 'POST', { cookie });
      message.success('Cookie 已保存');
      setManualOpen(false);
      setManualValue('');
      loadStatus();
    } catch (e: any) {
      message.error(e.message || '保存失败');
    } finally {
      setManualLoading(false);
    }
  }

  async function clearAuth() {
    try {
      await apiJson('/api/netease/cookie', 'DELETE');
      stopPolling();
      setQr(null);
      message.success('已清除授权');
      loadStatus();
    } catch (e: any) {
      message.error(e.message || '清除失败');
    }
  }

  const loggedIn = !!status?.logged_in;

  return (
    <div>
      <Space direction="vertical" size={12} style={{ width: '100%' }}>
        <Alert
          type="info"
          showIcon
          message="扫码登录后，网易云的搜索、试听、歌词与导入将使用你的账号授权，无需再手工提取 Cookie 或配置环境变量。授权实时可换，随时可清除。"
        />

        <Spin spinning={statusLoading}>
          <Space size={16} wrap align="center">
            <span>
              当前状态：
              {loggedIn
                ? <Tag color="green">已授权</Tag>
                : (status?.cookie_present ? <Tag color="orange">Cookie 无效</Tag> : <Tag>未授权</Tag>)}
            </span>
            {status?.last_modified
              ? <Typography.Text type="secondary">更新时间：{dateTime(status.last_modified)}</Typography.Text>
              : null}
          </Space>
        </Spin>

        <Space wrap>
          <Button type="primary" icon={<LoginOutlined />} loading={qrLoading} onClick={startQrLogin}>
            {loggedIn ? '重新扫码登录' : '扫码登录'}
          </Button>
          <Button icon={<ReloadOutlined />} onClick={loadStatus}>刷新状态</Button>
          <Button onClick={() => { setManualValue(''); setManualOpen(true); }}>手动粘贴 Cookie</Button>
          {status?.cookie_present ? (
            <Popconfirm title="确认清除当前授权？" onConfirm={clearAuth}>
              <Button danger>清除授权</Button>
            </Popconfirm>
          ) : null}
        </Space>

        {qr ? (
          <Space direction="vertical" align="center" style={{ width: '100%', padding: '8px 0' }}>
            <img
              src={qr.qr_image}
              alt="网易云登录二维码"
              style={{ width: 200, height: 200, background: '#fff', padding: 8, borderRadius: 8 }}
            />
            <Typography.Text strong>请使用网易云音乐 APP 扫码</Typography.Text>
            <Typography.Text type={scanState === 'expired' ? 'danger' : 'secondary'}>
              {STATUS_TEXT[scanState] || STATUS_TEXT.unknown}
            </Typography.Text>
            {scanState === 'expired' ? (
              <Button size="small" onClick={startQrLogin}>重新获取二维码</Button>
            ) : null}
          </Space>
        ) : null}
      </Space>

      <Modal
        title="手动粘贴 Cookie"
        open={manualOpen}
        onCancel={() => setManualOpen(false)}
        onOk={submitManual}
        confirmLoading={manualLoading}
        okText="保存"
        destroyOnClose
      >
        <Typography.Paragraph type="secondary">
          从浏览器网易云音乐页面复制 Cookie（至少包含 MUSIC_U 字段）粘贴到下方。一般情况下推荐直接扫码登录。
        </Typography.Paragraph>
        <Input.TextArea
          rows={6}
          value={manualValue}
          onChange={(e) => setManualValue(e.target.value)}
          placeholder="MUSIC_U=xxxxxx; os=pc; appver=8.9.70"
        />
      </Modal>
    </div>
  );
}
