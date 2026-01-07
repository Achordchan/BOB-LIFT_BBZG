/**
 * 显示消息提示
 * @param {string} message - 消息内容
 * @param {string} type - 消息类型：success, error, info
 */
function showMessage(message, type = 'success') {
  if (window.AppCore && typeof window.AppCore.showMessage === 'function') {
    window.AppCore.showMessage(message, type);
    return;
  }

  const messageContainer = document.getElementById('messageContainer');
  if (!messageContainer) {
    console.error('Message container not found');
    return;
  }
  
  messageContainer.textContent = message;
  messageContainer.className = `message ${type}`;
  
  setTimeout(() => {
    messageContainer.className = 'message hidden';
  }, 5000);
}

/**
 * 解析LRC歌词内容
 * @param {string} lrcContent - LRC歌词内容
 * @returns {Array} 解析后的歌词数据
 */
function parseLrc(lrcContent) {
  const lines = lrcContent.split('\n');
  const result = [];
  const timeRegex = /\[(\d{2}):(\d{2})\.(\d{2})\]/;
  const metadataRegex = /\[(ti|ar|al|by|offset):(.*?)\]/i;
  const metadata = {};
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    
    // 检查是否是元数据标签（如[ti:标题], [ar:艺术家]等）
    const metaMatch = metadataRegex.exec(line);
    if (metaMatch) {
      const metaType = metaMatch[1].toLowerCase();
      const metaValue = metaMatch[2];
      metadata[metaType] = metaValue;
      // 将元数据也添加到结果中，时间为0
      result.push({ time: 0, text: line, isMeta: true, metaType: metaType, metaValue: metaValue });
      continue;
    }
    
    // 检查是否是时间标签
    const match = timeRegex.exec(line);
    if (!match) {
      // 允许一些没有时间标签的行（如空行或注释）
      if (!line.startsWith('[') || line.includes('::')) {
        result.push({ time: 0, text: line });
        continue;
      }
      
      // 如果是未识别的带括号的内容，也添加到结果中
      if (line.startsWith('[') && line.includes(']')) {
        result.push({ time: 0, text: line, isUnknownTag: true });
        continue;
      }
      
      throw new Error('第 ' + (i + 1) + ' 行格式错误: ' + line);
    }
    
    const minutes = parseInt(match[1]);
    const seconds = parseInt(match[2]);
    const centiseconds = parseInt(match[3]);
    const time = minutes * 60 + seconds + centiseconds / 100;
    
    const text = line.substring(match[0].length).trim();
    result.push({ time, text });
  }
  
  // 将元数据附加到结果对象上
  result.metadata = metadata;
  
  return result.sort((a, b) => a.time - b.time);
}

/**
 * 在预览区显示解析后的LRC歌词
 * @param {Array} parsedLrc - 解析后的歌词数据
 * @param {string} containerId - 预览容器的ID
 */
function displayLrcPreview(parsedLrc, containerId = 'lrcPreviewContent') {
  const lrcPreviewContent = document.getElementById(containerId);
  lrcPreviewContent.innerHTML = '';
  
  // 先显示元数据
  if (parsedLrc.metadata) {
    const metadataSection = document.createElement('div');
    metadataSection.style.marginBottom = '15px';
    metadataSection.style.padding = '8px';
    metadataSection.style.backgroundColor = '#f0f0f0';
    metadataSection.style.borderRadius = '8px';
    
    // 添加标题
    const metaTitle = document.createElement('div');
    metaTitle.style.fontWeight = 'bold';
    metaTitle.style.marginBottom = '5px';
    metaTitle.textContent = '歌词信息:';
    metadataSection.appendChild(metaTitle);
    
    // 添加元数据内容
    for (const [key, value] of Object.entries(parsedLrc.metadata)) {
      const metaLine = document.createElement('div');
      metaLine.style.fontSize = '14px';
      let metaName = '';
      
      switch(key) {
        case 'ti': metaName = '标题'; break;
        case 'ar': metaName = '艺术家'; break;
        case 'al': metaName = '专辑'; break;
        case 'by': metaName = '作者'; break;
        case 'offset': metaName = '偏移量'; break;
        default: metaName = key;
      }
      
      metaLine.textContent = `${metaName}: ${value}`;
      metadataSection.appendChild(metaLine);
    }
    
    lrcPreviewContent.appendChild(metadataSection);
  }
  
  // 显示歌词内容
  parsedLrc.forEach(item => {
    if (item.isMeta) return; // 元数据已经在上面展示了
    
    const line = document.createElement('div');
    
    // 格式化时间
    let timeStr = '';
    if (item.time > 0) {
      const minutes = Math.floor(item.time / 60);
      const seconds = Math.floor(item.time % 60);
      const centiseconds = Math.floor((item.time % 1) * 100);
      timeStr = `[${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(centiseconds).padStart(2, '0')}] `;
    }
    
    line.textContent = timeStr + item.text;
    
    // 为未知标签添加样式
    if (item.isUnknownTag) {
      line.style.color = '#888';
      line.style.fontStyle = 'italic';
    }
    
    lrcPreviewContent.appendChild(line);
  });
}

