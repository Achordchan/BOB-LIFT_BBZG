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

  // 预览模式不播放任何音频，避免干扰后台操作。
  if (!(window.BBZG_THEME && window.BBZG_THEME.preview)) {
    loadStartupAudioAndPlay();
  }

  // 设置TTS系统已初始化标志
  window.audioSystemInitialized = true;
  window.userHasInteracted = !(window.BBZG_THEME && window.BBZG_THEME.preview);

  // 获取询盘音效配置
  loadInquiryMusicConfig();

  // 获取目标数据
  loadTargetData();

  // 一次性初始化快照，避免页面在 SSE 首帧前长期停留“尝试加载中”
  bootstrapMainSnapshotOnce('init');

  // 后台主题预览只读取一次快照，不建立长期 SSE 连接。
  if (!(window.BBZG_THEME && window.BBZG_THEME.preview)) {
    startMainEventStream();
  }

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

function readNumber(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function getSavedPersonalizedFireId() {
  try {
    const saved = localStorage.getItem('lastPersonalizedFireId');
    if (saved && /^[0-9]+$/.test(saved)) {
      return Number(saved);
    }
  } catch (e) {}
  return 0;
}

function playPersonalizedFireAudio(audioPath) {
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

function consumePersonalizedFireEvent(eventLike) {
  if (window.BBZG_THEME && window.BBZG_THEME.preview) return;
  if (!eventLike || typeof eventLike !== 'object') return;
  if (!eventLike.id || !eventLike.audioPath) return;

  if (typeof window.__lastPersonalizedFireId !== 'number') {
    window.__lastPersonalizedFireId = getSavedPersonalizedFireId();
  }

  const id = Number(eventLike.id);
  if (!Number.isFinite(id) || id <= window.__lastPersonalizedFireId) return;

  window.__lastPersonalizedFireId = id;
  try {
    localStorage.setItem('lastPersonalizedFireId', String(id));
  } catch (e) {}
  playPersonalizedFireAudio(eventLike.audioPath);
}

function extractSnapshotFromPayload(payload) {
  if (!payload || typeof payload !== 'object') return null;

  if (payload.snapshot && typeof payload.snapshot === 'object') {
    return payload.snapshot;
  }

  if (payload.type === 'snapshot' && payload.data && typeof payload.data === 'object') {
    return payload.data;
  }

  if (payload.payload && typeof payload.payload === 'object') {
    return payload.payload;
  }

  return payload;
}

async function applyMainStreamSnapshot(snapshot, rawPayload) {
  if (!snapshot || typeof snapshot !== 'object') return;

  const dashboard = snapshot.dashboard && typeof snapshot.dashboard === 'object' ? snapshot.dashboard : snapshot;
  const inquiryCount = readNumber(dashboard.inquiryCount);
  const dealAmount = readNumber(dashboard.dealAmount);

  if (inquiryCount !== null || dealAmount !== null) {
    window.__mainSnapshotReceived = true;
  }

  if (inquiryCount !== null && typeof applyInquirySnapshot === 'function') {
    await applyInquirySnapshot({
      inquiryCount,
      latestInquiry: dashboard.latestInquiry || null
    });
  }

  if (dealAmount !== null && typeof applyDealSnapshot === 'function') {
    await applyDealSnapshot({
      dealAmount,
      latestDeal: dashboard.latestDeal || null
    });
  }

  if (typeof updateTargetUI === 'function') {
    updateTargetUI();
  }

  const downstream = [
    window.applyMainStreamSnapshotForTheme,
    window.applyMainStreamSnapshotForLeaderboard,
    window.applyMainStreamSnapshotForPlatformTargets
  ];
  downstream.forEach(fn => {
    if (typeof fn === 'function') {
      try {
        fn(snapshot, rawPayload);
      } catch (e) {
        console.error('[SSE] 下游模块处理 snapshot 失败:', e);
      }
    }
  });
}

function findPersonalizedFireCandidate(payload, snapshot) {
  const candidates = [
    payload && payload.personalizedFire,
    payload && payload.personalized_fire,
    payload && payload.event,
    snapshot && snapshot.personalizedFire,
    snapshot && snapshot.personalized_fire,
    snapshot && snapshot.personalized
  ];
  for (let i = 0; i < candidates.length; i++) {
    const item = candidates[i];
    if (item && typeof item === 'object' && item.id && item.audioPath) {
      return item;
    }
  }
  return null;
}

async function handleMainStreamPayload(payload, eventName) {
  if (payload && payload.ts) {
    if (window.__lastMainStreamPayloadTs && window.__lastMainStreamPayloadTs === payload.ts) {
      return;
    }
    window.__lastMainStreamPayloadTs = payload.ts;
  }

  const snapshot = extractSnapshotFromPayload(payload);
  const normalizedEvent = String(eventName || '').toLowerCase();
  const hasSnapshotFields = !!(snapshot && typeof snapshot === 'object' && (
    snapshot.inquiryCount !== undefined ||
    snapshot.dealAmount !== undefined ||
    snapshot.dashboard ||
    snapshot.theme ||
    snapshot.pageSettings ||
    snapshot.recentActivity ||
    snapshot.platformTargets ||
    snapshot.platformDisplaySettings
  ));

  if (normalizedEvent.includes('snapshot') || normalizedEvent === 'message' || hasSnapshotFields) {
    await applyMainStreamSnapshot(snapshot, payload);
  }

  const personalized = findPersonalizedFireCandidate(payload, snapshot);
  if (personalized) {
    consumePersonalizedFireEvent(personalized);
  }
}

function bootstrapMainSnapshotOnce(trigger) {
  if (window.__mainSnapshotBootstrapTried) return;
  window.__mainSnapshotBootstrapTried = true;

  return (window.fetchWithTimeout
    ? window.fetchWithTimeout('/api/dashboard', { timeoutMs: 4000 })
    : fetch('/api/dashboard')
  )
    .then(response => {
      if (!response.ok) throw new Error(`dashboard ${response.status}`);
      return response.json();
    })
    .then(data => {
      if (!data || data.success === false) {
        throw new Error((data && data.message) ? data.message : 'dashboard not success');
      }
      return applyMainStreamSnapshot({
        dashboard: {
          inquiryCount: data.inquiryCount,
          dealAmount: data.dealAmount,
          latestInquiry: data.latestInquiry || null,
          latestDeal: data.latestDeal || null
        }
      }, { source: 'bootstrap', trigger: trigger || 'unknown' });
    })
    .catch(error => {
      console.error('[SSE] 一次性初始化快照失败:', error);
    });
}

function bindMainStreamEvent(source, eventName) {
  source.addEventListener(eventName, async function(evt) {
    try {
      const payload = evt && typeof evt.data === 'string' && evt.data ? JSON.parse(evt.data) : {};
      await handleMainStreamPayload(payload, eventName);
    } catch (error) {
      console.error(`[SSE] 处理事件 ${eventName} 失败:`, error);
    }
  });
}

function startMainEventStream() {
  if (window.mainEventStreamStarted) return;

  if (typeof EventSource === 'undefined') {
    console.error('当前浏览器不支持 EventSource，首页实时更新不可用');
    bootstrapMainSnapshotOnce('eventsource-unsupported');
    return;
  }

  window.mainEventStreamStarted = true;
  window.__lastPersonalizedFireId = getSavedPersonalizedFireId();

  if (window.mainEventSource) {
    try {
      window.mainEventSource.close();
    } catch (e) {}
  }

  const sseClientId = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const source = new EventSource(`/api/stream/main?cid=${encodeURIComponent(sseClientId)}`);
  window.mainEventSource = source;

  source.onopen = function() {
    console.log('[SSE] /api/stream/main 已连接');
  };

  source.onmessage = async function(evt) {
    try {
      const payload = evt && typeof evt.data === 'string' && evt.data ? JSON.parse(evt.data) : {};
      await handleMainStreamPayload(payload, 'message');
    } catch (error) {
      console.error('[SSE] 处理默认 message 失败:', error);
    }
  };

  source.onerror = function(error) {
    console.error('[SSE] 主通道异常，等待 EventSource 自动重连:', error);
    if (!window.__mainSnapshotReceived) {
      bootstrapMainSnapshotOnce('sse-error-before-first-snapshot');
    }
  };

  [
    'snapshot',
    'main_snapshot',
    'dashboard',
    'update',
    'personalized_fire',
    'personalizedFire',
    'page_settings',
    'recent_activity',
    'platform_targets',
    'platform_display_settings',
    'theme_settings'
  ].forEach(name => bindMainStreamEvent(source, name));
}

function stopMainEventStream() {
  window.mainEventStreamStarted = false;
  if (window.mainEventSource) {
    try {
      window.mainEventSource.close();
    } catch (e) {}
    window.mainEventSource = null;
  }
}

function startMainPolling() {
  console.warn('startMainPolling 已停用，改为 SSE');
  startMainEventStream();
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
  console.warn('startPersonalizedFirePolling 已停用，改为 SSE');
  startMainEventStream();
}

window.stopMainPolling = stopMainEventStream;
window.stopPersonalizedFirePolling = function stopPersonalizedFirePolling() {
  console.warn('stopPersonalizedFirePolling 已停用，个性化发射改为 SSE');
};

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
