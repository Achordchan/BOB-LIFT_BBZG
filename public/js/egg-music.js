(function () {
  const qInput = document.getElementById('q');
  const searchBtn = document.getElementById('searchBtn');
  const clearBtn = document.getElementById('clearBtn');
  const panel = document.getElementById('panel');
  const list = document.getElementById('list');
  const pager = document.getElementById('pager');
  const prevBtn = document.getElementById('prevBtn');
  const nextBtn = document.getElementById('nextBtn');
  const pageInfo = document.getElementById('pageInfo');
  const statusPill = document.getElementById('statusPill');
  const resultMeta = document.getElementById('resultMeta');
  const accountBtn = document.getElementById('accountBtn');

  const eggBroadcastBar = document.getElementById('eggBroadcastBar');
  const eggBroadcastCurrent = document.getElementById('eggBroadcastCurrent');
  const eggBroadcastEditBtn = document.getElementById('eggBroadcastEditBtn');
  const eggBroadcastModal = document.getElementById('eggBroadcastModal');
  const eggBroadcastCloseBtn = document.getElementById('eggBroadcastCloseBtn');
  const eggBroadcastCancelBtn = document.getElementById('eggBroadcastCancelBtn');
  const eggBroadcastList = document.getElementById('eggBroadcastList');

  const eggLoginModal = document.getElementById('eggLoginModal');
  const eggLoginCloseBtn = document.getElementById('eggLoginCloseBtn');
  const eggLoginCancelBtn = document.getElementById('eggLoginCancelBtn');
  const eggLoginSubmitBtn = document.getElementById('eggLoginSubmitBtn');
  const eggLoginUsername = document.getElementById('eggLoginUsername');
  const eggLoginPassword = document.getElementById('eggLoginPassword');

  const eggPwdModal = document.getElementById('eggPwdModal');
  const eggPwdCloseBtn = document.getElementById('eggPwdCloseBtn');
  const eggPwdCancelBtn = document.getElementById('eggPwdCancelBtn');
  const eggPwdSubmitBtn = document.getElementById('eggPwdSubmitBtn');
  const eggPwdCurrent = document.getElementById('eggPwdCurrent');
  const eggPwdNew = document.getElementById('eggPwdNew');

  const player = document.getElementById('player');
  const nowTitle = document.getElementById('nowTitle');
  const nowSub = document.getElementById('nowSub');
  const nowCover = document.getElementById('nowCover');

  const playerRoot = document.getElementById('eggMusicPlayer');
  const audioEl = document.getElementById('eggMusicAudio');
  const audioSourceEl = audioEl ? audioEl.querySelector('source') : null;
  const playBtn = playerRoot ? playerRoot.querySelector('.play-music-btn') : null;
  const playerBinding = (window.AudioCore && typeof window.AudioCore.bindAudioPlayer === 'function')
    ? window.AudioCore.bindAudioPlayer(playerRoot, { audioSelector: '#eggMusicAudio' })
    : (typeof window.bindAudioPlayer === 'function' ? window.bindAudioPlayer(playerRoot, { audioSelector: '#eggMusicAudio' }) : null);

  const toast = document.getElementById('toast');

  const PAGE_SIZE = 10;
  let keywords = '';
  let page = 1;
  let total = 0;
  let items = [];

  let me = null;
  let loginWaiter = null;

  let eggMusicList = null;

  function openBroadcastModal() {
    openModal(eggBroadcastModal);
  }

  function closeBroadcastModal() {
    closeModal(eggBroadcastModal);
  }

  function showToast(msg, type) {
    if (!toast) return;
    toast.textContent = String(msg || '');
    toast.style.display = 'block';
    toast.style.borderColor = type === 'error' ? 'rgba(255,59,48,0.4)' : 'rgba(255,255,255,0.14)';
    toast.style.background = type === 'error' ? 'rgba(255,59,48,0.15)' : 'rgba(0,0,0,0.55)';
    try {
      clearTimeout(toast.__t);
    } catch (e) {}
    toast.__t = setTimeout(() => {
      toast.style.display = 'none';
    }, 2200);
  }

  if (accountBtn) {
    accountBtn.addEventListener('click', function () {
      ensureLogin().then(ok => {
        if (!ok) return;
        openChangePassword();
      });
    });
  }

  if (eggBroadcastEditBtn) {
    eggBroadcastEditBtn.addEventListener('click', function () {
      ensureLogin().then(ok => {
        if (!ok) return;
        if (!Array.isArray(eggMusicList)) {
          showToast('音乐库加载中…', 'error');
          return;
        }
        renderBroadcastList();
        openBroadcastModal();
      });
    });
  }

  if (eggBroadcastCloseBtn) eggBroadcastCloseBtn.addEventListener('click', closeBroadcastModal);
  if (eggBroadcastCancelBtn) eggBroadcastCancelBtn.addEventListener('click', closeBroadcastModal);
  if (eggBroadcastModal) {
    eggBroadcastModal.addEventListener('click', function (e) {
      if (e && e.target === eggBroadcastModal) closeBroadcastModal();
    });
  }

  bindPwdModal();

  fetchMe().then(data => {
    me = data;
    setAccountButton();
    if (!me) {
      ensureLogin();
      return;
    }
    return loadEggMusicList().then(list => {
      eggMusicList = list;
      renderBroadcastUI();
    });
  });

  function setStatus(text) {
    if (statusPill) statusPill.textContent = String(text || '');
  }

  function setBusy(busy) {
    if (searchBtn) searchBtn.disabled = !!busy;
    if (clearBtn) clearBtn.disabled = !!busy;
    setStatus(busy ? '加载中…' : '准备就绪');
  }

  function setAccountButton() {
    if (!accountBtn) return;
    accountBtn.innerHTML = '';

    if (!(me && me.user && me.user.id)) {
      accountBtn.textContent = '登录';
      return;
    }

    const photoUrl = (me.user && me.user.photoUrl) ? String(me.user.photoUrl) : '';
    if (photoUrl) {
      const img = document.createElement('img');
      img.className = 'eggUserAvatar';
      img.alt = 'avatar';
      img.src = photoUrl;
      accountBtn.appendChild(img);
    }

    const span = document.createElement('span');
    span.textContent = safeText(me.user.name || '');
    accountBtn.appendChild(span);
  }

  function renderBroadcastUI() {
    if (!eggBroadcastBar || !eggBroadcastCurrent) return;
    if (!(me && me.user && me.user.id)) {
      eggBroadcastBar.style.display = 'none';
      return;
    }

    eggBroadcastBar.style.display = 'block';
    const curName = (me.user && me.user.musicName) ? String(me.user.musicName) : '';
    eggBroadcastCurrent.textContent = `当前播报：${curName || '未设置'}`;
  }

  function auditionLocalMusic(music) {
    const filename = music && music.filename ? String(music.filename) : '';
    if (!filename) {
      showToast('该音乐缺少文件名', 'error');
      return;
    }
    const url = `/music/${encodeURIComponent(filename)}`;

    fetch(url, { method: 'HEAD', cache: 'no-cache' })
      .then(res => {
        if (!res || !res.ok) throw new Error('音乐文件不可用');

        if (audioSourceEl) audioSourceEl.setAttribute('src', url);
        if (audioEl) {
          try { audioEl.load(); } catch (e) {}
        }
        if (player) player.style.display = 'block';
        if (nowTitle) nowTitle.textContent = safeText(music && music.name ? music.name : '未命名');
        if (nowSub) nowSub.textContent = '音乐库';
        if (nowCover) {
          const coverUrl = music && music.coverUrl ? String(music.coverUrl) : '';
          if (coverUrl) {
            nowCover.src = coverUrl;
            nowCover.style.display = 'block';
          } else {
            nowCover.removeAttribute('src');
            nowCover.style.display = 'none';
          }
        }
        if (playerBinding && typeof playerBinding.resetUI === 'function') {
          playerBinding.resetUI();
        }
        if (playBtn && !playBtn.disabled) {
          playBtn.click();
        } else if (audioEl) {
          const p = audioEl.play();
          if (p && typeof p.catch === 'function') p.catch(() => {});
        }
      })
      .catch(err => {
        showToast(err && err.message ? err.message : '试听失败', 'error');
      });
  }

  function renderBroadcastList() {
    if (!eggBroadcastList) return;
    if (!Array.isArray(eggMusicList)) {
      eggBroadcastList.innerHTML = '';
      const div = document.createElement('div');
      div.className = 'pill';
      div.textContent = '音乐库加载中…';
      eggBroadcastList.appendChild(div);
      return;
    }

    eggBroadcastList.innerHTML = '';

    const curId = (me && me.user && me.user.musicId) ? String(me.user.musicId) : '';

    eggMusicList.forEach(m => {
      if (!m || !m.id) return;

      const row = document.createElement('div');
      row.className = 'eggBroadcastItem';

      const title = document.createElement('div');
      title.className = 'eggBroadcastItemTitle';
      title.textContent = safeText(m.name || '');

      const actions = document.createElement('div');
      actions.className = 'eggBroadcastItemActions';

      const auditionBtn = document.createElement('button');
      auditionBtn.type = 'button';
      auditionBtn.className = 'btn btnSmall';
      auditionBtn.textContent = '试听';
      auditionBtn.addEventListener('click', function () {
        ensureLogin().then(ok => {
          if (!ok) return;
          auditionLocalMusic(m);
        });
      });

      const setBtn = document.createElement('button');
      setBtn.type = 'button';
      setBtn.className = 'btn btnSmall btnGood';
      setBtn.textContent = (curId && String(m.id) === curId) ? '当前' : '设为播报';
      if (curId && String(m.id) === curId) {
        setBtn.disabled = true;
      }

      setBtn.addEventListener('click', function () {
        ensureLogin().then(ok => {
          if (!ok) return;
          setBtn.disabled = true;
          apiPostJson('/api/egg/set-broadcast-music', { musicId: String(m.id) })
            .then(data => {
              if (!data || !data.success) throw new Error((data && data.message) ? data.message : '设置失败');
              showToast('已设为播报音乐');
              return refreshMeAndBroadcastUI();
            })
            .then(() => {
              renderBroadcastList();
              closeBroadcastModal();
            })
            .catch(err => {
              setBtn.disabled = false;
              showToast(err && err.message ? err.message : '设置失败', 'error');
            });
        });
      });

      actions.appendChild(auditionBtn);
      actions.appendChild(setBtn);

      row.appendChild(title);
      row.appendChild(actions);
      eggBroadcastList.appendChild(row);
    });
  }

  function loadEggMusicList() {
    return fetch('/api/egg/music', { method: 'GET' })
      .then(r => {
        if (!r || r.status === 401) return null;
        return r.json();
      })
      .then(data => {
        if (!data || !data.success) return null;
        return Array.isArray(data.music) ? data.music : [];
      })
      .catch(() => null);
  }

  function refreshMeAndBroadcastUI() {
    return fetchMe().then(data => {
      me = data;
      setAccountButton();
      return loadEggMusicList();
    }).then(list => {
      eggMusicList = list;
      renderBroadcastUI();
      return true;
    });
  }

  function openModal(modalEl) {
    if (!modalEl) return;
    modalEl.style.display = 'flex';
    modalEl.setAttribute('aria-hidden', 'false');
  }

  function closeModal(modalEl) {
    if (!modalEl) return;
    modalEl.style.display = 'none';
    modalEl.setAttribute('aria-hidden', 'true');
  }

  function apiPostJson(url, body) {
    return fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {})
    }).then(r => r.json());
  }

  function fetchMe() {
    return fetch('/api/egg/me', { method: 'GET' })
      .then(r => {
        if (r.status === 401) return null;
        return r.json();
      })
      .then(data => {
        if (!data || !data.success) return null;
        return data;
      })
      .catch(() => null);
  }

  function ensureLogin() {
    if (me && me.user && me.user.id) return Promise.resolve(true);
    if (loginWaiter) return loginWaiter;

    loginWaiter = fetchMe().then(data => {
      me = data;
      setAccountButton();
      if (me && me.user && me.user.id) {
        loginWaiter = null;
        return true;
      }

      return new Promise(resolve => {
        const finish = ok => {
          try { loginWaiter = null; } catch (e) {}
          resolve(!!ok);
        };

        const closeHandlers = [];
        function bind(el, fn) {
          if (!el) return;
          el.addEventListener('click', fn);
          closeHandlers.push([el, fn]);
        }

        function cleanup() {
          closeHandlers.forEach(([el, fn]) => {
            try { el.removeEventListener('click', fn); } catch (e) {}
          });
          closeHandlers.length = 0;
        }

        function onClose(ok) {
          cleanup();
          closeModal(eggLoginModal);
          if (eggLoginPassword) eggLoginPassword.value = '';
          finish(ok);
        }

        function doLogin() {
          const u = eggLoginUsername ? eggLoginUsername.value.trim() : '';
          const p = eggLoginPassword ? String(eggLoginPassword.value || '') : '';
          if (!u || !p) {
            showToast('请填写账号和密码', 'error');
            return;
          }
          if (eggLoginSubmitBtn) eggLoginSubmitBtn.disabled = true;
          apiPostJson('/api/egg/login', { username: u, password: p })
            .then(data2 => {
              if (!data2 || !data2.success) throw new Error((data2 && data2.message) ? data2.message : '登录失败');
              return refreshMeAndBroadcastUI();
            })
            .then(() => {
              if (!me || !me.user || !me.user.id) throw new Error('登录失败');
              showToast('登录成功');
              onClose(true);
            })
            .catch(err => {
              showToast(err && err.message ? err.message : '登录失败', 'error');
            })
            .finally(() => {
              if (eggLoginSubmitBtn) eggLoginSubmitBtn.disabled = false;
            });
        }

        bind(eggLoginCloseBtn, () => { cleanup(); onClose(false); });
        bind(eggLoginCancelBtn, () => { cleanup(); onClose(false); });
        bind(eggLoginSubmitBtn, () => { doLogin(); });

        if (eggLoginModal) {
          const overlayClose = (e) => {
            if (e && e.target === eggLoginModal) {
              onClose(false);
            }
          };
          eggLoginModal.addEventListener('click', overlayClose);
          closeHandlers.push([eggLoginModal, overlayClose]);
        }

        openModal(eggLoginModal);
        try {
          if (eggLoginUsername) eggLoginUsername.focus();
        } catch (e) {}
      });
    });

    return loginWaiter;
  }

  function openChangePassword() {
    if (!eggPwdModal) return;
    if (eggPwdCurrent) eggPwdCurrent.value = '';
    if (eggPwdNew) eggPwdNew.value = '';
    openModal(eggPwdModal);
  }

  function bindPwdModal() {
    if (eggPwdCloseBtn) eggPwdCloseBtn.addEventListener('click', () => closeModal(eggPwdModal));
    if (eggPwdCancelBtn) eggPwdCancelBtn.addEventListener('click', () => closeModal(eggPwdModal));
    if (eggPwdModal) {
      eggPwdModal.addEventListener('click', (e) => {
        if (e && e.target === eggPwdModal) closeModal(eggPwdModal);
      });
    }
    if (eggPwdSubmitBtn) {
      eggPwdSubmitBtn.addEventListener('click', () => {
        const cur = eggPwdCurrent ? String(eggPwdCurrent.value || '') : '';
        const next = eggPwdNew ? String(eggPwdNew.value || '') : '';
        if (!cur || !next) {
          showToast('请填写当前密码和新密码', 'error');
          return;
        }
        eggPwdSubmitBtn.disabled = true;
        apiPostJson('/api/egg/change-password', { currentPassword: cur, newPassword: next })
          .then(data => {
            if (!data || !data.success) throw new Error((data && data.message) ? data.message : '修改失败');
            showToast('密码修改成功');
            closeModal(eggPwdModal);
          })
          .catch(err => {
            showToast(err && err.message ? err.message : '修改失败', 'error');
          })
          .finally(() => {
            eggPwdSubmitBtn.disabled = false;
          });
      });
    }
  }

  function getCoverUrl(item) {
    if (!item) return '';
    return String(item.picUrl || (item.al && item.al.picUrl) || (item.album && item.album.picUrl) || '').trim();
  }

  function safeText(x) {
    return (x == null) ? '' : String(x);
  }

  function makeDownloadName(item) {
    const name = safeText(item && item.name ? item.name : '').trim();
    const artist = safeText(item && item.artists ? item.artists : '').trim();
    const joined = (name && artist) ? `${name}-${artist}` : (name || artist || '');
    return joined || '';
  }

  function render() {
    if (!panel || !list) return;

    list.innerHTML = '';
    if (!items || items.length === 0) {
      panel.style.display = 'none';
      return;
    }

    panel.style.display = 'block';

    const totalPages = total ? Math.max(1, Math.ceil(total / PAGE_SIZE)) : 1;
    if (resultMeta) {
      resultMeta.textContent = `共 ${total || items.length} 条 · 第 ${page}/${totalPages} 页`;
    }

    items.forEach(item => {
      const row = document.createElement('div');
      row.className = 'item';

      const meta = document.createElement('div');
      meta.className = 'meta';

      const img = document.createElement('img');
      img.className = 'cover';
      const coverUrl = getCoverUrl(item);
      img.src = coverUrl || '';
      img.alt = safeText(item.name);
      img.loading = 'lazy';
      img.onerror = function () {
        try { img.style.visibility = 'hidden'; } catch (e) {}
      };

      const texts = document.createElement('div');
      texts.className = 'texts';

      const name = document.createElement('div');
      name.className = 'name';
      name.textContent = safeText(item.name || '未知歌曲');

      const desc = document.createElement('div');
      desc.className = 'desc';
      const artist = safeText(item.artists || '');
      const album = safeText(item.album || '');
      desc.textContent = artist && album ? `${artist} · ${album}` : (artist || album || '');

      texts.appendChild(name);
      texts.appendChild(desc);

      meta.appendChild(img);
      meta.appendChild(texts);

      const actions = document.createElement('div');
      actions.className = 'actions';

      const auditionBtn = document.createElement('button');
      auditionBtn.type = 'button';
      auditionBtn.className = 'btn btnSmall';
      auditionBtn.textContent = '试听';

      auditionBtn.addEventListener('click', function () {
        ensureLogin().then(ok => {
          if (!ok) return;

          const id = (item && item.id != null) ? String(item.id) : '';
          if (!id) {
            showToast('缺少歌曲ID', 'error');
            return;
          }

          auditionBtn.disabled = true;
          const old = auditionBtn.textContent;
          auditionBtn.textContent = '加载中…';

          const url = `/api/public/music/stream?id=${encodeURIComponent(id)}`;
          try {
            if (audioSourceEl) audioSourceEl.setAttribute('src', url);
            if (audioEl) {
              try { audioEl.load(); } catch (e) {}
            }
            if (player) player.style.display = 'block';
            if (nowTitle) nowTitle.textContent = safeText(item.name || '未知歌曲');
            if (nowSub) nowSub.textContent = desc.textContent || '';

            if (nowCover) {
              const coverUrl = getCoverUrl(item);
              if (coverUrl) {
                nowCover.src = coverUrl;
                nowCover.style.display = 'block';
              } else {
                nowCover.removeAttribute('src');
                nowCover.style.display = 'none';
              }
            }

            if (playerBinding && typeof playerBinding.resetUI === 'function') {
              playerBinding.resetUI();
            }

            if (playBtn && !playBtn.disabled) {
              playBtn.click();
            } else if (audioEl) {
              const p = audioEl.play();
              if (p && typeof p.catch === 'function') p.catch(() => {});
            }
          } finally {
            auditionBtn.disabled = false;
            auditionBtn.textContent = old;
          }
        });
      });

      const downloadLink = document.createElement('a');
      downloadLink.className = 'btn btnSmall btnGood btnLink';
      downloadLink.textContent = '下载';
      downloadLink.rel = 'noopener noreferrer';

      const id = (item && item.id != null) ? String(item.id) : '';
      const dlName = makeDownloadName(item);
      downloadLink.href = `/api/public/music/download?id=${encodeURIComponent(id)}&name=${encodeURIComponent(dlName)}`;

      downloadLink.addEventListener('click', function (e) {
        try { if (e) e.preventDefault(); } catch (err) {}
        ensureLogin().then(ok => {
          if (!ok) return;
          try {
            const href = downloadLink.href;
            if (!href) return;
            const a = document.createElement('a');
            a.href = href;
            a.rel = 'noopener noreferrer';
            a.style.display = 'none';
            document.body.appendChild(a);
            a.click();
            a.remove();
          } catch (err) {}
        });
      });

      const setBtn = document.createElement('button');
      setBtn.type = 'button';
      setBtn.className = 'btn btnSmall';
      setBtn.textContent = '设为播报';
      setBtn.addEventListener('click', function () {
        ensureLogin().then(ok => {
          if (!ok) return;
          const neteaseId = (item && item.id != null) ? String(item.id) : '';
          if (!neteaseId) {
            showToast('缺少歌曲ID', 'error');
            return;
          }
          setBtn.disabled = true;
          const old = setBtn.textContent;
          setBtn.textContent = '设置中…';
          apiPostJson('/api/egg/set-broadcast-from-netease', {
            neteaseId,
            name: safeText(item && item.name ? item.name : ''),
            artists: safeText(item && item.artists ? item.artists : ''),
            coverUrl: getCoverUrl(item)
          })
            .then(data => {
              if (!data || !data.success) throw new Error((data && data.message) ? data.message : '设置失败');
              showToast('已设为播报音乐');
              return refreshMeAndBroadcastUI();
            })
            .catch(err => {
              showToast(err && err.message ? err.message : '设置失败', 'error');
            })
            .finally(() => {
              setBtn.disabled = false;
              setBtn.textContent = old;
            });
        });
      });

      actions.appendChild(auditionBtn);
      actions.appendChild(downloadLink);
      actions.appendChild(setBtn);

      row.appendChild(meta);
      row.appendChild(actions);
      list.appendChild(row);
    });

    const totalPages2 = total ? Math.max(1, Math.ceil(total / PAGE_SIZE)) : 1;
    if (pager) {
      if (totalPages2 > 1) {
        pager.style.display = 'flex';
      } else {
        pager.style.display = 'none';
      }
    }

    if (prevBtn) prevBtn.disabled = page <= 1;
    if (nextBtn) nextBtn.disabled = page >= totalPages2;
    if (pageInfo) pageInfo.textContent = `${page}/${totalPages2}`;
  }

  function runSearch(newPage) {
    const q = (qInput ? qInput.value : '').trim();
    if (!q) {
      showToast('请输入关键词再搜索', 'error');
      return;
    }

    ensureLogin().then(ok => {
      if (!ok) return;

      keywords = q;
      page = (typeof newPage === 'number' && newPage > 0) ? newPage : 1;

      setBusy(true);

      fetch(`/api/public/music/search?keywords=${encodeURIComponent(keywords)}&page=${encodeURIComponent(page)}&limit=${encodeURIComponent(PAGE_SIZE)}`)
        .then(r => r.json())
        .then(data => {
          if (!data || !data.success) throw new Error((data && data.message) ? data.message : '搜索失败');
          items = Array.isArray(data.songs) ? data.songs : [];
          total = (typeof data.total === 'number') ? data.total : (items.length || 0);
          render();
          if (items.length === 0) showToast('没有结果', 'error');
        })
        .catch(err => {
          console.error(err);
          items = [];
          total = 0;
          render();
          showToast(err && err.message ? err.message : '搜索失败', 'error');
        })
        .finally(() => {
          setBusy(false);
        });
    });
  }

  if (searchBtn) searchBtn.addEventListener('click', function () { runSearch(1); });
  if (clearBtn) {
    clearBtn.addEventListener('click', function () {
      if (qInput) qInput.value = '';
      keywords = '';
      page = 1;
      total = 0;
      items = [];
      if (panel) panel.style.display = 'none';
      showToast('已清空');
    });
  }

  if (qInput) {
    qInput.addEventListener('keydown', function (e) {
      if (e && e.key === 'Enter') {
        e.preventDefault();
        runSearch(1);
      }
    });
  }

  if (prevBtn) prevBtn.addEventListener('click', function () { runSearch(page - 1); });
  if (nextBtn) nextBtn.addEventListener('click', function () { runSearch(page + 1); });

  setBusy(false);
})();
