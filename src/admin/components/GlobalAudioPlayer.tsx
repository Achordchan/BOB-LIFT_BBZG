import { Button } from 'antd';
import { CloseOutlined } from '@ant-design/icons';
import AudioPlayer from 'react-h5-audio-player';
import 'react-h5-audio-player/lib/styles.css';
import type { AdminAudioTrack } from '../types';

interface GlobalAudioPlayerProps {
  track: AdminAudioTrack;
  onError: () => void;
  onClose: () => void;
}

export function GlobalAudioPlayer({ track, onError, onClose }: GlobalAudioPlayerProps) {
  return <div className="admin-global-player">
    <div className="admin-global-player-meta">
      <strong>{track.title}</strong>
      {track.subtitle ? <span>{track.subtitle}</span> : null}
    </div>
    <AudioPlayer
      autoPlay
      src={track.sources[track.sourceIndex || 0]}
      onError={onError}
      showJumpControls={false}
      layout="horizontal"
    />
    <Button className="admin-global-player-close" type="text" icon={<CloseOutlined />} onClick={onClose} aria-label="关闭播放器" />
  </div>;
}
