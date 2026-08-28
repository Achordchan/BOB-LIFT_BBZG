import { useCallback, useEffect, useMemo, useState } from 'react';
import { App, Button, Input, Select, Space, Table, Tag, Typography } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import { apiGet, dateTime } from '../api';
import { SectionCard } from '../components/SectionCard';

interface AuditEntry {
  ts: string;
  actor: string;
  actorType: 'admin' | 'staff' | 'connector' | 'anon' | string;
  action: string;
  target?: string;
  detail?: string;
  ip?: string;
  method?: string;
  path?: string;
  status?: number | null;
  requestId?: string;
}

const ACTOR_LABEL: Record<string, { text: string; color: string }> = {
  admin: { text: '管理员', color: 'geekblue' },
  staff: { text: '员工', color: 'cyan' },
  connector: { text: '外部接口', color: 'purple' },
  anon: { text: '匿名', color: 'default' }
};

export default function AuditPage() {
  const { message } = App.useApp();
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [actorType, setActorType] = useState('');
  const [keyword, setKeyword] = useState('');
  const [limit, setLimit] = useState(300);
  const [scanned, setScanned] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (actorType) params.set('actorType', actorType);
      if (keyword.trim()) params.set('q', keyword.trim());
      params.set('limit', String(limit));
      const res = await apiGet<{ entries: AuditEntry[]; scanned: number }>(`/api/audit?${params.toString()}`);
      const data = res as any;
      setEntries(data.entries || []);
      setScanned(data.scanned || 0);
    } catch (e: any) {
      message.error(e.message || '读取操作日志失败');
    } finally {
      setLoading(false);
    }
  }, [actorType, keyword, limit, message]);

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [actorType, limit]);

  const columns = useMemo(() => [
    { title: '时间', dataIndex: 'ts', width: 170, render: (v: string) => <span className="admin-log-time">{dateTime(v)}</span> },
    {
      title: '操作人', dataIndex: 'actor', width: 170, render: (v: string, r: AuditEntry) => {
        const meta = ACTOR_LABEL[r.actorType] || ACTOR_LABEL.anon;
        return <Space size={6}><Tag color={meta.color}>{meta.text}</Tag><span>{v}</span></Space>;
      }
    },
    {
      title: '动作', dataIndex: 'action', width: 200, render: (v: string, r: AuditEntry) => (
        <span>{v}{r.status && r.status >= 400 ? <Tag color="red" style={{ marginLeft: 6 }}>{r.status}</Tag> : null}</span>
      )
    },
    { title: '详情', dataIndex: 'detail', ellipsis: true, render: (v: string, r: AuditEntry) => v || r.target || '—' },
    { title: 'IP', dataIndex: 'ip', width: 140, ellipsis: true, render: (v: string) => v || '—' }
  ], []);

  return (
    <SectionCard
      title="操作日志"
      description="谁、什么时候、做了什么业务动作（成交/询盘/成员/授权/主题等）"
      extra={
        <Space wrap>
          <Select
            style={{ width: 130 }}
            value={actorType}
            onChange={setActorType}
            options={[
              { value: '', label: '全部身份' },
              { value: 'admin', label: '管理员' },
              { value: 'staff', label: '员工' },
              { value: 'connector', label: '外部接口' },
              { value: 'anon', label: '匿名' }
            ]}
          />
          <Select
            style={{ width: 110 }}
            value={limit}
            onChange={setLimit}
            options={[100, 300, 500, 1000, 2000].map((n) => ({ value: n, label: `${n} 条` }))}
          />
          <Input.Search
            allowClear
            placeholder="搜索操作人 / 动作 / 详情"
            style={{ width: 240 }}
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            onSearch={() => load()}
          />
          <Button icon={<ReloadOutlined />} loading={loading} onClick={() => load()}>刷新</Button>
        </Space>
      }
    >
      <Space direction="vertical" size={10} style={{ width: '100%' }}>
        <Typography.Text type="secondary">
          共 {scanned} 条记录，显示 {entries.length} 条{actorType ? `（身份：${(ACTOR_LABEL[actorType] || {}).text || actorType}）` : ''}{keyword.trim() ? `（关键字：${keyword.trim()}）` : ''}
        </Typography.Text>
        <Table
          className="admin-log-table"
          rowKey={(_, i) => String(i)}
          size="small"
          loading={loading}
          dataSource={entries}
          columns={columns as any}
          pagination={{ pageSize: 50, showSizeChanger: false, size: 'small' }}
          scroll={{ x: 820 }}
          expandable={{
            rowExpandable: (r) => !!(r.requestId || r.path),
            expandedRowRender: (r) => (
              <div className="admin-log-detail">
                <pre className="admin-log-meta">{JSON.stringify(r, null, 2)}</pre>
              </div>
            )
          }}
        />
      </Space>
    </SectionCard>
  );
}
