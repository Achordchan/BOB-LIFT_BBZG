export interface TrackLyricsState<TLine = unknown> {
  title: string;
  rawContent: string;
  lines: TLine[];
  trackId: string;
}

export function keepLyricsForReplay<TLine>(
  current: TrackLyricsState<TLine> | null,
  trackId: string
) {
  return current?.trackId === trackId ? current : null;
}

export function keepLyricsWhenReloadHasNoContent<TLine>(
  current: TrackLyricsState<TLine> | null,
  trackId: string,
  fallback: TrackLyricsState<TLine>
) {
  const rawContent = current?.rawContent.trim() || '';
  const hasUsableLyrics = current?.trackId === trackId
    && rawContent !== ''
    && rawContent !== '暂无歌词';

  return hasUsableLyrics ? current : fallback;
}
