/**
 * 加载音乐列表
 */
function populateInquirySelects(addInquirySelect, reduceInquirySelect, soundEffects, musicFiles) {
  if (window.MusicPresenter && typeof window.MusicPresenter.populateInquirySelects === 'function') {
    window.MusicPresenter.populateInquirySelects(addInquirySelect, reduceInquirySelect, soundEffects, musicFiles);
    return;
  }
  const candidates = [];
  if (Array.isArray(soundEffects)) candidates.push(...soundEffects);
  if (Array.isArray(musicFiles)) candidates.push(...musicFiles);

  candidates.forEach(item => {
    if (!item) return;
    if (!item.id) return;
    if (!item.filename) return;

    const label = item.name || item.filename || item.id;

    if (addInquirySelect) {
      const opt = document.createElement('option');
      opt.value = item.id;
      opt.textContent = label;
      addInquirySelect.appendChild(opt);
    }
    if (reduceInquirySelect) {
      const opt = document.createElement('option');
      opt.value = item.id;
      opt.textContent = label;
      reduceInquirySelect.appendChild(opt);
    }
  });
}

function loadInquiryMusicConfig() {
  if (window.MusicPresenter && typeof window.MusicPresenter.loadInquiryMusicConfig === 'function') {
    window.MusicPresenter.loadInquiryMusicConfig();
    return;
  }
  console.error('MusicPresenter.loadInquiryMusicConfig not available');
  if (window.showMessage) window.showMessage('音乐模块未加载，请刷新页面', 'error');
}

/**
 * 加载音乐列表
 */
function loadMusic() {
  if (window.MusicPresenter && typeof window.MusicPresenter.loadMusic === 'function') {
    window.MusicPresenter.loadMusic();
    return;
  }
  console.error('MusicPresenter.loadMusic not available');
  if (window.showMessage) window.showMessage('音乐模块未加载，请刷新页面', 'error');
}

function deleteMusic(musicId) {
  if (window.MusicPresenter && typeof window.MusicPresenter.deleteMusic === 'function') {
    window.MusicPresenter.deleteMusic(musicId);
    return;
  }
  console.error('MusicPresenter.deleteMusic not available');
  if (window.showMessage) window.showMessage('音乐模块未加载，请刷新页面', 'error');
}

/**
 * 显示音乐项
 * @param {Object} music - 音乐对象
 * @param {HTMLElement} container - 容器元素
 */
function displayMusicItem(music, container) {
  if (window.MusicView && typeof window.MusicView.displayMusicItem === 'function') {
    window.MusicView.displayMusicItem(music, container);
    return;
  }
  console.error('MusicView.displayMusicItem not available');
  if (window.showMessage) window.showMessage('音乐视图模块未加载，请刷新页面', 'error');
}

/**
 * 显示音效项
 * @param {Object} sound - 音效对象
 * @param {HTMLElement} container - 容器元素
 */
function displaySoundEffectItem(sound, container) {
  if (window.MusicView && typeof window.MusicView.displaySoundEffectItem === 'function') {
    window.MusicView.displaySoundEffectItem(sound, container);
    return;
  }
  console.error('MusicView.displaySoundEffectItem not available');
  if (window.showMessage) window.showMessage('音乐视图模块未加载，请刷新页面', 'error');
}

function bindAudioPlayer(root, options = {}) {
  if (window.AudioCore && typeof window.AudioCore.bindAudioPlayer === 'function') {
    return window.AudioCore.bindAudioPlayer(root, options);
  }
  return null;
}

/**
 * 停止所有正在播放的音频
 */
function stopAllAudio() {
  if (window.AudioCore && typeof window.AudioCore.stopAllAudio === 'function') {
    window.AudioCore.stopAllAudio();
  }
}

// 确保函数在全局范围内可见
window.loadMusic = loadMusic;
window.deleteMusic = deleteMusic;
window.loadInquiryMusicConfig = loadInquiryMusicConfig;
if (typeof window.stopAllAudio !== 'function') window.stopAllAudio = stopAllAudio;
if (typeof window.bindAudioPlayer !== 'function') window.bindAudioPlayer = bindAudioPlayer;
if (typeof window.displayMusicItem !== 'function') window.displayMusicItem = displayMusicItem;
if (typeof window.displaySoundEffectItem !== 'function') window.displaySoundEffectItem = displaySoundEffectItem;