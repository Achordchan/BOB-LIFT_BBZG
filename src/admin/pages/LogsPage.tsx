import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { App, Button, Input, Select, Space, Switch, Table, Tag, Typography } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import { apiGet } from '../api';
import { SectionCard } from '../components/SectionCard';

interface LogFile {
  name: string;
  size: number;
  mtime: string | null;
  kind: 'app' | 'error';
}

interface LogEntry {
  timestamp: string;
  level: string;
  message: string;
  stack?: string;
  meta?: Record<string, unknown>;
}

const LEVEL_COLOR: Record<string, string> = {
  error: 'red',
  warn: 'gold',
  info: 'blue',
  http: 'geekblue',
  debug: 'default',
  verbose: 'default'
};

function formatBytes(n: number) {
  if (!n) return '0 B';
  const u = ['B', 'KB', 'MB', 'GB'];
  let v = n;
  let i = 0;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(i === 0 ? 0 : 1)} ${u[i]}`;
}

export default function LogsPage() {
  const { message } = App.useApp();
  const [files, setFiles] = useState<LogFile[]>([]);
  const [file, setFile] = useState<string>('');
  const [level, setLevel] = useState<string>('');
  const [keyword, setKeyword] = useState<string>('');
  const [lines, setLines] = useState<number>(300);
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [auto, setAuto] = useState(false);
  const [meta, setMeta] = useState<{ scanned: number; returned: number } | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadFiles = useCallback(async () => {
    try {
      const res = await apiGet<{ files: LogFile[] }>('/api/logs/files');
      const list = (res as any).files || [];
      setFiles(list);
      setFile((cur) => cur || (list[0] ? list[0].name : ''));
    } catch (e: any) {
      message.error(e.message || '获取日志文件失败');
    }
  }, [message]);

  const loadTail = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const params = new URLSearchParams();
      if (file) params.set('file', file);
      if (level) params.set('level', level);
      if (keyword.trim()) params.set('q', keyword.trim());
      params.set('lines', String(lines));
      const res = await apiGet<{ entries: LogEntry[]; scanned: number; returned: number; file: string }>(`/api/logs/tail?${params.toString()}`);
      const data = res as any;
      setEntries((data.entries || []).slice().reverse()); // 最新在上
      setMeta({ scanned: data.scanned || 0, returned: data.returned || 0 });
      if (data.file && data.file !== file) setFile(data.file);
    } catch (e: any) {
      if (!silent) message.error(e.message || '读取日志失败');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [file, level, keyword, lines, message]);

  useEffect(() => { loadFiles(); }, [loadFiles]);
  useEffect(() => { if (file) loadTail(); /* eslint-disable-next-line */ }, [file, level, lines]);

  useEffect(() => {
    if (timer.current) { clearInterval(timer.current); timer.current = null; }
    if (auto) {
      timer.current = setInterval(() => { loadTail(true); }, 5000);
    }
    return () => { if (timer.current) clearInterval(timer.current); };
  }, [auto, loadTail]);

  const columns = useMemo(() => [
    { title: '时间', dataIndex: 'timestamp', width: 190, render: (v: string) => <span className="admin-log-time">{v || '—'}</span> },
    { title: '级别', dataIndex: 'level', width: 84, render: (v: string) => <Tag color={LEVEL_COLOR[v] || 'default'}>{(v || 'info').toUpperCase()}</Tag> },
    { title: '消息', dataIndex: 'message', ellipsis: true, render: (v: string, r: LogEntry) => <span>{v}{r.meta && (r.meta as any).tag === 'http' && (r.meta as any).status ? <Tag style={{ marginLeft: 8 }} color={Number((r.meta as any).status) >= 500 ? 'red' : Number((r.meta as any).status) >= 400 ? 'gold' : 'green'}>{String((r.meta as any).status)}</Tag> : null}</span> }
  ], []);

  return (
    <SectionCard
      title="运行日志"
      description="后台访问、错误与运行日志（服务器 logs 目录，按天切割）"
      extra={
        <Space wrap>
          <Select
            style={{ width: 230 }}
            value={file || undefined}
            placeholder="选择日志文件"
            onChange={(v) => setFile(v)}
            options={files.map((f) => ({ value: f.name, label: `${f.name}（${formatBytes(f.size)}）` }))}
          />
          <Select
            style={{ width: 120 }}
            value={level}
            onChange={(v) => setLevel(v)}
            options={[
              { value: '', label: '全部级别' },
              { value: 'error', label: 'ERROR' },
              { value: 'warn', label: 'WARN' },
              { value: 'info', label: 'INFO' },
              { value: 'debug', label: 'DEBUG' }
            ]}
          />
          <Select
            style={{ width: 110 }}
            value={lines}
            onChange={(v) => setLines(v)}
            options={[100, 300, 500, 1000, 2000].map((n) => ({ value: n, label: `${n} 行` }))}
          />
          <Input.Search
            allowClear
            placeholder="搜索关键字 / requestId"
            style={{ width: 220 }}
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            onSearch={() => loadTail()}
          />
          <Space size={6}>
            <span style={{ color: '#7b8794', fontSize: 12 }}>自动</span>
            <Switch size="small" checked={auto} onChange={setAuto} />
          </Space>
          <Button icon={<ReloadOutlined />} loading={loading} onClick={() => loadTail()}>刷新</Button>
        </Space>
      }
    >
      <Space direction="vertical" size={10} style={{ width: '100%' }}>
        {meta ? (
          <Typography.Text type="secondary">
            共扫描 {meta.scanned} 条，显示 {entries.length} 条{level ? `（级别：${level.toUpperCase()}）` : ''}{keyword.trim() ? `（关键字：${keyword.trim()}）` : ''}
          </Typography.Text>
        ) : null}
        <Table
          className="admin-log-table"
          rowKey={(_, i) => String(i)}
          size="small"
          loading={loading}
          dataSource={entries}
          columns={columns as any}
          pagination={{ pageSize: 50, showSizeChanger: false, size: 'small' }}
          scroll={{ x: 720 }}
          expandable={{
            rowExpandable: (r) => !!(r.stack || (r.meta && Object.keys(r.meta).length)),
            expandedRowRender: (r) => (
              <div className="admin-log-detail">
                {r.stack ? <pre className="admin-log-stack">{r.stack}</pre> : null}
                {r.meta && Object.keys(r.meta).length ? (
                  <pre className="admin-log-meta">{JSON.stringify(r.meta, null, 2)}</pre>
                ) : null}
              </div>
            )
          }}
        />
      </Space>
    </SectionCard>
  );
}
