import { useEffect, useRef, useState } from 'react';
import { App, Avatar, Button, Drawer, Form, Input, Modal, Popconfirm, Select, Space, Table, Tag } from 'antd';
import { DeleteOutlined, EditOutlined, PlusOutlined, UploadOutlined, ArrowUpOutlined, ArrowDownOutlined, SoundOutlined, PauseCircleOutlined } from '@ant-design/icons';
import { apiForm, apiGet, apiJson, audioUrl } from '../api';
import { ImageCropUpload, type CroppedFile } from '../components/ImageCropUpload';
import { SectionCard } from '../components/SectionCard';
import type { MusicItem, UserItem } from '../types';

export default function UsersPage() {
  const { message } = App.useApp();
  const [users, setUsers] = useState<UserItem[]>([]);
  const [music, setMusic] = useState<MusicItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<UserItem | null>(null);
  const [photoOpen, setPhotoOpen] = useState<UserItem | null>(null);
  const [previewingMusicId, setPreviewingMusicId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [halfPhoto, setHalfPhoto] = useState<CroppedFile | null>(null);
  const [fullPhoto, setFullPhoto] = useState<CroppedFile | null>(null);
  const [form] = Form.useForm();
  const [photoForm] = Form.useForm();

  async function load() {
    setLoading(true);
    try {
      const [u, m] = await Promise.all([apiGet<{ users: UserItem[] }>('/api/users'), apiGet<{ music: MusicItem[] }>('/api/music')]);
      setUsers((u as any).users || []);
      setMusic(((m as any).music || []).filter((x: MusicItem) => !x.isSound));
    } catch (e: any) { message.error(e.message || '用户加载失败'); }
    finally { setLoading(false); }
  }
  useEffect(() => {
    load();
    return () => { audioRef.current?.pause(); };
  }, []);

  function startAdd() { setEditing(null); form.resetFields(); setOpen(true); }
  function startEdit(user: UserItem) { setEditing(user); form.setFieldsValue({ ...user, loginPassword: '' }); setOpen(true); }

  async function submit(values: any) {
    try {
      if (editing) {
        await apiJson(`/api/users/update/${editing.id}`, 'PUT', values);
        message.success('用户已更新');
      } else {
        await apiJson('/api/users/add', 'POST', values);
        message.success('用户已添加');
      }
      setOpen(false); load();
    } catch (e: any) { message.error(e.message || '保存失败'); }
  }

  function clearSelectedPhotos() {
    if (halfPhoto) URL.revokeObjectURL(halfPhoto.previewUrl);
    if (fullPhoto) URL.revokeObjectURL(fullPhoto.previewUrl);
    setHalfPhoto(null);
    setFullPhoto(null);
  }

  function closePhotoModal() {
    setPhotoOpen(null);
    clearSelectedPhotos();
    photoForm.resetFields();
  }

  async function uploadPhoto() {
    if (!photoOpen) return;
    const formData = new FormData();
    if (halfPhoto) formData.append('userPhoto', halfPhoto.file);
    if (fullPhoto) formData.append('userFullPhoto', fullPhoto.file);
    if (!halfPhoto && !fullPhoto) { message.warning('请先选择并裁剪照片'); return; }
    try {
      await apiForm(`/api/users/${photoOpen.id}/photo`, formData);
      message.success('照片已上传'); closePhotoModal(); load();
    } catch (e: any) { message.error(e.message || '上传失败'); }
  }

  async function move(user: UserItem, direction: 'up' | 'down') {
    try { await apiJson('/api/users/update-sort', 'POST', { userId: user.id, direction }); load(); }
    catch (e: any) { message.error(e.message || '排序失败'); }
  }

  function getUserMusic(user: UserItem) {
    return music.find(item => item.id === user.musicId) || music.find(item => item.name === user.musicName) || null;
  }

  function getPreviewSources(song: MusicItem) {
    const sources = [];
    if (song.filename) sources.push(audioUrl(song.filename));
    const sourceId = (song as any).sourceId;
    if (sourceId) sources.push(`/api/public/music/stream?id=${encodeURIComponent(String(sourceId))}`);
    return Array.from(new Set(sources));
  }

  function playPreviewSources(song: MusicItem, sources: string[], index = 0) {
    const source = sources[index];
    if (!source) {
      setPreviewingMusicId(null);
      message.error('试听失败');
      return;
    }

    const audio = new Audio(source);
    audioRef.current = audio;
    setPreviewingMusicId(song.id);
    audio.onended = () => setPreviewingMusicId(null);
    audio.onerror = () => playPreviewSources(song, sources, index + 1);
    audio.play().catch(() => playPreviewSources(song, sources, index + 1));
  }

  function previewMusic(user: UserItem) {
    const song = getUserMusic(user);
    if (!song) {
      message.warning('当前战歌没有可试听文件');
      return;
    }

    if (previewingMusicId === song.id) {
      audioRef.current?.pause();
      setPreviewingMusicId(null);
      return;
    }

    const sources = getPreviewSources(song);
    if (!sources.length) {
      message.warning('当前战歌没有可试听文件');
      return;
    }

    audioRef.current?.pause();
    playPreviewSources(song, sources);
  }

  function renderUserMusic(user: UserItem) {
    const song = getUserMusic(user);
    if (!user.musicName) return <Tag>未配置</Tag>;
    return <Space size={6} wrap>
      <Tag color="blue">{user.musicName}</Tag>
      <Button
        size="small"
        icon={song?.id && previewingMusicId === song.id ? <PauseCircleOutlined /> : <SoundOutlined />}
        disabled={!song?.filename}
        onClick={() => previewMusic(user)}
      >{song?.id && previewingMusicId === song.id ? '停止' : '试听'}</Button>
    </Space>;
  }


  return <SectionCard title="用户管理" description="维护团队成员、登录账号、照片和专属成交战歌" extra={<Button type="primary" icon={<PlusOutlined />} onClick={startAdd}>添加用户</Button>}>
    <Table rowKey="id" loading={loading} dataSource={users} pagination={{ pageSize: 10 }} columns={[
      { title: '成员', render: (_, r) => <Space><Avatar src={(r as any).photoUrl}>{r.name?.[0]}</Avatar><span>{r.name}</span></Space> },
      { title: '职位', dataIndex: 'position' },
      { title: '专属战歌', render: (_, r) => renderUserMusic(r) },
      { title: '登录账号', render: (_, r) => r.hasLogin || r.loginUsername ? <Tag color="green">已启用</Tag> : <Tag>未启用</Tag> },
      { title: '排序', render: (_, r) => <Space><Button size="small" icon={<ArrowUpOutlined />} onClick={() => move(r, 'up')} /><Button size="small" icon={<ArrowDownOutlined />} onClick={() => move(r, 'down')} /></Space> },
      { title: '操作', width: 260, render: (_, r) => <Space wrap>
        <Button size="small" icon={<EditOutlined />} onClick={() => startEdit(r)}>编辑</Button>
        <Button size="small" icon={<UploadOutlined />} onClick={() => { clearSelectedPhotos(); setPhotoOpen(r); }}>照片</Button>
        <Popconfirm title="确认删除该用户？" onConfirm={async () => { await apiJson(`/api/users/delete/${r.id}`, 'DELETE'); message.success('已删除'); load(); }}><Button size="small" danger icon={<DeleteOutlined />}>删除</Button></Popconfirm>
      </Space> }
    ]} />

    <Drawer width={520} title={editing ? '编辑用户' : '添加用户'} open={open} onClose={() => setOpen(false)} destroyOnClose>
      <Form form={form} layout="vertical" onFinish={submit}>
        <Form.Item name="name" label="用户名称" rules={[{ required: true, message: '请输入用户名称' }]}><Input /></Form.Item>
        <Form.Item name="position" label="用户职位" rules={[{ required: true, message: '请输入用户职位' }]}><Input /></Form.Item>
        <Form.Item name="musicId" label="专属成交音乐"><Select allowClear showSearch optionFilterProp="label" options={music.map(m => ({ label: m.name, value: m.id }))} /></Form.Item>
        <Form.Item name="loginUsername" label="登录账号"><Input placeholder={editing ? '留空则关闭成员登录' : '可选，填写后启用成员登录'} /></Form.Item>
        <Form.Item name="loginPassword" label="登录密码"><Input.Password placeholder={editing ? '不填写则不修改' : '可选'} /></Form.Item>
        <Space><Button type="primary" htmlType="submit">保存</Button><Button onClick={() => setOpen(false)}>取消</Button></Space>
      </Form>
    </Drawer>

    <Modal title={`上传照片：${photoOpen?.name || ''}`} open={!!photoOpen} onCancel={closePhotoModal} footer={null} destroyOnClose>
      <Form form={photoForm} layout="vertical" onFinish={uploadPhoto}>
        <Form.Item label="半身照">
          <ImageCropUpload buttonText="选择半身照" cropTitle="裁剪半身照" fileName="cropped-user-photo.jpg" aspect={1} outputWidth={900} outputHeight={900} value={halfPhoto} onChange={setHalfPhoto} />
        </Form.Item>
        <Form.Item label="全身照">
          <ImageCropUpload buttonText="选择全身照" cropTitle="裁剪全身照" fileName="cropped-user-full-photo.jpg" aspect={2 / 3} outputWidth={800} outputHeight={1200} value={fullPhoto} onChange={setFullPhoto} />
        </Form.Item>
        <Space><Button type="primary" htmlType="submit">上传</Button><Button onClick={closePhotoModal}>取消</Button></Space>
      </Form>
    </Modal>
  </SectionCard>;
}
