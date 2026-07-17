import { useEffect, useMemo, useRef, useState } from 'react';
import { App, Button, Card, Drawer, Form, Input, Modal, Popconfirm, Progress, Space, Spin, Table, Tabs, Tag, Typography, Upload } from 'antd';
import { DeleteOutlined, EditOutlined, PlusOutlined, SearchOutlined, UploadOutlined } from '@ant-design/icons';
import { apiForm, apiGet, apiJson, apiText, audioUrl, dateTime } from '../api';
import { SectionCard } from '../components/SectionCard';
import type { MusicItem, PlayAdminTrackInput } from '../types';

interface MusicPageProps {
  playTrack: (track: PlayAdminTrackInput) => void;
  activeTrackId?: string;
  onLyricsPanelChange?: (value: {
    title: string;
    rawContent: string;
    lines: LyricLine[];
    trackId: string;
  } | null) => void;
}

interface LyricLine {
  time: number;
  text: string;
}

interface LyricsOpenState {
  open: boolean;
  title: string;
  rawContent: string;
  lines: LyricLine[];
  trackId: string;
  loading: boolean;
}

type LyricsSearchTarget = 'upload' | 'edit';

export default function MusicPage({
  playTrack,
  activeTrackId,
  onLyricsPanelChange
}: MusicPageProps) {
  const { message } = App.useApp();
  const [items, setItems] = useState<MusicItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploadLoading, setUploadLoading] = useState(false);
  const [open, setOpen] = useState<'music' | 'sound' | null>(null);
  const [editing, setEditing] = useState<MusicItem | null>(null);
  const [editLoading, setEditLoading] = useState(false);
  const [saveLoading, setSaveLoading] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchRows, setSearchRows] = useState<any[]>([]);
  const [lyricsOpen, setLyricsOpen] = useState<LyricsOpenState | null>(null);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [searchPage, setSearchPage] = useState(1);
  const [searchHasRun, setSearchHasRun] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchLyricsLoading, setSearchLyricsLoading] = useState(false);
  const [lyricsSearchOpen, setLyricsSearchOpen] = useState(false);
  const [lyricsSearchRows, setLyricsSearchRows] = useState<any[]>([]);
  const [lyricsSearchKeyword, setLyricsSearchKeyword] = useState('');
  const [lyricsSearchTarget, setLyricsSearchTarget] = useState<LyricsSearchTarget>('upload');
  const [applyLyricsId, setApplyLyricsId] = useState('');
  const [importing, setImporting] = useState<any>(null);
  const [assetView, setAssetView] = useState<'songs' | 'sounds' | null>(null);
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
  useEffect(() => () => {
    emitLyricsPanel(null);
  }, []);

  async function submitUpload(values: any) {
    const fd = new FormData();
    const isMusic = open === 'music';
    const songName = String(values.songName || '').trim();
    const artist = String(values.artist || '').trim();
    const displayName = isMusic ? [songName, artist].filter(Boolean).join('-') : String(values.name || '').trim();
    fd.append(open === 'sound' ? 'sound' : 'musicFile', values.file?.[0]?.originFileObj);
    fd.append('name', displayName);
    if (isMusic) {
      fd.append('songName', songName);
      fd.append('artist', artist);
    }
    fd.append('description', values.description || '');
    if (values.lrcFile?.[0]?.originFileObj) fd.append('lrcFile', values.lrcFile[0].originFileObj);
    if (values.lrcContent) fd.append('lrcContent', values.lrcContent);
    if (open === 'music') fd.append('isSound', 'false');
    setUploadLoading(true);
    try {
      await apiForm(open === 'sound' ? '/api/sound/upload' : '/api/music/upload', fd);
      message.success(open === 'sound' ? '音效已上传' : '音乐已上传'); setOpen(null); form.resetFields(); load();
    } catch (e: any) { message.error(e.message || '上传失败'); }
    finally { setUploadLoading(false); }
  }

  async function startEdit(row: MusicItem) {
    setEditLoading(false);
    setSaveLoading(false);
    setEditing(row);
    editForm.setFieldsValue({
      ...row,
      songName: getMusicTitle(row),
      artist: getMusicArtist(row, ''),
      lrcContent: ''
    });
    if (!row.lrcFilename) return;
    setEditLoading(true);
    try {
      const lrcContent = await apiText(`/api/music/${row.id}/lrc`);
      editForm.setFieldsValue({ lrcContent });
    } catch (e: any) {
      message.error(e.message || '歌词加载失败');
    } finally {
      setEditLoading(false);
    }
  }

  function parseLrc(content: string): LyricLine[] {
    const lines = String(content || '').split(/\r?\n/);
    const result: LyricLine[] = [];
    const timeRegex = /\[(\d{1,}):(\d{2})(?:[.:](\d{1,3}))?\]/g;

    for (let i = 0; i < lines.length; i++) {
      const raw = lines[i];
      const text = raw ? raw.replace(timeRegex, '').trim() : '';
      if (!text) continue;

      const matches = raw.matchAll(timeRegex);
      for (const match of matches) {
        const minute = parseInt(match[1], 10);
        const second = parseInt(match[2], 10);
        const msRaw = match[3] || '';
        const ms = msRaw ? parseInt(msRaw.padEnd(3, '0').slice(0, 3), 10) : 0;
        if (Number.isFinite(minute) && Number.isFinite(second)) {
          result.push({
            time: minute * 60 + second + (msRaw ? ms / 1000 : 0),
            text
          });
        }
      }
    }

    return result.sort((a, b) => a.time - b.time);
  }

  function emitLyricsPanel(value: {
    title: string;
    rawContent: string;
    lines: LyricLine[];
    trackId: string;
  } | null) {
    if (!onLyricsPanelChange) return;
    onLyricsPanelChange(value);
  }

  async function runLyricsSearch(keywordValue: string, target: LyricsSearchTarget) {
    const keyword = String(keywordValue || '').trim();
    if (!keyword) {
      message.warning('请输入歌曲名或歌手');
      return;
    }

    setLyricsSearchTarget(target);
    setLyricsSearchKeyword(keyword);
    setLyricsSearchOpen(true);
    setSearchLyricsLoading(true);
    try {
      const searchRes = await apiGet<any>(`/api/public/music/search?keywords=${encodeURIComponent(keyword)}&limit=20&page=1`);
      const rows = (searchRes as any).songs || (searchRes as any).data?.songs || (searchRes as any).result?.songs || [];
      const finalRows = Array.isArray(rows) ? rows : [];
      setLyricsSearchRows(finalRows);
      if (!finalRows.length) message.info('未找到匹配歌词');
    } catch (e: any) {
      message.error(e && e.message ? e.message : '歌词搜索失败');
    } finally {
      setSearchLyricsLoading(false);
    }
  }

  async function fillLyricsBySearch({
    songName,
    artist,
    target
  }: {
    songName: string;
    artist: string;
    target: LyricsSearchTarget;
  }) {
    if (searchLyricsLoading) return;
    const keyword = [songName, artist].filter(Boolean).join(' ').trim();
    if (!keyword) {
      message.warning('请先填写歌曲名（编辑页会自动带入歌名）');
      return;
    }

    await runLyricsSearch(keyword, target);
  }

  async function applyLyricsFromSearch(row: any) {
    const id = getSearchId(row);
    if (!/^\d+$/.test(id)) {
      message.error('缺少/无效歌曲ID');
      return;
    }

    setApplyLyricsId(id);
    try {
      const lyricRes = await apiGet<{ success: boolean; lyric?: string; tLyric?: string; message?: string }>(`/api/public/music/lyric?id=${encodeURIComponent(id)}`);
      const content = lyricRes && lyricRes.success ? (lyricRes.lyric || lyricRes.tLyric || '') : '';
      if (!content) {
        message.info('该歌曲暂无歌词内容');
        return;
      }

      const targetForm = lyricsSearchTarget === 'edit' ? editForm : form;
      targetForm.setFieldsValue({ lrcContent: content });
      setLyricsSearchOpen(false);
      message.success(`已使用《${getSearchTitle(row)}》的歌词`);
    } catch (e: any) {
      message.error(e && e.message ? e.message : '歌词获取失败');
    } finally {
      setApplyLyricsId('');
    }
  }

  async function searchLyricsForUpload() {
    if (!open) return;
    const songName = String(form.getFieldValue('songName') || '').trim();
    const artist = String(form.getFieldValue('artist') || '').trim();
    const fallback = String(form.getFieldValue('name') || '').trim();
    const finalSongName = songName || fallback || '';
    await fillLyricsBySearch({ songName: finalSongName, artist, target: 'upload' });
  }

  function getEditFormValues() {
    const values = editForm.getFieldsValue(true);
    const songName = String((values && values.songName) || getMusicTitle(editing || {} as MusicItem)).trim();
    const artist = String((values && values.artist) || getMusicArtist(editing || {} as MusicItem)).trim();
    return { songName, artist };
  }

  async function searchLyricsForEdit() {
    if (!editing) return;
    const { songName, artist } = getEditFormValues();
    await fillLyricsBySearch({ songName, artist, target: 'edit' });
  }

  async function openLyricsPreview(row: MusicItem) {
    const title = row.isSound ? row.name : getMusicTitle(row);
    setLyricsOpen({
      open: true,
      title,
      rawContent: '加载中...',
      lines: [],
      trackId: `music-${row.id}`,
      loading: true
    });
    emitLyricsPanel({
      title,
      rawContent: '加载中...',
      lines: [],
      trackId: `music-${row.id}`
    });
    try {
      const content = await apiText(`/api/music/${row.id}/lrc`);
      const lines = parseLrc(content);
      const normalized = (content && content.trim()) || '暂无歌词';
      emitLyricsPanel({
        title,
        rawContent: normalized,
        lines,
        trackId: `music-${row.id}`
      });
      setLyricsOpen({
        open: true,
        title,
        rawContent: normalized,
        lines,
        trackId: `music-${row.id}`,
        loading: false
      });
    } catch (e: any) {
      const errorText = e && e.message ? e.message : '加载歌词失败';
      emitLyricsPanel({
        title,
        rawContent: errorText,
        lines: [],
        trackId: `music-${row.id}`
      });
      setLyricsOpen({
        open: true,
        title,
        rawContent: errorText,
        lines: [],
        trackId: `music-${row.id}`,
        loading: false
      });
    }
  }

  async function openSearchLyricsPreview(row: any) {
    const id = getSearchId(row);
    if (!/^\d+$/.test(id)) {
      message.error('缺少/无效歌曲ID');
      return;
    }

    const title = getSearchTitle(row);
    setLyricsOpen({
      open: true,
      title,
      rawContent: '加载中...',
      lines: [],
      trackId: `netease-${id}`,
      loading: true
    });
    emitLyricsPanel({
      title,
      rawContent: '加载中...',
      lines: [],
      trackId: `netease-${id}`
    });

    try {
      const data = await apiGet<{ success: boolean; lyric?: string; tLyric?: string; message?: string }>(`/api/public/music/lyric?id=${encodeURIComponent(id)}`);
      const content = data && data.success
        ? (data.lyric || data.tLyric || '暂无歌词')
        : (data && data.message) ? data.message : '暂无歌词';
      const lines = parseLrc(content);
      emitLyricsPanel({
        title,
        rawContent: content,
        lines,
        trackId: `netease-${id}`
      });
      setLyricsOpen({
        open: true,
        title,
        rawContent: content,
        lines,
        trackId: `netease-${id}`,
        loading: false
      });
    } catch (e: any) {
      const errorText = e && e.message ? e.message : '加载歌词失败';
      emitLyricsPanel({
        title,
        rawContent: errorText,
        lines: [],
        trackId: `netease-${id}`
      });
      setLyricsOpen({
        open: true,
        title,
        rawContent: errorText,
        lines: [],
        trackId: `netease-${id}`,
        loading: false
      });
    }
  }

  async function saveEdit(values: any) {
    if (!editing) return;
    const fd = new FormData();
    const songName = String(values.songName || '').trim();
    const artist = String(values.artist || '').trim();
    const displayName = editing.isSound ? String(values.name || '').trim() : [songName, artist].filter(Boolean).join('-');
    fd.append('musicId', editing.id);
    fd.append('name', displayName);
    if (!editing.isSound) {
      fd.append('songName', songName);
      fd.append('artist', artist);
    }
    fd.append('description', values.description || '');
    if (values.lrcFile?.[0]?.originFileObj) fd.append('lrcFile', values.lrcFile[0].originFileObj);
    if (typeof values.lrcContent === 'string' && values.lrcContent.trim()) fd.append('lrcContent', values.lrcContent);
    setSaveLoading(true);
    try { await apiForm('/api/music/update', fd); message.success('音乐已更新'); setEditing(null); load(); }
    catch (e: any) { message.error(e.message || '更新失败'); }
    finally { setSaveLoading(false); }
  }

  async function search(values: any, page = 1) {
    const keyword = String(values.keyword || searchKeyword || '').trim();
    if (!keyword) { message.warning('请输入搜索关键词'); return; }
    setSearchLoading(true);
    try {
      const limit = 20;
      const res = await apiGet<any>(`/api/public/music/search?keywords=${encodeURIComponent(keyword)}&limit=${limit}&page=${page}`);
      const rows = (res as any).songs || (res as any).data?.songs || (res as any).result?.songs || [];
      setSearchKeyword(keyword);
      setSearchPage(page);
      setSearchRows(Array.isArray(rows) ? rows : []);
      setSearchHasRun(true);
      if (!rows.length) message.info('没有搜索到可导入音乐');
    } catch (e: any) { message.error(e.message || '搜索失败'); }
    finally { setSearchLoading(false); }
  }

  function getMusicSources(row: MusicItem) {
    const sources: string[] = [];
    if (row.filename) sources.push(audioUrl(row.filename));
    if ((row as any).sourceId) sources.push(`/api/public/music/stream?id=${encodeURIComponent(String((row as any).sourceId))}`);
    return Array.from(new Set(sources));
  }

  function safeText(value: any, fallback = '—') {
    if (value == null || value === '') return fallback;
    if (typeof value === 'string' || typeof value === 'number') return String(value);
    if (Array.isArray(value)) return value.map(item => safeText(item, '')).filter(Boolean).join(' / ') || fallback;
    if (typeof value === 'object') return safeText(value.name || value.title || value.value, fallback);
    return fallback;
  }

  function getSearchId(row: any) {
    return safeText(row?.id || row?.neteaseId || row?.songId, '');
  }

  function getSearchTitle(row: any) {
    return safeText(row?.name || row?.title, '未命名音乐');
  }

  function getSearchArtist(row: any, fallback = '—') {
    return safeText(row?.artists || row?.artist || row?.ar || row?.artist_string, fallback);
  }

  function getSearchAlbum(row: any, fallback = '—') {
    return safeText(row?.album || row?.al, fallback);
  }

  function splitJoinedName(name?: string) {
    const text = String(name || '').trim();
    const index = text.lastIndexOf('-');
    if (index <= 0 || index >= text.length - 1) return { title: text, artist: '' };
    return { title: text.slice(0, index).trim(), artist: text.slice(index + 1).trim() };
  }

  function getMusicTitle(row: MusicItem, fallback = '未命名音乐') {
    const explicit = String(row.songName || '').trim();
    if (explicit) return explicit;
    const parts = splitJoinedName(row.name);
    return parts.title || safeText(row.name, fallback);
  }

  function getMusicArtist(row: MusicItem, fallback = '—') {
    const explicit = String(row.artist || row.artists || '').trim();
    if (explicit) return explicit;
    const parsed = splitJoinedName(row.name).artist;
    if (parsed) return parsed;
    const description = String(row.description || '').trim();
    if (description && description !== 'egg-music') return description;
    return fallback;
  }

  function getSearchSources(row: any) {
    const id = getSearchId(row);
    return id ? [`/api/public/music/stream?id=${encodeURIComponent(String(id))}`] : [];
  }

  function playLibraryTrack(row: MusicItem) {
    playTrack({
      id: `music-${row.id}`,
      title: row.isSound ? row.name : getMusicTitle(row),
      subtitle: row.isSound ? (row.description || '音效库') : getMusicArtist(row, '音乐库'),
      sources: getMusicSources(row)
    });
  }

  function playSearchTrack(row: any) {
    const id = getSearchId(row);
    const title = getSearchTitle(row);
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
    >{row.isSound ? row.name : getMusicTitle(row)}</Button>;
  }

  function renderSearchName(row: any) {
    const id = getSearchId(row);
    const title = getSearchTitle(row);
    const active = activeTrackId === `netease-${id}`;
    return <Button
      type="link"
      className={active ? 'admin-track-link admin-track-link-active' : 'admin-track-link'}
      disabled={!getSearchSources(row).length}
      onClick={() => playSearchTrack(row)}
    >{title}</Button>;
  }

  function renderLyricsContent() {
    if (!lyricsOpen) return null;
    return <pre className="admin-lyrics-plain">{lyricsOpen.rawContent || '暂无歌词'}</pre>;
  }

  function openSearchModal() {
    setSearchOpen(true);
    setSearchRows([]);
    setSearchKeyword('');
    setSearchPage(1);
    setSearchHasRun(false);
    setSearchLoading(false);
    searchForm.resetFields();
  }

  async function importSong(row: any) {
    try {
      const id = getSearchId(row);
      const songName = getSearchTitle(row);
      const artist = getSearchArtist(row, '');
      const name = [songName, artist].filter(Boolean).join('-');
      const res = await apiJson<{ jobId: string }>('/api/music/import-netease', 'POST', { neteaseId: id, name, songName, artist, description: artist });
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

  const actionColumn = {
    title: '操作',
    width: 240,
    fixed: 'right' as const,
    render: (_: any, r: MusicItem) => <Space>
      <Button size="small" icon={<EditOutlined />} onClick={() => startEdit(r)}>编辑</Button>
      <Button size="small" disabled={!r.lrcFilename} onClick={() => openLyricsPreview(r)}>查看歌词</Button>
      <Popconfirm title="确认删除？" onConfirm={async () => { await apiJson(`/api/music/delete/${r.id}`, 'DELETE'); message.success('已删除'); load(); }}>
        <Button size="small" danger icon={<DeleteOutlined />}>删除</Button>
      </Popconfirm>
    </Space>
  };

  const songColumns = [
    { title: '歌曲名', dataIndex: 'name', width: 280, ellipsis: true, render: (_: any, r: MusicItem) => renderTrackName(r) },
    { title: '歌手', width: 160, ellipsis: true, render: (_: any, r: MusicItem) => getMusicArtist(r) },
    { title: '来源/备注', dataIndex: 'description', width: 160, ellipsis: true, render: (v: string) => v || '—' },
    { title: '上传时间', width: 170, render: (_: any, r: MusicItem) => dateTime(r.uploadDate || r.uploadedAt) },
    { title: '歌词', width: 86, align: 'center' as const, render: (_: any, r: MusicItem) => r.lrcFilename ? <Tag color="green">有</Tag> : <Tag>无</Tag> },
    actionColumn
  ];

  const soundColumns = [
    { title: '音效名称', dataIndex: 'name', width: 300, ellipsis: true, render: (_: any, r: MusicItem) => renderTrackName(r) },
    { title: '说明', dataIndex: 'description', width: 240, ellipsis: true, render: (v: string) => v || '—' },
    { title: '上传时间', width: 170, render: (_: any, r: MusicItem) => dateTime(r.uploadDate || r.uploadedAt) },
    actionColumn
  ];

  return <Space direction="vertical" size={16} style={{ width: '100%' }}>
    <SectionCard title="音乐资产" description="音乐库、音效库和网易云导入统一管理" extra={<Space><Button icon={<SearchOutlined />} onClick={openSearchModal}>网易云导入</Button><Button icon={<PlusOutlined />} onClick={() => setOpen('sound')}>上传音效</Button><Button type="primary" icon={<PlusOutlined />} onClick={() => setOpen('music')}>上传音乐</Button></Space>}>
      {importing && <Progress percent={Number(importing.percent || 0)} status={importing.status === 'error' ? 'exception' : importing.status === 'done' ? 'success' : 'active'} />}
      {!assetView ? <div className="music-asset-entry-grid">
        <Card size="small" hoverable onClick={() => setAssetView('songs')}>
          <Typography.Text type="secondary">音乐库</Typography.Text>
          <Typography.Title level={3} style={{ margin: '6px 0 0' }}>{songs.length}</Typography.Title>
          <Typography.Text type="secondary">点击查看音乐列表</Typography.Text>
        </Card>
        <Card size="small" hoverable onClick={() => setAssetView('sounds')}>
          <Typography.Text type="secondary">音效库</Typography.Text>
          <Typography.Title level={3} style={{ margin: '6px 0 0' }}>{sounds.length}</Typography.Title>
          <Typography.Text type="secondary">点击查看音效列表</Typography.Text>
        </Card>
      </div> : <>
        <Button style={{ marginBottom: 12 }} onClick={() => setAssetView(null)}>返回资产概览</Button>
        <Tabs activeKey={assetView} onChange={(key) => setAssetView(key as 'songs' | 'sounds')} items={[{ key: 'songs', label: `音乐库 ${songs.length}`, children: <Table className="music-admin-table" rowKey="id" loading={loading} dataSource={songs} columns={songColumns as any} scroll={{ x: 1010 }} /> }, { key: 'sounds', label: `音效库 ${sounds.length}`, children: <Table className="music-admin-table" rowKey="id" loading={loading} dataSource={sounds} columns={soundColumns as any} scroll={{ x: 860 }} /> }]} />
      </>}
    </SectionCard>

    <Drawer title={open === 'sound' ? '上传音效' : '上传音乐'} open={!!open} onClose={() => { setOpen(null); setUploadLoading(false); }} width={560} destroyOnClose>
      <Form form={form} layout="vertical" onFinish={submitUpload}>
        {open === 'music' ? <>
          <Form.Item name="songName" label="歌曲名" rules={[{ required: true, message: '请输入歌曲名' }]}><Input placeholder="例如：慢灵魂" /></Form.Item>
          <Form.Item name="artist" label="歌手名" rules={[{ required: true, message: '请输入歌手名' }]}><Input placeholder="例如：卢广仲" /></Form.Item>
          <Form.Item name="description" label="来源/备注"><Input placeholder="可填写版权来源、导入渠道或内部备注" /></Form.Item>
        </> : <>
          <Form.Item name="name" label="音效名称" rules={[{ required: true, message: '请输入音效名称' }]}><Input /></Form.Item>
          <Form.Item name="description" label="说明"><Input /></Form.Item>
        </>}
        <Form.Item name="file" label="音频文件" valuePropName="fileList" getValueFromEvent={norm} rules={[{ required: true, message: '请选择音频文件' }]}><Upload beforeUpload={() => false} maxCount={1} accept="audio/*"><Button icon={<UploadOutlined />}>选择文件</Button></Upload></Form.Item>
        {open === 'music' && <><Form.Item name="lrcFile" label="LRC 歌词文件" valuePropName="fileList" getValueFromEvent={norm}><Upload beforeUpload={() => false} maxCount={1} accept=".lrc,text/plain"><Button>选择歌词文件</Button></Upload></Form.Item><Form.Item name="lrcContent" label="歌词内容"><Input.TextArea rows={6} /></Form.Item></>}
        {open === 'music' && <Form.Item>
          <Button size="small" loading={searchLyricsLoading} onClick={searchLyricsForUpload}>搜索网易歌词</Button>
          <span style={{ marginLeft: 10, color: '#7b8794', fontSize: 12 }}>用于自动补齐未上传的歌词文件</span>
        </Form.Item>}
        <Button type="primary" htmlType="submit" loading={uploadLoading}>提交</Button>
      </Form>
    </Drawer>

    <Drawer title={editing?.isSound ? '编辑音效' : '编辑音乐'} open={!!editing} onClose={() => { setEditing(null); setSaveLoading(false); }} width={560} destroyOnClose>
      <Form form={editForm} layout="vertical" onFinish={saveEdit} disabled={editLoading}>
        {editing?.isSound ? <>
          <Form.Item name="name" label="音效名称" rules={[{ required: true, message: '请输入音效名称' }]}><Input /></Form.Item>
          <Form.Item name="description" label="说明"><Input /></Form.Item>
        </> : <>
          <Form.Item name="songName" label="歌曲名" rules={[{ required: true, message: '请输入歌曲名' }]}><Input /></Form.Item>
          <Form.Item name="artist" label="歌手名" rules={[{ required: true, message: '请输入歌手名' }]}><Input /></Form.Item>
          <Form.Item name="description" label="来源/备注"><Input /></Form.Item>
          <Form.Item name="lrcFile" label="替换 LRC 文件" valuePropName="fileList" getValueFromEvent={norm}><Upload beforeUpload={() => false} maxCount={1} accept=".lrc,text/plain"><Button>选择歌词文件</Button></Upload></Form.Item>
          <Form.Item
            name="lrcContent"
            label="歌词内容"
            extra={editing?.lrcFilename ? '已自动载入当前歌词，可直接修改后保存。' : '当前未配置歌词，可在这里粘贴 LRC 内容。'}
          >
            <Input.TextArea rows={8} placeholder={editLoading ? '歌词加载中...' : '暂无歌词内容'} />
          </Form.Item>
          <Form.Item>
            <Button size="small" loading={searchLyricsLoading} onClick={searchLyricsForEdit} disabled={!editing}>再次搜索歌词</Button>
            <span style={{ marginLeft: 10, color: '#7b8794', fontSize: 12 }}>用于补齐未有歌词信息的歌曲</span>
          </Form.Item>
        </>}
        <Button type="primary" htmlType="submit" loading={editLoading || saveLoading}>保存</Button>
      </Form>
    </Drawer>

    <Modal title="选择歌词来源" width={860} open={lyricsSearchOpen} onCancel={() => setLyricsSearchOpen(false)} footer={null} destroyOnClose>
      <Space direction="vertical" size={12} className="music-lyrics-picker">
        <Input.Search
          value={lyricsSearchKeyword}
          placeholder="输入歌曲名或歌手重新搜索"
          enterButton="搜索"
          loading={searchLyricsLoading}
          onChange={(e) => setLyricsSearchKeyword(e.target.value)}
          onSearch={(value) => runLyricsSearch(value, lyricsSearchTarget)}
        />
        <Typography.Text type="secondary">当前只负责把你选择的结果歌词写入“歌词内容”，不会自动改歌曲名和歌手。</Typography.Text>
        <Table
          rowKey={(r) => getSearchId(r) || `${getSearchTitle(r)}-${getSearchArtist(r)}-${getSearchAlbum(r)}`}
          loading={searchLyricsLoading}
          dataSource={lyricsSearchRows}
          pagination={false}
          scroll={{ x: 760, y: 360 }}
          columns={[
            { title: '歌曲', render: (_: any, r: any) => getSearchTitle(r) },
            { title: '歌手', width: 180, render: (_: any, r: any) => getSearchArtist(r) },
            { title: '专辑', width: 180, render: (_: any, r: any) => getSearchAlbum(r) },
            { title: '操作', width: 190, fixed: 'right' as const, render: (_: any, r: any) => <Space>
              <Button size="small" onClick={() => openSearchLyricsPreview(r)}>查看歌词</Button>
              <Button size="small" type="primary" loading={applyLyricsId === getSearchId(r)} onClick={() => applyLyricsFromSearch(r)}>使用</Button>
            </Space> }
          ]}
        />
      </Space>
    </Modal>

    <Modal title="网易云音乐导入" width={820} open={searchOpen} onCancel={() => setSearchOpen(false)} footer={null}>
      <Form form={searchForm} layout="inline" onFinish={(v) => search(v, 1)} className="music-search-form"><Form.Item name="keyword" rules={[{ required: true, message: '请输入关键词' }]}><Input placeholder="歌曲或歌手" /></Form.Item><Button type="primary" htmlType="submit" loading={searchLoading}>搜索</Button></Form>
      {searchHasRun ? <>
        <Table
          loading={searchLoading}
          rowKey={(r) => getSearchId(r) || `${getSearchTitle(r)}-${getSearchArtist(r)}`}
          dataSource={searchRows}
          pagination={false}
          columns={[{ title: '歌曲', render: (_: any, r: any) => renderSearchName(r) }, { title: '歌手', render: (_: any, r: any) => getSearchArtist(r) }, { title: '操作', render: (_: any, r: any) => <Space>
            <Button size="small" onClick={() => playSearchTrack(r)}>试听</Button>
            <Button size="small" onClick={() => openSearchLyricsPreview(r)}>查看歌词</Button>
            <Button size="small" type="primary" onClick={() => importSong(r)}>导入</Button>
          </Space> }]}
        />
        {searchRows.length || searchPage > 1 ? <Space style={{ marginTop: 12 }}><Button disabled={searchPage <= 1} onClick={() => search({ keyword: searchKeyword }, searchPage - 1)}>上一页</Button><span>第 {searchPage} 页</span><Button disabled={!searchRows.length} onClick={() => search({ keyword: searchKeyword }, searchPage + 1)}>下一页</Button></Space> : null}
        <div className="music-open-source-credit">
          <Typography.Text strong>开源致谢</Typography.Text>
          <Typography.Text type="secondary">本功能基于开源项目实现，感谢作者。</Typography.Text>
          <a href="https://github.com/Suxiaoqinx/Netease_url" target="_blank" rel="noopener noreferrer">原仓库地址</a>
        </div>
      </> : null}
    </Modal>
    <Modal
      title={lyricsOpen?.title || '歌词'}
      width={760}
      open={!!lyricsOpen?.open}
      onCancel={() => setLyricsOpen(null)}
      footer={null}
      destroyOnClose
    >
      <Spin spinning={!!lyricsOpen?.loading}>
        <div className="admin-lyrics-preview">
          {renderLyricsContent()}
        </div>
      </Spin>
    </Modal>
  </Space>;
}
