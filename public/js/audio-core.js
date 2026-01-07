(function () {
  function bindAudioPlayer(root, options = {}) {
    if (!root) return null;

    const audioElement = root.querySelector(options.audioSelector || '.music-audio');
    const playBtn = root.querySelector(options.playButtonSelector || '.play-music-btn');
    const playIcon = playBtn ? playBtn.querySelector('.play-icon') : null;
    const pauseIcon = playBtn ? playBtn.querySelector('.pause-icon') : null;
    const playText = playBtn ? playBtn.querySelector('.play-text') : null;
    const progressWrap = root.querySelector(options.progressWrapSelector || '.music-progress-wrap');
    const progressBar = root.querySelector(options.progressBarSelector || '.music-progress');
    const progressFill = root.querySelector(options.progressFillSelector || '.music-progress-fill');
    const timeText = root.querySelector(options.timeTextSelector || '.music-time');

    if (!audioElement || !playBtn || !playIcon || !pauseIcon || !playText) return null;

    const getSrc = () => {
      const explicit = typeof options.getAudioSrc === 'function' ? options.getAudioSrc() : '';
      if (explicit) return explicit;
      const sourceEl = audioElement.querySelector('source');
      return audioElement.currentSrc || audioElement.src || (sourceEl ? sourceEl.getAttribute('src') : '') || '';
    };

    function formatTime(seconds) {
      if (!isFinite(seconds) || seconds < 0) return '0:00';
      const m = Math.floor(seconds / 60);
      const s = Math.floor(seconds % 60);
      return `${m}:${String(s).padStart(2, '0')}`;
    }

    function updateProgressUI() {
      const duration = audioElement.duration;
      const current = audioElement.currentTime;
      const ratio = duration ? Math.min(1, Math.max(0, current / duration)) : 0;
      if (progressFill) progressFill.style.width = `${(ratio * 100).toFixed(2)}%`;
      if (timeText) timeText.textContent = `${formatTime(current)}/${formatTime(duration)}`;
    }

    function setPlayButtonState(isPlayingNow) {
      playIcon.style.display = isPlayingNow ? 'none' : 'block';
      pauseIcon.style.display = isPlayingNow ? 'block' : 'none';
      playText.textContent = isPlayingNow ? '暂停' : '播放';
      playBtn.style.backgroundColor = isPlayingNow ? '#ff9500' : '#34c759';
    }

    let isLoading = false;

    function setLoadingState(isLoadingNow) {
      isLoading = !!isLoadingNow;
      if (isLoadingNow) {
        playBtn.disabled = true;
        playIcon.style.display = 'block';
        pauseIcon.style.display = 'none';
        playText.textContent = '加载中...';
        playBtn.style.backgroundColor = '#0071e3';
      } else {
        playBtn.disabled = false;
      }
    }

    function isLocalMusicPath(src) {
      if (!src) return false;
      try {
        const u = new URL(src, window.location.href);
        return u.origin === window.location.origin && u.pathname.startsWith('/music/');
      } catch (e) {
        return typeof src === 'string' && src.startsWith('/music/');
      }
    }

    function markUnplayable(message) {
      try {
        audioElement.pause();
        audioElement.currentTime = 0;
      } catch (e) {}
      if (progressFill) progressFill.style.width = '0%';
      if (timeText) timeText.textContent = '0:00/0:00';
      setPlayButtonState(false);
      playBtn.style.backgroundColor = '#ff3b30';
      playText.textContent = '不可播放';
      if (progressWrap) progressWrap.style.opacity = '0.6';
      if (window.showMessage) window.showMessage(message || '音频无法播放', 'error');
    }

    playBtn.addEventListener('click', function () {
      const isCurrentlyPlaying = !audioElement.paused;

      if (isCurrentlyPlaying) {
        audioElement.pause();
        setPlayButtonState(false);
        return;
      }

      if (window.AudioCore && typeof window.AudioCore.stopAllAudio === 'function') {
        window.AudioCore.stopAllAudio();
      } else if (typeof window.stopAllAudio === 'function') {
        window.stopAllAudio();
      }

      setLoadingState(true);

      const src = getSrc();
      const isLocalFile = isLocalMusicPath(src);
      const headCheck = isLocalFile ? fetch(src, { method: 'HEAD', cache: 'no-cache' }) : Promise.resolve({ ok: true });

      headCheck
        .then(res => {
          if (!res || !res.ok) {
            setLoadingState(false);
            markUnplayable('音频文件不存在或已被删除');
            return;
          }

          const onPlaying = () => {
            setLoadingState(false);
            setPlayButtonState(true);
          };
          const onCanPlay = () => {
            setLoadingState(false);
            if (!audioElement.paused && !audioElement.ended) {
              setPlayButtonState(true);
            }
          };
          audioElement.addEventListener('playing', onPlaying, { once: true });
          audioElement.addEventListener('canplay', onCanPlay, { once: true });

          const playPromise = audioElement.play();
          if (playPromise && typeof playPromise.catch === 'function') {
            playPromise.catch(err => {
              console.error('播放失败:', err);
              setLoadingState(false);
              markUnplayable(err && err.message ? `播放失败: ${err.message}` : '播放失败');
            });
          }
        })
        .catch(err => {
          console.error('音频检测失败:', err);
          setLoadingState(false);
          markUnplayable('音频文件无法访问');
        });
    });

    audioElement.addEventListener('ended', function () {
      setPlayButtonState(false);
      audioElement.currentTime = 0;
      updateProgressUI();
    });
    audioElement.addEventListener('loadedmetadata', function () {
      updateProgressUI();
    });
    audioElement.addEventListener('timeupdate', function () {
      updateProgressUI();
    });
    audioElement.addEventListener('error', function () {
      const src = getSrc();
      const msg = isLocalMusicPath(src) ? '音频文件加载失败（可能文件已丢失）' : '外链音频加载失败（可能跨域或链接失效）';
      setLoadingState(false);
      markUnplayable(msg);
    });

    audioElement.addEventListener('abort', function () {
      if (!isLoading) return;

      if (audioElement.error) {
        const src = getSrc();
        const msg = isLocalMusicPath(src) ? '音频文件加载失败（可能文件已丢失）' : '外链音频加载失败（可能跨域或链接失效）';
        setLoadingState(false);
        markUnplayable(msg);
        return;
      }

      setLoadingState(false);
      setPlayButtonState(false);
    });

    if (progressBar) {
      let dragging = false;

      function seekByEvent(e) {
        const rect = progressBar.getBoundingClientRect();
        const clientX = e.touches && e.touches[0] ? e.touches[0].clientX : e.clientX;
        const x = Math.min(rect.right, Math.max(rect.left, clientX));
        const ratio = rect.width ? (x - rect.left) / rect.width : 0;
        if (isFinite(audioElement.duration) && audioElement.duration > 0) {
          audioElement.currentTime = audioElement.duration * ratio;
          updateProgressUI();
        }
      }

      progressBar.addEventListener('mousedown', function (e) {
        dragging = true;
        seekByEvent(e);
      });
      window.addEventListener('mousemove', function (e) {
        if (!dragging) return;
        seekByEvent(e);
      });
      window.addEventListener('mouseup', function () {
        dragging = false;
      });

      progressBar.addEventListener('touchstart', function (e) {
        dragging = true;
        seekByEvent(e);
      }, { passive: true });
      window.addEventListener('touchmove', function (e) {
        if (!dragging) return;
        seekByEvent(e);
      }, { passive: true });
      window.addEventListener('touchend', function () {
        dragging = false;
      });
    }

    function resetUI() {
      setLoadingState(false);
      setPlayButtonState(false);
      if (progressFill) progressFill.style.width = '0%';
      if (timeText) timeText.textContent = '0:00/0:00';
      if (progressWrap) progressWrap.style.opacity = '1';
    }

    resetUI();

    return {
      audioElement,
      resetUI,
      updateProgressUI
    };
  }

  function stopAllAudio() {
    const audioSet = new Set();
    document.querySelectorAll('.music-audio').forEach(a => audioSet.add(a));
    document.querySelectorAll('#modalMusicAudio, #editUserMusicAudio, #addInquiryMusicAudio, #reduceInquiryMusicAudio').forEach(a => audioSet.add(a));

    audioSet.forEach(audio => {
      if (!audio || audio.paused) return;

      try {
        audio.pause();
        audio.currentTime = 0;
      } catch (e) {}

      const wrapper = audio.closest('[data-audio-player]') || audio.closest('.music-item');
      if (!wrapper) return;

      const playBtn = wrapper.querySelector('.play-music-btn');
      const playIcon = playBtn ? playBtn.querySelector('.play-icon') : null;
      const pauseIcon = playBtn ? playBtn.querySelector('.pause-icon') : null;
      const playText = playBtn ? playBtn.querySelector('.play-text') : null;
      const progressFill = wrapper.querySelector('.music-progress-fill');
      const timeText = wrapper.querySelector('.music-time');
      if (playIcon) playIcon.style.display = 'block';
      if (pauseIcon) pauseIcon.style.display = 'none';
      if (playText) playText.textContent = '播放';
      if (playBtn) playBtn.style.backgroundColor = '#34c759';
      if (progressFill) progressFill.style.width = '0%';
      if (timeText) timeText.textContent = '0:00/0:00';

      if (wrapper.__playerBinding && typeof wrapper.__playerBinding.resetUI === 'function') {
        wrapper.__playerBinding.resetUI();
      }
    });
  }

  window.AudioCore = {
    bindAudioPlayer,
    stopAllAudio
  };

  window.stopAllAudio = stopAllAudio;
  window.bindAudioPlayer = bindAudioPlayer;
})();
