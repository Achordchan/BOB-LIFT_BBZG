import { Avatar } from 'antd';
import { CustomerServiceOutlined } from '@ant-design/icons';
import { useState } from 'react';

export function MusicCover({ url, video = false }: { url?: string; video?: boolean }) {
  const [failedUrl, setFailedUrl] = useState('');
  return <Avatar shape="square" size={44} src={url && url !== failedUrl ? <img src={url} alt={video ? '视频封面' : '歌曲封面'} loading="lazy" referrerPolicy="no-referrer" onError={() => setFailedUrl(url)} /> : undefined} icon={<CustomerServiceOutlined />} className={video ? 'music-cover music-cover-video' : 'music-cover'} />;
}
