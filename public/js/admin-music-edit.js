/**
 * 初始化音乐上传事件
 */
function initMusicUploadEvents() {
  if (window.__musicUploadEventsInited) {
    return;
  }
  window.__musicUploadEventsInited = true;

  const uploadMusicModal = document.getElementById('uploadMusicModal');
  const openUploadMusicModalBtn = document.getElementById('openUploadMusicModalBtn');
  const uploadSoundEffectModal = document.getElementById('uploadSoundEffectModal');
  const openUploadSoundEffectModalBtn = document.getElementById('openUploadSoundEffectModalBtn');

  const uploadMusicBtn = document.getElementById('uploadMusicBtn');
  const uploadMusicBtnText = document.getElementById('uploadMusicBtnText');

  if (window.AdminModals && typeof window.AdminModals.initUploadMusicModals === 'function') {
    window.AdminModals.initUploadMusicModals();
  }

  // 上传音乐
  // 音乐来源切换
  document.querySelectorAll('input[name="musicSource"]').forEach(radio => {
    radio.addEventListener('change', function() {
      const localForm = document.getElementById('localMusicForm');
      const externalForm = document.getElementById('externalMusicForm');
      
      if (this.value === 'local') {
        localForm.style.display = 'block';
        externalForm.style.display = 'none';
        if (uploadMusicBtn) uploadMusicBtn.style.display = '';

        if (uploadMusicBtnText) uploadMusicBtnText.textContent = '上传音乐';
      } else {
        localForm.style.display = 'none';
        externalForm.style.display = 'block';
        if (uploadMusicBtn) uploadMusicBtn.style.display = 'none';
        if (uploadMusicBtnText) uploadMusicBtnText.textContent = '上传音乐';
      }
    });
  });
  
  const externalMusicSearchBtn = document.getElementById('externalMusicSearchBtn');
  const externalMusicSearchQuery = document.getElementById('externalMusicSearchQuery');
  const externalMusicSearchResults = document.getElementById('externalMusicSearchResults');
  const externalMusicPagination = document.getElementById('externalMusicPagination');
  const externalMusicIdInput = document.getElementById('externalMusicId');
  const auditionWrap = document.getElementById('externalMusicAudition');
  const auditionAudio = document.getElementById('externalMusicAuditionAudio');
  const importProgressWrap = document.getElementById('externalMusicImportProgress');
  const importProgressText = document.getElementById('externalMusicImportProgressText');
  const importProgressFill = document.getElementById('externalMusicImportProgressFill');
  const importProgressMeta = document.getElementById('externalMusicImportProgressMeta');
  const importedMusicHint = document.getElementById('importedMusicHint');
  const importedMusicHintText = document.getElementById('importedMusicHintText');

  const externalSearchPageSize = 10;
  let externalSearchKeywords = '';
  let externalSearchPage = 1;
  let externalSearchTotal = 0;
  const auditionUrlCache = new Map();
  let importedLocalMusicId = null;

  function safeStopAudition() {
    if (auditionWrap) auditionWrap.style.display = 'none';
    if (!auditionAudio) return;
    try {
      auditionAudio.pause();
      auditionAudio.currentTime = 0;
      const srcEl = auditionAudio.querySelector('source');
      if (srcEl) srcEl.setAttribute('src', '');
      try { auditionAudio.load(); } catch (e) {}
    } catch (e) {}
  }

  function setAuditionUrl(url) {
    if (!auditionWrap || !auditionAudio) return;
    const srcEl = auditionAudio.querySelector('source');
    if (!srcEl) return;
    srcEl.setAttribute('src', url || '');
    try { auditionAudio.load(); } catch (e) {}
    auditionWrap.style.display = 'block';

    if (!auditionWrap.__playerBinding) {
      if (window.AudioCore && typeof window.AudioCore.bindAudioPlayer === 'function') {
        auditionWrap.__playerBinding = window.AudioCore.bindAudioPlayer(auditionWrap);
      } else if (typeof window.bindAudioPlayer === 'function') {
        auditionWrap.__playerBinding = window.bindAudioPlayer(auditionWrap);
      }
    }
  }

  function showImportProgressUI(text, percent, metaText) {
    if (importProgressWrap) importProgressWrap.style.display = 'block';
    if (importProgressText) importProgressText.textContent = text || '';

    if (importProgressFill) {
      const p = Number.isFinite(percent) ? percent : 0;
      importProgressFill.style.width = `${Math.max(0, Math.min(100, p))}%`;
    }
    if (importProgressMeta) importProgressMeta.textContent = metaText || '';

    if (importProgressWrap) {
      try {
        importProgressWrap.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      } catch (e) {}
    }
  }

  function hideImportProgressUI() {
    if (importProgressWrap) importProgressWrap.style.display = 'none';
    if (importProgressFill) importProgressFill.style.width = '0%';
    if (importProgressText) importProgressText.textContent = '准备中...';
    if (importProgressMeta) importProgressMeta.textContent = '';
  }

  function setImportedMode(musicId, displayName) {
    importedLocalMusicId = musicId ? String(musicId) : null;
    if (importedMusicHint && importedMusicHintText) {
      if (importedLocalMusicId) {
        importedMusicHintText.textContent = String(displayName || '');
        importedMusicHint.style.display = 'block';
      } else {
        importedMusicHintText.textContent = '';
        importedMusicHint.style.display = 'none';
      }
    }

    if (uploadMusicBtnText) {
      uploadMusicBtnText.textContent = importedLocalMusicId ? '保存信息' : '上传音乐';
    }
  }

  function showNiceConfirm(options) {
    const title = options && options.title ? String(options.title) : '确认操作';
    const message = options && options.message ? String(options.message) : '';
    const confirmText = options && options.confirmText ? String(options.confirmText) : '确认';
    const cancelText = options && options.cancelText ? String(options.cancelText) : '取消';

    return new Promise(resolve => {
      const overlay = document.createElement('div');
      overlay.style.position = 'fixed';
      overlay.style.inset = '0';
      overlay.style.background = 'rgba(0,0,0,0.45)';
      overlay.style.backdropFilter = 'blur(2px)';
      overlay.style.zIndex = '9999';
      overlay.style.display = 'flex';
      overlay.style.alignItems = 'center';
      overlay.style.justifyContent = 'center';
      overlay.style.padding = '16px';

      const card = document.createElement('div');
      card.style.width = 'min(520px, 92vw)';
      card.style.background = 'white';
      card.style.borderRadius = '16px';
      card.style.boxShadow = '0 20px 60px rgba(0,0,0,0.25)';
      card.style.border = '1px solid rgba(0,0,0,0.06)';
      card.style.overflow = 'hidden';

      const header = document.createElement('div');
      header.style.padding = '16px 18px';
      header.style.background = 'linear-gradient(135deg, #f5f7fa 0%, #eef2f7 100%)';
      header.style.borderBottom = '1px solid rgba(0,0,0,0.06)';
      header.innerHTML = `<div style="font-weight: 700; font-size: 16px; color: #111;">${title}</div>`;

      const body = document.createElement('div');
      body.style.padding = '16px 18px';
      body.style.color = '#333';
      body.style.fontSize = '14px';
      body.style.lineHeight = '1.6';
      body.style.whiteSpace = 'pre-wrap';
      body.textContent = message;

      const footer = document.createElement('div');
      footer.style.display = 'flex';
      footer.style.gap = '10px';
      footer.style.justifyContent = 'flex-end';
      footer.style.padding = '14px 18px 18px';
      footer.style.background = '#fff';

      const cancelBtn = document.createElement('button');
      cancelBtn.type = 'button';
      cancelBtn.textContent = cancelText;
      cancelBtn.style.backgroundColor = '#9c9c9c';
      cancelBtn.style.padding = '10px 14px';
      cancelBtn.style.borderRadius = '12px';

      const okBtn = document.createElement('button');
      okBtn.type = 'button';
      okBtn.textContent = confirmText;
      okBtn.style.backgroundColor = '#34c759';
      okBtn.style.padding = '10px 14px';
      okBtn.style.borderRadius = '12px';

      function cleanup(result) {
        try { document.removeEventListener('keydown', onKey); } catch (e) {}
        try { overlay.remove(); } catch (e) {}
        resolve(result);
      }

      function onKey(e) {
        if (!e) return;
        if (e.key === 'Escape') cleanup(false);
      }

      overlay.addEventListener('click', function (e) {
        if (e && e.target === overlay) cleanup(false);
      });
      cancelBtn.addEventListener('click', function () { cleanup(false); });
      okBtn.addEventListener('click', function () { cleanup(true); });
      document.addEventListener('keydown', onKey);

      footer.appendChild(cancelBtn);
      footer.appendChild(okBtn);
      card.appendChild(header);
      card.appendChild(body);
      card.appendChild(footer);
      overlay.appendChild(card);
      document.body.appendChild(overlay);

      try { okBtn.focus(); } catch (e) {}
    });
  }

  function switchToLocalTabAndPrefill(payload) {
    const localRadio = document.getElementById('musicSourceLocal');
    if (localRadio) {
      localRadio.checked = true;
      try { localRadio.dispatchEvent(new Event('change', { bubbles: true })); } catch (e) {}
    }

    const nameEl = document.getElementById('musicName');
    const descEl = document.getElementById('musicDescription');
    const lrcEl = document.getElementById('lrcEditor');
    if (nameEl && payload && payload.name) nameEl.value = String(payload.name);
    if (descEl && payload && payload.description != null) descEl.value = String(payload.description || '');
    if (lrcEl && payload && payload.lrcContent != null) lrcEl.value = String(payload.lrcContent || '');
  }

  function scrollToMusicItem(musicId) {
    if (!musicId) return;
    const list = document.getElementById('musicList');
    if (!list) return;

    const safeId = (typeof CSS !== 'undefined' && CSS && typeof CSS.escape === 'function') ? CSS.escape(musicId) : musicId;
    const targetBtn = list.querySelector(`.play-music-btn[data-music-id="${safeId}"]`);
    const target = targetBtn ? targetBtn.closest('.music-item') : null;
    if (!target) return;

    try {
      target.scrollIntoView({ behavior: 'smooth', block: 'center' });
      const oldOutline = target.style.outline;
      target.style.outline = '2px solid #34c759';
      target.style.borderRadius = '12px';
      setTimeout(() => {
        target.style.outline = oldOutline || '';
      }, 2000);
    } catch (e) {}
  }

  function startImportNeteaseSong(payload) {
    showImportProgressUI('开始导入...', 0, '');
    return fetch('/api/music/import-netease', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload || {})
    })
      .then(r => r.json())
      .then(data => {
        if (!data || !data.success || !data.jobId) {
          throw new Error((data && data.message) ? data.message : '导入失败');
        }

        const jobId = String(data.jobId);
        let timer = null;
        let done = false;

        function stop() {
          if (done) return;
          done = true;
          if (timer) {
            try { clearInterval(timer); } catch (e) {}
            timer = null;
          }
        }

        function pollOnce() {
          return fetch(`/api/music/import-status/${encodeURIComponent(jobId)}`, { cache: 'no-cache' })
            .then(r => r.json())
            .then(d => {
              if (!d || !d.success || !d.job) throw new Error((d && d.message) ? d.message : '获取进度失败');
              const job = d.job;
              const p = (typeof job.percent === 'number') ? job.percent : 0;
              const meta = job.progressText || job.message || '';
              const title = job.phase ? String(job.phase) : '';
              showImportProgressUI(title ? `${title}...` : '导入中...', p, meta);

              if (job.status === 'done') {
                stop();
                if (typeof window.showMessage === 'function') window.showMessage('导入成功');
                if (typeof window.loadMusic === 'function') window.loadMusic();
                if (job.musicId) scrollToMusicItem(String(job.musicId));

                // 导入完成后：切回“本地上传”并预填信息（不强制关闭弹窗）
                switchToLocalTabAndPrefill(payload);
                setImportedMode(job.musicId || null, payload && payload.name ? payload.name : '');
                hideImportProgressUI();
                return;
              }

              if (job.status === 'error') {
                stop();
                const errMsg = job.error || job.message || '导入失败';
                if (typeof window.showMessage === 'function') window.showMessage(String(errMsg), 'error');
              }
            });
        }

        timer = setInterval(pollOnce, 800);
        return pollOnce();
      })
      .catch(err => {
        if (typeof window.showMessage === 'function') {
          window.showMessage(err && err.message ? err.message : '导入失败', 'error');
        }
      });
  }

  function fetchAuditionUrlById(songId) {
    const idStr = String(songId || '').trim();
    if (!idStr) return Promise.reject(new Error('缺少歌曲ID'));
    if (auditionUrlCache.has(idStr)) return Promise.resolve(auditionUrlCache.get(idStr));

    function requestLevel(level) {
      return fetch('https://wyapi-1.toubiec.cn/api/music/url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: idStr, level })
      })
        .then(res => res.json())
        .then(data => {
          if (!data || data.code !== 200 || !data.data || !data.data[0]) {
            throw new Error((data && data.msg) ? data.msg : '获取试听链接失败');
          }
          const url = String(data.data[0].url || '').trim();
          if (!url) throw new Error('获取试听链接失败');
          return url;
        });
    }

    return requestLevel('exhigh')
      .catch(() => requestLevel('standard'))
      .then(url => {
        auditionUrlCache.set(idStr, url);
        return url;
      });
  }

  function renderExternalSearchResults(items, meta) {
    if (!externalMusicSearchResults) return;
    externalMusicSearchResults.innerHTML = '';

    if (externalMusicPagination) {
      externalMusicPagination.style.display = 'none';
      externalMusicPagination.innerHTML = '';
    }

    externalSearchTotal = (meta && typeof meta.total === 'number') ? meta.total : externalSearchTotal;
    externalSearchPage = (meta && typeof meta.page === 'number') ? meta.page : externalSearchPage;

    if (!items || items.length === 0) {
      externalMusicSearchResults.style.display = 'none';
      showMessage('没有搜索结果', 'error');
      return;
    }

    items.forEach(item => {
      const row = document.createElement('div');
      row.style.display = 'flex';
      row.style.alignItems = 'center';
      row.style.justifyContent = 'space-between';

      row.style.gap = '10px';
      row.style.padding = '12px 14px';
      row.style.borderBottom = '1px solid var(--border-color)';

      const left = document.createElement('div');
      left.style.display = 'flex';
      left.style.alignItems = 'center';
      left.style.gap = '10px';
      left.style.flex = '1';
      left.style.minWidth = '0';

      const coverUrl = (item && (item.picUrl || (item.al && item.al.picUrl) || (item.album && item.album.picUrl))) || '';
      if (coverUrl) {
        const cover = document.createElement('img');
        cover.src = coverUrl;
        cover.alt = item && item.name ? String(item.name) : '';
        cover.loading = 'lazy';
        cover.style.width = '42px';
        cover.style.height = '42px';
        cover.style.borderRadius = '8px';
        cover.style.objectFit = 'cover';
        cover.style.flex = '0 0 auto';
        cover.onerror = function () {
          try { cover.style.display = 'none'; } catch (e) {}
        };
        left.appendChild(cover);
      }

      const textWrap = document.createElement('div');
      textWrap.style.flex = '1';
      textWrap.style.minWidth = '0';

      const title = document.createElement('div');
      title.textContent = item.name || '未知歌曲';
      title.style.fontWeight = '600';
      title.style.fontSize = '14px';
      title.style.whiteSpace = 'nowrap';
      title.style.overflow = 'hidden';
      title.style.textOverflow = 'ellipsis';

      const sub = document.createElement('div');
      const artistText = item.artists ? String(item.artists) : '';
      const albumText = item.album ? String(item.album) : '';
      sub.textContent = artistText && albumText ? `${artistText} · ${albumText}` : (artistText || albumText || '');
      sub.style.fontSize = '12px';
      sub.style.color = 'var(--text-secondary)';
      sub.style.marginTop = '4px';
      sub.style.whiteSpace = 'nowrap';
      sub.style.overflow = 'hidden';
      sub.style.textOverflow = 'ellipsis';

      textWrap.appendChild(title);
      textWrap.appendChild(sub);
      left.appendChild(textWrap);

      const actionWrap = document.createElement('div');
      actionWrap.style.display = 'flex';
      actionWrap.style.alignItems = 'center';
      actionWrap.style.gap = '10px';

      const auditionBtn = document.createElement('button');
      auditionBtn.type = 'button';
      auditionBtn.textContent = '试听';
      auditionBtn.style.backgroundColor = '#5ac8fa';
      auditionBtn.style.whiteSpace = 'nowrap';
      auditionBtn.addEventListener('click', function () {
        const songId = (item && item.id != null) ? String(item.id) : '';
        if (!songId) {
          showMessage('缺少歌曲ID，无法试听', 'error');
          return;
        }

        auditionBtn.disabled = true;
        const oldText = auditionBtn.textContent;
        auditionBtn.textContent = '解析中...';

        fetchAuditionUrlById(songId)
          .then(url => {
            safeStopAudition();
            setAuditionUrl(url);
          })
          .catch(err => {
            console.error('获取试听链接失败:', err);
            showMessage(`试听失败：${err && err.message ? err.message : '未知错误'}（可能被浏览器跨域拦截，必要时需后端代理）`, 'error');
          })
          .finally(() => {
            auditionBtn.disabled = false;
            auditionBtn.textContent = oldText;
          });
      });

      const selectBtn = document.createElement('button');
      selectBtn.type = 'button';
      selectBtn.textContent = '选中';
      selectBtn.style.backgroundColor = '#34c759';
      selectBtn.style.whiteSpace = 'nowrap';
      selectBtn.addEventListener('click', function () {
        const songId = (item && item.id != null) ? String(item.id) : '';
        if (!songId) {
          showMessage('缺少歌曲ID，无法选中', 'error');
          return;
        }

        if (externalMusicIdInput) externalMusicIdInput.value = songId;

        const nameEl2 = document.getElementById('musicName');
        const descEl2 = document.getElementById('musicDescription');
        const lrcEl2 = document.getElementById('lrcEditor');
        const name = nameEl2 ? String(nameEl2.value || item.name || '').trim() : '';
        const description = descEl2 ? String(descEl2.value || '').trim() : '';
        const lrcContent = lrcEl2 ? String(lrcEl2.value || '') : '';

        if (nameEl2 && !nameEl2.value) nameEl2.value = item.name || '';

        if (!name) {
          showMessage('请先填写音乐名称（或先选中会自动填）', 'error');
          return;
        }

        showNiceConfirm({
          title: '导入到本地',
          message: `${name}\nID: ${songId}\n\n将下载到服务器并加入音乐列表。`,
          confirmText: '开始导入',
          cancelText: '取消'
        }).then(ok => {
          if (!ok) return;
          startImportNeteaseSong({
            neteaseId: songId,
            name,
            description,
            lrcContent: lrcContent || null
          });
        });
      });

      actionWrap.appendChild(auditionBtn);
      actionWrap.appendChild(selectBtn);
      row.appendChild(left);
      row.appendChild(actionWrap);
      externalMusicSearchResults.appendChild(row);
    });

    externalMusicSearchResults.style.display = 'block';

    const perPage = externalSearchPageSize;
    const totalPages = (externalSearchTotal && perPage) ? Math.max(1, Math.ceil(externalSearchTotal / perPage)) : 1;
    if (externalMusicPagination && totalPages > 1) {
      externalMusicPagination.style.display = 'flex';
      externalMusicPagination.innerHTML = '';

      function makeBtn(label, disabled, onClick) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.textContent = label;
        btn.disabled = !!disabled;
        btn.style.padding = '6px 10px';
        btn.style.borderRadius = '10px';
        btn.style.fontSize = '12px';
        btn.style.lineHeight = '1';
        btn.style.backgroundColor = '#f5f5f7';
        btn.style.color = '#111';
        btn.style.border = '1px solid rgba(0,0,0,0.08)';
        btn.style.cursor = btn.disabled ? 'not-allowed' : 'pointer';
        btn.style.opacity = btn.disabled ? '0.55' : '1';
        btn.addEventListener('click', function () {
          if (btn.disabled) return;
          onClick();
        });
        return btn;
      }

      const prevBtn = makeBtn('上一页', externalSearchPage <= 1, () => runExternalSearch(externalSearchPage - 1));
      const nextBtn = makeBtn('下一页', externalSearchPage >= totalPages, () => runExternalSearch(externalSearchPage + 1));

      const info = document.createElement('div');
      info.textContent = `${externalSearchPage}/${totalPages}`;
      info.style.fontSize = '12px';
      info.style.color = 'var(--text-secondary)';
      info.style.padding = '0 2px';

      externalMusicPagination.appendChild(prevBtn);
      externalMusicPagination.appendChild(info);
      externalMusicPagination.appendChild(nextBtn);
    }
  }

  function runExternalSearch(page) {
    const q = externalMusicSearchQuery ? externalMusicSearchQuery.value.trim() : '';
    if (!q) {
      showMessage('请输入关键词再搜索', 'error');
      return;
    }

    externalSearchKeywords = q;
    externalSearchPage = (typeof page === 'number' && page > 0) ? page : 1;

    if (externalMusicSearchBtn) {
      externalMusicSearchBtn.disabled = true;
      externalMusicSearchBtn.textContent = '搜索中...';
    }

    fetch('https://wyapi-1.toubiec.cn/api/music/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        keywords: q,
        page: externalSearchPage,
        limit: externalSearchPageSize,
        pageSize: externalSearchPageSize
      })
    })
      .then(res => res.json())
      .then(data => {
        if (!data || data.code !== 200 || !data.data || !Array.isArray(data.data.songs)) {
          throw new Error((data && data.msg) ? data.msg : '搜索失败');
        }
        const total = (data && data.data && typeof data.data.total === 'number') ? data.data.total : 0;
        renderExternalSearchResults(data.data.songs, { total, page: externalSearchPage });
      })
      .catch(err => {
        console.error('搜索音乐失败:', err);
        showMessage(`搜索失败：${err && err.message ? err.message : '未知错误'}（可能被浏览器跨域拦截，必要时需后端代理）`, 'error');
        if (externalMusicSearchResults) {
          externalMusicSearchResults.style.display = 'none';
          externalMusicSearchResults.innerHTML = '';
        }
      })
      .finally(() => {
        if (externalMusicSearchBtn) {
          externalMusicSearchBtn.disabled = false;
          externalMusicSearchBtn.textContent = '搜索';
        }
      });
  }

  if (externalMusicSearchBtn) externalMusicSearchBtn.addEventListener('click', function () { runExternalSearch(); });
  if (externalMusicSearchQuery) {
    externalMusicSearchQuery.addEventListener('keydown', function (e) {
      if (e && e.key === 'Enter') {
        e.preventDefault();
        runExternalSearch();
      }
    });
  }

  if (uploadMusicBtn) uploadMusicBtn.addEventListener('click', function () {
    const musicSource = document.querySelector('input[name="musicSource"]:checked').value;
    const musicName = document.getElementById('musicName').value.trim();
    const musicDescription = document.getElementById('musicDescription').value.trim();
    const lrcContent = document.getElementById('lrcEditor').value.trim();

    if (!musicName) {
      showMessage('请输入音乐名称', 'error');
      return;
    }

    if (musicSource !== 'local') {
      showMessage('请在搜索结果中点击“选中”→“开始导入”', 'error');
      return;
    }

    const uploadBtn = this;
    const musicFile = document.getElementById('musicFile').files[0];
    const lrcFile = document.getElementById('lrcFile').files[0];

    if (!musicFile && importedLocalMusicId) {
      const formData = new FormData();
      formData.append('musicId', importedLocalMusicId);
      formData.append('name', musicName);
      formData.append('description', musicDescription);
      if (lrcFile) formData.append('lrcFile', lrcFile);
      else if (lrcContent) formData.append('lrcContent', lrcContent);

      uploadBtn.disabled = true;
      if (uploadMusicBtnText) uploadMusicBtnText.textContent = '保存中...';

      fetch('/api/music/update', {
        method: 'POST',
        body: formData
      })
        .then(r => r.json())
        .then(data => {
          if (data && data.success) {
            showMessage('保存成功', 'success');
            clearMusicForm();
            loadMusic();
            if (uploadMusicModal) {
              uploadMusicModal.style.display = 'none';
              try { document.body.style.overflow = ''; } catch (e) {}
            }
          } else {
            showMessage((data && data.message) ? data.message : '保存失败，请重试', 'error');
          }
        })
        .catch(error => {
          console.error('保存音乐信息失败:', error);
          showMessage('保存失败，请重试', 'error');
        })
        .finally(() => {
          uploadBtn.disabled = false;
          if (uploadMusicBtnText) uploadMusicBtnText.textContent = importedLocalMusicId ? '保存信息' : '上传音乐';
        });
      return;
    }

    if (!musicFile) {
      showMessage('请选择音乐文件', 'error');
      return;
    }

    const formData = new FormData();
    formData.append('musicFile', musicFile);
    formData.append('name', musicName);
    formData.append('description', musicDescription);
    formData.append('isSound', 'false');

    if (lrcFile) {
      formData.append('lrcFile', lrcFile);
    } else if (lrcContent) {
      const lrcBlob = new Blob([lrcContent], { type: 'text/plain' });
      formData.append('lrcFile', lrcBlob, musicName + '.lrc');
      formData.append('lrcContent', lrcContent);
    }

    uploadBtn.disabled = true;
    if (uploadMusicBtnText) uploadMusicBtnText.textContent = '上传中...';

    fetch('/api/music/upload', {
      method: 'POST',
      body: formData
    })
      .then(response => response.json())
      .then(data => {
        if (data.success) {
          showMessage('音乐上传成功', 'success');
          clearMusicForm();
          loadMusic();

          if (uploadMusicModal) {
            uploadMusicModal.style.display = 'none';
            try { document.body.style.overflow = ''; } catch (e) {}
          }
        } else {
          showMessage(data.message || '上传失败，请重试', 'error');
        }
      })
      .catch(error => {
        console.error('上传音乐失败:', error);
        showMessage('上传失败，请重试', 'error');
      })
      .finally(() => {
        uploadBtn.disabled = false;
        if (uploadMusicBtnText) uploadMusicBtnText.textContent = '上传音乐';
      });
  });

  function clearMusicForm() {
    document.getElementById('musicFile').value = '';
    document.getElementById('lrcFile').value = '';
    if (externalMusicIdInput) externalMusicIdInput.value = '';
    if (externalMusicSearchQuery) externalMusicSearchQuery.value = '';

    if (externalMusicSearchResults) {
      externalMusicSearchResults.style.display = 'none';
      externalMusicSearchResults.innerHTML = '';
    }

    if (externalMusicPagination) {
      externalMusicPagination.style.display = 'none';
      externalMusicPagination.innerHTML = '';
    }

    setImportedMode(null, '');
    document.getElementById('lrcEditor').value = '';
    document.getElementById('musicName').value = '';
    document.getElementById('musicDescription').value = '';
    document.getElementById('lrcPreview').style.display = 'none';

    safeStopAudition();
    hideImportProgressUI();
  }

  function clearSoundEffectForm() {
    const fileEl = document.getElementById('soundEffectFile');
    const nameEl = document.getElementById('soundEffectName');
    const descEl = document.getElementById('soundEffectDescription');
    if (fileEl) fileEl.value = '';
    if (nameEl) nameEl.value = '';
    if (descEl) descEl.value = '';
  }

  const uploadSoundEffectBtn = document.getElementById('uploadSoundEffectBtn');
  if (uploadSoundEffectBtn && !uploadSoundEffectBtn.__bbzgBound) {
    uploadSoundEffectBtn.__bbzgBound = true;
    uploadSoundEffectBtn.addEventListener('click', function() {
      const soundFile = document.getElementById('soundEffectFile').files[0];
      const soundName = document.getElementById('soundEffectName').value.trim();
      const soundDescription = document.getElementById('soundEffectDescription').value.trim();

      if (!soundFile) {
        showMessage('请选择音效文件', 'error');
        return;
      }

      if (!soundName) {
        showMessage('请输入音效名称', 'error');
        return;
      }

      if (soundFile.size > 500000) {  // 大于500KB
        if (!confirm('该文件较大，可能不适合作为短音效。是否继续上传？')) {
          return;
        }
      }

      const formData = new FormData();
      formData.append('sound', soundFile);
      formData.append('name', soundName);
      formData.append('description', soundDescription);

      fetch('/api/sound/upload', {
        method: 'POST',
        body: formData
      })
      .then(response => response.json())
      .then(data => {
        if (data.success) {
          showMessage('音效上传成功');
          clearSoundEffectForm();
          loadMusic();
          if (uploadSoundEffectModal) {
            uploadSoundEffectModal.style.display = 'none';
            try { document.body.style.overflow = ''; } catch (e) {}
          }
        } else {
          showMessage(data.message || '音效上传失败', 'error');
        }
      })
      .catch(error => {
        console.error('上传音效失败:', error);
        showMessage('上传音效失败，请重试', 'error');
      });
    });
  }

  if (openUploadMusicModalBtn) {
    openUploadMusicModalBtn.addEventListener('click', function () {
      clearMusicForm();
    });
  }
}

