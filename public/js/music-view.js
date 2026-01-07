(function() {
  function displayMusicItem(music, container) {
    const musicItem = document.createElement('div');
    musicItem.className = 'music-item';

    const audioSrc = `/music/${music.filename}`;
    const safeAudioSrc = audioSrc ? (window.escapeHtml ? window.escapeHtml(audioSrc) : audioSrc) : '';

    const tagsHtml = `
    ${music.lrcFilename ? '<span style="background-color: #ff9500; color: white; padding: 2px 8px; border-radius: 12px; font-size: 12px; margin-left: 8px;">歌词</span>' : ''}
    <span style="background-color: #34c759; color: white; padding: 2px 8px; border-radius: 12px; font-size: 12px; margin-left: 8px;">📁 本地</span>
  `;

    musicItem.innerHTML = `
    <div style="flex: 1; min-width: 0;">
      <div style="display: flex; align-items: center; flex-wrap: wrap; gap: 8px; margin-bottom: 8px;">
        <strong>${music.name}</strong>
        ${tagsHtml}
      </div>
      <p style="margin: 4px 0;">${music.description || ''}</p>
    </div>
    <div style="display: flex; align-items: center; gap: 10px; flex-shrink: 0;">
      <button class="play-music-btn" data-music-id="${music.id}" data-music-src="${safeAudioSrc}" style="background-color: #34c759; padding: 8px 16px; border: none; border-radius: 8px; color: white; cursor: pointer; display: flex; align-items: center; gap: 6px; white-space: nowrap;">
        <svg class="play-icon" width="16" height="16" viewBox="0 0 24 24" fill="white" xmlns="http://www.w3.org/2000/svg">
          <path d="M8 5v14l11-7z"/>
        </svg>
        <svg class="pause-icon" width="16" height="16" viewBox="0 0 24 24" fill="white" xmlns="http://www.w3.org/2000/svg" style="display: none;">
          <path d="M6 4h4v16H6zM14 4h4v16h-4z"/>
        </svg>
        <span class="play-text">播放</span>
      </button>
      <audio class="music-audio" data-music-id="${music.id}" preload="none" style="display: none;">
        <source src="${safeAudioSrc}" type="audio/mpeg">
      </audio>
      <div class="music-progress-wrap" style="display: flex; align-items: center; gap: 8px; min-width: 210px;">
        <div class="music-progress" style="width: 140px; height: 6px; background: #e5e5ea; border-radius: 999px; overflow: hidden; cursor: pointer;">
          <div class="music-progress-fill" style="height: 100%; width: 0%; background: #0071e3;"></div>
        </div>
        <div class="music-time" style="font-size: 12px; color: var(--text-secondary); min-width: 62px; text-align: right;">0:00/0:00</div>
      </div>
      <button class="edit-music-btn" data-music-id="${music.id}" style="background-color: #5ac8fa; white-space: nowrap;">编辑</button>
      <button class="button-danger" data-music-id="${music.id}" style="white-space: nowrap;">删除</button>
    </div>
  `;

    if (typeof window.bindAudioPlayer === 'function') {
      musicItem.__playerBinding = window.bindAudioPlayer(musicItem);
    }

    musicItem.querySelector('.button-danger').addEventListener('click', function() {
      const musicId = this.getAttribute('data-music-id');
      if (typeof window.deleteMusic === 'function') {
        window.deleteMusic(musicId);
      }
    });

    musicItem.querySelector('.edit-music-btn').addEventListener('click', function() {
      const musicId = this.getAttribute('data-music-id');
      if (typeof window.editMusic === 'function') {
        window.editMusic(musicId);
      } else {
        console.error('editMusic function not found');
        if (typeof window.showMessage === 'function') {
          window.showMessage('编辑功能暂未加载，请刷新页面', 'error');
        }
      }
    });

    container.appendChild(musicItem);
  }

  function displaySoundEffectItem(sound, container) {
    const soundItem = document.createElement('div');
    soundItem.className = 'music-item';
    soundItem.innerHTML = `
    <div>
      <strong>${sound.name}</strong>
      <span style="background-color: #34c759; color: white; padding: 2px 8px; border-radius: 12px; font-size: 12px; margin-left: 8px;">音效</span>
      <p>${sound.description || ''}</p>
    </div>
    <div style="display: flex; align-items: center; gap: 10px;">
      <button class="play-music-btn" data-music-id="${sound.id}" data-music-filename="${sound.filename}" style="background-color: #34c759; padding: 8px 16px; border: none; border-radius: 8px; color: white; cursor: pointer; display: flex; align-items: center; gap: 6px;">
        <svg class="play-icon" width="16" height="16" viewBox="0 0 24 24" fill="white" xmlns="http://www.w3.org/2000/svg">
          <path d="M8 5v14l11-7z"/>
        </svg>
        <svg class="pause-icon" width="16" height="16" viewBox="0 0 24 24" fill="white" xmlns="http://www.w3.org/2000/svg" style="display: none;">
          <path d="M6 4h4v16H6zM14 4h4v16h-4z"/>
        </svg>
        <span class="play-text">播放</span>
      </button>
      <audio class="music-audio" data-music-id="${sound.id}" preload="none" style="display: none;">
        <source src="/music/${sound.filename}" type="audio/mpeg">
      </audio>
      <div class="music-progress-wrap" style="display: flex; align-items: center; gap: 8px; min-width: 210px;">
        <div class="music-progress" style="width: 140px; height: 6px; background: #e5e5ea; border-radius: 999px; overflow: hidden; cursor: pointer;">
          <div class="music-progress-fill" style="height: 100%; width: 0%; background: #0071e3;"></div>
        </div>
        <div class="music-time" style="font-size: 12px; color: var(--text-secondary); min-width: 62px; text-align: right;">0:00/0:00</div>
      </div>
      <button class="button-danger" data-music-id="${sound.id}">删除</button>
    </div>
  `;

    if (typeof window.bindAudioPlayer === 'function') {
      soundItem.__playerBinding = window.bindAudioPlayer(soundItem);
    }

    soundItem.querySelector('.button-danger').addEventListener('click', function() {
      const musicId = this.getAttribute('data-music-id');
      if (typeof window.deleteMusic === 'function') {
        window.deleteMusic(musicId);
      }
    });

    container.appendChild(soundItem);
  }

  window.MusicView = {
    displayMusicItem,
    displaySoundEffectItem
  };

  window.displayMusicItem = displayMusicItem;
  window.displaySoundEffectItem = displaySoundEffectItem;
})();
