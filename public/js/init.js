/*
 * 系统主要初始化文件
 * 注意：此文件包含系统的核心初始化逻辑，所有页面初始化应在此文件中进行
 * 其他JS文件不应重复这些初始化代码
 */

// 当DOM加载完成后执行初始化
document.addEventListener('DOMContentLoaded', function() {
  console.log('初始化系统...');
  if (!window.fetchWithTimeout) {
    window.fetchWithTimeout = function fetchWithTimeout(url, options = {}) {
      const timeoutMs = typeof options.timeoutMs === 'number' ? options.timeoutMs : 4000;
      if (typeof AbortController === 'undefined') {
        return fetch(url, options);
      }
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      const fetchOptions = {
        ...options,
        signal: controller.signal
      };

      return fetch(url, fetchOptions)
        .finally(() => clearTimeout(timeoutId));
    };
  }
  
  // 初始化全局变量
  window.celebrationData = null;
  window.celebrationActive = false;
  window.celebrationAnimationTimers = [];
  
  // 确保在页面加载时检查并隐藏庆祝框
  const celebrationOverlay = document.getElementById('celebrationOverlay');
  if (celebrationOverlay) {
    celebrationOverlay.style.display = 'none';
  }
  
  // 确保在页面加载时隐藏歌词容器
  const lyricsContainer = document.getElementById('lyricsContainer');
  if (lyricsContainer) {
    lyricsContainer.classList.remove('show');
  }
  
  // 确保在页面加载时隐藏音乐播放器
  const musicPlayer = document.getElementById('musicPlayer');
  if (musicPlayer) {
    musicPlayer.classList.remove('show');
  }
  
  // 移除可能残留的庆祝模式类
  document.body.classList.remove('celebration-mode');
  
  // 初始化音乐播放器事件监听
  setupMusicPlayerEvents();
  
  // 页面加载完成时
  console.log('页面加载完成，初始化音频系统');

  // 播放启动音频以激活音频系统（可配置，默认 Go.mp3）
  loadStartupAudioAndPlay();
  
  // 设置TTS系统已初始化标志
  window.audioSystemInitialized = true;
  window.userHasInteracted = true;
  
  // 获取询盘音效配置
  loadInquiryMusicConfig();
  
  // 获取目标数据
  loadTargetData();
  
  startMainPolling();

  startPersonalizedFirePolling();
  
  // 音频预加载
  ensureAudioLoaded(inquirySound, 'inquiryAudioReady');
  ensureAudioLoaded(deleteSound, 'deleteAudioReady');
  
  console.log('初始化完成');
});

function loadStartupAudioAndPlay() {
  const fallback = '/music/Go.mp3';
  const req = (window.fetchWithTimeout ? window.fetchWithTimeout('/api/startup-audio', { timeoutMs: 4000 }) : fetch('/api/startup-audio'))
    .then(r => r.ok ? r.json() : Promise.reject(new Error(`startup-audio ${r.status}`)))
    .then(data => {
      const path = (data && data.audioPath && typeof data.audioPath === 'string') ? data.audioPath : fallback;
      playActivationSound(path);
    })
    .catch(err => {
      console.warn('读取启动音频配置失败，使用默认 Go.mp3:', err);
      playActivationSound(fallback);
    });
  return req;
}

