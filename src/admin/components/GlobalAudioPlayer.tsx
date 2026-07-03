import { useEffect, useMemo, useRef, useState } from 'react';
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

export function GlobalAudioPlayer({ track, onError, onClose, onListen, currentTime, lyricsPanel }: GlobalAudioPlayerProps) {
  const [lyricsScreenOpen, setLyricsScreenOpen] = useState(false);
  const playerRef = useRef<AudioPlayer | null>(null);
  const lineRefs = useRef<Array<HTMLDivElement | null>>([]);
  const activeLyrics = lyricsPanel && lyricsPanel.trackId === track.id ? lyricsPanel : null;
  const lines = useMemo(() => activeLyrics?.lines || [], [activeLyrics]);
  const safeTime = Number.isFinite(currentTime) ? currentTime : 0;
  const currentIndex = lines.length ? Math.max(0, findCurrentLyricLine(lines, safeTime)) : -1;
  const rawText = String(activeLyrics?.rawContent || '').trim();
  const currentLine = currentIndex >= 0 ? (lines[currentIndex]?.text || '—') : (rawText || '暂无歌词');
  const canOpenLyrics = !!activeLyrics && (!!lines.length || !!rawText);

  useEffect(() => {
    setLyricsScreenOpen(false);
  }, [track.id]);

  useEffect(() => {
    if (!lyricsScreenOpen || currentIndex < 0) return;
    lineRefs.current[currentIndex]?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [lyricsScreenOpen, currentIndex]);

  function seekToLyric(time: number) {
    const audio = playerRef.current?.audio.current;
    if (!audio || !Number.isFinite(time)) return;
    audio.currentTime = time;
    onListen(time);
    const playPromise = audio.play();
    if (playPromise && typeof playPromise.catch === 'function') playPromise.catch(() => {});
  }

  return <>
    <div className="admin-global-player">
      <div className="admin-global-player-meta">
        <strong>{track.title}</strong>
        {track.subtitle ? <span>{track.subtitle}</span> : null}
      </div>
      <button
        type="button"
        className={canOpenLyrics ? 'admin-global-player-lyrics' : 'admin-global-player-lyrics admin-global-player-lyrics-disabled'}
        disabled={!canOpenLyrics}
        onClick={() => canOpenLyrics && setLyricsScreenOpen(true)}
      >
        <span className={lines.length && currentIndex >= 0 ? 'admin-global-player-lyrics-line current' : 'admin-global-player-lyrics-empty'}>
          {currentLine}
        </span>
      </button>
      <AudioPlayer
        ref={playerRef}
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
    </div>
    {lyricsScreenOpen && activeLyrics ? <div className="admin-lyrics-screen" role="dialog" aria-modal="true">
      <div className="admin-lyrics-screen-header">
        <div>
          <div className="admin-lyrics-screen-label">正在播放</div>
          <h2>{activeLyrics.title || track.title}</h2>
        </div>
        <button className="admin-lyrics-screen-close" type="button" aria-label="关闭歌词" onClick={() => setLyricsScreenOpen(false)} />
      </div>
      <div className="admin-lyrics-screen-body">
        {lines.length ? lines.map((line, index) => <div
          key={`${line.time}-${line.text}-${index}`}
          ref={(node) => { lineRefs.current[index] = node; }}
          role="button"
          tabIndex={0}
          onClick={() => seekToLyric(line.time)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') seekToLyric(line.time);
          }}
          className={index === currentIndex ? 'admin-lyrics-screen-line current' : 'admin-lyrics-screen-line'}
        >{line.text || '—'}</div>) : <pre className="admin-lyrics-screen-plain">{rawText || '暂无歌词'}</pre>}
      </div>
    </div> : null}
  </>;
}
