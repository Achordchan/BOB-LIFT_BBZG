import { useEffect, useRef, useState } from 'react';
import { Alert, App, Button, Input, Popconfirm, QRCode, Space, Typography } from 'antd';
import { QrcodeOutlined, ReloadOutlined } from '@ant-design/icons';
import { apiGet, apiJson } from '../api';

type LoginState = 'waiting' | 'scanned' | 'confirmed' | 'expired' | 'error';
type Account = { logged_in: boolean; uname: string; mp3?: boolean };

export function BilibiliAuthCard() {
  const { message } = App.useApp();
  const [status, setStatus] = useState<Account | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [cookie, setCookie] = useState('');
  const [error, setError] = useState('');
  const [qr, setQr] = useState<{ url: string } | null>(null);
  const [phase, setPhase] = useState<LoginState>('waiting');
  const streamRef = useRef<EventSource | null>(null);
  const operationRef = useRef(0);

  function closeQr() {
    operationRef.current += 1;
    streamRef.current?.close();
    streamRef.current = null;
    setQr(null);
    setBusy(false);
  }

  useEffect(() => {
    let disposed = false;
    const operation = operationRef.current;
    void apiGet<{ data: Account }>('/api/bilibili/status').then(result => {
      if (!disposed && operation === operationRef.current) setStatus(result.data);
    }).catch(() => {});
    return () => { disposed = true; operationRef.current += 1; streamRef.current?.close(); };
  }, []);

  async function createQr() {
    closeQr();
    const operation = ++operationRef.current;
    setEditing(false);
    setError('');
    setPhase('waiting');
    setBusy(true);
    try {
      const result = await apiJson<{ url: string }>('/api/bilibili/qr', 'POST');
      if (operation !== operationRef.current) return;
      setQr({ url: result.url });
      const stream = new EventSource('/api/bilibili/qr/events');
      streamRef.current = stream;
      stream.addEventListener('status', event => {
        if (operation !== operationRef.current) return;
        try {
          const data = JSON.parse((event as MessageEvent).data);
          setPhase(data.state);
          if (data.state === 'confirmed') {
            setStatus(current => ({ ...current, logged_in: !!data.logged_in, uname: data.uname || '' }));
            setQr(null);
            message.success('哔哩哔哩扫码授权成功');
          }
          if (data.state === 'error') setError(data.message || '授权失败，请重新扫码');
          if (['confirmed', 'expired', 'error'].includes(data.state)) {
            stream.close();
            streamRef.current = null;
          }
        } catch (_) { stream.close(); setPhase('error'); setError('授权状态解析失败，请重新扫码'); }
      });
      stream.onerror = () => {
        stream.close();
        if (operation !== operationRef.current) return;
        setPhase('error');
        setError('授权连接中断，请重新扫码');
      };
    } catch (e: any) {
      if (operation === operationRef.current) setError(e.message || '二维码获取失败');
    } finally { if (operation === operationRef.current) setBusy(false); }
  }

  async function run(action: 'status' | 'save' | 'clear') {
    if (action !== 'status') closeQr();
    setBusy(true);
    setError('');
    try {
      if (action === 'save') {
        await apiJson('/api/bilibili/cookie', 'POST', { cookie });
        setCookie('');
        setEditing(false);
      }
      if (action === 'clear') await apiJson('/api/bilibili/cookie', 'DELETE');
      const result = await apiGet<{ data: Account }>('/api/bilibili/status');
      setStatus(result.data);
      if (action !== 'status') message.success(action === 'save' ? '授权已保存' : '授权已清除');
    } catch (e: any) { setError(e.message || '操作失败'); }
    finally { setBusy(false); }
  }

  return <Space direction="vertical" className="bilibili-auth-card">
    <Typography.Text type="secondary">扫码登录哔哩哔哩账号，用于音频搜索、试听和导入。未登录时使用游客模式。</Typography.Text>
    {status?.mp3 === false ? <Alert type="error" message="服务端缺少 FFmpeg，暂时无法转换 MP3" /> : null}
    {error ? <Alert type="error" message={error} /> : null}
    <Space wrap>
      <Typography.Text>{status ? (status.logged_in ? `已授权：${status.uname}` : '游客模式') : '服务状态待检查'}</Typography.Text>
      <Button type="primary" icon={<QrcodeOutlined />} loading={busy} onClick={createQr}>扫码登录</Button>
      <Button icon={<ReloadOutlined />} disabled={busy} onClick={() => run('status')}>刷新状态</Button>
      {status?.logged_in ? <Popconfirm title="清除哔哩哔哩账号授权？" onConfirm={() => run('clear')}><Button disabled={busy}>清除授权</Button></Popconfirm> : null}
      <Button type="link" disabled={busy} onClick={() => { closeQr(); setEditing(!editing); }}>手动授权</Button>
    </Space>
    {qr ? <Space direction="vertical" align="center" className="bilibili-auth-qr">
      <QRCode value={qr.url} size={208} status={phase === 'expired' || phase === 'error' ? 'expired' : 'active'} onRefresh={createQr} />
      <Typography.Text>{phase === 'scanned' ? '已扫码，请在手机上确认登录' : phase === 'expired' ? '二维码已过期，请刷新' : phase === 'error' ? '请重新获取二维码' : '使用哔哩哔哩 App 扫码'}</Typography.Text>
      <Button onClick={closeQr}>关闭二维码</Button>
    </Space> : null}
    {editing ? <Space direction="vertical" className="bilibili-auth-card">
      <Input.Password aria-label="哔哩哔哩 Cookie" autoComplete="off" placeholder="粘贴包含 SESSDATA 的 Cookie" value={cookie} onChange={e => setCookie(e.target.value)} />
      <Button type="primary" disabled={!cookie.trim()} loading={busy} onClick={() => run('save')}>保存授权</Button>
    </Space> : null}
  </Space>;
}
