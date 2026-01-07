/**
 * 初始化庆祝语管理功能
 */
function initCelebrationMessages() {
  // 加载所有庆祝语
  loadCelebrationMessages();
  
  // 绑定变量插入按钮事件
  document.getElementById('insertPersonBtn').addEventListener('click', function() {
    insertTextAtCursor(document.getElementById('newCelebrationMessage'), '{person}');
  });
  
  document.getElementById('insertPlatformBtn').addEventListener('click', function() {
    insertTextAtCursor(document.getElementById('newCelebrationMessage'), '{platform}');
  });
  
  document.getElementById('insertAmountBtn').addEventListener('click', function() {
    insertTextAtCursor(document.getElementById('newCelebrationMessage'), '{amount}');
  });
  
  // 绑定添加庆祝语按钮事件
  document.getElementById('addCelebrationBtn').addEventListener('click', function() {
    const messageText = document.getElementById('newCelebrationMessage').value.trim();
    if (!messageText) {
      showMessage('请输入庆祝语内容', 'error');
      return;
    }
    
    // 检查是否包含必要的变量
    if (!messageText.includes('{person}') && !messageText.includes('{ person }') &&
        !messageText.includes('{platform}') && !messageText.includes('{ platform }') &&
        !messageText.includes('{amount}') && !messageText.includes('{ amount }')) {
      showMessage('建议包含所有变量: {person}, {platform}, {amount}', 'warning');
      // 仍然允许添加，但显示警告
    }
    
    // 规范化庆祝语格式，处理占位符中的空格问题
    const normalizedMessage = messageText
      .replace(/\{\s*person\s*\}/g, "{person}")
      .replace(/\{\s*platform\s*\}/g, "{platform}")
      .replace(/\{\s*amount\s*\}/g, "{amount}")
      .replace(/\s+/g, ' ')
      .trim();
    
    // 发送请求添加庆祝语
    fetch('/api/celebration-messages/add', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ message: normalizedMessage })
    })
    .then(response => response.json())
    .then(data => {
      if (data.success) {
        showMessage('庆祝语添加成功');
        document.getElementById('newCelebrationMessage').value = '';
        loadCelebrationMessages(); // 重新加载列表
      } else {
        showMessage(data.message || '添加庆祝语失败', 'error');
      }
    })
    .catch(error => {
      console.error('添加庆祝语失败:', error);
      showMessage('添加庆祝语失败', 'error');
    });
  });
}

/**
 * 加载庆祝语列表
 */
function loadCelebrationMessages() {
  const container = document.getElementById('celebrationMessagesList');
  if (!container) return;
  
  container.innerHTML = '<div class="loading-spinner">加载中...</div>';
  
  fetch('/api/celebration-messages')
    .then(response => response.json())
    .then(data => {
      if (data.success && Array.isArray(data.messages)) {
        if (data.messages.length === 0) {
          container.innerHTML = '<div class="no-items" style="padding: 20px; text-align: center; color: #666;">暂无庆祝语，请添加</div>';
          return;
        }
        
        container.innerHTML = '';
        data.messages.forEach(message => {
          // 创建庆祝语项
          const messageItem = createCelebrationMessageItem(message);
          container.appendChild(messageItem);
        });
      } else {
        container.innerHTML = '<div class="error-message" style="padding: 20px; text-align: center; color: #F44336;">加载庆祝语失败</div>';
      }
    })
    .catch(error => {
      console.error('加载庆祝语失败:', error);
      const safeError = window.escapeHtml ? window.escapeHtml(error.message) : error.message;
      container.innerHTML = `<div class="error-message" style="padding: 20px; text-align: center; color: #F44336;">加载庆祝语失败: ${safeError}</div>`;
    });
}

/**
 * 创建庆祝语列表项
 * @param {Object} message - 庆祝语对象
 * @returns {HTMLElement} 庆祝语列表项元素
 */
