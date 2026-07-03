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
  const jumpPageInput = document.getElementById('jumpPageInput');
  const jumpPageBtn = document.getElementById('jumpPageBtn');
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
  const eggLyricsModal = document.getElementById('eggLyricsModal');
  const eggLyricsTitle = document.getElementById('eggLyricsTitle');
  const eggLyricsCloseBtn = document.getElementById('eggLyricsCloseBtn');
  const eggLyricsCancelBtn = document.getElementById('eggLyricsCancelBtn');
  const eggLyricsBody = document.getElementById('eggLyricsBody');
  const eggPlayerLyrics = document.getElementById('eggPlayerLyrics');
  const eggPlayerLyricsList = document.getElementById('eggPlayerLyricsList');
  const eggPlayerLyricsScreen = document.getElementById('eggPlayerLyricsScreen');
  const eggPlayerLyricsScreenTitle = document.getElementById('eggPlayerLyricsScreenTitle');
  const eggPlayerLyricsScreenBody = document.getElementById('eggPlayerLyricsScreenBody');
  const eggPlayerLyricsScreenClose = document.getElementById('eggPlayerLyricsScreenClose');
  let eggLyricsLines = [];
  let eggLyricsPlainText = '';
  let eggLyricsSyncLine = -1;
  let eggCurrentLyricKey = '';
  let eggCurrentLyricTitle = '歌词';

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

  let pendingStreamErrorHandler = null;
  function bindStreamErrorToast() {
    if (!audioEl) return;
    if (pendingStreamErrorHandler) {
      try { audioEl.removeEventListener('error', pendingStreamErrorHandler); } catch (e) {}
    }
    pendingStreamErrorHandler = function () {
      showToast('当前歌曲暂不可试听，可能是版权或会员限制', 'error');
      pendingStreamErrorHandler = null;
    };
    audioEl.addEventListener('error', pendingStreamErrorHandler, { once: true });
  }

  function closeLyricsModal() {
    if (!eggLyricsModal) return;
    closeModal(eggLyricsModal);
  }

  function setLyricsText(text) {
    if (!eggLyricsBody) return;
    eggLyricsBody.textContent = String(text || '');
  }

  function parseLrcText(text) {
    const source = String(text || '').split(/\r?\n/);
    const lines = [];
    const reg = /\[(\d{1,}):(\d{2})(?:[.:](\d{1,3}))?\]/g;
    for (let i = 0; i < source.length; i++) {
      const raw = source[i] || '';
      const lyric = raw.replace(reg, '').trim();
      if (!lyric) continue;

      const matches = raw.matchAll(reg);
      for (const m of matches) {
        const minute = parseInt(m[1], 10);
        const second = parseInt(m[2], 10);
        const msRaw = m[3] || '';
        const ms = msRaw ? parseInt(msRaw.padEnd(3, '0').slice(0, 3), 10) : 0;
        if (Number.isFinite(minute) && Number.isFinite(second)) {
          lines.push({
            time: minute * 60 + second + (msRaw ? ms / 1000 : 0),
            text: lyric
          });
        }
      }
    }
    return lines.sort((a, b) => a.time - b.time);
  }

  function findCurrentLineIndex(lines, currentTime) {
    if (!Array.isArray(lines) || !lines.length || !Number.isFinite(currentTime)) return 0;
    for (let i = lines.length - 1; i >= 0; i--) {
      if (currentTime >= lines[i].time) return i;
    }
    return 0;
  }

  function renderEggLyricsByTime(currentTime) {
    const isValidTime = Number.isFinite(currentTime) ? currentTime : 0;
    if (!eggPlayerLyrics || !eggPlayerLyricsList) {
      return;
    }

    if (!eggLyricsLines.length) {
      eggLyricsSyncLine = -1;
      eggPlayerLyrics.style.display = 'block';
      eggPlayerLyricsList.innerHTML = '';
      const noData = document.createElement('div');
      noData.className = 'playerLyricsNoData';
      const rawText = String(eggLyricsPlainText || '').trim();
      noData.textContent = rawText || '暂无歌词';
      eggPlayerLyricsList.appendChild(noData);
      renderPlayerLyricsScreen(-1);
      return;
    }

    const idx = findCurrentLineIndex(eggLyricsLines, isValidTime);
    if (idx === eggLyricsSyncLine) return;
    eggLyricsSyncLine = idx;

    eggPlayerLyricsList.innerHTML = '';
    eggPlayerLyrics.style.display = 'block';

    const mini = document.createElement('div');
    mini.className = 'playerLyricsLine current';
    mini.textContent = eggLyricsLines[idx].text || '—';
    eggPlayerLyricsList.appendChild(mini);
    renderPlayerLyricsScreen(idx);
  }

  function renderPlayerLyricsScreen(currentIndex) {
    if (!eggPlayerLyricsScreenBody) return;
    const isOpen = eggPlayerLyricsScreen && eggPlayerLyricsScreen.style.display === 'flex';
    if (!isOpen) return;

    eggPlayerLyricsScreenBody.innerHTML = '';
    if (eggPlayerLyricsScreenTitle) eggPlayerLyricsScreenTitle.textContent = eggCurrentLyricTitle || '歌词';

    if (!eggLyricsLines.length) {
      const pre = document.createElement('pre');
      pre.className = 'playerLyricsScreenPlain';
      pre.textContent = String(eggLyricsPlainText || '').trim() || '暂无歌词';
      eggPlayerLyricsScreenBody.appendChild(pre);
      return;
    }

    let currentNode = null;
    eggLyricsLines.forEach((line, index) => {
      const div = document.createElement('div');
      div.className = index === currentIndex ? 'playerLyricsScreenLine current' : 'playerLyricsScreenLine';
      div.textContent = line.text || '—';
      div.addEventListener('click', () => {
        if (!audioEl || !Number.isFinite(line.time)) return;
        audioEl.currentTime = line.time;
        renderEggLyricsByTime(line.time);
        const p = audioEl.play();
        if (p && typeof p.catch === 'function') p.catch(() => {});
      });
      eggPlayerLyricsScreenBody.appendChild(div);
      if (index === currentIndex) currentNode = div;
    });

    if (currentNode) {
      window.requestAnimationFrame(() => {
        try { currentNode.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (e) {}
      });
    }
  }

  function openPlayerLyricsScreen() {
    if (!eggPlayerLyricsScreen) return;
    eggPlayerLyricsScreen.style.display = 'flex';
    eggPlayerLyricsScreen.setAttribute('aria-hidden', 'false');
    renderPlayerLyricsScreen(eggLyricsLines.length ? findCurrentLineIndex(eggLyricsLines, audioEl ? audioEl.currentTime : 0) : -1);
  }

  function closePlayerLyricsScreen() {
    if (!eggPlayerLyricsScreen) return;
    eggPlayerLyricsScreen.style.display = 'none';
    eggPlayerLyricsScreen.setAttribute('aria-hidden', 'true');
  }

  function setPlayerLyricsPayload(text, title) {
    eggCurrentLyricTitle = title || eggCurrentLyricTitle || '歌词';
    eggLyricsPlainText = String(text || '');
    eggLyricsLines = parseLrcText(eggLyricsPlainText);
    eggLyricsSyncLine = -1;
    renderEggLyricsByTime(audioEl ? audioEl.currentTime : 0);
  }

  function loadPlayerLyrics(key, title, url, parser) {
    eggCurrentLyricKey = key;
    setPlayerLyricsPayload('歌词加载中...', title);
    fetch(url)
      .then(r => {
        if (!r || !r.ok) {
          return r.json().catch(() => null).then(data => {
            throw new Error((data && data.message) ? data.message : `获取歌词失败（${r ? r.status : '网络错误'}）`);
          });
        }
        return parser(r);
      })
      .then(text => {
        if (eggCurrentLyricKey !== key) return;
        setPlayerLyricsPayload(text || '暂无歌词', title);
      })
      .catch(err => {
        if (eggCurrentLyricKey !== key) return;
        console.error('获取播放器歌词失败', err);
        setPlayerLyricsPayload('暂无歌词', title);
      });
  }

  if (audioEl) {
    const syncEggLyrics = function () {
      renderEggLyricsByTime(audioEl.currentTime);
    };
    if (!audioEl.__bbzgLyricsBound) {
      audioEl.__bbzgLyricsBound = true;
      audioEl.addEventListener('timeupdate', syncEggLyrics);
      audioEl.addEventListener('loadedmetadata', syncEggLyrics);
      audioEl.addEventListener('ended', () => {
        renderEggLyricsByTime(0);
      });
    }
  }

  function setLyricsTitle(text) {
    if (!eggLyricsTitle) return;
    eggLyricsTitle.textContent = String(text || '歌词');
  }

  function openLyricsModal() {
    if (!eggLyricsModal) return;
    openModal(eggLyricsModal);
  }

  function showNeteaseLyrics(song) {
    const id = song && song.id != null ? String(song.id) : '';
    const name = safeText(song && song.name ? song.name : '未知歌曲');
    if (!id) {
      showToast('缺少歌曲ID', 'error');
      return;
    }

    setLyricsTitle(`歌词 · ${name}`);
    setLyricsText('加载中...');
    openLyricsModal();

    fetch(`/api/public/music/lyric?id=${encodeURIComponent(id)}`)
      .then(r => {
        if (!r || !r.ok) {
          return r.json().catch(() => null).then(data => {
            throw new Error((data && data.message) ? data.message : `获取歌词失败（${r ? r.status : '网络错误'}）`);
          });
        }
        return r.json();
      })
      .then(data => {
        const text = data && data.success ? (data.lyric || data.tLyric || '') : '';
        setLyricsText(text || '暂无歌词');
      })
      .catch(err => {
        console.error('获取歌词失败', err);
        setLyricsText(err && err.message ? err.message : '暂无歌词');
        showToast(err && err.message ? err.message : '获取歌词失败', 'error');
      });
  }

  function showLocalLyrics(record) {
    const id = record && record.id ? String(record.id) : '';
    const name = safeText(record && record.name ? record.name : '未知歌曲');
    if (!id) {
      showToast('缺少歌曲ID', 'error');
      return;
    }

    setLyricsTitle(`歌词 · ${name}`);
    setLyricsText('加载中...');
    openLyricsModal();

    fetch(`/api/music/${encodeURIComponent(id)}/lrc`)
      .then(r => {
        if (!r || !r.ok) {
          return r.json().catch(() => null).then(data => {
            throw new Error((data && data.message) ? data.message : `获取歌词失败（${r ? r.status : '网络错误'}）`);
          });
        }
        return r.text();
      })
      .then(text => {
        setLyricsText(text || '暂无歌词');
      })
      .catch(err => {
        console.error('获取歌词失败', err);
        setLyricsText(err && err.message ? err.message : '暂无歌词');
        showToast(err && err.message ? err.message : '获取歌词失败', 'error');
      });
  }

  if (eggPlayerLyrics) eggPlayerLyrics.addEventListener('click', openPlayerLyricsScreen);
  if (eggPlayerLyricsScreenClose) eggPlayerLyricsScreenClose.addEventListener('click', closePlayerLyricsScreen);

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

  if (eggLyricsCloseBtn) eggLyricsCloseBtn.addEventListener('click', closeLyricsModal);
  if (eggLyricsCancelBtn) eggLyricsCancelBtn.addEventListener('click', closeLyricsModal);
  if (eggLyricsModal) {
    eggLyricsModal.addEventListener('click', function (e) {
      if (e && e.target === eggLyricsModal) closeLyricsModal();
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
        if (music && music.id) {
          loadPlayerLyrics(
            `local:${music.id}`,
            safeText(music && music.name ? music.name : '歌词'),
            `/api/music/${encodeURIComponent(String(music.id))}/lrc`,
            r => r.text()
          );
        } else {
          eggCurrentLyricKey = `local:${filename}`;
          setPlayerLyricsPayload('暂无歌词', safeText(music && music.name ? music.name : '歌词'));
        }
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

      const lyricBtn = document.createElement('button');
      lyricBtn.type = 'button';
      lyricBtn.className = 'btn btnSmall';
      lyricBtn.textContent = '歌词';
      lyricBtn.addEventListener('click', function () {
        ensureLogin().then(ok => {
          if (!ok) return;
          showLocalLyrics(m);
        });
      });

      actions.appendChild(auditionBtn);
      actions.appendChild(setBtn);
      actions.appendChild(lyricBtn);

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
            bindStreamErrorToast();
            if (audioSourceEl) audioSourceEl.setAttribute('src', url);
            if (audioEl) {
              try { audioEl.load(); } catch (e) {}
            }
            if (player) player.style.display = 'block';
            if (nowTitle) nowTitle.textContent = safeText(item.name || '未知歌曲');
            if (nowSub) nowSub.textContent = desc.textContent || '';
            loadPlayerLyrics(
              `netease:${id}`,
              safeText(item.name || '歌词'),
              `/api/public/music/lyric?id=${encodeURIComponent(id)}`,
              r => r.json().then(data => data && data.success ? (data.lyric || data.tLyric || '') : '')
            );

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
              if (p && typeof p.catch === 'function') {
                p.catch(() => showToast('播放器启动失败，请再试一次', 'error'));
              }
            }
          } catch (err) {
            showToast(err && err.message ? err.message : '试听失败', 'error');
          } finally {
            auditionBtn.disabled = false;
            auditionBtn.textContent = old;
          }
        });
      });

      const lyricBtn = document.createElement('button');
      lyricBtn.type = 'button';
      lyricBtn.className = 'btn btnSmall';
      lyricBtn.textContent = '歌词';
      lyricBtn.addEventListener('click', function () {
        ensureLogin().then(ok => {
          if (!ok) return;
          showNeteaseLyrics(item);
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
      actions.appendChild(lyricBtn);
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

    if (jumpPageInput) {
      try { jumpPageInput.max = String(totalPages2); } catch (e) {}
      try { jumpPageInput.placeholder = `跳转 ${totalPages2}`; } catch (e) {}
    }

    if (prevBtn) prevBtn.disabled = page <= 1;
    if (nextBtn) nextBtn.disabled = page >= totalPages2;
    if (pageInfo) pageInfo.textContent = `${page}/${totalPages2}`;
  }

  function jumpToPage() {
    const totalPages2 = total ? Math.max(1, Math.ceil(total / PAGE_SIZE)) : 1;
    const v = jumpPageInput ? String(jumpPageInput.value || '').trim() : '';
    const n = Number.parseInt(v, 10);
    if (!Number.isFinite(n) || n <= 0) {
      showToast('请输入要跳转的页码', 'error');
      return;
    }
    const target = Math.max(1, Math.min(totalPages2, n));
    if (target !== n) {
      showToast(`页码范围：1-${totalPages2}`, 'error');
      return;
    }
    runSearch(target);
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

      const controller = typeof AbortController === 'function' ? new AbortController() : null;
      const timeoutId = controller ? setTimeout(() => controller.abort(), 9000) : null;

      fetch(`/api/public/music/search?keywords=${encodeURIComponent(keywords)}&page=${encodeURIComponent(page)}&limit=${encodeURIComponent(PAGE_SIZE)}`, {
        signal: controller ? controller.signal : undefined
      })
        .then(r => {
          if (!r || !r.ok) {
            return r.json().catch(() => null).then(data => {
              throw new Error((data && data.message) ? data.message : `搜索失败（${r ? r.status : '网络错误'}）`);
            });
          }
          return r.json();
        })
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
          const message = (err && err.name === 'AbortError') ? '搜索请求超时，请稍后重试' : (err && err.message ? err.message : '搜索失败');
          showToast(message, 'error');
        })
        .finally(() => {
          if (timeoutId) clearTimeout(timeoutId);
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

  if (jumpPageBtn) jumpPageBtn.addEventListener('click', function () { jumpToPage(); });
  if (jumpPageInput) {
    jumpPageInput.addEventListener('keydown', function (e) {
      if (e && e.key === 'Enter') {
        e.preventDefault();
        jumpToPage();
      }
    });
  }

  setBusy(false);
})();
