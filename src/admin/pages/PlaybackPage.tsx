import { useEffect, useMemo, useState } from 'react';
import { App, Button, Card, Form, Input, List, Popconfirm, Radio, Select, Space, Table, Tabs, Tag, Typography, Upload } from 'antd';
import { CloudUploadOutlined, DeleteOutlined, PlayCircleOutlined, SoundOutlined, UploadOutlined } from '@ant-design/icons';
import { apiForm, apiGet, apiJson, audioUrl, dateTime } from '../api';
import { SectionCard } from '../components/SectionCard';
import { AdminAudioPlayer } from '../components/AdminAudioPlayer';
import type { MusicItem } from '../types';

export default function PlaybackPage() {
  const { message } = App.useApp();
  const [music, setMusic] = useState<MusicItem[]>([]);
  const [defaultSong, setDefaultSong] = useState<any>(null);
  const [startup, setStartup] = useState<any>({ mode: 'default', audioPath: '/music/Go.mp3' });
  const [personalized, setPersonalized] = useState<any[]>([]);
  const [cleanup, setCleanup] = useState<any[]>([]);
  const [defaultForm] = Form.useForm();
  const [defaultSelectForm] = Form.useForm();
  const [inquiryForm] = Form.useForm();
  const [startupForm] = Form.useForm();
  const [personForm] = Form.useForm();
  const [ttsForm] = Form.useForm();
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
    return { label: '路径添加', color: 'default' };
  }
  async function addPersonalized(values: any) { try { await apiJson('/api/personalized/add', 'POST', values); message.success('已添加'); personForm.resetFields(); load(); } catch (e: any) { message.error(e.message || '添加失败'); } }
  async function uploadPersonalized(values: any) {
    const file = values.personalizedFile?.[0]?.originFileObj;
    const name = String(values.uploadName || '').trim();
    if (!name) { message.warning('请输入音频名称'); return; }
    if (!file) { message.warning('请选择音频文件'); return; }
    const fd = new FormData();
    fd.append('name', name);
    fd.append('personalizedAudioFile', file);
    try {
      await apiForm('/api/personalized/upload', fd);
      message.success('个性化音频已上传');
      personForm.resetFields(['uploadName', 'personalizedFile']);
      load();
    } catch (e: any) { message.error(e.message || '上传失败'); }
  }
  async function addPersonalizedFromTts(values: any) {
    const name = String(values.ttsName || '').trim();
    const text = String(values.ttsText || '').trim();
    if (!name || !text) { message.warning('请输入名称和 TTS 文本'); return; }
    try {
      const res = await apiJson('/api/text-to-speech', 'POST', { text });
      await apiJson('/api/personalized/add', 'POST', { name, audioPath: (res as any).audioPath, source: 'tts', ttsText: text });
      message.success('TTS 个性化音频已添加');
      personForm.resetFields(['ttsName', 'ttsText']);
      load();
    } catch (e: any) { message.error(e.message || '生成失败'); }
  }
  async function saveTts(values: any) { try { await apiJson('/api/aliyun-tts-config', 'POST', values); message.success('TTS 配置已保存'); load(); } catch (e: any) { message.error(e.message || '保存失败'); } }
  async function scanCleanup() { try { const res = await apiJson<{ items: any[] }>('/api/audio-cleanup/scan', 'POST', {}); setCleanup((res as any).items || []); } catch (e: any) { message.error(e.message || '扫描失败'); } }

  return <Tabs items={[
    {
      key: 'battle',
      label: '默认战歌',
      children: (
        <SectionCard title="默认战歌" description="用户未配置专属音乐时自动使用">
          <Space direction="vertical" size={16} style={{ width: '100%' }}>
            <Card size="small" className="playback-current-card">
              {defaultSong ? (
                <Space direction="vertical" size={10} style={{ width: '100%' }}>
                  <Typography.Text strong>{defaultSong.name || '默认战歌'}</Typography.Text>
                  {defaultSong.filename ? <AdminAudioPlayer sources={[audioUrl(defaultSong.filename)]} onError={() => message.error('试听失败')} /> : null}
                  <Popconfirm title="确认移除默认战歌？" onConfirm={async () => { await apiJson('/api/defaultBattleSong/delete', 'DELETE'); message.success('已移除'); load(); }}>
                    <Button danger>移除默认战歌</Button>
                  </Popconfirm>
                </Space>
              ) : (
                <Typography.Text type="secondary">当前未设置默认战歌</Typography.Text>
              )}
            </Card>
            <Form form={defaultSelectForm} className="playback-inline-form" layout="inline" onFinish={selectDefault}>
              <Form.Item name="musicId" label="从音乐库选择" className="playback-default-select-item" rules={[{ required: true, message: '请选择音乐库中的战歌' }]}>
                <Select showSearch optionFilterProp="label" placeholder="选择一首已有音乐" options={battleSongOptions} />
              </Form.Item>
              <Button type="primary" htmlType="submit">保存默认战歌</Button>
            </Form>
            <Form form={defaultForm} className="playback-inline-form" layout="inline" onFinish={uploadDefault}>
              <Form.Item name="file" label="上传新文件" valuePropName="fileList" getValueFromEvent={norm}>
                <Upload beforeUpload={() => false} maxCount={1} accept="audio/*"><Button icon={<UploadOutlined />}>选择文件</Button></Upload>
              </Form.Item>
              <Button htmlType="submit">上传并设为默认</Button>
            </Form>
          </Space>
        </SectionCard>
      )
    },
    { key: 'inquiry', label: '询盘音效', children: <SectionCard title="询盘音效配置" description="新增或减少询盘时触发不同音效"><Form form={inquiryForm} layout="vertical" onFinish={saveInquiry}><Form.Item name="addInquiryMusicId" label="新增询盘音效"><Select allowClear options={soundOptions} /></Form.Item><Form.Item name="reduceInquiryMusicId" label="减少询盘音效"><Select allowClear options={soundOptions} /></Form.Item><Button type="primary" htmlType="submit">保存配置</Button></Form></SectionCard> },
    { key: 'tts', label: '语音播报', children: <SectionCard title="阿里云 TTS 配置" description="AccessKey Secret 已脱敏，保留 ****** 时不会覆盖原密钥"><Form form={ttsForm} layout="vertical" onFinish={saveTts}><div className="form-grid"><Form.Item name="url" label="服务地址"><Input /></Form.Item><Form.Item name="appKey" label="AppKey"><Input /></Form.Item><Form.Item name="accessKeyId" label="AccessKey ID"><Input /></Form.Item><Form.Item name="accessKeySecret" label="AccessKey Secret"><Input.Password /></Form.Item><Form.Item name="voice" label="音色"><Input /></Form.Item><Form.Item name="format" label="格式"><Select options={[{ value: 'mp3' }, { value: 'wav' }]} /></Form.Item><Form.Item name="sampleRate" label="采样率"><Input type="number" /></Form.Item><Form.Item name="volume" label="音量"><Input type="number" /></Form.Item><Form.Item name="speechRate" label="语速"><Input type="number" /></Form.Item><Form.Item name="pitchRate" label="音调"><Input type="number" /></Form.Item></div><Space><Button type="primary" htmlType="submit">保存 TTS 配置</Button><Button onClick={async () => { try { await apiJson('/api/test-aliyun-tts', 'POST', {}); message.success('Token 测试通过'); } catch (e: any) { message.error(e.message || '测试失败'); } }}>测试 Token</Button></Space></Form></SectionCard> },
    {
      key: 'startup',
      label: '启动音频',
      children: (
        <SectionCard title="启动音频" description="管理首页打开时的启动声">
          <div className="startup-config-layout">
            <Card className="startup-preview-card" bordered={false}>
              <Space direction="vertical" size={14} style={{ width: '100%' }}>
                <div className="startup-preview-icon"><SoundOutlined /></div>
                <div>
                  <Typography.Text type="secondary">当前启动音频</Typography.Text>
                  <Typography.Title level={4} style={{ margin: '4px 0 0' }}>{startupAudioMeta.title}</Typography.Title>
                </div>
                <Tag color={startupAudioMeta.color}>{startupAudioMeta.type}</Tag>
                <AdminAudioPlayer sources={[startupAudioPath]} onError={() => message.error('试听失败')} />
              </Space>
            </Card>
            <Form form={startupForm} layout="vertical" onFinish={saveStartup} className="startup-config-form">
              <Form.Item name="mode" label="播放策略">
                <Radio.Group optionType="button" buttonStyle="solid" className="startup-mode-group" options={[{ label: '系统默认', value: 'default' }, { label: '语音播报', value: 'tts' }, { label: '音频文件', value: 'file' }]} />
              </Form.Item>
              <Form.Item name="audioPath" hidden><Input /></Form.Item>
              {startupMode === 'file' && (
                <div className="startup-option-panel">
                  <Form.Item label="从音乐库选择">
                    <Select showSearch allowClear optionFilterProp="label" placeholder="选择一首已有音乐" options={startupMusicOptions} onChange={selectStartupMusic} />
                  </Form.Item>
                  <Form.Item name="upload" label="上传启动音频" valuePropName="fileList" getValueFromEvent={norm}>
                    <Upload beforeUpload={() => false} maxCount={1} accept="audio/*"><Button icon={<UploadOutlined />}>选择音频文件</Button></Upload>
                  </Form.Item>
                  <Button icon={<CloudUploadOutlined />} onClick={() => uploadStartup(startupForm.getFieldsValue())}>上传并设为启动音频</Button>
                </div>
              )}
              {startupMode === 'tts' && (
                <div className="startup-option-panel">
                  <Form.Item name="ttsText" label="播报文案">
                    <Input.TextArea rows={4} placeholder="输入首页打开时要播报的内容" />
                  </Form.Item>
                  <Button icon={<SoundOutlined />} onClick={generateStartupTts}>生成并设为启动音频</Button>
                </div>
              )}
              {startupMode === 'default' && <div className="startup-option-panel"><Typography.Text type="secondary">使用系统内置启动声，无需填写文件地址。</Typography.Text></div>}
              <Button type="primary" htmlType="submit">保存启动配置</Button>
            </Form>
          </div>
        </SectionCard>
      )
    },
    {
      key: 'personalized',
      label: '个性化',
      children: (
        <SectionCard title="个性化音频" description="预设临时音频，需要时一键推送到首页播放">
          <Space direction="vertical" size={18} style={{ width: '100%' }}>
            <Card size="small" className="personalized-create-card" title="新增音频">
              <Tabs
                size="small"
                items={[
                  {
                    key: 'upload',
                    label: '上传文件',
                    children: (
                      <Form form={personForm} layout="inline" className="personalized-inline-form" onFinish={uploadPersonalized}>
                        <Form.Item name="uploadName" label="名称" rules={[{ required: true, message: '请输入音频名称' }]}><Input placeholder="例如：Roaix 登顶" /></Form.Item>
                        <Form.Item name="personalizedFile" label="音频文件" valuePropName="fileList" getValueFromEvent={norm} rules={[{ required: true, message: '请选择音频文件' }]}>
                          <Upload beforeUpload={() => false} maxCount={1} accept="audio/*"><Button icon={<UploadOutlined />}>选择音频</Button></Upload>
                        </Form.Item>
                        <Button type="primary" htmlType="submit">上传新增</Button>
                      </Form>
                    )
                  },
                  {
                    key: 'tts',
                    label: 'TTS 生成',
                    children: (
                      <Form form={personForm} layout="inline" className="personalized-inline-form" onFinish={addPersonalizedFromTts}>
                        <Form.Item name="ttsName" label="名称" rules={[{ required: true, message: '请输入音频名称' }]}><Input placeholder="例如：临时播报" /></Form.Item>
                        <Form.Item name="ttsText" label="播报文案" rules={[{ required: true, message: '请输入播报文案' }]}><Input placeholder="输入要播报的内容" /></Form.Item>
                        <Button type="primary" htmlType="submit">生成新增</Button>
                      </Form>
                    )
                  },
                  {
                    key: 'path',
                    label: '高级路径',
                    children: (
                      <Form form={personForm} layout="inline" className="personalized-inline-form" onFinish={addPersonalized}>
                        <Form.Item name="name" label="名称" rules={[{ required: true, message: '请输入名称' }]}><Input placeholder="音频名称" /></Form.Item>
                        <Form.Item name="audioPath" label="内部文件" rules={[{ required: true, message: '请输入内部文件地址' }]}><Input placeholder="/music/custom/xxx.mp3" /></Form.Item>
                        <Button type="primary" htmlType="submit">添加</Button>
                      </Form>
                    )
                  }
                ]}
              />
            </Card>
            <Table
              rowKey="id"
              className="personalized-table"
              dataSource={personalized}
              pagination={false}
              locale={{ emptyText: '暂无个性化音频' }}
              columns={[
                { title: '音频名称', dataIndex: 'name', render: (name: string, item: any) => <Space direction="vertical" size={2}><Typography.Text strong>{name}</Typography.Text><Typography.Text type="secondary" className="personalized-meta">{dateTime(item.createdAt)}</Typography.Text></Space> },
                { title: '来源', width: 120, render: (_: any, item: any) => { const src = personalizedSource(item); return <Tag color={src.color}>{src.label}</Tag>; } },
                { title: '试听', width: 250, render: (_: any, item: any) => <AdminAudioPlayer compact sources={[item.audioPath]} onError={() => message.error('试听失败')} /> },
                { title: '操作', width: 190, render: (_: any, item: any) => <Space><Button size="small" icon={<PlayCircleOutlined />} onClick={() => firePersonalized(item.audioPath)}>发射</Button><Popconfirm title="确认删除该音频？" onConfirm={() => deletePersonalized(item.id)}><Button size="small" danger icon={<DeleteOutlined />}>删除</Button></Popconfirm></Space> }
              ]}
            />
            <List
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
                      <AdminAudioPlayer sources={[item.audioPath]} onError={() => message.error('试听失败')} />
                      <Space><Button size="small" icon={<PlayCircleOutlined />} onClick={() => firePersonalized(item.audioPath)}>发射</Button><Popconfirm title="确认删除该音频？" onConfirm={() => deletePersonalized(item.id)}><Button size="small" danger icon={<DeleteOutlined />}>删除</Button></Popconfirm></Space>
                    </Space>
                  </Card>
                </List.Item>;
              }}
            />
          </Space>
        </SectionCard>
      )
    },
    { key: 'cleanup', label: '音频清理', children: <SectionCard title="音频清理" description="只允许清理未被引用的 TTS 和 custom 音频"><Button onClick={scanCleanup}>扫描可清理文件</Button><List style={{ marginTop: 16 }} dataSource={cleanup} locale={{ emptyText: '暂无可清理文件' }} renderItem={(item) => <List.Item actions={[<Popconfirm title="确认删除该音频？" onConfirm={async () => { const res = await apiJson('/api/audio-cleanup/delete', 'POST', { audioPath: item.audioPath }); setCleanup((res as any).items || []); message.success('已删除'); }}><Button danger icon={<DeleteOutlined />}>删除</Button></Popconfirm>]}><List.Item.Meta title={item.audioPath} description={`${item.sizeKb || 0} KB`} /></List.Item>} /></SectionCard> }
  ]} />;
}
