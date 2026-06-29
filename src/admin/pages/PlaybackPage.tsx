import { useEffect, useMemo, useState } from 'react';
import { App, Button, Card, Form, Input, List, Popconfirm, Progress, Radio, Select, Space, Tabs, Upload } from 'antd';
import { DeleteOutlined, PlayCircleOutlined, UploadOutlined } from '@ant-design/icons';
import { apiForm, apiGet, apiJson, audioUrl } from '../api';
import { SectionCard } from '../components/SectionCard';
import type { MusicItem } from '../types';

export default function PlaybackPage() {
  const { message } = App.useApp();
  const [music, setMusic] = useState<MusicItem[]>([]);
  const [defaultSong, setDefaultSong] = useState<any>(null);
  const [startup, setStartup] = useState<any>({ mode: 'default', audioPath: '/music/Go.mp3' });
  const [personalized, setPersonalized] = useState<any[]>([]);
  const [cleanup, setCleanup] = useState<any[]>([]);
  const [defaultForm] = Form.useForm();
  const [inquiryForm] = Form.useForm();
  const [startupForm] = Form.useForm();
  const [personForm] = Form.useForm();
  const [ttsForm] = Form.useForm();
  const soundOptions = useMemo(() => music.map(m => ({ label: `${m.isSound ? '音效' : '音乐'} · ${m.name}`, value: m.id })), [music]);
  const norm = (e: any) => Array.isArray(e) ? e : e?.fileList;

  async function load() {
    try {
      const [m, d, i, s, p, t] = await Promise.all([
        apiGet<{ music: MusicItem[] }>('/api/music'), apiGet('/api/defaultBattleSong'), apiGet('/api/inquiries/config'), apiGet('/api/startup-audio'), apiJson<{ items: any[] }>('/api/personalized/list', 'POST', {}), apiGet('/api/aliyun-tts-config')
      ]);
      setMusic((m as any).music || []); setDefaultSong((d as any).defaultBattleSong || null); setStartup(s); setPersonalized((p as any).items || []);
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
  async function saveInquiry(values: any) { try { await apiJson('/api/inquiries/config', 'POST', values); message.success('询盘音效已保存'); load(); } catch (e: any) { message.error(e.message || '保存失败'); } }
  async function saveStartup(values: any) { try { await apiJson('/api/startup-audio', 'POST', values); message.success('启动音频已保存'); load(); } catch (e: any) { message.error(e.message || '保存失败'); } }
  async function uploadStartup(values: any) {
    const file = values.upload?.[0]?.originFileObj;
    if (!file) { message.warning('请选择启动音频文件'); return; }
    const fd = new FormData();
    fd.append('startupAudioFile', file);
    try {
      const res = await apiForm('/api/startup-audio/upload', fd);
      startupForm.setFieldsValue({ mode: 'file', audioPath: (res as any).audioPath });
      message.success('启动音频已上传');
    } catch (e: any) {
      message.error(e.message || '上传失败');
    }
  }
  async function firePersonalized(audioPath: string) {
    try {
      await apiJson('/api/personalized/fire', 'POST', { audioPath });
      message.success('已发射');
    } catch (e: any) {
      message.error(e.message || '发射失败');
    }
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
  function previewAudio(audioPath: string) {
    new Audio(audioPath).play().catch(() => message.error('预览失败'));
  }
  async function saveTts(values: any) { try { await apiJson('/api/aliyun-tts-config', 'POST', values); message.success('TTS 配置已保存'); load(); } catch (e: any) { message.error(e.message || '保存失败'); } }
  async function scanCleanup() { try { const res = await apiJson<{ items: any[] }>('/api/audio-cleanup/scan', 'POST', {}); setCleanup((res as any).items || []); } catch (e: any) { message.error(e.message || '扫描失败'); } }

  return <Tabs items={[
    { key: 'battle', label: '默认战歌', children: <SectionCard title="默认战歌" description="用户未配置专属音乐时使用"><Space direction="vertical" style={{ width: '100%' }}>{defaultSong ? <Card size="small"><Space direction="vertical"><b>{defaultSong.name || '默认战歌'}</b>{defaultSong.filename && <audio controls preload="none" src={audioUrl(defaultSong.filename)} />}<Popconfirm title="确认移除默认战歌？" onConfirm={async () => { await apiJson('/api/defaultBattleSong/delete', 'DELETE'); message.success('已移除'); load(); }}><Button danger>移除默认战歌</Button></Popconfirm></Space></Card> : <Card>尚未设置默认战歌</Card>}<Form form={defaultForm} layout="inline" onFinish={uploadDefault}><Form.Item name="file" valuePropName="fileList" getValueFromEvent={norm}><Upload beforeUpload={() => false} maxCount={1} accept="audio/*"><Button icon={<UploadOutlined />}>选择文件</Button></Upload></Form.Item><Button type="primary" htmlType="submit">上传</Button></Form></Space></SectionCard> },
    { key: 'inquiry', label: '询盘音效', children: <SectionCard title="询盘音效配置" description="新增或减少询盘时触发不同音效"><Form form={inquiryForm} layout="vertical" onFinish={saveInquiry}><Form.Item name="addInquiryMusicId" label="新增询盘音效"><Select allowClear options={soundOptions} /></Form.Item><Form.Item name="reduceInquiryMusicId" label="减少询盘音效"><Select allowClear options={soundOptions} /></Form.Item><Button type="primary" htmlType="submit">保存配置</Button></Form></SectionCard> },
    { key: 'tts', label: '语音播报', children: <SectionCard title="阿里云 TTS 配置" description="AccessKey Secret 已脱敏，保留 ****** 时不会覆盖原密钥"><Form form={ttsForm} layout="vertical" onFinish={saveTts}><div className="form-grid"><Form.Item name="url" label="服务地址"><Input /></Form.Item><Form.Item name="appKey" label="AppKey"><Input /></Form.Item><Form.Item name="accessKeyId" label="AccessKey ID"><Input /></Form.Item><Form.Item name="accessKeySecret" label="AccessKey Secret"><Input.Password /></Form.Item><Form.Item name="voice" label="音色"><Input /></Form.Item><Form.Item name="format" label="格式"><Select options={[{ value: 'mp3' }, { value: 'wav' }]} /></Form.Item><Form.Item name="sampleRate" label="采样率"><Input type="number" /></Form.Item><Form.Item name="volume" label="音量"><Input type="number" /></Form.Item><Form.Item name="speechRate" label="语速"><Input type="number" /></Form.Item><Form.Item name="pitchRate" label="音调"><Input type="number" /></Form.Item></div><Space><Button type="primary" htmlType="submit">保存 TTS 配置</Button><Button onClick={async () => { try { await apiJson('/api/test-aliyun-tts', 'POST', {}); message.success('Token 测试通过'); } catch (e: any) { message.error(e.message || '测试失败'); } }}>测试 Token</Button></Space></Form></SectionCard> },
    { key: 'startup', label: '启动音频', children: <SectionCard title="启动音频" description="首页启动时播放的默认、TTS 或上传音频"><Form form={startupForm} layout="vertical" onFinish={saveStartup}><Form.Item name="mode" label="模式"><Radio.Group options={[{ label: '默认', value: 'default' }, { label: 'TTS', value: 'tts' }, { label: '文件', value: 'file' }]} /></Form.Item><Form.Item name="audioPath" label="音频路径"><Input /></Form.Item><Form.Item name="ttsText" label="TTS 文本"><Input.TextArea rows={3} /></Form.Item><Form.Item name="upload" label="上传启动音频" valuePropName="fileList" getValueFromEvent={norm}><Upload beforeUpload={() => false} maxCount={1} accept="audio/*"><Button icon={<UploadOutlined />}>选择文件</Button></Upload></Form.Item><Space><Button onClick={() => uploadStartup(startupForm.getFieldsValue())}>先上传文件</Button><Button type="primary" htmlType="submit">保存启动配置</Button></Space></Form>{startup?.audioPath && <audio controls src={startup.audioPath} />}</SectionCard> },
    {
      key: 'personalized',
      label: '个性化',
      children: (
        <SectionCard title="个性化音频" description="保存常用音频，可预览并立即发射到首页">
          <Space direction="vertical" size={16} style={{ width: '100%' }}>
            <Form form={personForm} layout="inline" onFinish={addPersonalized}>
              <Form.Item name="name" rules={[{ required: true }]}><Input placeholder="名称" /></Form.Item>
              <Form.Item name="audioPath" rules={[{ required: true }]}><Input placeholder="/music/custom/xxx.mp3" /></Form.Item>
              <Button type="primary" htmlType="submit">按路径添加</Button>
            </Form>
            <Form form={personForm} layout="inline" onFinish={uploadPersonalized}>
              <Form.Item name="uploadName" rules={[{ required: true }]}><Input placeholder="上传音频名称" /></Form.Item>
              <Form.Item name="personalizedFile" valuePropName="fileList" getValueFromEvent={norm} rules={[{ required: true }]}>
                <Upload beforeUpload={() => false} maxCount={1} accept="audio/*"><Button icon={<UploadOutlined />}>选择音频</Button></Upload>
              </Form.Item>
              <Button htmlType="submit">上传新增</Button>
            </Form>
            <Form form={personForm} layout="inline" onFinish={addPersonalizedFromTts}>
              <Form.Item name="ttsName" rules={[{ required: true }]}><Input placeholder="TTS 音频名称" /></Form.Item>
              <Form.Item name="ttsText" rules={[{ required: true }]}><Input placeholder="TTS 文本" /></Form.Item>
              <Button htmlType="submit">TTS 生成新增</Button>
            </Form>
            <List dataSource={personalized} locale={{ emptyText: '暂无个性化音频' }} renderItem={(item) => <List.Item actions={[<Button onClick={() => previewAudio(item.audioPath)}>预览</Button>, <Button icon={<PlayCircleOutlined />} onClick={() => firePersonalized(item.audioPath)}>发射</Button>]}><List.Item.Meta title={item.name} description={item.audioPath} /></List.Item>} />
          </Space>
        </SectionCard>
      )
    },
    { key: 'cleanup', label: '音频清理', children: <SectionCard title="音频清理" description="只允许清理未被引用的 TTS 和 custom 音频"><Button onClick={scanCleanup}>扫描可清理文件</Button><List style={{ marginTop: 16 }} dataSource={cleanup} locale={{ emptyText: '暂无可清理文件' }} renderItem={(item) => <List.Item actions={[<Popconfirm title="确认删除该音频？" onConfirm={async () => { const res = await apiJson('/api/audio-cleanup/delete', 'POST', { audioPath: item.audioPath }); setCleanup((res as any).items || []); message.success('已删除'); }}><Button danger icon={<DeleteOutlined />}>删除</Button></Popconfirm>]}><List.Item.Meta title={item.audioPath} description={`${item.sizeKb || 0} KB`} /></List.Item>} /></SectionCard> }
  ]} />;
}
