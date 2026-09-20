import { Avatar } from 'antd';
import { CustomerServiceOutlined } from '@ant-design/icons';
import { useEffect, useRef, useState } from 'react';

export function MusicCover({ url, video = false }: { url?: string; video?: boolean }) {
  return <CoverImage key={url || 'empty'} url={url} video={video} />;
}

function CoverImage({ url, video }: { url?: string; video: boolean }) {
  const [attempt, setAttempt] = useState(0);
  const [failed, setFailed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => () => clearTimeout(timer.current), []);
  const src = url && attempt ? `${url}${url.includes('?') ? '&' : '?'}cover_retry=${attempt}` : url;
  const onError = () => {
    clearTimeout(timer.current);
    if (attempt >= 2) { setFailed(true); return; }
    timer.current = setTimeout(() => setAttempt(value => value + 1), attempt === 0 ? 500 : 1500);
  };
  return <Avatar shape="square" size={44} src={src && !failed ? <img src={src} alt={video ? '视频封面' : '歌曲封面'} loading="lazy" referrerPolicy="no-referrer" onError={onError} /> : undefined} icon={<CustomerServiceOutlined />} className={video ? 'music-cover music-cover-video' : 'music-cover'} />;
}