function createCelebrationMessageItem(message) {
  const messageDiv = document.createElement('div');
  messageDiv.className = 'celebration-message-item';
  
  messageDiv.style.padding = '15px';
  messageDiv.style.border = '1px solid #ddd';
  messageDiv.style.borderRadius = '8px';
  messageDiv.style.marginBottom = '15px';
  messageDiv.style.position = 'relative';
  messageDiv.style.backgroundColor = '#f9f9f9';
  
  const rawMessage = message && message.message ? message.message : '';
  const safeMessage = window.escapeHtml ? window.escapeHtml(rawMessage) : rawMessage;

  // 高亮显示变量
  let highlightedMessage = safeMessage
    .replace(/\{person\}/g, '<span style="color: #2196F3; font-weight: bold;">{person}</span>')
    .replace(/\{platform\}/g, '<span style="color: #4CAF50; font-weight: bold;">{platform}</span>')
    .replace(/\{amount\}/g, '<span style="color: #F44336; font-weight: bold;">{amount}</span>');
  
  // 显示预览样例
  const previewMessage = rawMessage
    .replace(/\{person\}/g, '张三')
    .replace(/\{platform\}/g, '阿里巴巴')
    .replace(/\{amount\}/g, '1000');

  const safePreviewMessage = window.escapeHtml ? window.escapeHtml(previewMessage) : previewMessage;
  
  // 显示庆祝语内容
  messageDiv.innerHTML = `
    <div style="margin-bottom: 10px; font-size: 16px; line-height: 1.5;">${highlightedMessage}</div>
    <div style="margin-bottom: 15px; font-size: 14px; color: #666; padding: 10px; background-color: #f0f0f0; border-radius: 6px;">
      <div style="margin-bottom: 5px; font-size: 12px; color: #888;">预览效果：</div>
      ${safePreviewMessage}
    </div>
    <div style="display: flex; justify-content: flex-end;">
      <button class="listen-message-btn" data-message="${safePreviewMessage}" style="background-color: #4CAF50; padding: 8px 15px; font-size: 14px; margin-right: 10px;">试听</button>
      <button class="delete-message-btn" data-id="${message.id}" style="background-color: #F44336; padding: 8px 15px; font-size: 14px;">删除</button>
    </div>
  `;
  
  // 绑定删除按钮事件
  messageDiv.querySelector('.delete-message-btn').addEventListener('click', function() {
    const messageId = this.getAttribute('data-id');
    deleteCelebrationMessage(messageId);
  });
  
  // 绑定试听按钮事件
  messageDiv.querySelector('.listen-message-btn').addEventListener('click', function() {
    const message = this.getAttribute('data-message');
    speakCelebrationMessage(message);
  });
  
  return messageDiv;
}

/**
 * 删除庆祝语
 * @param {string} messageId - 庆祝语ID
 */
function deleteCelebrationMessage(messageId) {
  if (!confirm('确定要删除这条庆祝语吗？此操作不可撤销。')) {
    return;
  }
  
  fetch(`/api/celebration-messages/${messageId}`, {
    method: 'DELETE'
  })
  .then(response => response.json())
  .then(data => {
    if (data.success) {
      showMessage('庆祝语删除成功');
      loadCelebrationMessages(); // 重新加载列表
    } else {
      showMessage(data.message || '删除庆祝语失败', 'error');
    }
  })
  .catch(error => {
    console.error('删除庆祝语失败:', error);
    showMessage('删除庆祝语失败', 'error');
  });
}

/**
 * 播放庆祝语语音
 * @param {string} message - 庆祝语内容
 */
function speakCelebrationMessage(message) {
  const text = typeof message === 'string' ? message : '';
  if (!text.trim()) {
    showMessage('暂无可试听内容', 'error');
    return;
  }

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
  .then(response => response.json())
  .then(data => {
    if (!data || !data.success || !data.audioPath) {
      showMessage((data && data.message) ? data.message : '试听失败', 'error');
      return;
    }

      const audio = document.createElement('audio');
      audio.src = `${data.audioPath}?t=${Date.now()}`;
      audio.preload = 'auto';
      audio.volume = 1.0;

      audio.onerror = function () {
        try { audio.remove(); } catch (e) {}
        showMessage('试听音频加载失败', 'error');
      };

      audio.onended = function () {
        try { audio.remove(); } catch (e) {}
      };

      document.body.appendChild(audio);
      const p = audio.play();
      if (p && typeof p.catch === 'function') {
        p.catch(() => {
          try { audio.remove(); } catch (e) {}
          showMessage('浏览器阻止了自动播放，请点击页面后重试', 'error');
        });
      }
    })
    .catch(error => {
      console.error('试听失败:', error);
      showMessage('试听失败', 'error');
    });
}

// 确保函数在全局范围内可见
window.initCelebrationMessages = initCelebrationMessages;
window.loadCelebrationMessages = loadCelebrationMessages;
window.deleteCelebrationMessage = deleteCelebrationMessage;
window.speakCelebrationMessage = speakCelebrationMessage; 