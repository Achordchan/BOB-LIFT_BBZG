/**
 * TV大屏幕响应式处理 - 简化版
 */

document.addEventListener('DOMContentLoaded', function() {
  initTvDisplay();
  initDebugMode();
});

/**
 * 初始化TV显示优化
 */
function initTvDisplay() {
  console.log('初始化TV显示优化...');
  
  // 检测是否是电视浏览器
  const isTvBrowser = detectTvBrowser();
  if (isTvBrowser) {
    document.body.classList.add('tv-browser');
    document.documentElement.classList.add('tv-browser');
    console.log('检测到TV浏览器环境，应用TV优化');
    
    // TV浏览器强制使用TTS API
    window.useTtsApi = true;
    console.log('在电视浏览器上强制使用TTS API进行语音播报');
  }
  
  // 如果是大屏幕，自动应用TV浏览器优化
  if (window.innerWidth >= 1920) {
    document.body.classList.add('tv-browser');
    document.documentElement.classList.add('tv-browser');
    console.log('检测到大屏幕，应用TV优化');
    
    // 大屏幕也强制使用TTS API
    window.useTtsApi = true;
    console.log('在大屏幕上强制使用TTS API进行语音播报');
  }
  
  // 针对飞视浏览器的特殊处理
  if (navigator.userAgent.toLowerCase().includes('feiyu')) {
    applyFeiyuFixes();
  }
}

/**
 * 检测是否是TV浏览器
 */
function detectTvBrowser() {
  const userAgent = navigator.userAgent.toLowerCase();
  
  // 检测常见的TV浏览器特征
  const tvBrowsers = [
    'smart-tv', 
    'smarttv', 
    'tv', 
    'android tv', 
    'feiyu',  // 飞视浏览器
    'webkit tv'
  ];
  
  return tvBrowsers.some(keyword => userAgent.includes(keyword));
}

/**
 * 针对飞视浏览器的特殊修复
 */
function applyFeiyuFixes() {
  console.log('应用飞视浏览器特殊修复...');
  
  // 添加特殊类标记
  document.documentElement.classList.add('feiyu-browser');
  
  // 修复1: 强制设置视口宽度
  function updateViewport() {
    const metaViewport = document.querySelector('meta[name="viewport"]');
    if (metaViewport) {
      metaViewport.setAttribute('content', 
        'width=1920, initial-scale=1.0, maximum-scale=1.0, user-scalable=no');
    }
  }
  
  // 立即执行并在DOM加载后再次执行，以确保生效
  updateViewport();
  window.addEventListener('load', updateViewport);
  
  // 飞视浏览器上强制使用TTS API
  window.useTtsApi = true;
  console.log('在飞视浏览器上强制使用TTS API进行语音播报');
}

/**
 * 初始化调试功能
 */
function initDebugMode() {
  // 创建调试面板
  const debugPanel = document.createElement('div');
  debugPanel.className = 'debug-mode';
  debugPanel.innerHTML = `
    <h3>TV显示调试</h3>
    <p>屏幕尺寸: <span id="debug-screen-size">-</span></p>
    <p>浏览器信息: <span id="debug-user-agent">-</span></p>
    <p>TTS模式: <span id="debug-tts-mode">预生成MP3</span></p>
    <button id="debug-reset">重置</button>
  `;
  document.body.appendChild(debugPanel);
  
  // 创建调试切换按钮
  const debugToggle = document.createElement('div');
  debugToggle.className = 'debug-toggle';
  document.body.appendChild(debugToggle);
  
  // 通过双击右上角激活调试模式
  debugToggle.addEventListener('dblclick', function(e) {
    e.stopPropagation();
    toggleDebugMode();
  });
  
  // 添加调试按钮功能
  document.getElementById('debug-reset').addEventListener('click', function() {
    resetDisplay();
  });
  
  // 初始化调试信息
  updateDebugInfo();
}

/**
 * 切换调试模式
 */
function toggleDebugMode() {
  const debugPanel = document.querySelector('.debug-mode');
  debugPanel.classList.toggle('active');
  
  updateDebugInfo();
  
  if (debugPanel.classList.contains('active')) {
    // 如果开启调试模式，定期更新信息
    window.debugInterval = setInterval(updateDebugInfo, 1000);
  } else {
    // 关闭调试模式时，停止更新
    clearInterval(window.debugInterval);
  }
}

/**
 * 更新调试信息
 */
function updateDebugInfo() {
  document.getElementById('debug-screen-size').textContent = 
    `${window.innerWidth}x${window.innerHeight}`;
  
  // 显示UserAgent截断版本
  const ua = navigator.userAgent;
  document.getElementById('debug-user-agent').textContent = 
    ua.length > 30 ? ua.substring(0, 30) + '...' : ua;
}

/**
 * 重置显示
 */
function resetDisplay() {
  // 强制刷新视口
  const metaViewport = document.querySelector('meta[name="viewport"]');
  if (metaViewport) {
    metaViewport.setAttribute('content', 
      'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no');
  }
  
  location.reload();
} 