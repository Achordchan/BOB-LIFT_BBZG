import { useEffect, useRef, useState } from 'react';
import { Button, Slider, Space, Typography } from 'antd';
import { PauseCircleOutlined, PlayCircleOutlined } from '@ant-design/icons';

interface AdminAudioPlayerProps {
  sources: string[];
  disabled?: boolean;
  compact?: boolean;
  onError?: () => void;
}

function formatTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const minutes = Math.floor(seconds / 60);
  const remain = Math.floor(seconds % 60);
  return `${minutes}:${String(remain).padStart(2, '0')}`;
}

export function AdminAudioPlayer(props: AdminAudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const onErrorRef = useRef(props.onError);
  const sourcesRef = useRef<string[]>([]);
  const sourceIndexRef = useRef(0);
  const requestedRef = useRef(false);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [duration, setDuration] = useState(0);
  const [current, setCurrent] = useState(0);
  const [sourceIndex, setSourceIndex] = useState(0);
  const safeSources = props.sources.filter(Boolean);

  useEffect(() => { onErrorRef.current = props.onError; }, [props.onError]);
  useEffect(() => { sourcesRef.current = safeSources; }, [safeSources.join('|')]);

  function resetState() {
    setLoading(false);
    setPlaying(false);
    setDuration(0);
    setCurrent(0);
  }

  function playSource(index: number) {
    const audio = audioRef.current;
    const source = sourcesRef.current[index];
    if (!audio || !source) {
      requestedRef.current = false;
      resetState();
      onErrorRef.current?.();
      return;
    }

    sourceIndexRef.current = index;
    setSourceIndex(index);
    setLoading(true);
    audio.src = source;
    audio.load();
    audio.play().catch(() => playSource(index + 1));
  }

  useEffect(() => {
    const audio = new Audio();
    audio.preload = 'none';
    audioRef.current = audio;

    const handlePlaying = () => { setLoading(false); setPlaying(true); };
    const handlePause = () => setPlaying(false);
    const handleEnded = () => { requestedRef.current = false; setPlaying(false); setCurrent(0); };
    const handleLoaded = () => setDuration(Number.isFinite(audio.duration) ? audio.duration : 0);
    const handleTime = () => setCurrent(Number.isFinite(audio.currentTime) ? audio.currentTime : 0);
    const handleError = () => {
      if (!requestedRef.current) return;
      playSource(sourceIndexRef.current + 1);
    };

    audio.addEventListener('playing', handlePlaying);
    audio.addEventListener('pause', handlePause);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('loadedmetadata', handleLoaded);
    audio.addEventListener('timeupdate', handleTime);
    audio.addEventListener('error', handleError);

    return () => {
      requestedRef.current = false;
      audio.pause();
      audio.removeEventListener('playing', handlePlaying);
      audio.removeEventListener('pause', handlePause);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('loadedmetadata', handleLoaded);
      audio.removeEventListener('timeupdate', handleTime);
      audio.removeEventListener('error', handleError);
    };
  }, []);

  useEffect(() => {
    requestedRef.current = false;
    audioRef.current?.pause();
    audioRef.current?.removeAttribute('src');
    sourceIndexRef.current = 0;
    setSourceIndex(0);
    resetState();
  }, [safeSources.join('|')]);

  function togglePlay() {
    const audio = audioRef.current;
    if (!audio || !safeSources.length) return;
    if (!audio.paused) {
      requestedRef.current = false;
      audio.pause();
      return;
    }
    requestedRef.current = true;
    playSource(sourceIndex || 0);
  }

  function seek(value: number) {
    const audio = audioRef.current;
    if (!audio || !duration) return;
    audio.currentTime = value;
    setCurrent(value);
  }

  return <div className={props.compact ? 'admin-audio-player admin-audio-player-compact' : 'admin-audio-player'}>
    <Space size={10} align="center" style={{ width: '100%' }}>
      <Button
        size="small"
        shape="circle"
        type={playing ? 'primary' : 'default'}
        loading={loading}
        disabled={props.disabled || !safeSources.length}
        icon={playing ? <PauseCircleOutlined /> : <PlayCircleOutlined />}
        onClick={togglePlay}
      />
      <div className="admin-audio-progress">
        <Slider min={0} max={duration || 0} step={0.1} value={Math.min(current, duration || 0)} tooltip={{ open: false }} onChange={seek} disabled={!duration} />
      </div>
      <Typography.Text type="secondary" className="admin-audio-time">{formatTime(current)} / {formatTime(duration)}</Typography.Text>
    </Space>
  </div>;
}
