import { Button } from 'antd';
import { CloseOutlined } from '@ant-design/icons';
import AudioPlayer from 'react-h5-audio-player';
import 'react-h5-audio-player/lib/styles.css';
import type { AdminAudioTrack } from '../types';

interface LyricLine {
  time: number;
  text: string;
}

interface LyricsPanelState {
  title: string;
  rawContent: string;
  lines: LyricLine[];
  trackId: string;
}

interface GlobalAudioPlayerProps {
  track: AdminAudioTrack;
  onError: () => void;
  onClose: () => void;
  onListen: (currentTime: number) => void;
  currentTime: number;
  lyricsPanel: LyricsPanelState | null;
}

function findCurrentLyricLine(lines: LyricLine[], currentTime: number): number {
  if (!lines.length || !Number.isFinite(currentTime)) return -1;
  for (let i = lines.length - 1; i >= 0; i--) {
    if (currentTime >= lines[i].time) {
      return i;
    }
  }
  return -1;
}

function renderLyricsPanel(trackId: string, currentTime: number, lyricsPanel: LyricsPanelState | null) {
  if (!lyricsPanel || lyricsPanel.trackId !== trackId) {
    return <div className="admin-global-player-lyrics">
      <div className="admin-global-player-lyrics-title">播放器歌词</div>
      <div className="admin-global-player-lyrics-empty">点击对应曲目的“查看歌词”后，支持同步展示滚动歌词</div>
    </div>;
  }

  const lines = lyricsPanel.lines || [];
  const lineCount = lines.length;
  if (!lineCount) {
    return <div className="admin-global-player-lyrics">
      <div className="admin-global-player-lyrics-title">播放器歌词（无时间轴）</div>
      <div className="admin-global-player-lyrics-empty">当前曲目暂无可滚动歌词，请在“查看歌词”确认原文</div>
    </div>;
  }

  const currentIndex = Math.max(0, findCurrentLyricLine(lines, currentTime));
  const visible = [
    ...(currentIndex > 0 ? [currentIndex - 1] : []),
    currentIndex,
    ...(currentIndex + 1 < lineCount ? [currentIndex + 1] : [])
  ];

  return <div className="admin-global-player-lyrics">
    <div className="admin-global-player-lyrics-title">{lyricsPanel.title || '歌词'}</div>
    <div className="admin-global-player-lyrics-scroll">
      {visible.map((index) => {
        const line = lines[index];
        const state = index === currentIndex ? 'current' : 'normal';
        return <div key={`${line.time}-${line.text}-${index}`} className={`admin-global-player-lyrics-line ${state}`}>
          {line.text || '—'}
        </div>;
      })}
    </div>
  </div>;
}

export function GlobalAudioPlayer({ track, onError, onClose, onListen, currentTime, lyricsPanel }: GlobalAudioPlayerProps) {
  return <div className="admin-global-player">
    <div className="admin-global-player-meta">
      <strong>{track.title}</strong>
      {track.subtitle ? <span>{track.subtitle}</span> : null}
    </div>
    {renderLyricsPanel(track.id, Number.isFinite(currentTime) ? currentTime : 0, lyricsPanel)}
    <AudioPlayer
      autoPlay
      src={track.sources[track.sourceIndex || 0]}
      onError={onError}
      onListen={(e) => {
        const node = e && e.target ? (e.target as HTMLAudioElement) : null;
        const time = node && Number.isFinite(node.currentTime) ? node.currentTime : 0;
        onListen(time);
      }}
      showJumpControls={false}
      layout="horizontal"
    />
    <Button className="admin-global-player-close" type="text" icon={<CloseOutlined />} onClick={onClose} aria-label="关闭播放器" />
  </div>;
}
