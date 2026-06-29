import { useEffect, useState } from 'react';
import { App, Avatar, Button, Drawer, Form, Input, Modal, Popconfirm, Select, Space, Table, Tag, Upload } from 'antd';
import { DeleteOutlined, EditOutlined, PlusOutlined, UploadOutlined, ArrowUpOutlined, ArrowDownOutlined } from '@ant-design/icons';
import { apiForm, apiGet, apiJson } from '../api';
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
  useEffect(() => { load(); }, []);

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

  async function uploadPhoto(values: any) {
    if (!photoOpen) return;
    const formData = new FormData();
    const half = values.userPhoto?.[0]?.originFileObj;
    const full = values.userFullPhoto?.[0]?.originFileObj;
    if (half) formData.append('userPhoto', half);
    if (full) formData.append('userFullPhoto', full);
    if (!half && !full) { message.warning('请选择照片'); return; }
    try {
      await apiForm(`/api/users/${photoOpen.id}/photo`, formData);
      message.success('照片已上传'); setPhotoOpen(null); photoForm.resetFields(); load();
    } catch (e: any) { message.error(e.message || '上传失败'); }
  }

  async function move(user: UserItem, direction: 'up' | 'down') {
    try { await apiJson('/api/users/update-sort', 'POST', { userId: user.id, direction }); load(); }
    catch (e: any) { message.error(e.message || '排序失败'); }
  }

  const uploadNorm = (e: any) => Array.isArray(e) ? e : e?.fileList;

  return <SectionCard title="用户管理" description="维护团队成员、登录账号、照片和专属成交战歌" extra={<Button type="primary" icon={<PlusOutlined />} onClick={startAdd}>添加用户</Button>}>
    <Table rowKey="id" loading={loading} dataSource={users} pagination={{ pageSize: 10 }} columns={[
      { title: '成员', render: (_, r) => <Space><Avatar src={(r as any).photoUrl}>{r.name?.[0]}</Avatar><span>{r.name}</span></Space> },
      { title: '职位', dataIndex: 'position' },
      { title: '专属战歌', dataIndex: 'musicName', render: (v) => v ? <Tag color="blue">{v}</Tag> : <Tag>未配置</Tag> },
      { title: '登录账号', render: (_, r) => r.hasLogin || r.loginUsername ? <Tag color="green">已启用</Tag> : <Tag>未启用</Tag> },
      { title: '排序', render: (_, r) => <Space><Button size="small" icon={<ArrowUpOutlined />} onClick={() => move(r, 'up')} /><Button size="small" icon={<ArrowDownOutlined />} onClick={() => move(r, 'down')} /></Space> },
      { title: '操作', width: 260, render: (_, r) => <Space wrap>
        <Button size="small" icon={<EditOutlined />} onClick={() => startEdit(r)}>编辑</Button>
        <Button size="small" icon={<UploadOutlined />} onClick={() => setPhotoOpen(r)}>照片</Button>
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

    <Modal title={`上传照片：${photoOpen?.name || ''}`} open={!!photoOpen} onCancel={() => setPhotoOpen(null)} footer={null} destroyOnClose>
      <Form form={photoForm} layout="vertical" onFinish={uploadPhoto}>
        <Form.Item name="userPhoto" label="半身照" valuePropName="fileList" getValueFromEvent={uploadNorm}><Upload beforeUpload={() => false} maxCount={1} accept="image/*"><Button icon={<UploadOutlined />}>选择半身照</Button></Upload></Form.Item>
        <Form.Item name="userFullPhoto" label="全身照" valuePropName="fileList" getValueFromEvent={uploadNorm}><Upload beforeUpload={() => false} maxCount={1} accept="image/*"><Button icon={<UploadOutlined />}>选择全身照</Button></Upload></Form.Item>
        <Button type="primary" htmlType="submit">上传</Button>
      </Form>
    </Modal>
  </SectionCard>;
}
