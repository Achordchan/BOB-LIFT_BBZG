import { useEffect, useRef, useState } from 'react';
import { App, Alert, Button, Input, Modal, Popconfirm, Space, Spin, Tag, Typography } from 'antd';
import { LoginOutlined, ReloadOutlined } from '@ant-design/icons';
import { apiGet, apiJson, dateTime } from '../api';

type Verified = 'valid' | 'invalid' | 'unknown';

interface CookieStatus {
  logged_in: boolean;
  verified?: Verified;
  cookie_present: boolean;
  format_ok?: boolean;
  nickname?: string | null;
  last_modified?: string | null;
}

interface QrCreateData {
  key: string;
  login_url: string;
  qr_image: string;
  expires_in: number;
}

const POLL_INTERVAL_MS = 3000;
const MAX_CONSECUTIVE_ERRORS = 5;
const STATUS_TEXT: Record<string, string> = {
  waiting: '等待扫码…',
  scanned: '已扫码，请在手机上确认登录',
  success: '登录成功',
  expired: '二维码已过期，请重新获取',
  superseded: '二维码已被新的扫码会话取代',
  error: '与音乐服务通信失败，请稍后重试',
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
  // 每次发起扫码自增一代；只有当代号仍为当前代时，轮询回调才生效，
  // 从而隔离“重新扫码”时上一轮在途请求造成的串扰。
  const genRef = useRef(0);
  const deadlineRef = useRef(0);
  const errorsRef = useRef(0);

  function stopPolling() {
    // 让所有在途/待调度的旧轮询失效
    genRef.current += 1;
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function poll(key: string, myGen: number) {
    if (myGen !== genRef.current) return;

    // 到达二维码有效期即停止
    if (Date.now() >= deadlineRef.current) {
      if (myGen === genRef.current) setScanState('expired');
      stopPolling();
      return;
    }

    try {
      const res = await apiGet<{ code: number; status: string; cookie_saved: boolean }>(
        `/api/netease/qr/check?key=${encodeURIComponent(key)}`
      );
      if (myGen !== genRef.current) return; // 期间已重新扫码/卸载
      errorsRef.current = 0;
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
      if (state === 'expired' || state === 'superseded') {
        stopPolling();
        if (state === 'superseded') setQr(null);
        return;
      }
    } catch (e: any) {
      if (myGen !== genRef.current) return;
      errorsRef.current += 1;
      if (errorsRef.current >= MAX_CONSECUTIVE_ERRORS) {
        setScanState('error');
        stopPolling();
        message.error('多次查询失败，已停止。请检查音乐服务后重试');
        return;
      }
    }

    if (myGen === genRef.current) {
      pollTimer.current = setTimeout(() => poll(key, myGen), POLL_INTERVAL_MS);
    }
  }

  async function startQrLogin() {
    stopPolling();
    const myGen = genRef.current; // stopPolling 已自增，这里即当前代
    errorsRef.current = 0;
    setQrLoading(true);
    setScanState('waiting');
    try {
      const res = await apiJson<QrCreateData>('/api/netease/qr/create', 'POST');
      if (myGen !== genRef.current) return; // 期间又点了一次，丢弃本次结果
      const data = (res as any).data as QrCreateData;
      if (!data || !data.key || !data.qr_image) throw new Error('二维码生成失败');
      deadlineRef.current = Date.now() + Math.max(30, Number(data.expires_in) || 180) * 1000;
      setQr(data);
      pollTimer.current = setTimeout(() => poll(data.key, myGen), POLL_INTERVAL_MS);
    } catch (e: any) {
      if (myGen === genRef.current) message.error(e.message || '生成二维码失败');
    } finally {
      if (myGen === genRef.current) setQrLoading(false);
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
      // 手动保存即为最新授权，停止任何进行中的扫码轮询并清除二维码
      stopPolling();
      setQr(null);
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

  function renderStatusTag() {
    if (!status) return <Tag>未知</Tag>;
    const verified = status.verified;
    if (status.logged_in || verified === 'valid') {
      return <Tag color="green">已授权{status.nickname ? `（${status.nickname}）` : ''}</Tag>;
    }
    if (status.cookie_present) {
      if (verified === 'invalid') return <Tag color="red">登录已失效</Tag>;
      return <Tag color="orange">已保存 · 暂无法校验</Tag>;
    }
    return <Tag>未授权</Tag>;
  }

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
            <span>当前状态：{renderStatusTag()}</span>
            {status?.cookie_present && status?.verified === 'invalid'
              ? <Typography.Text type="danger">登录已失效，请重新扫码</Typography.Text>
              : null}
            {status?.cookie_present && status?.verified === 'unknown' && !status?.logged_in
              ? <Typography.Text type="secondary">无法连接网易云校验，稍后可点“刷新状态”重试</Typography.Text>
              : null}
            {status?.last_modified
              ? <Typography.Text type="secondary">更新时间：{dateTime(status.last_modified)}</Typography.Text>
              : null}
          </Space>
        </Spin>

        <Space wrap>
          <Button type="primary" icon={<LoginOutlined />} loading={qrLoading} onClick={startQrLogin}>
            {status?.logged_in ? '重新扫码登录' : '扫码登录'}
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
            <Typography.Text type={scanState === 'expired' || scanState === 'error' ? 'danger' : 'secondary'}>
              {STATUS_TEXT[scanState] || STATUS_TEXT.unknown}
            </Typography.Text>
            {scanState === 'expired' || scanState === 'error' ? (
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