function initEditMusicModal() {
  const modal = document.getElementById('editMusicModal');
  if (!modal) return;

  function open() {
    modal.style.display = 'flex';
    try { document.body.style.overflow = 'hidden'; } catch (e) {}
  }

  function close() {
    modal.style.display = 'none';
    try { document.body.style.overflow = ''; } catch (e) {}
  }

  const cancelBtn = document.getElementById('editMusicCancelBtn');
  if (cancelBtn) {
    cancelBtn.addEventListener('click', function(e) {
      if (e) e.preventDefault();
      close();
    });
  }

  if (window.ModalCore && typeof window.ModalCore.bindModalClose === 'function') {
    window.ModalCore.bindModalClose('editMusicModal', {
      closeSelector: '#closeEditMusicModal',
      cancelId: 'editMusicCancelBtn',
      overlayClose: true,
      escClose: true,
      onClose: close
    });
  }

  window.__openEditMusicModal = open;
  window.__closeEditMusicModal = close;
}

function initLrcEditor() {
  if (window.__lrcEditorInited) return;
  window.__lrcEditorInited = true;

  function renderPreview(text, contentEl) {
    if (!contentEl) return;
    const safe = String(text || '').split(/\r?\n/).filter(Boolean);
    contentEl.innerHTML = safe.map(line => {
      const div = document.createElement('div');
      div.textContent = line;
      return div.outerHTML;
    }).join('');
  }

  const previewBtn = document.getElementById('lrcEditorPreviewBtn');
  if (previewBtn) {
    previewBtn.addEventListener('click', function(e) {
      if (e) e.preventDefault();
      const input = document.getElementById('lrcEditor');
      const wrap = document.getElementById('lrcPreview');
      const content = document.getElementById('lrcPreviewContent');
      if (!input || !wrap) return;
      renderPreview(input.value, content);
      wrap.style.display = 'block';
    });
  }

  const applyBtn = document.getElementById('lrcEditorApplyBtn');
  if (applyBtn) {
    applyBtn.addEventListener('click', function(e) {
      if (e) e.preventDefault();
      const wrap = document.getElementById('lrcPreview');
      if (wrap) wrap.style.display = 'none';
    });
  }

  const helpBtn = document.getElementById('lrcEditorHelpBtn');
  if (helpBtn) {
    helpBtn.addEventListener('click', function(e) {
      if (e) e.preventDefault();
      if (typeof window.showMessage === 'function') {
        window.showMessage('LRC 格式示例：\n[00:00.00]第一行歌词\n[00:05.00]第二行歌词');
      }
    });
  }

  const editPreviewBtn = document.getElementById('editLrcPreviewBtn');
  if (editPreviewBtn) {
    editPreviewBtn.addEventListener('click', function(e) {
      if (e) e.preventDefault();
      const input = document.getElementById('editLrcEditor');
      const wrap = document.getElementById('editLrcPreview');
      const content = document.getElementById('editLrcPreviewContent');
      if (!input || !wrap) return;
      renderPreview(input.value, content);
      wrap.style.display = 'block';
    });
  }

  const editHelpBtn = document.getElementById('editLrcHelpBtn');
  if (editHelpBtn) {
    editHelpBtn.addEventListener('click', function(e) {
      if (e) e.preventDefault();
      if (typeof window.showMessage === 'function') {
        window.showMessage('LRC 格式示例：\n[00:00.00]第一行歌词\n[00:05.00]第二行歌词');
      }
    });
  }
}

