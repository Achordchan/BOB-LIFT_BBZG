import { useEffect, useMemo, useState } from 'react';
import { Button, Modal, Slider, Space, Typography, Upload } from 'antd';
import { UploadOutlined } from '@ant-design/icons';

interface CroppedFile {
  file: File;
  previewUrl: string;
}

interface CropUploadProps {
  buttonText: string;
  cropTitle: string;
  fileName: string;
  aspect: number;
  outputWidth: number;
  outputHeight: number;
  value: CroppedFile | null;
  onChange: (value: CroppedFile | null) => void;
}

interface CropSource {
  file: File;
  url: string;
  width: number;
  height: number;
}

const frameWidth = 360;

function readImage(file: File) {
  const url = URL.createObjectURL(file);
  return new Promise<CropSource>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve({ file, url, width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('图片读取失败'));
    };
    image.src = url;
  });
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export type { CroppedFile };

export function ImageCropUpload(props: CropUploadProps) {
  const [source, setSource] = useState<CropSource | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offsetX, setOffsetX] = useState(0);
  const [offsetY, setOffsetY] = useState(0);
  const frameHeight = Math.round(frameWidth / props.aspect);

  const bounds = useMemo(() => {
    if (!source) return { x: 0, y: 0, scale: 1 };
    const baseScale = Math.max(frameWidth / source.width, frameHeight / source.height);
    const renderWidth = source.width * baseScale * zoom;
    const renderHeight = source.height * baseScale * zoom;
    return {
      x: Math.max(0, Math.round((renderWidth - frameWidth) / 2)),
      y: Math.max(0, Math.round((renderHeight - frameHeight) / 2)),
      scale: baseScale * zoom
    };
  }, [frameHeight, source, zoom]);

  useEffect(() => {
    setOffsetX(value => clamp(value, -bounds.x, bounds.x));
    setOffsetY(value => clamp(value, -bounds.y, bounds.y));
  }, [bounds.x, bounds.y]);

  useEffect(() => () => {
    if (source?.url) URL.revokeObjectURL(source.url);
  }, [source?.url]);

  async function openCrop(file: File) {
    if (source?.url) URL.revokeObjectURL(source.url);
    const next = await readImage(file);
    setSource(next);
    setZoom(1);
    setOffsetX(0);
    setOffsetY(0);
  }

  async function confirmCrop() {
    if (!source) return;
    const image = new Image();
    image.src = source.url;
    await image.decode();

    const scaled = bounds.scale;
    const imageLeft = (frameWidth - source.width * scaled) / 2 + offsetX;
    const imageTop = (frameHeight - source.height * scaled) / 2 + offsetY;
    const sourceX = clamp((0 - imageLeft) / scaled, 0, source.width);
    const sourceY = clamp((0 - imageTop) / scaled, 0, source.height);
    const sourceWidth = clamp(frameWidth / scaled, 1, source.width - sourceX);
    const sourceHeight = clamp(frameHeight / scaled, 1, source.height - sourceY);

    const canvas = document.createElement('canvas');
    canvas.width = props.outputWidth;
    canvas.height = props.outputHeight;
    const context = canvas.getContext('2d');
    if (!context) return;
    context.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, props.outputWidth, props.outputHeight);

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(value => value ? resolve(value) : reject(new Error('裁剪失败')), 'image/jpeg', 0.92);
    });
    const previewUrl = URL.createObjectURL(blob);
    if (props.value?.previewUrl) URL.revokeObjectURL(props.value.previewUrl);
    props.onChange({ file: new File([blob], props.fileName, { type: 'image/jpeg' }), previewUrl });
    URL.revokeObjectURL(source.url);
    setSource(null);
  }

  function cancelCrop() {
    if (source?.url) URL.revokeObjectURL(source.url);
    setSource(null);
  }

  return <div className="image-crop-upload">
    <Space align="center" size={12} wrap>
      {props.value ? <img className="image-crop-thumb" src={props.value.previewUrl} alt="已裁剪预览" /> : null}
      <Upload
        accept="image/*"
        showUploadList={false}
        beforeUpload={(file) => {
          openCrop(file).catch(error => Modal.error({ title: '照片读取失败', content: error.message }));
          return Upload.LIST_IGNORE;
        }}
      >
        <Button icon={<UploadOutlined />}>{props.value ? '重新选择' : props.buttonText}</Button>
      </Upload>
      {props.value ? <Typography.Text type="secondary">已裁剪</Typography.Text> : null}
    </Space>
    <Modal title={props.cropTitle} open={!!source} width={560} onCancel={cancelCrop} onOk={confirmCrop} okText="使用裁剪结果" cancelText="取消" destroyOnClose>
      {source ? <Space direction="vertical" size={16} style={{ width: '100%' }}>
        <div className="image-crop-stage" style={{ width: frameWidth, height: frameHeight }}>
          <img
            src={source.url}
            alt="裁剪预览"
            style={{
              width: source.width * bounds.scale,
              height: source.height * bounds.scale,
              transform: `translate(${offsetX}px, ${offsetY}px)`
            }}
          />
        </div>
        <div className="image-crop-controls">
          <Typography.Text>缩放</Typography.Text>
          <Slider min={1} max={3} step={0.01} value={zoom} onChange={setZoom} />
          <Typography.Text>左右位置</Typography.Text>
          <Slider min={-bounds.x} max={bounds.x} step={1} value={offsetX} onChange={setOffsetX} disabled={!bounds.x} />
          <Typography.Text>上下位置</Typography.Text>
          <Slider min={-bounds.y} max={bounds.y} step={1} value={offsetY} onChange={setOffsetY} disabled={!bounds.y} />
        </div>
      </Space> : null}
    </Modal>
  </div>;
}
