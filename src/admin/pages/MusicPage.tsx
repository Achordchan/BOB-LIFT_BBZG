import { useEffect, useMemo, useRef, useState } from 'react';
import { App, Button, Drawer, Form, Input, Modal, Popconfirm, Progress, Space, Table, Tabs, Tag, Upload } from 'antd';
import { DeleteOutlined, EditOutlined, PlusOutlined, SearchOutlined, UploadOutlined } from '@ant-design/icons';
import { apiForm, apiGet, apiJson, audioUrl, dateTime } from '../api';
import { SectionCard } from '../components/SectionCard';
import type { MusicItem, PlayAdminTrackInput } from '../types';

interface MusicPageProps {
  playTrack: (track: PlayAdminTrackInput) => void;
  activeTrackId?: string;
}

export default function MusicPage({ playTrack, activeTrackId }: MusicPageProps) {
  const { message } = App.useApp();
  const [items, setItems] = useState<MusicItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState<'music' | 'sound' | null>(null);
  const [editing, setEditing] = useState<MusicItem | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchRows, setSearchRows] = useState<any[]>([]);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [searchPage, setSearchPage] = useState(1);
  const [importing, setImporting] = useState<any>(null);
  const importSourceRef = useRef<EventSource | null>(null);
  const [form] = Form.useForm();
  const [editForm] = Form.useForm();
  const [searchForm] = Form.useForm();
  const songs = useMemo(() => items.filter(i => !i.isSound), [items]);
  const sounds = useMemo(() => items.filter(i => i.isSound), [items]);
  const norm = (e: any) => Array.isArray(e) ? e : e?.fileList;

  async function load() {
    setLoading(true);
    try { const res = await apiGet<{ music: MusicItem[] }>('/api/music'); setItems((res as any).music || []); }
    catch (e: any) { message.error(e.message || '音乐加载失败'); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); return () => importSourceRef.current?.close(); }, []);

  async function submitUpload(values: any) {
    const fd = new FormData();
    fd.append(open === 'sound' ? 'sound' : 'musicFile', values.file?.[0]?.originFileObj);
    fd.append('name', values.name || '');
    fd.append('description', values.description || '');
    if (values.lrcFile?.[0]?.originFileObj) fd.append('lrcFile', values.lrcFile[0].originFileObj);
    if (values.lrcContent) fd.append('lrcContent', values.lrcContent);
    if (open === 'music') fd.append('isSound', 'false');
    try {
      await apiForm(open === 'sound' ? '/api/sound/upload' : '/api/music/upload', fd);
      message.success(open === 'sound' ? '音效已上传' : '音乐已上传'); setOpen(null); form.resetFields(); load();
    } catch (e: any) { message.error(e.message || '上传失败'); }
  }

  async function saveEdit(values: any) {
    if (!editing) return;
    const fd = new FormData();
    fd.append('musicId', editing.id);
    fd.append('name', values.name || '');
    fd.append('description', values.description || '');
    if (values.lrcFile?.[0]?.originFileObj) fd.append('lrcFile', values.lrcFile[0].originFileObj);
    if (values.lrcContent) fd.append('lrcContent', values.lrcContent);
    try { await apiForm('/api/music/update', fd); message.success('音乐已更新'); setEditing(null); load(); }
    catch (e: any) { message.error(e.message || '更新失败'); }
  }

  async function search(values: any, page = 1) {
    const keyword = String(values.keyword || searchKeyword || '').trim();
    if (!keyword) { message.warning('请输入搜索关键词'); return; }
    try {
      const limit = 20;
      const offset = (page - 1) * limit;
      const res = await apiGet<any>(`/api/public/music/search?keywords=${encodeURIComponent(keyword)}&limit=${limit}&offset=${offset}`);
      const rows = (res as any).songs || (res as any).data?.songs || (res as any).result?.songs || [];
      setSearchKeyword(keyword);
      setSearchPage(page);
      setSearchRows(rows);
      if (!rows.length) message.info('没有搜索到可导入音乐');
    } catch (e: any) { message.error(e.message || '搜索失败'); }
  }

  function getMusicSources(row: MusicItem) {
    const sources = [];
    if (row.filename) sources.push(audioUrl(row.filename));
    if ((row as any).sourceId) sources.push(`/api/public/music/stream?id=${encodeURIComponent(String((row as any).sourceId))}`);
    return Array.from(new Set(sources));
  }

  function getSearchArtist(row: any) {
    return row.artists?.map((a: any) => a.name).join(' / ') || row.artist || '—';
  }

  function getSearchSources(row: any) {
    const id = row.id || row.neteaseId;
    return id ? [`/api/public/music/stream?id=${encodeURIComponent(String(id))}`] : [];
  }

  function playLibraryTrack(row: MusicItem) {
    playTrack({
      id: `music-${row.id}`,
      title: row.name,
      subtitle: row.description || (row.isSound ? '音效库' : '音乐库'),
      sources: getMusicSources(row)
    });
  }

  function playSearchTrack(row: any) {
    const id = row.id || row.neteaseId;
    const title = row.name || row.title || '未命名音乐';
    playTrack({
      id: `netease-${id}`,
      title,
      subtitle: getSearchArtist(row),
      sources: getSearchSources(row)
    });
  }

  function renderTrackName(row: MusicItem) {
    const active = activeTrackId === `music-${row.id}`;
    return <Button
      type="link"
      className={active ? 'admin-track-link admin-track-link-active' : 'admin-track-link'}
      disabled={!getMusicSources(row).length}
      onClick={() => playLibraryTrack(row)}
    >{row.name}</Button>;
  }

  function renderSearchName(row: any) {
    const id = row.id || row.neteaseId;
    const title = row.name || row.title || '未命名音乐';
    const active = activeTrackId === `netease-${id}`;
    return <Button
      type="link"
      className={active ? 'admin-track-link admin-track-link-active' : 'admin-track-link'}
      disabled={!getSearchSources(row).length}
      onClick={() => playSearchTrack(row)}
    >{title}</Button>;
  }

  async function importSong(row: any) {
    try {
      const id = row.id || row.neteaseId;
      const name = row.name || row.title;
      const res = await apiJson<{ jobId: string }>('/api/music/import-netease', 'POST', { neteaseId: id, name, description: row.artists?.map((a: any) => a.name).join(' / ') || row.artist || '' });
      const jobId = (res as any).jobId;
      if (!jobId) throw new Error('导入任务未返回 jobId');
      importSourceRef.current?.close();
      setImporting({ percent: 0, message: '开始导入', name });
      const es = new EventSource(`/api/music/import-events/${encodeURIComponent(jobId)}`);
      importSourceRef.current = es;
      const closeSource = () => {
        es.close();
        if (importSourceRef.current === es) importSourceRef.current = null;
      };
      const handleMessage = (evt: MessageEvent) => {
        try {
          if (!evt.data) return;
          const data = JSON.parse(evt.data);
          const job = data.job || {};
          setImporting({ ...job, name });
          if (job.status === 'done') { closeSource(); message.success('导入完成'); load(); }
          if (job.status === 'error') { closeSource(); message.error(job.error || '导入失败'); }
        } catch {
          closeSource();
          message.error('导入进度解析失败');
        }
      };
      const handleConnectionError = (evt: Event) => {
        if ('data' in evt && (evt as MessageEvent).data) {
          handleMessage(evt as MessageEvent);
          return;
        }
        closeSource();
        setImporting((prev: any) => ({ ...(prev || {}), status: 'error', message: '导入连接中断' }));
        message.error('导入连接中断');
      };
      es.addEventListener('progress', handleMessage as EventListener);
      es.addEventListener('done', handleMessage as EventListener);
      es.addEventListener('error', handleConnectionError);
    } catch (e: any) { message.error(e.message || '导入失败'); }
  }

  const columns = [
    { title: '名称', dataIndex: 'name', render: (_: any, r: MusicItem) => renderTrackName(r) },
    { title: '描述', dataIndex: 'description', ellipsis: true },
    { title: '上传时间', render: (_: any, r: MusicItem) => dateTime(r.uploadDate || r.uploadedAt) },
    { title: '歌词', render: (_: any, r: MusicItem) => r.lrcFilename ? <Tag color="green">已配置</Tag> : <Tag>无歌词</Tag> },
    { title: '操作', render: (_: any, r: MusicItem) => <Space><Button size="small" icon={<EditOutlined />} onClick={() => { setEditing(r); editForm.setFieldsValue(r); }}>编辑</Button><Popconfirm title="确认删除？" onConfirm={async () => { await apiJson(`/api/music/delete/${r.id}`, 'DELETE'); message.success('已删除'); load(); }}><Button size="small" danger icon={<DeleteOutlined />}>删除</Button></Popconfirm></Space> }
  ];

  return <Space direction="vertical" size={16} style={{ width: '100%' }}>
    <SectionCard title="音乐资产" description="音乐库、音效库和网易云导入统一管理" extra={<Space><Button icon={<SearchOutlined />} onClick={() => setSearchOpen(true)}>网易云导入</Button><Button icon={<PlusOutlined />} onClick={() => setOpen('sound')}>上传音效</Button><Button type="primary" icon={<PlusOutlined />} onClick={() => setOpen('music')}>上传音乐</Button></Space>}>
      {importing && <Progress percent={Number(importing.percent || 0)} status={importing.status === 'error' ? 'exception' : importing.status === 'done' ? 'success' : 'active'} />}
      <Tabs items={[{ key: 'songs', label: `音乐库 ${songs.length}`, children: <Table rowKey="id" loading={loading} dataSource={songs} columns={columns as any} /> }, { key: 'sounds', label: `音效库 ${sounds.length}`, children: <Table rowKey="id" loading={loading} dataSource={sounds} columns={columns as any} /> }]} />
    </SectionCard>

    <Drawer title={open === 'sound' ? '上传音效' : '上传音乐'} open={!!open} onClose={() => setOpen(null)} width={560} destroyOnClose>
      <Form form={form} layout="vertical" onFinish={submitUpload}>
        <Form.Item name="name" label="名称" rules={[{ required: true, message: '请输入名称' }]}><Input /></Form.Item>
        <Form.Item name="description" label="描述"><Input /></Form.Item>
        <Form.Item name="file" label="音频文件" valuePropName="fileList" getValueFromEvent={norm} rules={[{ required: true, message: '请选择音频文件' }]}><Upload beforeUpload={() => false} maxCount={1} accept="audio/*"><Button icon={<UploadOutlined />}>选择文件</Button></Upload></Form.Item>
        {open === 'music' && <><Form.Item name="lrcFile" label="LRC 歌词文件" valuePropName="fileList" getValueFromEvent={norm}><Upload beforeUpload={() => false} maxCount={1} accept=".lrc,text/plain"><Button>选择歌词文件</Button></Upload></Form.Item><Form.Item name="lrcContent" label="歌词内容"><Input.TextArea rows={6} /></Form.Item></>}
        <Button type="primary" htmlType="submit">提交</Button>
      </Form>
    </Drawer>

    <Drawer title="编辑音乐" open={!!editing} onClose={() => setEditing(null)} width={560} destroyOnClose>
      <Form form={editForm} layout="vertical" onFinish={saveEdit}>
        <Form.Item name="name" label="名称" rules={[{ required: true }]}><Input /></Form.Item>
        <Form.Item name="description" label="描述"><Input /></Form.Item>
        <Form.Item name="lrcFile" label="替换 LRC 文件" valuePropName="fileList" getValueFromEvent={norm}><Upload beforeUpload={() => false} maxCount={1} accept=".lrc,text/plain"><Button>选择歌词文件</Button></Upload></Form.Item>
        <Form.Item name="lrcContent" label="歌词内容"><Input.TextArea rows={8} /></Form.Item>
        <Button type="primary" htmlType="submit">保存</Button>
      </Form>
    </Drawer>

    <Modal title="网易云音乐导入" width={820} open={searchOpen} onCancel={() => setSearchOpen(false)} footer={null}>
      <Form form={searchForm} layout="inline" onFinish={(v) => search(v, 1)} style={{ marginBottom: 16 }}><Form.Item name="keyword" rules={[{ required: true, message: '请输入关键词' }]}><Input placeholder="歌曲或歌手" /></Form.Item><Button type="primary" htmlType="submit">搜索</Button></Form>
      <Table rowKey={(r) => String(r.id)} dataSource={searchRows} pagination={false} columns={[{ title: '歌曲', render: (_: any, r: any) => renderSearchName(r) }, { title: '歌手', render: (_: any, r: any) => getSearchArtist(r) }, { title: '操作', render: (_: any, r: any) => <Button size="small" type="primary" onClick={() => importSong(r)}>导入</Button> }]} />
      <Space style={{ marginTop: 12 }}><Button disabled={searchPage <= 1} onClick={() => search({ keyword: searchKeyword }, searchPage - 1)}>上一页</Button><span>第 {searchPage} 页</span><Button disabled={!searchRows.length} onClick={() => search({ keyword: searchKeyword }, searchPage + 1)}>下一页</Button></Space>
    </Modal>
  </Space>;
}