function editMusic(musicId) {
  const modal = document.getElementById('editMusicModal');
  if (!modal) return;

  if (!window.__openEditMusicModal && typeof initEditMusicModal === 'function') {
    initEditMusicModal();
  }

  const open = window.__openEditMusicModal;
  const close = window.__closeEditMusicModal;

  const nameEl = document.getElementById('editMusicName');
  const descEl = document.getElementById('editMusicDescription');
  const lrcEl = document.getElementById('editLrcEditor');
  const typeWrap = document.getElementById('editMusicTypeIndicator');
  const typeText = document.getElementById('editMusicTypeText');
  const saveBtn = document.getElementById('editMusicSaveBtn');

  if (!nameEl || !descEl || !lrcEl || !saveBtn) return;

  if (typeof open === 'function') open();

  fetch(`/api/music/${encodeURIComponent(musicId)}`)
    .then(r => r.json())
    .then(data => {
      if (!data || !data.success || !data.music) {
        throw new Error((data && data.message) ? data.message : '加载音乐信息失败');
      }

      const music = data.music;
      modal.__editingMusic = music;

      nameEl.value = music.name || '';
      descEl.value = music.description || '';

      if (typeWrap && typeText) {
        typeWrap.style.display = 'block';
        if (music.isSound) {
          typeText.textContent = '音效';
        } else {
          typeText.textContent = '本地音乐';
        }
      }

      lrcEl.value = '';
      if (music.lrcFilename) {
        fetch(`/api/music/${encodeURIComponent(musicId)}/lrc`)
          .then(r => {
            if (!r.ok) throw new Error('加载歌词失败');
            return r.text();
          })
          .then(text => {
            lrcEl.value = text || '';
          })
          .catch(() => {});
      }
    })
    .catch(err => {
      if (typeof window.showMessage === 'function') {
        window.showMessage(err && err.message ? err.message : '加载失败', 'error');
      }
      if (typeof close === 'function') close();
    });

  if (!saveBtn.__bbzgBound) {
    saveBtn.__bbzgBound = true;
    saveBtn.addEventListener('click', function(e) {
      if (e) e.preventDefault();
      const music = modal.__editingMusic;
      if (!music || !music.id) return;

      const name = String(nameEl.value || '').trim();
      if (!name) {
        if (typeof window.showMessage === 'function') window.showMessage('请输入音乐名称', 'error');
        return;
      }

      const description = String(descEl.value || '').trim();
      const lrcContent = String(lrcEl.value || '');

      saveBtn.disabled = true;
      const finish = () => { saveBtn.disabled = false; };

      const formData = new FormData();
      formData.append('musicId', music.id);
      formData.append('name', name);
      formData.append('description', description);
      formData.append('lrcContent', lrcContent);

      fetch('/api/music/update', {
        method: 'POST',
        body: formData
      })
        .then(r => r.json())
        .then(data => {
          if (!data || !data.success) throw new Error((data && data.message) ? data.message : '保存失败');
          if (typeof window.showMessage === 'function') window.showMessage('保存成功');
          if (typeof close === 'function') close();
          if (typeof window.loadMusic === 'function') window.loadMusic();
        })
        .catch(err => {
          if (typeof window.showMessage === 'function') window.showMessage(err && err.message ? err.message : '保存失败', 'error');
        })
        .finally(finish);
    });
  }
}

// 全局可用函数
window.editMusic = editMusic;
window.initLrcEditor = initLrcEditor;
window.initEditMusicModal = initEditMusicModal;
window.initMusicUploadEvents = initMusicUploadEvents;