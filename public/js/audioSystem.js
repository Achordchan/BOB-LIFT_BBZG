// 音频系统帮助函数，不包含权限请求

// 显示音频启用提示消息
function defaultShowAudioEnableMessage() {
  // 检查是否已经显示了提示
  if (document.getElementById('audioEnableMessage')) return;
  
  // 创建提示元素
  const messageDiv = document.createElement('div');
  messageDiv.id = 'audioEnableMessage';
  messageDiv.style.position = 'fixed';
  messageDiv.style.bottom = '80px';
  messageDiv.style.left = '50%';
  messageDiv.style.transform = 'translateX(-50%)';
  messageDiv.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
  messageDiv.style.color = 'white';
  messageDiv.style.padding = '15px 20px';
  messageDiv.style.borderRadius = '8px';
  messageDiv.style.zIndex = '9999';
  messageDiv.style.fontSize = '16px';
  messageDiv.style.textAlign = 'center';
  messageDiv.style.boxShadow = '0 4px 10px rgba(0, 0, 0, 0.3)';
  messageDiv.style.maxWidth = '80%';
  messageDiv.style.pointerEvents = 'none';
  messageDiv.textContent = '请点击屏幕任意位置以启用音频播放';
  
  // 添加到页面
  document.body.appendChild(messageDiv);
  
  // 3秒后自动隐藏
  setTimeout(() => {
    if (messageDiv.parentNode) {
      messageDiv.parentNode.removeChild(messageDiv);
    }
  }, 3000);
}

function showAudioEnableMessage() {
  const impl = window.__showAudioEnableMessageImpl;
  if (typeof impl === 'function') {
    try {
      impl();
      return;
    } catch (e) {}
  }
  defaultShowAudioEnableMessage();
}

// 初始化音频系统
function initializeAudio() {
  if (window.audioContext) {
    // 如果已经初始化，则只处理自动播放解锁
    unlockAudioPlayback();
    return;
  }
  
  try {
    // 创建音频上下文
    window.audioContext = new (window.AudioContext || window.webkitAudioContext)();
    
    // 处理音频自动播放限制
    unlockAudioPlayback();
    
    console.log('音频系统已初始化');
  } catch (e) {
    console.error('初始化音频系统失败:', e);
  }
}

// 解锁音频自动播放
function unlockAudioPlayback() {
  // 检查Audio Context的状态
  if (window.audioContext && window.audioContext.state === 'suspended') {
    if (window.__audioUnlockListenerActive) return;
    window.__audioUnlockListenerActive = true;

    const unlockAllAudio = function() {
      // 尝试恢复音频上下文
      window.audioContext.resume().then(() => {
        console.log('音频上下文已恢复');
        
        // 尝试初始化所有音频元素
        const audioElements = [inquirySound, deleteSound, dealSound, userDealSound];
        
        Promise.all(audioElements.map(audio => {
          if (!audio) return Promise.resolve();
          
          // 简短播放然后暂停，解锁音频
          return audio.play()
            .then(() => {
              audio.pause();
              audio.currentTime = 0;
              return Promise.resolve();
            })
            .catch(err => {
              console.warn('初始化音频元素失败:', err);
              return Promise.resolve(); // 继续流程
            });
        })).then(() => {
          console.log('所有音频元素已初始化');
          document.body.removeEventListener('click', unlockAllAudio);
          document.body.removeEventListener('touchstart', unlockAllAudio);
          window.__audioUnlockListenerActive = false;
        });
      }).catch(() => {
        document.body.removeEventListener('click', unlockAllAudio);
        document.body.removeEventListener('touchstart', unlockAllAudio);
        window.__audioUnlockListenerActive = false;
      });
    };
    
    // 添加事件监听器
    document.body.addEventListener('click', unlockAllAudio);
    document.body.addEventListener('touchstart', unlockAllAudio);
  } else {
    console.log('音频上下文状态:', window.audioContext ? window.audioContext.state : '不存在');
  }
}

// 处理音频播放错误
function handleAudioPlayError() {
  if (navigator && navigator.userActivation && navigator.userActivation.isActive) {
    console.log('用户已经与页面交互，可以播放音频');
    return;
  }

  if (window.__audioPlayErrorUnlockActive) return;
  window.__audioPlayErrorUnlockActive = true;
  
  const unlockAudio = function() {
    console.log('用户交互已触发，尝试解锁音频');
    
    // 尝试解锁所有音频
    const audioElements = [inquirySound, deleteSound, dealSound, userDealSound];
    
    Promise.all(audioElements.map(audio => {
      if (!audio) return Promise.resolve();
      
      // 简短播放然后暂停，解锁音频
      return audio.play()
        .then(() => {
          audio.pause();
          audio.currentTime = 0;
          return Promise.resolve();
        })
        .catch(err => {
          console.warn('解锁音频元素失败:', err);
          return Promise.resolve(); // 继续流程
        });
    })).then(() => {
      console.log('音频元素已解锁');
      document.body.removeEventListener('click', unlockAudio);
      document.body.removeEventListener('touchstart', unlockAudio);
      window.__audioPlayErrorUnlockActive = false;
    });
  };
  
  // 添加事件监听器
  document.body.addEventListener('click', unlockAudio);
  document.body.addEventListener('touchstart', unlockAudio);
  
  // 显示提示消息
  showAudioEnableMessage();
}

// 确保音频加载完成
function ensureAudioLoaded(audioElement, readyFlag) {
  if (!audioElement) {
    console.warn('音频元素不存在');
    return;
  }
  
  if (audioElement.readyState >= 2) {
    // 如果音频已经加载了足够的数据可以播放
    window[readyFlag] = true;
    console.log(`音频已加载完成: ${readyFlag}`);
    return;
  }
  
  // 监听canplay事件
  audioElement.addEventListener('canplay', function onCanPlay() {
    window[readyFlag] = true;
    console.log(`音频已加载完成: ${readyFlag}`);
    audioElement.removeEventListener('canplay', onCanPlay);
  });
  
  // 监听错误事件
  audioElement.addEventListener('error', function onError() {
    console.error(`音频加载失败: ${readyFlag}`, audioElement.error);
    // 即使加载失败，也设置标志为true以避免阻塞
    window[readyFlag] = true;
    audioElement.removeEventListener('error', onError);
  });
  
  // 预加载音频
  try {
    audioElement.load();
  } catch (e) {
    console.error('加载音频失败:', e);
    window[readyFlag] = true; // 确保不会阻塞
  }
} 