function startMainPolling() {
  const BASE_INTERVAL_MS = 1000;
  const MAX_INTERVAL_MS = 60000;
  const REQUEST_TIMEOUT_MS = 4000;

  let currentInterval = BASE_INTERVAL_MS;
  let inFlight = false;
  let stopped = false;
  let lastTargetUiUpdateAt = 0;

  async function tick() {
    if (stopped) return;
    if (typeof document !== 'undefined' && document.hidden) {
      currentInterval = Math.min(MAX_INTERVAL_MS, Math.max(currentInterval, 30000));
      scheduleNext(currentInterval);
      return;
    }
    if (inFlight) {
      scheduleNext(currentInterval);
      return;
    }

    inFlight = true;
    let success = true;

    try {
      const resp = await (window.fetchWithTimeout ? window.fetchWithTimeout('/api/dashboard', { timeoutMs: REQUEST_TIMEOUT_MS }) : fetch('/api/dashboard'));
      if (!resp.ok) throw new Error(`dashboard ${resp.status}`);
      const dash = await resp.json();
      if (!dash || dash.success === false) throw new Error('dashboard not success');

      if (typeof applyInquirySnapshot === 'function') {
        await applyInquirySnapshot({
          inquiryCount: dash.inquiryCount,
          latestInquiry: dash.latestInquiry || null
        });
      } else {
        await fetchInquiryCount();
      }

      if (typeof applyDealSnapshot === 'function') {
        await applyDealSnapshot({
          dealAmount: dash.dealAmount,
          latestDeal: dash.latestDeal || null
        });
      } else {
        await checkDealAmountChange();
      }

      const now = Date.now();
      if (typeof updateTargetUI === 'function' && now - lastTargetUiUpdateAt >= 10000) {
        lastTargetUiUpdateAt = now;
        updateTargetUI();
      }
    } catch (e) {
      try {
        await fetchInquiryCount();
        await checkDealAmountChange();
      } catch (fallbackErr) {
        console.error('[轮询] dashboard失败且回退也失败:', fallbackErr);
      }
      success = false;
      console.error('[轮询] 本轮请求失败，将自动退避:', e);
    } finally {
      inFlight = false;
    }

    if (success) {
      currentInterval = BASE_INTERVAL_MS;
    } else {
      currentInterval = Math.min(MAX_INTERVAL_MS, currentInterval * 2);
    }

    scheduleNext(currentInterval);
  }

  function scheduleNext(ms) {
    window.mainPollingTimer = setTimeout(tick, ms);
  }

  window.stopMainPolling = function stopMainPolling() {
    stopped = true;
    if (window.mainPollingTimer) {
      clearTimeout(window.mainPollingTimer);
    }
  };

  try {
    if (typeof document !== 'undefined' && document.addEventListener) {
      document.addEventListener('visibilitychange', () => {
        if (stopped) return;
        if (document.hidden) return;
        if (inFlight) return;
        tick();
      });
    }
  } catch (e) {}

  tick();
}

// 播放激活音频（Go.mp3）
function playActivationSound(src) {
  const audioSrc = (typeof src === 'string' && src.trim()) ? src.trim() : '/music/Go.mp3';
  console.log('播放激活音频:', audioSrc);
  const activationSound = new Audio(audioSrc);
  activationSound.volume = 0.3; // 设置较低音量
  
  activationSound.oncanplaythrough = function() {
    console.log('激活音频已加载，准备播放');
  };
  
  activationSound.onended = function() {
    console.log('激活音频播放完成，音频系统已启动');
  };
  
  activationSound.onerror = function(e) {
    console.error('激活音频播放失败', e);
  };
  
  // 播放音频
  const playPromise = activationSound.play();
  
  if (playPromise !== undefined) {
    playPromise.then(() => {
      console.log('激活音频开始播放');
    }).catch(error => {
      console.error('播放激活音频失败:', error);
      // 用户交互后再尝试播放
      document.body.addEventListener('click', function() {
        activationSound.play().catch(e => console.error('二次尝试播放激活音频失败:', e));
      }, { once: true });
    });
  }
}

