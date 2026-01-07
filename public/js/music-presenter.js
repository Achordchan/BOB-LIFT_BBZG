(function () {
  function populateInquirySelects(addInquirySelect, reduceInquirySelect, soundEffects, musicFiles) {
    const addSelect = addInquirySelect;
    const reduceSelect = reduceInquirySelect;
    if (!addSelect && !reduceSelect) return;

    const candidates = [];
    if (Array.isArray(soundEffects)) candidates.push(...soundEffects);
    if (Array.isArray(musicFiles)) candidates.push(...musicFiles);

    candidates.forEach(item => {
      if (!item) return;
      if (!item.id) return;
      if (!item.filename) return;

      const label = item.name || item.filename || item.id;
      if (addSelect) {
        const opt = document.createElement('option');
        opt.value = item.id;
        opt.textContent = label;
        addSelect.appendChild(opt);
      }
      if (reduceSelect) {
        const opt = document.createElement('option');
        opt.value = item.id;
        opt.textContent = label;
        reduceSelect.appendChild(opt);
      }
    });
  }

  function loadInquiryMusicConfig() {
    const addSelect = document.getElementById('addInquiryMusic');
    const reduceSelect = document.getElementById('reduceInquiryMusic');

    const request = window.MusicModel && window.MusicModel.fetchInquiryConfig
      ? window.MusicModel.fetchInquiryConfig()
      : (window.apiRequest ? window.apiRequest('/api/inquiries/config', { method: 'GET' }) : fetch('/api/inquiries/config').then(r => r.json()));

    request
      .then(data => {
        if (!data || !data.success || !data.inquiryConfig) return;

        const cfg = data.inquiryConfig;

        if (addSelect) {
          addSelect.value = cfg.addInquiryMusicId || '';
          addSelect.dispatchEvent(new Event('change'));
        }
        if (reduceSelect) {
          reduceSelect.value = cfg.reduceInquiryMusicId || '';
          reduceSelect.dispatchEvent(new Event('change'));
        }
      })
      .catch(error => {
        console.error('加载询盘音效配置失败:', error);
      });
  }

  function loadMusic() {
    const load = window.MusicModel && window.MusicModel.fetchMusicList
      ? window.MusicModel.fetchMusicList()
      : fetch('/api/music').then(r => r.json()).then(d => d.music || []);

    Promise.resolve(load)
      .then(listOrData => {
        const list = Array.isArray(listOrData) ? listOrData : (listOrData && Array.isArray(listOrData.music) ? listOrData.music : []);

        if (window.__musicListCache && Array.isArray(list)) {
          window.__musicListCache.ts = Date.now();
          window.__musicListCache.data = list;
        }

        const musicList = document.getElementById('musicList');
        const soundEffectList = document.getElementById('soundEffectList');
        if (musicList) musicList.innerHTML = '';
        if (soundEffectList) soundEffectList.innerHTML = '';

        const musicSelect = document.getElementById('configMusic');
        const addInquirySelect = document.getElementById('addInquiryMusic');
        const reduceInquirySelect = document.getElementById('reduceInquiryMusic');

        const selectedValue = musicSelect ? musicSelect.value : '';
        const addInquirySelectedValue = addInquirySelect ? addInquirySelect.value : '';
        const reduceInquirySelectedValue = reduceInquirySelect ? reduceInquirySelect.value : '';

        if (musicSelect) musicSelect.innerHTML = '<option value="">请选择音乐</option>';
        if (addInquirySelect) addInquirySelect.innerHTML = '<option value="">请选择音乐</option>';
        if (reduceInquirySelect) reduceInquirySelect.innerHTML = '<option value="">请选择音乐</option>';

        const musicFiles = list.filter(m => !m.isSound);
        const soundEffects = list.filter(m => m.isSound);

        musicFiles.forEach(music => {
          if (typeof window.displayMusicItem === 'function' && musicList) {
            window.displayMusicItem(music, musicList);
          }
          if (musicSelect) {
            const option = document.createElement('option');
            option.value = music.id;
            option.textContent = music.name;
            musicSelect.appendChild(option);
          }
        });

        soundEffects.forEach(sound => {
          if (typeof window.displaySoundEffectItem === 'function' && soundEffectList) {
            window.displaySoundEffectItem(sound, soundEffectList);
          }
        });

        populateInquirySelects(addInquirySelect, reduceInquirySelect, soundEffects, musicFiles);

        if (selectedValue && musicSelect) musicSelect.value = selectedValue;
        if (addInquirySelectedValue && addInquirySelect) addInquirySelect.value = addInquirySelectedValue;
        if (reduceInquirySelectedValue && reduceInquirySelect) reduceInquirySelect.value = reduceInquirySelectedValue;

        loadInquiryMusicConfig();
      })
      .catch(error => {
        console.error('加载音乐列表失败:', error);
        if (window.showMessage) window.showMessage('加载音乐列表失败，请重试', 'error');
      });
  }

  function deleteMusic(musicId) {
    if (!musicId) {
      if (window.showMessage) window.showMessage('音乐ID无效', 'error');
      return;
    }

    if (!confirm('确定要删除这首音乐吗？此操作不可恢复。')) {
      return;
    }

    if (typeof window.stopAllAudio === 'function') {
      window.stopAllAudio();
    }

    const req = window.MusicModel && window.MusicModel.deleteMusicById
      ? window.MusicModel.deleteMusicById(musicId)
      : (window.apiRequest ? window.apiRequest(`/api/music/delete/${encodeURIComponent(musicId)}`, { method: 'DELETE' }) : fetch(`/api/music/delete/${encodeURIComponent(musicId)}`, { method: 'DELETE' }).then(r => r.json()));

    Promise.resolve(req)
      .then(data => {
        if (data && data.success) {
          if (window.showMessage) window.showMessage('删除成功', 'success');
          loadMusic();
          return;
        }
        if (window.showMessage) window.showMessage((data && data.message) || '删除失败', 'error');
      })
      .catch(err => {
        console.error('删除音乐失败:', err);
        if (window.showMessage) window.showMessage('删除失败，请重试', 'error');
      });
  }

  function initInquiryMusicConfigEvents() {
    const saveInquiryMusicBtn = document.getElementById('saveInquiryMusicBtn');
    if (saveInquiryMusicBtn) {
      saveInquiryMusicBtn.addEventListener('click', function () {
        const addInquiryMusicId = document.getElementById('addInquiryMusic') ? document.getElementById('addInquiryMusic').value : '';
        const reduceInquiryMusicId = document.getElementById('reduceInquiryMusic') ? document.getElementById('reduceInquiryMusic').value : '';

        const req = window.MusicModel && window.MusicModel.saveInquiryConfig
          ? window.MusicModel.saveInquiryConfig(addInquiryMusicId, reduceInquiryMusicId)
          : fetch('/api/inquiries/config', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                addInquiryMusicId: addInquiryMusicId || null,
                reduceInquiryMusicId: reduceInquiryMusicId || null
              })
            }).then(r => r.json());

        Promise.resolve(req)
          .then(data => {
            if (data && data.success) {
              if (window.showMessage) window.showMessage('询盘音效配置保存成功');
              loadInquiryMusicConfig();
              return;
            }
            if (window.showMessage) window.showMessage((data && data.message) || '配置保存失败', 'error');
          })
          .catch(error => {
            console.error('保存询盘音效配置失败:', error);
            if (window.showMessage) window.showMessage('保存询盘音效配置失败，请重试', 'error');
          });
      });
    }

    const getMusicList = () => {
      if (typeof window.getCachedMusicList === 'function') return window.getCachedMusicList();
      if (window.MusicModel && typeof window.MusicModel.fetchMusicList === 'function') return window.MusicModel.fetchMusicList();
      return fetch('/api/music').then(r => r.json()).then(d => d.music || []);
    };

    const bindInquiryPreview = (selectId, previewId, audioId, playerKey) => {
      const select = document.getElementById(selectId);
      if (!select) return;

      select.addEventListener('change', function () {
        const musicId = this.value;
        const preview = document.getElementById(previewId);
        if (!musicId || !preview) {
          try {
            const audioElement = document.getElementById(audioId);
            if (audioElement) {
              audioElement.pause();
              audioElement.currentTime = 0;
              const source = audioElement.querySelector('source');
              if (source) source.src = '';
              audioElement.removeAttribute('src');
              audioElement.load();
            }
            const playerRoot = preview ? preview.querySelector(`[data-audio-player="${playerKey}"]`) : null;
            if (playerRoot && playerRoot.__playerBinding && typeof playerRoot.__playerBinding.resetUI === 'function') {
              playerRoot.__playerBinding.resetUI();
            }
          } catch (e) {}
          if (preview) preview.style.display = 'none';
          return;
        }

        Promise.resolve(getMusicList())
          .then(list => {
            const music = Array.isArray(list) ? list.find(m => m && m.id === musicId) : null;
            if (!music) return;

            const audioElement = document.getElementById(audioId);
            if (!audioElement) return;

            const src = `/music/${music.filename}`;
            const source = audioElement.querySelector('source');
            if (source) source.src = src;
            audioElement.removeAttribute('src');
            audioElement.setAttribute('preload', 'none');
            audioElement.load();

            preview.style.display = 'block';

            const playerRoot = preview.querySelector(`[data-audio-player="${playerKey}"]`);
            if (playerRoot && typeof window.bindAudioPlayer === 'function') {
              if (!playerRoot.__playerBinding) {
                playerRoot.__playerBinding = window.bindAudioPlayer(playerRoot);
              }
              if (playerRoot.__playerBinding && typeof playerRoot.__playerBinding.resetUI === 'function') {
                playerRoot.__playerBinding.resetUI();
              }
            }
          })
          .catch(error => {
            console.error('获取音乐信息失败:', error);
          });
      });
    };

    bindInquiryPreview('addInquiryMusic', 'addInquiryMusicPreview', 'addInquiryMusicAudio', 'addInquiryMusic');
    bindInquiryPreview('reduceInquiryMusic', 'reduceInquiryMusicPreview', 'reduceInquiryMusicAudio', 'reduceInquiryMusic');
  }

  function initDefaultBattleSong() {
    function loadDefaultBattleSong() {
      fetch('/api/defaultBattleSong')
        .then(response => response.json())
        .then(data => {
          if (data.success) {
            const defaultBattleSong = data.defaultBattleSong;
            const noDefaultSongElement = document.getElementById('noDefaultSong');
            const defaultSongInfoElement = document.getElementById('defaultSongInfo');
            const defaultSongNameElement = document.getElementById('defaultSongName');
            const defaultSongAudioElement = document.getElementById('defaultSongAudio');
            const removeDefaultSongBtn = document.getElementById('removeDefaultSongBtn');

            if (defaultBattleSong) {
              if (noDefaultSongElement) noDefaultSongElement.style.display = 'none';
              if (defaultSongInfoElement) defaultSongInfoElement.style.display = 'block';
              if (defaultSongNameElement) defaultSongNameElement.textContent = defaultBattleSong.name || '默认战歌';

              if (defaultSongAudioElement) {
                const sourceElement = defaultSongAudioElement.querySelector('source');
                if (sourceElement) {
                  sourceElement.src = `/music/${defaultBattleSong.filename}`;
                  defaultSongAudioElement.load();
                }
              }

              if (removeDefaultSongBtn) removeDefaultSongBtn.style.display = 'inline-block';
            } else {
              if (noDefaultSongElement) noDefaultSongElement.style.display = 'block';
              if (defaultSongInfoElement) defaultSongInfoElement.style.display = 'none';
              if (removeDefaultSongBtn) removeDefaultSongBtn.style.display = 'none';
            }
          } else {
            console.error('获取默认战歌失败:', data.message);
          }
        })
        .catch(error => {
          console.error('获取默认战歌失败:', error);
        });
    }

    const uploadDefaultSongBtn = document.getElementById('uploadDefaultSongBtn');
    if (uploadDefaultSongBtn) {
      uploadDefaultSongBtn.addEventListener('click', function () {
        const fileInput = document.getElementById('defaultBattleSongFile');

        if (!fileInput.files || fileInput.files.length === 0) {
          showMessage('请选择音乐文件', 'error');
          return;
        }

        const formData = new FormData();
        formData.append('battleSongFile', fileInput.files[0]);

        this.disabled = true;
        this.textContent = '上传中...';

        fetch('/api/defaultBattleSong/upload', {
          method: 'POST',
          body: formData
        })
          .then(response => response.json())
          .then(data => {
            if (data.success) {
              showMessage('默认战歌上传成功');
              fileInput.value = '';
              loadDefaultBattleSong();
            } else {
              showMessage(data.message || '上传失败', 'error');
            }
          })
          .catch(error => {
            console.error('上传默认战歌失败:', error);
            showMessage('上传失败，请重试', 'error');
          })
          .finally(() => {
            this.disabled = false;
            this.textContent = '上传默认战歌';
          });
      });
    }

    const removeDefaultSongBtn = document.getElementById('removeDefaultSongBtn');
    if (removeDefaultSongBtn) {
      removeDefaultSongBtn.addEventListener('click', function () {
        if (!confirm('确定要删除当前的默认战歌吗？')) {
          return;
        }

        this.disabled = true;
        this.textContent = '删除中...';

        fetch('/api/defaultBattleSong/delete', {
          method: 'DELETE'
        })
          .then(response => response.json())
          .then(data => {
            if (data.success) {
              showMessage('默认战歌已成功删除');
              loadDefaultBattleSong();
            } else {
              showMessage(data.message || '删除失败', 'error');
            }
          })
          .catch(error => {
            console.error('删除默认战歌失败:', error);
            showMessage('删除失败，请重试', 'error');
          })
          .finally(() => {
            this.disabled = false;
            this.textContent = '移除默认战歌';
          });
      });
    }

    loadDefaultBattleSong();
  }

  window.MusicPresenter = {
    populateInquirySelects,
    loadInquiryMusicConfig,
    loadMusic,
    deleteMusic,
    initInquiryMusicConfigEvents,
    initDefaultBattleSong
  };
})();
