(function () {
  function openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (!modal) return;
    modal.style.display = 'flex';
    try { document.body.style.overflow = 'hidden'; } catch (e) {}
  }

  function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (!modal) return;
    modal.style.display = 'none';
    try { document.body.style.overflow = ''; } catch (e) {}
    try {
      if (typeof window.stopAllAudio === 'function') {
        window.stopAllAudio();
      }
    } catch (e) {}
  }

  function setAudioPreview(audioEl, audioPath) {
    if (!audioEl) return;
    const src = audioPath ? `${audioPath}?t=${Date.now()}` : '';
    const source = audioEl.querySelector('source');
    if (source) source.src = src;
    audioEl.removeAttribute('src');
    try { audioEl.load(); } catch (e) {}
  }

  function safeJson(res) {
    return res.json().catch(() => ({}));
  }

  function apiPostJson(url, payload) {
    return fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload || {})
    }).then(async r => {
      const data = await safeJson(r);
      if (!r.ok) {
        const msg = data && data.message ? data.message : `请求失败(${r.status})`;
        throw new Error(msg);
      }
      return data;
    });
  }

  function apiGetJson(url) {
    return fetch(url).then(async r => {
      const data = await safeJson(r);
      if (!r.ok) {
        const msg = data && data.message ? data.message : `请求失败(${r.status})`;
        throw new Error(msg);
      }
      return data;
    });
  }

  function initStartupAudioModal() {
    const openBtn = document.getElementById('openStartupAudioModalBtn');
    const modalId = 'startupAudioModal';

    const ttsText = document.getElementById('startupTtsText');
    const genBtn = document.getElementById('startupGenerateTtsBtn');
    const uploadFile = document.getElementById('startupUploadFile');
    const uploadBtn = document.getElementById('startupUploadBtn');
    const saveBtn = document.getElementById('saveStartupAudioBtn');

    const preview = document.getElementById('startupAudioPreview');
    const currentLabel = document.getElementById('startupCurrentLabel');

    function getSelectedMode() {
      const el = document.querySelector('input[name="startupAudioMode"]:checked');
      return el ? el.value : 'default';
    }

    function setSelectedMode(mode) {
      const el = document.querySelector(`input[name="startupAudioMode"][value="${mode}"]`);
      if (el) el.checked = true;
    }

    function setCurrent(audioPath, mode, extra) {
      const path = audioPath || '/music/Go.mp3';
      if (preview) {
        preview.dataset.audioPath = path;
        setAudioPreview(preview, path);
      }
      if (currentLabel) {
        currentLabel.textContent = path;
      }
      if (mode) {
        setSelectedMode(mode);
      }
      if (mode === 'tts' && ttsText && extra && extra.ttsText) {
        ttsText.value = extra.ttsText;
      }
    }

    function loadCurrent() {
      return apiGetJson('/api/startup-audio')
        .then(data => {
          if (!data || !data.success) return;
          setCurrent(data.audioPath, data.mode, { ttsText: data.ttsText });
        })
        .catch(err => {
          console.error('加载启动音频配置失败:', err);
          if (window.showMessage) window.showMessage('加载启动音频配置失败', 'error');
          setCurrent('/music/Go.mp3', 'default');
        });
    }

    if (openBtn) {
      openBtn.addEventListener('click', function () {
        openModal(modalId);
        loadCurrent();
      });
    }

    if (window.ModalCore && typeof window.ModalCore.bindModalClose === 'function') {
      window.ModalCore.bindModalClose(modalId, {
        closeSelector: '.close',
        cancelId: 'cancelStartupAudioBtn',
        overlayClose: true,
        escClose: true,
        onClose: function () {
          closeModal(modalId);
        }
      });
    }

    if (genBtn) {
      genBtn.addEventListener('click', function () {
        const text = ttsText ? String(ttsText.value || '').trim() : '';
        if (!text) {
          if (window.showMessage) window.showMessage('请输入要生成的文本', 'error');
          return;
        }

        genBtn.disabled = true;
        const old = genBtn.textContent;
        genBtn.textContent = '生成中...';

        fetch('/api/text-to-speech', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            text: text,
            deviceType: 'admin',
            screenSize: `${window.innerWidth}x${window.innerHeight}`
          })
        })
          .then(r => safeJson(r).then(d => ({ ok: r.ok, d })))
          .then(({ ok, d }) => {
            if (!ok || !d || !d.success || !d.audioPath) {
              const msg = (d && d.message) ? d.message : '生成失败';
              throw new Error(msg);
            }
            setSelectedMode('tts');
            setCurrent(d.audioPath, 'tts', { ttsText: text });
            if (window.showMessage) window.showMessage('生成成功');
          })
          .catch(err => {
            console.error('生成启动音频失败:', err);
            if (window.showMessage) window.showMessage(err.message || '生成失败', 'error');
          })
          .finally(() => {
            genBtn.disabled = false;
            genBtn.textContent = old;
          });
      });
    }

    if (uploadBtn) {
      uploadBtn.addEventListener('click', function () {
        const file = uploadFile && uploadFile.files ? uploadFile.files[0] : null;
        if (!file) {
          if (window.showMessage) window.showMessage('请选择要上传的音频文件', 'error');
          return;
        }

        uploadBtn.disabled = true;
        const old = uploadBtn.textContent;
        uploadBtn.textContent = '上传中...';

        const form = new FormData();
        form.append('startupAudioFile', file);

        fetch('/api/startup-audio/upload', {
          method: 'POST',
          body: form
        })
          .then(r => safeJson(r).then(d => ({ ok: r.ok, d })))
          .then(({ ok, d }) => {
            if (!ok || !d || !d.success || !d.audioPath) {
              const msg = (d && d.message) ? d.message : '上传失败';
              throw new Error(msg);
            }
            setSelectedMode('file');
            setCurrent(d.audioPath, 'file');
            if (uploadFile) uploadFile.value = '';
            if (window.showMessage) window.showMessage('上传成功');
          })
          .catch(err => {
            console.error('上传启动音频失败:', err);
            if (window.showMessage) window.showMessage(err.message || '上传失败', 'error');
          })
          .finally(() => {
            uploadBtn.disabled = false;
            uploadBtn.textContent = old;
          });
      });
    }

    if (saveBtn) {
      saveBtn.addEventListener('click', function () {
        const mode = getSelectedMode();
        const audioPath = preview ? (preview.dataset.audioPath || '') : '';
        const text = ttsText ? String(ttsText.value || '').trim() : '';

        const payload = {
          mode
        };

        if (mode === 'default') {
          payload.audioPath = '';
          payload.ttsText = '';
        } else {
          payload.audioPath = audioPath;
          payload.ttsText = mode === 'tts' ? text : '';
        }

        saveBtn.disabled = true;
        const old = saveBtn.textContent;
        saveBtn.textContent = '保存中...';

        apiPostJson('/api/startup-audio', payload)
          .then(data => {
            if (window.showMessage) window.showMessage(data.message || '保存成功');
            closeModal(modalId);
          })
          .catch(err => {
            console.error('保存启动音频失败:', err);
            if (window.showMessage) window.showMessage(err.message || '保存失败', 'error');
          })
          .finally(() => {
            saveBtn.disabled = false;
            saveBtn.textContent = old;
          });
      });
    }
  }

  function initPersonalizedModal() {
    const openBtn = document.getElementById('openPersonalizedAudioModalBtn');
    const modalId = 'personalizedAudioModal';

    const listSelect = document.getElementById('personalizedAudioSelect');
    const preview = document.getElementById('personalizedAudioPreview');

    const ttsName = document.getElementById('personalizedTtsName');
    const ttsText = document.getElementById('personalizedTtsText');
    const genBtn = document.getElementById('personalizedGenerateTtsBtn');

    const uploadName = document.getElementById('personalizedUploadName');
    const uploadFile = document.getElementById('personalizedUploadFile');
    const uploadBtn = document.getElementById('personalizedUploadBtn');

    const fireBtn = document.getElementById('firePersonalizedBtn');
    const previewBtn = document.getElementById('previewPersonalizedBtn');

    function fillList(items) {
      if (!listSelect) return;
      const cur = listSelect.value;
      listSelect.innerHTML = '<option value="">请选择音频</option>';
      (Array.isArray(items) ? items : []).forEach(item => {
        if (!item || !item.audioPath) return;
        const opt = document.createElement('option');
        opt.value = item.audioPath;
        opt.textContent = item.name || item.audioPath;
        listSelect.appendChild(opt);
      });
      if (cur) listSelect.value = cur;
    }

    function loadList(selectPath) {
      return apiPostJson('/api/personalized/list', {})
        .then(data => {
          const items = (data && Array.isArray(data.items)) ? data.items : [];
          fillList(items);
          if (selectPath && listSelect) {
            listSelect.value = selectPath;
          }
          if (listSelect && preview) {
            const p = listSelect.value;
            if (p) {
              preview.dataset.audioPath = p;
              setAudioPreview(preview, p);
            }
          }
        })
        .catch(err => {
          console.error('加载个性化音频列表失败:', err);
          if (window.showMessage) window.showMessage('加载个性化列表失败', 'error');
        });
    }

    function getSelectedAudioPath() {
      if (!listSelect) return '';
      return listSelect.value || '';
    }

    if (openBtn) {
      openBtn.addEventListener('click', function () {
        openModal(modalId);
        loadList();
      });
    }

    if (window.ModalCore && typeof window.ModalCore.bindModalClose === 'function') {
      window.ModalCore.bindModalClose(modalId, {
        closeSelector: '.close',
        cancelId: 'cancelPersonalizedBtn',
        overlayClose: true,
        escClose: true,
        onClose: function () {
          closeModal(modalId);
        }
      });
    }

    if (listSelect) {
      listSelect.addEventListener('change', function () {
        const p = getSelectedAudioPath();
        if (preview) {
          preview.dataset.audioPath = p;
          setAudioPreview(preview, p);
        }
      });
    }

    if (previewBtn) {
      previewBtn.addEventListener('click', function () {
        const p = getSelectedAudioPath();
        if (!p) {
          if (window.showMessage) window.showMessage('请先选择音频', 'error');
          return;
        }
        if (preview) {
          setAudioPreview(preview, p);
          const playPromise = preview.play();
          if (playPromise && typeof playPromise.catch === 'function') {
            playPromise.catch(() => {
              if (window.showMessage) window.showMessage('浏览器阻止了自动播放，请点击页面后重试', 'error');
            });
          }
        }
      });
    }

    if (genBtn) {
      genBtn.addEventListener('click', function () {
        const name = ttsName ? String(ttsName.value || '').trim() : '';
        const text = ttsText ? String(ttsText.value || '').trim() : '';
        if (!name) {
          if (window.showMessage) window.showMessage('请输入名称', 'error');
          return;
        }
        if (!text) {
          if (window.showMessage) window.showMessage('请输入要生成的文本', 'error');
          return;
        }

        genBtn.disabled = true;
        const old = genBtn.textContent;
        genBtn.textContent = '生成中...';

        fetch('/api/text-to-speech', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: text, deviceType: 'admin', screenSize: `${window.innerWidth}x${window.innerHeight}` })
        })
          .then(r => safeJson(r).then(d => ({ ok: r.ok, d })))
          .then(({ ok, d }) => {
            if (!ok || !d || !d.success || !d.audioPath) {
              const msg = (d && d.message) ? d.message : '生成失败';
              throw new Error(msg);
            }
            return apiPostJson('/api/personalized/add', {
              name,
              audioPath: d.audioPath,
              source: 'tts',
              ttsText: text
            }).then(() => d.audioPath);
          })
          .then(audioPath => {
            if (window.showMessage) window.showMessage('已添加到个性化音频');
            loadList(audioPath);
          })
          .catch(err => {
            console.error('生成个性化音频失败:', err);
            if (window.showMessage) window.showMessage(err.message || '生成失败', 'error');
          })
          .finally(() => {
            genBtn.disabled = false;
            genBtn.textContent = old;
          });
      });
    }

    if (uploadBtn) {
      uploadBtn.addEventListener('click', function () {
        const name = uploadName ? String(uploadName.value || '').trim() : '';
        const file = uploadFile && uploadFile.files ? uploadFile.files[0] : null;
        if (!name) {
          if (window.showMessage) window.showMessage('请输入名称', 'error');
          return;
        }
        if (!file) {
          if (window.showMessage) window.showMessage('请选择要上传的音频文件', 'error');
          return;
        }

        uploadBtn.disabled = true;
        const old = uploadBtn.textContent;
        uploadBtn.textContent = '上传中...';

        const form = new FormData();
        form.append('personalizedAudioFile', file);
        form.append('name', name);

        fetch('/api/personalized/upload', {
          method: 'POST',
          body: form
        })
          .then(r => safeJson(r).then(d => ({ ok: r.ok, d })))
          .then(({ ok, d }) => {
            if (!ok || !d || !d.success || !d.audioPath) {
              const msg = (d && d.message) ? d.message : '上传失败';
              throw new Error(msg);
            }
            if (uploadFile) uploadFile.value = '';
            if (window.showMessage) window.showMessage('上传成功');
            loadList(d.audioPath);
          })
          .catch(err => {
            console.error('上传个性化音频失败:', err);
            if (window.showMessage) window.showMessage(err.message || '上传失败', 'error');
          })
          .finally(() => {
            uploadBtn.disabled = false;
            uploadBtn.textContent = old;
          });
      });
    }

    if (fireBtn) {
      fireBtn.addEventListener('click', function () {
        const p = getSelectedAudioPath() || (preview ? (preview.dataset.audioPath || '') : '');
        if (!p) {
          if (window.showMessage) window.showMessage('请先选择音频', 'error');
          return;
        }

        fireBtn.disabled = true;
        const old = fireBtn.textContent;
        fireBtn.textContent = '发射中...';

        apiPostJson('/api/personalized/fire', { audioPath: p })
          .then(data => {
            if (window.showMessage) window.showMessage(data.message || '已发射');
          })
          .catch(err => {
            console.error('发射失败:', err);
            if (window.showMessage) window.showMessage(err.message || '发射失败', 'error');
          })
          .finally(() => {
            fireBtn.disabled = false;
            fireBtn.textContent = old;
          });
      });
    }
  }

  function initCleanupModal() {
    const openBtn = document.getElementById('openAudioCleanupModalBtn');
    const modalId = 'audioCleanupModal';
    const listWrap = document.getElementById('audioCleanupList');
    const refreshBtn = document.getElementById('refreshAudioCleanupBtn');

    function render(items) {
      if (!listWrap) return;
      const list = Array.isArray(items) ? items : [];
      if (!list.length) {
        listWrap.innerHTML = '<div style="color: var(--text-secondary); padding: 12px 4px;">暂无可清理的废品文件</div>';
        return;
      }

      listWrap.innerHTML = '';
      list.forEach(item => {
        if (!item || !item.audioPath) return;
        const row = document.createElement('div');
        row.className = 'cleanup-item';
        row.innerHTML = `
          <div class="cleanup-meta">
            <div class="cleanup-path">${window.escapeHtml ? window.escapeHtml(item.audioPath) : item.audioPath}</div>
            <div class="cleanup-sub">${(item.sizeKb || 0)} KB</div>
          </div>
          <div class="cleanup-actions">
            <button type="button" class="cleanup-delete" data-audio-path="${window.escapeHtml ? window.escapeHtml(item.audioPath) : item.audioPath}" style="background-color: var(--danger-color);">删除</button>
          </div>
        `;
        listWrap.appendChild(row);
      });

      listWrap.querySelectorAll('.cleanup-delete').forEach(btn => {
        btn.addEventListener('click', function () {
          const audioPath = btn.getAttribute('data-audio-path');
          if (!audioPath) return;
          if (!confirm(`确定要删除该文件吗？\n${audioPath}`)) return;

          btn.disabled = true;
          const old = btn.textContent;
          btn.textContent = '删除中...';

          apiPostJson('/api/audio-cleanup/delete', { audioPath })
            .then(data => {
              if (window.showMessage) window.showMessage(data.message || '删除成功');
              render((data && data.items) ? data.items : []);
            })
            .catch(err => {
              console.error('删除失败:', err);
              if (window.showMessage) window.showMessage(err.message || '删除失败', 'error');
            })
            .finally(() => {
              btn.disabled = false;
              btn.textContent = old;
            });
        });
      });
    }

    function scan() {
      if (!listWrap) return Promise.resolve();
      listWrap.innerHTML = '<div class="loading-spinner">加载中...</div>';
      return apiPostJson('/api/audio-cleanup/scan', {})
        .then(data => {
          render((data && data.items) ? data.items : []);
        })
        .catch(err => {
          console.error('扫描失败:', err);
          if (window.showMessage) window.showMessage(err.message || '扫描失败', 'error');
          if (listWrap) listWrap.innerHTML = '<div style="color: var(--danger-color); padding: 12px 4px;">扫描失败</div>';
        });
    }

    if (openBtn) {
      openBtn.addEventListener('click', function () {
        openModal(modalId);
        scan();
      });
    }

    if (refreshBtn) {
      refreshBtn.addEventListener('click', function () {
        scan();
      });
    }

    if (window.ModalCore && typeof window.ModalCore.bindModalClose === 'function') {
      window.ModalCore.bindModalClose(modalId, {
        closeSelector: '.close',
        cancelId: 'cancelAudioCleanupBtn',
        overlayClose: true,
        escClose: true,
        onClose: function () {
          closeModal(modalId);
        }
      });
    }
  }

  window.initAudioPlaybackConfig = function initAudioPlaybackConfig() {
    if (window.__audioPlaybackConfigInited) {
      return;
    }
    window.__audioPlaybackConfigInited = true;

    initStartupAudioModal();
    initPersonalizedModal();
    initCleanupModal();
  };
})();