function startPersonalizedFirePolling() {
  const BASE_INTERVAL_MS = 3000;
  const MAX_INTERVAL_MS = 5000;

  let currentInterval = BASE_INTERVAL_MS;
  let inFlight = false;

  const saved = localStorage.getItem('lastPersonalizedFireId');
  let lastId = saved && /^[0-9]+$/.test(saved) ? Number(saved) : 0;

  let stopped = false;

  function scheduleNext(ms) {
    if (window.personalizedFirePollingTimer) {
      clearTimeout(window.personalizedFirePollingTimer);
    }
    window.personalizedFirePollingTimer = setTimeout(tick, ms);
  }

  window.stopPersonalizedFirePolling = function stopPersonalizedFirePolling() {
    stopped = true;
    if (window.personalizedFirePollingTimer) {
      clearTimeout(window.personalizedFirePollingTimer);
      window.personalizedFirePollingTimer = null;
    }
  };

  function playPersonalizedAudio(audioPath) {
    const src = (typeof audioPath === 'string' && audioPath.trim()) ? audioPath.trim() : '';
    if (!src) return;

    try {
      if (typeof window.stopAllAudio === 'function') {
        window.stopAllAudio();
      }
    } catch (e) {}

    const audio = new Audio(`${src}?t=${Date.now()}`);
    audio.volume = 1.0;
    const p = audio.play();
    if (p && typeof p.catch === 'function') {
      p.catch(() => {
        document.body.addEventListener('click', function() {
          audio.play().catch(() => {});
        }, { once: true });
      });
    }
  }

  async function tick() {
    if (stopped) return;
    if (typeof document !== 'undefined' && document.hidden) {
      currentInterval = Math.min(MAX_INTERVAL_MS, Math.max(currentInterval, 5000));
      scheduleNext(currentInterval);
      return;
    }
    if (inFlight) return;
    inFlight = true;

    try {
      const url = `/api/personalized/fire?after=${encodeURIComponent(String(lastId || 0))}`;
      const response = await (window.fetchWithTimeout ? window.fetchWithTimeout(url, { timeoutMs: 4000 }) : fetch(url));
      if (!response.ok) throw new Error(`fire poll ${response.status}`);
      const data = await response.json();
      const ev = data && data.event;

      if (ev && ev.id && ev.audioPath) {
        const id = Number(ev.id);
        if (Number.isFinite(id) && id > lastId) {
          lastId = id;
          try { localStorage.setItem('lastPersonalizedFireId', String(lastId)); } catch (e) {}
          playPersonalizedAudio(ev.audioPath);
        }
      }

      currentInterval = BASE_INTERVAL_MS;
    } catch (e) {
      currentInterval = Math.min(MAX_INTERVAL_MS, currentInterval * 2);
    } finally {
      inFlight = false;
      scheduleNext(currentInterval);
    }
  }

  if (!window.__personalizedFireVisibilityBound) {
    window.__personalizedFireVisibilityBound = true;
    document.addEventListener('visibilitychange', function() {
      if (!document.hidden) {
        try {
          scheduleNext(0);
        } catch (e) {}
      }
    });
  }

  scheduleNext(0);
}

// 测试连接函数，用于在页面加载时测试与服务器的连接
function testConnection() {
  (window.fetchWithTimeout ? window.fetchWithTimeout('/api/ping') : fetch('/api/ping'))
    .then(response => {
      if (!response.ok) {
        throw new Error(`服务器返回错误状态码: ${response.status}`);
      }
      return response.json();
    })
    .then(data => {
      console.log('服务器连接状态:', data);
    })
    .catch(error => {
      console.error('服务器连接失败:', error);
      // 连接失败时不中断用户体验
      // 继续初始化UI，只是不依赖于服务器数据
      initLocalUIOnly();
    });
}

// 当无法连接到服务器时，初始化本地UI组件
function initLocalUIOnly() {
  // 设置示例数据
  const inquiryCount = document.getElementById('inquiryCount');
  if (inquiryCount) inquiryCount.textContent = '加载中...';
  
  const dealAmount = document.getElementById('dealAmount');
  if (dealAmount) dealAmount.textContent = '加载中...';
  
  const inquiryPercentage = document.getElementById('inquiryPercentage');
  if (inquiryPercentage) inquiryPercentage.textContent = '0%';
  
  const dealPercentage = document.getElementById('dealPercentage');
  if (dealPercentage) dealPercentage.textContent = '0%';
  
  // 显示错误消息
  const activityList = document.getElementById('activityList');
  if (activityList) {
    activityList.innerHTML = `
      <div class="activity-item">
        <div class="activity-time">刚刚</div>
        <div class="activity-text">无法连接到服务器，请检查网络连接</div>
      </div>
    `;
  }
}

// 页面加载后测试连接
setTimeout(testConnection, 2000); 