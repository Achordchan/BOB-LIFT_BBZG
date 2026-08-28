import { useEffect, useMemo, useState } from 'react';
import { App, Button, Card, Form, Grid, Input, List, Popconfirm, Radio, Select, Space, Table, Tabs, Tag, Typography, Upload } from 'antd';
import { CloudUploadOutlined, DeleteOutlined, PlayCircleOutlined, PlusOutlined, SoundOutlined, UploadOutlined } from '@ant-design/icons';
import { apiForm, apiGet, apiJson, audioUrl, dateTime } from '../api';
import { SectionCard } from '../components/SectionCard';
import type { MusicItem, PlayAdminTrackInput } from '../types';

interface PlaybackPageProps {
  playTrack: (track: PlayAdminTrackInput) => void;
  activeTrackId?: string;
}

export default function PlaybackPage({ playTrack, activeTrackId }: PlaybackPageProps) {
  const { message } = App.useApp();
  const [music, setMusic] = useState<MusicItem[]>([]);
  const [defaultSong, setDefaultSong] = useState<any>(null);
  const [startup, setStartup] = useState<any>({ mode: 'default', audioPath: '/music/Go.mp3' });
  const [personalized, setPersonalized] = useState<any[]>([]);
  const [cleanup, setCleanup] = useState<any[]>([]);
  const [cleanupScanned, setCleanupScanned] = useState(false);
  const [personalizedCreateOpen, setPersonalizedCreateOpen] = useState(false);
  const screens = Grid.useBreakpoint();
  const isMobile = !screens.md;
  const [defaultForm] = Form.useForm();
  const [defaultSelectForm] = Form.useForm();
  const [inquiryForm] = Form.useForm();
  const [startupForm] = Form.useForm();
  const [uploadPersonForm] = Form.useForm();
  const [ttsPersonForm] = Form.useForm();
  const [libraryPersonForm] = Form.useForm();
  const [ttsForm] = Form.useForm();
  const [personalizedSubmitting, setPersonalizedSubmitting] = useState<'upload' | 'tts' | 'library' | null>(null);
  const startupMode = Form.useWatch('mode', startupForm) || startup?.mode || 'default';
  const startupAudioPath = Form.useWatch('audioPath', startupForm) || startup?.audioPath || '/music/Go.mp3';
  const soundOptions = useMemo(() => music.map(m => ({ label: `${m.isSound ? '音效' : '音乐'} · ${m.name}`, value: m.id })), [music]);
  const battleSongOptions = useMemo(() => music.filter(m => !m.isSound).map(m => ({ label: m.name, value: m.id })), [music]);
  const startupMusicOptions = useMemo(() => music.filter(m => !m.isSound && m.filename).map(m => ({ label: m.name, value: m.id })), [music]);
  const startupAudioMeta = useMemo(() => {
    if (startupMode === 'default') return { title: '系统默认启动音频', type: '默认策略', color: 'blue' };
    const matched = music.find(m => m.filename && audioUrl(m.filename) === startupAudioPath);
    if (matched) return { title: matched.name, type: '音乐库', color: 'green' };
    if (String(startupAudioPath || '').includes('/music/tts/')) return { title: 'TTS 语音播报', type: '语音生成', color: 'purple' };
    if (String(startupAudioPath || '').includes('/music/custom/')) return { title: '上传音频文件', type: '上传文件', color: 'cyan' };
    return { title: '已配置启动音频', type: '音频文件', color: 'default' };
  }, [music, startupAudioPath, startupMode]);
  const norm = (e: any) => Array.isArray(e) ? e : e?.fileList;

  async function load() {
    try {
      const [m, d, i, s, p, t] = await Promise.all([
        apiGet<{ music: MusicItem[] }>('/api/music'), apiGet('/api/defaultBattleSong'), apiGet('/api/inquiries/config'), apiGet('/api/startup-audio'), apiJson<{ items: any[] }>('/api/personalized/list', 'POST', {}), apiGet('/api/aliyun-tts-config')
      ]);
      const loadedMusic = (m as any).music || [];
      const loadedDefault = (d as any).defaultBattleSong || null;
      setMusic(loadedMusic); setDefaultSong(loadedDefault); setStartup(s); setPersonalized((p as any).items || []);
      defaultSelectForm.setFieldsValue({ musicId: loadedDefault?.musicId });
      inquiryForm.setFieldsValue((i as any).inquiryConfig || {}); startupForm.setFieldsValue(s); ttsForm.setFieldsValue((t as any).config || {});
    } catch (e: any) { message.error(e.message || '配置加载失败'); }
  }
  useEffect(() => { load(); }, []);

  async function uploadDefault(values: any) {
    const file = values.file?.[0]?.originFileObj;
    if (!file) return message.warning('请选择默认战歌文件');
    const fd = new FormData(); fd.append('battleSongFile', file);
    try { await apiForm('/api/defaultBattleSong/upload', fd); message.success('默认战歌已上传'); defaultForm.resetFields(); load(); }
    catch (e: any) { message.error(e.message || '上传失败'); }
  }
  async function selectDefault(values: any) {
    if (!values.musicId) return message.warning('请选择音乐库中的战歌');
    try { await apiJson('/api/defaultBattleSong/select', 'POST', { musicId: values.musicId }); message.success('默认战歌已保存'); load(); }
    catch (e: any) { message.error(e.message || '保存失败'); }
  }
  async function saveInquiry(values: any) { try { await apiJson('/api/inquiries/config', 'POST', values); message.success('询盘音效已保存'); load(); } catch (e: any) { message.error(e.message || '保存失败'); } }
  function buildStartupPayload(values: any) {
    const mode = values.mode || 'default';
    const payload = { mode, audioPath: values.audioPath || '/music/Go.mp3', ttsText: values.ttsText || '' };
    if (mode === 'default') payload.audioPath = '/music/Go.mp3';
    return payload;
  }
  async function saveStartup(values: any) {
    const payload = buildStartupPayload(values);
    if (payload.mode !== 'default' && !payload.audioPath) { message.warning('请先选择或生成启动音频'); return; }
    try { await apiJson('/api/startup-audio', 'POST', payload); message.success('启动音频已保存'); load(); } catch (e: any) { message.error(e.message || '保存失败'); }
  }
  async function uploadStartup(values: any) {
    const file = values.upload?.[0]?.originFileObj;
    if (!file) { message.warning('请选择启动音频文件'); return; }
    const fd = new FormData();
    fd.append('startupAudioFile', file);
    try {
      const res = await apiForm('/api/startup-audio/upload', fd);
      const payload = { mode: 'file', audioPath: (res as any).audioPath, ttsText: values.ttsText || '' };
      startupForm.setFieldsValue(payload);
      await apiJson('/api/startup-audio', 'POST', payload);
      message.success('上传完成，启动音频已保存');
      load();
    } catch (e: any) {
      message.error(e.message || '上传失败');
    }
  }
  async function generateStartupTts() {
    const values = startupForm.getFieldsValue();
    const text = String(values.ttsText || '').trim();
    if (!text) { message.warning('请输入 TTS 播报文案'); return; }
    try {
      const res = await apiJson('/api/text-to-speech', 'POST', { text });
      const payload = { mode: 'tts', audioPath: (res as any).audioPath, ttsText: text };
      startupForm.setFieldsValue(payload);
      await apiJson('/api/startup-audio', 'POST', payload);
      message.success('TTS 已生成，启动音频已保存');
      load();
    } catch (e: any) { message.error(e.message || '生成失败'); }
  }
  function selectStartupMusic(musicId?: string) {
    if (!musicId) return;
    const selected = music.find(m => m.id === musicId);
    if (!selected?.filename) return;
    startupForm.setFieldsValue({ mode: 'file', audioPath: audioUrl(selected.filename) });
  }
  async function firePersonalized(audioPath: string) {
    try {
      await apiJson('/api/personalized/fire', 'POST', { audioPath });
      message.success('已发射');
    } catch (e: any) {
      message.error(e.message || '发射失败');
    }
  }
  async function deletePersonalized(id: string) {
    try {
      await apiJson(`/api/personalized/delete/${id}`, 'DELETE');
      message.success('已删除');
      load();
    } catch (e: any) { message.error(e.message || '删除失败'); }
  }
  function personalizedSource(item: any) {
    if (item.source === 'upload') return { label: '上传音频', color: 'cyan' };
    if (item.source === 'tts' || String(item.audioPath || '').includes('/music/tts/')) return { label: 'TTS 生成', color: 'purple' };
    if (
      item.source === 'library'
      || (item.audioPath && music.some(m => m.filename && audioUrl(m.filename) === item.audioPath))
    ) return { label: '音乐库', color: 'green' };
    return { label: '路径添加', color: 'default' };
  }
  function isTrackActive(trackId: string) { return activeTrackId === trackId; }
  function playTrackWithId(trackId: string, title: string, subtitle: string, sourcePath?: string) {
    if (!sourcePath) return;
    playTrack({ id: trackId, title, subtitle, sources: [sourcePath] });
  }
  function playDefaultSong() {
    if (!defaultSong?.filename) return;
    playTrackWithId(`default-song-${defaultSong.id || defaultSong.filename}`, defaultSong.name || '默认战歌', '默认战歌', audioUrl(defaultSong.filename));
  }
  function playStartupAudio() {
    if (!startupAudioPath) return;
    playTrackWithId(`startup-audio-${startupAudioPath}`, '启动音频', startupAudioMeta.type, startupAudioPath);
  }
  function playPersonalized(item: any) {
    if (!item?.audioPath) return;
    playTrackWithId(`personalized-${item.id || item.audioPath}`, '个性化音频', item.name || '未命名音频', item.audioPath);
  }
  function playCleanupItem(item: any) {
    if (!item?.audioPath) return;
    playTrackWithId(`cleanup-${item.id || item.audioPath}`, '音频清理预览', item.audioPath || '', item.audioPath);
  }
  function onLibraryMusicChange(musicId?: string) {
    if (!musicId) return;
    const selected = music.find(m => m.id === musicId);
    if (!selected) return;
    const currentName = String(libraryPersonForm.getFieldValue('name') || '').trim();
    if (!currentName && selected.name) {
      libraryPersonForm.setFieldsValue({ name: selected.name });
    }
  }
  async function addPersonalizedFromLibrary(values: any) {
    const name = String(values.name || '').trim();
    const selected = music.find(m => m.id === values.musicId);
    if (!name) { message.warning('请输入音频名称'); return; }
    if (!selected?.filename) { message.warning('请选择音乐库中的音频'); return; }
    try {
      setPersonalizedSubmitting('library');
      await apiJson('/api/personalized/add', 'POST', { name, audioPath: audioUrl(selected.filename), source: 'library' });
      message.success('已添加');
      libraryPersonForm.resetFields();
      setPersonalizedCreateOpen(false);
      load();
    } catch (e: any) {
      message.error(e.message || '添加失败');
    } finally {
      setPersonalizedSubmitting(null);
    }
  }
  async function uploadPersonalized(values: any) {
    const file = values.personalizedFile?.[0]?.originFileObj;
    const name = String(values.uploadName || '').trim();
    if (!name) { message.warning('请输入音频名称'); return; }
    if (!file) { message.warning('请选择音频文件'); return; }
    const fd = new FormData();
    fd.append('name', name);
    fd.append('personalizedAudioFile', file);
    try {
      setPersonalizedSubmitting('upload');
      await apiForm('/api/personalized/upload', fd);
      message.success('个性化音频已上传');
      uploadPersonForm.resetFields();
      setPersonalizedCreateOpen(false);
      load();
    } catch (e: any) { message.error(e.message || '上传失败'); } finally { setPersonalizedSubmitting(null); }
  }
  async function addPersonalizedFromTts(values: any) {
    const name = String(values.ttsName || '').trim();
    const text = String(values.ttsText || '').trim();
    if (!name || !text) { message.warning('请输入名称和 TTS 文本'); return; }
    try {
      setPersonalizedSubmitting('tts');
      const res = await apiJson('/api/text-to-speech', 'POST', { text });
      const audioPath = (res as any).audioPath;
      if (!audioPath) throw new Error('TTS 接口未返回音频地址');
      await apiJson('/api/personalized/add', 'POST', { name, audioPath, source: 'tts', ttsText: text });
      message.success('TTS 个性化音频已添加');
      ttsPersonForm.resetFields();
      setPersonalizedCreateOpen(false);
      load();
    } catch (e: any) { message.error(e.message || '生成失败'); } finally { setPersonalizedSubmitting(null); }
  }
  async function saveTts(values: any) { try { await apiJson('/api/aliyun-tts-config', 'POST', values); message.success('TTS 配置已保存'); load(); } catch (e: any) { message.error(e.message || '保存失败'); } }
  async function scanCleanup() { try { const res = await apiJson<{ items: any[] }>('/api/audio-cleanup/scan', 'POST', {}); setCleanup((res as any).items || []); setCleanupScanned(true); } catch (e: any) { message.error(e.message || '扫描失败'); } }

  const startupBlock = (
    <div className="startup-block">
      <div className="pb-current">
        <div className="pb-current-info">
          <Typography.Text type="secondary">当前</Typography.Text>
          <Typography.Text strong ellipsis>{startupAudioMeta.title}</Typography.Text>
          <Tag color={startupAudioMeta.color}>{startupAudioMeta.type}</Tag>
        </div>
        <Button size="small" type={isTrackActive(`startup-audio-${startupAudioPath}`) ? 'primary' : 'default'} icon={<PlayCircleOutlined />} onClick={playStartupAudio}>
          {isTrackActive(`startup-audio-${startupAudioPath}`) ? '播放中' : '试听'}
        </Button>
      </div>
      <Form form={startupForm} layout="vertical" onFinish={saveStartup} className="pb-form">
        <div className="pb-inline-row">
          <Form.Item name="mode" label="播放策略">
            <Radio.Group optionType="button" buttonStyle="solid" className="startup-mode-group" options={[{ label: '系统默认', value: 'default' }, { label: '语音播报', value: 'tts' }, { label: '音频文件', value: 'file' }]} />
          </Form.Item>
          <Button type="primary" htmlType="submit">保存启动配置</Button>
        </div>
        <Form.Item name="audioPath" hidden><Input /></Form.Item>
        {startupMode === 'file' && (
          <div className="pb-inline-row">
            <Form.Item label="从音乐库选择">
              <Select showSearch allowClear optionFilterProp="label" placeholder="选择一首已有音乐" options={startupMusicOptions} onChange={selectStartupMusic} />
            </Form.Item>
            <Form.Item name="upload" label="或上传音频" valuePropName="fileList" getValueFromEvent={norm}>
              <Upload beforeUpload={() => false} maxCount={1} accept="audio/*" className="pb-upload"><Button icon={<UploadOutlined />} block>选择音频文件</Button></Upload>
            </Form.Item>
            <Button icon={<CloudUploadOutlined />} onClick={() => uploadStartup(startupForm.getFieldsValue())}>上传并启用</Button>
          </div>
        )}
        {startupMode === 'tts' && (
          <div className="pb-inline-row pb-inline-row-top">
            <Form.Item name="ttsText" label="播报文案">
              <Input.TextArea rows={2} placeholder="输入首页打开时要播报的内容" />
            </Form.Item>
            <Button icon={<SoundOutlined />} onClick={generateStartupTts}>生成并启用</Button>
          </div>
        )}
        {startupMode === 'default' && <Typography.Text type="secondary">使用系统内置启动声，无需额外配置。</Typography.Text>}
      </Form>
    </div>
  );

  return <Tabs items={[
    {
      key: 'playback',
      label: '播放设置',
      children: (
        <div className="playback-grid">
          <section className="pb-card">
            <header className="pb-card-head">
              <span className="pb-card-title">默认战歌</span>
              <span className="pb-card-sub">用户未配置专属音乐时自动使用</span>
            </header>
            <div className="pb-card-body">
              <div className="pb-current">
                {defaultSong ? (
                  <>
                    <div className="pb-current-info">
                      <Typography.Text strong ellipsis>{defaultSong.name || '默认战歌'}</Typography.Text>
                      <Tag color="blue">当前</Tag>
                    </div>
                    <Space size={6}>
                      <Button size="small" type={isTrackActive(`default-song-${defaultSong.id || defaultSong.filename}`) ? 'primary' : 'default'} icon={<PlayCircleOutlined />} disabled={!defaultSong.filename} onClick={playDefaultSong}>{isTrackActive(`default-song-${defaultSong.id || defaultSong.filename}`) ? '播放中' : (defaultSong.filename ? '试听' : '无音频')}</Button>
                      <Popconfirm title="确认移除默认战歌？" onConfirm={async () => { await apiJson('/api/defaultBattleSong/delete', 'DELETE'); message.success('已移除'); load(); }}><Button size="small" danger>移除</Button></Popconfirm>
                    </Space>
                  </>
                ) : <Typography.Text type="secondary">当前未设置默认战歌</Typography.Text>}
              </div>
              <Form form={defaultSelectForm} layout="vertical" onFinish={selectDefault} className="pb-form">
                <div className="pb-inline-row">
                  <Form.Item name="musicId" label="从音乐库选择" rules={[{ required: true, message: '请选择音乐库中的战歌' }]}>
                    <Select showSearch optionFilterProp="label" placeholder="选择一首已有音乐" options={battleSongOptions} />
                  </Form.Item>
                  <Button type="primary" htmlType="submit">保存</Button>
                </div>
              </Form>
              <Form form={defaultForm} layout="vertical" onFinish={uploadDefault} className="pb-form">
                <div className="pb-inline-row">
                  <Form.Item name="file" label="上传新文件" valuePropName="fileList" getValueFromEvent={norm}>
                    <Upload beforeUpload={() => false} maxCount={1} accept="audio/*" className="pb-upload"><Button icon={<UploadOutlined />} block>选择文件</Button></Upload>
                  </Form.Item>
                  <Button htmlType="submit">上传并设为默认</Button>
                </div>
              </Form>
            </div>
          </section>

          <section className="pb-card">
            <header className="pb-card-head">
              <span className="pb-card-title">询盘音效</span>
              <span className="pb-card-sub">新增或减少询盘时触发不同音效</span>
            </header>
            <div className="pb-card-body">
              <Form form={inquiryForm} layout="vertical" onFinish={saveInquiry} className="pb-form">
                <div className="pb-field-grid">
                  <Form.Item name="addInquiryMusicId" label="新增询盘音效"><Select allowClear options={soundOptions} placeholder="选择触发音效" /></Form.Item>
                  <Form.Item name="reduceInquiryMusicId" label="减少询盘音效"><Select allowClear options={soundOptions} placeholder="选择触发音效" /></Form.Item>
                </div>
                <div className="pb-form-foot"><Button type="primary" htmlType="submit">保存配置</Button></div>
              </Form>
            </div>
          </section>

          <section className="pb-card pb-span-2">
            <header className="pb-card-head">
              <span className="pb-card-title">启动音频</span>
              <span className="pb-card-sub">首页打开时的启动声</span>
            </header>
            <div className="pb-card-body">{startupBlock}</div>
          </section>
        </div>
      )
    },
    {
      key: 'personalized',
      label: '个性化',
      children: (
        <SectionCard title="个性化音频" description="预设临时音频，需要时一键推送到首页播放">
          <Space direction="vertical" size={18} style={{ width: '100%' }}>
            {!personalizedCreateOpen ? <Button type="primary" icon={<PlusOutlined />} onClick={() => setPersonalizedCreateOpen(true)}>新增音频</Button> : <Card size="small" className="personalized-create-card" title="新增音频" extra={<Button onClick={() => { setPersonalizedCreateOpen(false); uploadPersonForm.resetFields(); ttsPersonForm.resetFields(); libraryPersonForm.resetFields(); }}>收起</Button>}>
              <Tabs
                size="small"
                items={[
                  {
                    key: 'upload',
                    label: '上传文件',
                    children: (
                      <Form form={uploadPersonForm} layout="inline" className="personalized-inline-form" onFinish={uploadPersonalized} onFinishFailed={() => message.warning('请补全上传音频信息')}>
                        <Form.Item name="uploadName" label="名称" rules={[{ required: true, message: '请输入音频名称' }]}><Input placeholder="例如：Roaix 登顶" /></Form.Item>
                        <Form.Item name="personalizedFile" label="音频文件" valuePropName="fileList" getValueFromEvent={norm} rules={[{ required: true, message: '请选择音频文件' }]}> 
                          <Upload beforeUpload={() => false} maxCount={1} accept="audio/*"><Button icon={<UploadOutlined />}>选择音频</Button></Upload>
                        </Form.Item>
                        <Button type="primary" htmlType="submit" loading={personalizedSubmitting === 'upload'}>上传新增</Button>
                      </Form>
                    )
                  },
                  {
                    key: 'tts',
                    label: 'TTS 生成',
                    children: (
                      <Form form={ttsPersonForm} layout="inline" className="personalized-inline-form" onFinish={addPersonalizedFromTts} onFinishFailed={() => message.warning('请补全 TTS 生成信息')}>
                        <Form.Item name="ttsName" label="名称" rules={[{ required: true, message: '请输入音频名称' }]}><Input placeholder="例如：临时播报" /></Form.Item>
                        <Form.Item name="ttsText" label="播报文案" rules={[{ required: true, message: '请输入播报文案' }]}><Input placeholder="输入要播报的内容" /></Form.Item>
                        <Button type="primary" htmlType="submit" loading={personalizedSubmitting === 'tts'}>生成新增</Button>
                      </Form>
                    )
                  },
                  {
                    key: 'library',
                    label: '音乐库选择',
                    children: (
                      <Form form={libraryPersonForm} layout="inline" className="personalized-inline-form" onFinish={addPersonalizedFromLibrary} onFinishFailed={() => message.warning('请补全音乐库选择信息')}>
                        <Form.Item name="name" label="名称" rules={[{ required: true, message: '请输入名称' }]}><Input placeholder="音频名称" /></Form.Item>
                        <Form.Item name="musicId" label="从音乐库选择" rules={[{ required: true, message: '请选择音乐库中的音频' }]}>
                          <Select
                            showSearch
                            allowClear
                            optionFilterProp="label"
                            placeholder="选择一首已有音乐"
                            options={startupMusicOptions}
                            onChange={onLibraryMusicChange}
                            style={{ minWidth: 220 }}
                          />
                        </Form.Item>
                        <Button type="primary" htmlType="submit" loading={personalizedSubmitting === 'library'}>添加</Button>
                      </Form>
                    )
                  }
                ]}
              />
            </Card>}
            {!isMobile ? <Table
              rowKey="id"
              className="personalized-table"
              dataSource={personalized}
              pagination={false}
              locale={{ emptyText: '暂无个性化音频' }}
              columns={[
                { title: '音频名称', dataIndex: 'name', render: (name: string, item: any) => <Space direction="vertical" size={2}><Typography.Text strong>{name}</Typography.Text><Typography.Text type="secondary" className="personalized-meta">{dateTime(item.createdAt)}</Typography.Text></Space> },
                { title: '来源', width: 120, render: (_: any, item: any) => { const src = personalizedSource(item); return <Tag color={src.color}>{src.label}</Tag>; } },
                { title: '试听', width: 250, render: (_: any, item: any) => (
                  <Button
                    size="small"
                    type={isTrackActive(`personalized-${item.id || item.audioPath}`) ? 'primary' : 'default'}
                    icon={<PlayCircleOutlined />}
                    disabled={!item.audioPath}
                    onClick={() => playPersonalized(item)}
                  >
                    {isTrackActive(`personalized-${item.id || item.audioPath}`) ? '正在播放' : (item.audioPath ? '试听' : '无音频')}
                  </Button>
                ) },
                { title: '操作', width: 190, render: (_: any, item: any) => <Space><Button size="small" icon={<PlayCircleOutlined />} onClick={() => firePersonalized(item.audioPath)}>发射</Button><Popconfirm title="确认删除该音频？" onConfirm={() => deletePersonalized(item.id)}><Button size="small" danger icon={<DeleteOutlined />}>删除</Button></Popconfirm></Space> }
              ]}
            /> : <List
              className="personalized-mobile-list"
              dataSource={personalized}
              locale={{ emptyText: '暂无个性化音频' }}
              renderItem={(item: any) => {
                const src = personalizedSource(item);
                return <List.Item>
                  <Card size="small" style={{ width: '100%' }}>
                    <Space direction="vertical" size={10} style={{ width: '100%' }}>
                      <Space style={{ width: '100%', justifyContent: 'space-between' }} align="start">
                        <Space direction="vertical" size={2}><Typography.Text strong>{item.name}</Typography.Text><Typography.Text type="secondary" className="personalized-meta">{dateTime(item.createdAt)}</Typography.Text></Space>
                        <Tag color={src.color}>{src.label}</Tag>
                      </Space>
                      <Button
                        type={isTrackActive(`personalized-${item.id || item.audioPath}`) ? 'primary' : 'default'}
                        icon={<PlayCircleOutlined />}
                        disabled={!item.audioPath}
                        onClick={() => playPersonalized(item)}
                      >
                        {isTrackActive(`personalized-${item.id || item.audioPath}`) ? '正在播放' : (item.audioPath ? '试听' : '无音频')}
                      </Button>
                      <Space><Button size="small" icon={<PlayCircleOutlined />} onClick={() => firePersonalized(item.audioPath)}>发射</Button><Popconfirm title="确认删除该音频？" onConfirm={() => deletePersonalized(item.id)}><Button size="small" danger icon={<DeleteOutlined />}>删除</Button></Popconfirm></Space>
                    </Space>
                  </Card>
                </List.Item>;
              }}
            />}
          </Space>
        </SectionCard>
      )
    },
    {
      key: 'tts-maintenance',
      label: '语音与维护',
      children: (
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          <SectionCard title="阿里云 TTS 配置">
            <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>AccessKey Secret 已脱敏，保留 ****** 时不会覆盖原密钥</Typography.Text>
            <Form form={ttsForm} layout="vertical" onFinish={saveTts}>
              <div className="form-grid">
                <Form.Item name="url" label="服务地址"><Input /></Form.Item>
                <Form.Item name="appKey" label="AppKey"><Input /></Form.Item>
                <Form.Item name="accessKeyId" label="AccessKey ID"><Input /></Form.Item>
                <Form.Item name="accessKeySecret" label="AccessKey Secret"><Input.Password /></Form.Item>
                <Form.Item name="voice" label="音色"><Input /></Form.Item>
                <Form.Item name="format" label="格式"><Select options={[{ value: 'mp3' }, { value: 'wav' }]} /></Form.Item>
                <Form.Item name="sampleRate" label="采样率"><Input type="number" /></Form.Item>
                <Form.Item name="volume" label="音量"><Input type="number" /></Form.Item>
                <Form.Item name="speechRate" label="语速"><Input type="number" /></Form.Item>
                <Form.Item name="pitchRate" label="音调"><Input type="number" /></Form.Item>
              </div>
              <Space>
                <Button type="primary" htmlType="submit">保存 TTS 配置</Button>
                <Button onClick={async () => { try { await apiJson('/api/test-aliyun-tts', 'POST', {}); message.success('Token 测试通过'); } catch (e: any) { message.error(e.message || '测试失败'); } }}>测试 Token</Button>
              </Space>
            </Form>
          </SectionCard>
          <SectionCard title="音频清理">
            <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>只允许清理未被引用的 TTS 和 custom 音频</Typography.Text>
            <Button onClick={scanCleanup}>扫描可清理文件</Button>
            {cleanupScanned ? <List
              style={{ marginTop: 16 }}
              dataSource={cleanup}
              locale={{ emptyText: '暂无可清理文件' }}
              renderItem={(item) => <List.Item actions={[
                <Popconfirm title="确认删除该音频？" onConfirm={async () => { const res = await apiJson('/api/audio-cleanup/delete', 'POST', { audioPath: item.audioPath }); setCleanup((res as any).items || []); setCleanupScanned(true); message.success('已删除'); }}><Button danger icon={<DeleteOutlined />}>删除</Button></Popconfirm>
              ]}>
                <List.Item.Meta
                  title={<Typography.Text strong>{item.audioPath}</Typography.Text>}
                  description={<Space direction="vertical" size={8} style={{ width: '100%' }}>
                    <Typography.Text type="secondary">{item.sizeKb || 0} KB</Typography.Text>
                    <Button
                      size="small"
                      type={isTrackActive(`cleanup-${item.id || item.audioPath}`) ? 'primary' : 'default'}
                      icon={<PlayCircleOutlined />}
                      disabled={!item.audioPath}
                      onClick={() => playCleanupItem(item)}
                    >
                      {isTrackActive(`cleanup-${item.id || item.audioPath}`) ? '正在播放' : (item.audioPath ? '试听' : '无音频')}
                    </Button>
                  </Space>}
                />
              </List.Item>}
            /> : null}
          </SectionCard>
        </Space>
      )
    }
  ]} />;
}