/**
 * 在文本区域的光标位置插入文本
 * @param {HTMLElement} textarea - 文本区域元素
 * @param {string} text - 要插入的文本
 */
function insertTextAtCursor(textarea, text) {
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const value = textarea.value;
  
  textarea.value = value.substring(0, start) + text + value.substring(end);
  textarea.focus();
  textarea.selectionStart = textarea.selectionEnd = start + text.length;
}

/**
 * 加载API URL信息
 */
function loadApiUrls() {
  const addApiUrl = window.location.origin + '/api/inquiries/add';
  const reduceApiUrl = window.location.origin + '/api/inquiries/reduce';
  const dealApiUrl = window.location.origin + '/api/deals/add';
  const pingApiUrl = window.location.origin + '/api/ping';
  const routesApiUrl = window.location.origin + '/api/debug/routes';
  const targetsApiUrl = window.location.origin + '/api/targets';
  const pageSettingsApiUrl = window.location.origin + '/api/page-settings';
  
  if (document.getElementById('addApiUrl')) {
    document.getElementById('addApiUrl').textContent = addApiUrl;
  }
  if (document.getElementById('reduceApiUrl')) {
    document.getElementById('reduceApiUrl').textContent = reduceApiUrl;
  }
  if (document.getElementById('dealApiUrl')) {
    document.getElementById('dealApiUrl').textContent = dealApiUrl + '?zongjine=1000&fuzeren=张三&laiyuanpingtai=阿里巴巴&userName=用户名';
  }

  if (document.getElementById('pingApiUrl')) {
    document.getElementById('pingApiUrl').textContent = pingApiUrl;
  }
  if (document.getElementById('routesApiUrl')) {
    document.getElementById('routesApiUrl').textContent = routesApiUrl;
  }
  if (document.getElementById('targetsApiUrl')) {
    document.getElementById('targetsApiUrl').textContent = targetsApiUrl;
  }
  if (document.getElementById('pageSettingsApiUrl')) {
    document.getElementById('pageSettingsApiUrl').textContent = pageSettingsApiUrl;
  }
}

/**
 * 全局API错误处理器
 */

// 包装fetch请求，统一处理错误
window.apiRequest = async function(url, options = {}) {
  if (window.AppCore && typeof window.AppCore.apiRequest === 'function') {
    return window.AppCore.apiRequest(url, options);
  }
  throw new Error('apiRequest not available');
};

window.escapeHtml = function(value) {
  const str = value === null || value === undefined ? '' : String(value);
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
};

window.__musicListCache = window.__musicListCache || {
  ts: 0,
  data: null
};

window.getCachedMusicList = async function(force = false) {
  const now = Date.now();
  if (!force && window.__musicListCache.data && (now - window.__musicListCache.ts) < 30000) {
    return window.__musicListCache.data;
  }

  const result = await window.apiRequest('/api/music', { timeoutMs: 8000 });
  const list = (result && Array.isArray(result.music)) ? result.music : [];
  window.__musicListCache.ts = now;
  window.__musicListCache.data = list;
  return list;
};

window.invalidateMusicListCache = function() {
  window.__musicListCache.ts = 0;
  window.__musicListCache.data = null;
};

// 显示API错误信息的辅助函数
window.handleApiError = function(error, defaultMessage = '操作失败') {
  let message = defaultMessage;
  
  if (error.status === 404) {
    message = 'API端点不存在，可能是服务器版本问题，请联系管理员';
  } else if (error.status === 401) {
    message = '会话已过期，即将跳转到登录页面';
  } else if (error.message) {
    message = error.message;
  }
  
  if (window.showMessage) {
    window.showMessage(message, 'error');
  } else {
    alert(message);
  }
  
  return message;
};

// 检查服务器连接状态
window.checkServerStatus = async function() {
  try {
    const response = await fetch('/api/debug/routes');
    if (response.ok) {
      console.log('服务器连接正常');
      return true;
    }
  } catch (error) {
    console.error('服务器连接检查失败:', error);
  }
  return false;
};

// 确保函数在全局可用
window.showMessage = showMessage;
window.parseLrc = parseLrc;
window.displayLrcPreview = displayLrcPreview;
window.insertTextAtCursor = insertTextAtCursor;
window.loadApiUrls = loadApiUrls; 