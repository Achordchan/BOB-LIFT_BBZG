import { useEffect, useRef, useState } from 'react';
import { Button, Modal, Space, Typography, Upload } from 'antd';
import { UploadOutlined } from '@ant-design/icons';
import ReactCrop, { centerCrop, makeAspectCrop, type Crop, type PixelCrop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';

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
  currentUrl?: string;
  currentLabel?: string;
  replaceButtonText?: string;
  onChange: (value: CroppedFile | null) => void;
}

interface CropSource {
  file: File;
  url: string;
}

function centerAspectCrop(width: number, height: number, aspect: number) {
  return centerCrop(
    makeAspectCrop({ unit: '%', width: 82 }, aspect, width, height),
    width,
    height
  );
}

function readImage(file: File) {
  const url = URL.createObjectURL(file);
  return new Promise<CropSource>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve({ file, url });
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('图片读取失败'));
    };
    image.src = url;
  });
}

async function canvasPreview(image: HTMLImageElement, crop: PixelCrop, width: number, height: number) {
  const canvas = document.createElement('canvas');
  const scaleX = image.naturalWidth / image.width;
  const scaleY = image.naturalHeight / image.height;
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('裁剪失败');

  context.imageSmoothingQuality = 'high';
  context.drawImage(
    image,
    crop.x * scaleX,
    crop.y * scaleY,
    crop.width * scaleX,
    crop.height * scaleY,
    0,
    0,
    width,
    height
  );

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(value => value ? resolve(value) : reject(new Error('裁剪失败')), 'image/jpeg', 0.92);
  });
}

export type { CroppedFile };

export function ImageCropUpload(props: CropUploadProps) {
  const imageRef = useRef<HTMLImageElement | null>(null);
  const [source, setSource] = useState<CropSource | null>(null);
  const [crop, setCrop] = useState<Crop>();
  const [completedCrop, setCompletedCrop] = useState<PixelCrop>();

  useEffect(() => () => {
    if (source?.url) URL.revokeObjectURL(source.url);
  }, [source?.url]);

  async function openCrop(file: File) {
    if (source?.url) URL.revokeObjectURL(source.url);
    const next = await readImage(file);
    setSource(next);
    setCrop(undefined);
    setCompletedCrop(undefined);
  }

  async function confirmCrop() {
    if (!source || !imageRef.current || !completedCrop?.width || !completedCrop?.height) return;
    const blob = await canvasPreview(imageRef.current, completedCrop, props.outputWidth, props.outputHeight);
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

  const previewUrl = props.value?.previewUrl || props.currentUrl || '';
  const buttonText = props.value ? '重新选择' : props.currentUrl ? (props.replaceButtonText || '替换照片') : props.buttonText;

  return <div className="image-crop-upload">
    <Space align="center" size={12} wrap>
      {previewUrl ? <img className="image-crop-thumb" src={previewUrl} alt={props.value ? '新裁剪预览' : '当前照片'} /> : null}
      <Upload
        accept="image/*"
        showUploadList={false}
        beforeUpload={(file) => {
          openCrop(file).catch(error => Modal.error({ title: '照片读取失败', content: error.message }));
          return Upload.LIST_IGNORE;
        }}
      >
        <Button icon={<UploadOutlined />}>{buttonText}</Button>
      </Upload>
      {props.value ? <Typography.Text type="secondary">已选择新裁剪</Typography.Text> : props.currentUrl ? <Typography.Text type="secondary">{props.currentLabel || '当前照片'}</Typography.Text> : null}
    </Space>
    <Modal title={props.cropTitle} open={!!source} width={720} onCancel={cancelCrop} onOk={confirmCrop} okText="使用裁剪结果" cancelText="取消" destroyOnClose>
      {source ? <Space direction="vertical" size={12} style={{ width: '100%' }}>
        <Typography.Text type="secondary">拖拽或缩放选区，确认后生成后台使用照片。</Typography.Text>
        <div className="image-crop-modern-stage">
          <ReactCrop
            crop={crop}
            aspect={props.aspect}
            minWidth={80}
            minHeight={80 / props.aspect}
            keepSelection
            onChange={(_, percentCrop) => setCrop(percentCrop)}
            onComplete={(pixelCrop) => setCompletedCrop(pixelCrop)}
          >
            <img
              ref={imageRef}
              src={source.url}
              alt="裁剪预览"
              onLoad={(event) => {
                const { width, height } = event.currentTarget;
                const nextCrop = centerAspectCrop(width, height, props.aspect);
                setCrop(nextCrop);
              }}
            />
          </ReactCrop>
        </div>
      </Space> : null}
    </Modal>
  </div>;
}
