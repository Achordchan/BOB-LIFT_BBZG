// 播放询盘录入音效
async function playInquirySound() {
  // 检查用户是否已交互
  if (!window.userHasInteracted && !sessionStorage.getItem('userHasInteracted')) {
    console.warn('用户尚未交互，无法播放音效，显示交互提示');
    showInteractionNeededMessage();
    setupInteractionListener();
    return;
  }
  
  // 确保音频已加载
  await ensureAudioLoaded(inquirySound, 'inquiryAudioReady');
  
  // 重置音频并播放
  inquirySound.currentTime = 0;
  
  // 尝试播放音频
  try {
    await inquirySound.play();
  } catch (error) {
    console.log('询盘音效播放失败:', error);
    handleAudioPlayError();
  }
}

// 播放询盘删除音效
async function playDeleteSound() {
  // 检查用户是否已交互
  if (!window.userHasInteracted && !sessionStorage.getItem('userHasInteracted')) {
    console.warn('用户尚未交互，无法播放音效，显示交互提示');
    showInteractionNeededMessage();
    setupInteractionListener();
    return;
  }
  
  // 确保音频已加载
  await ensureAudioLoaded(deleteSound, 'deleteAudioReady');
  
  // 重置音频并播放
  deleteSound.currentTime = 0;
  
  // 尝试播放音频
  try {
    await deleteSound.play();
  } catch (error) {
    console.log('删除音效播放失败:', error);
    handleAudioPlayError();
  }
}

// 播放成交音效
function playDealSound() {
  if (!dealSound) return;
  
  // 如果正在播放用户自定义音乐，则不播放默认音效
  if (window.playingCustomMusic === true) {
    console.log('正在播放自定义音乐，跳过默认成交音效');
    return;
  }
  
  // 检查用户是否已交互
  if (!window.userHasInteracted && !sessionStorage.getItem('userHasInteracted')) {
    console.warn('用户尚未交互，无法播放音效，显示交互提示');
    showInteractionNeededMessage();
    setupInteractionListener();
    return;
  }
  
  // 重置音频
  dealSound.currentTime = 0;
  
  // 设置为低音量以避免移动设备的自动播放限制
  dealSound.volume = 0.7;
  
  // 尝试播放
  const playPromise = dealSound.play();
  
  // 处理可能的播放限制
  if (playPromise !== undefined) {
    playPromise.then(() => {
      // 播放成功，恢复音量
      setTimeout(() => {
        dealSound.volume = 1.0;
      }, 100);
      console.log('音效播放成功');
    }).catch(error => {
      console.log('音效播放失败:', error);
      
      // 确保显示交互提示
      showInteractionNeededMessage();
      setupInteractionListener();
    });
  }
}

// 播放自定义音效
async function playCustomSound(musicToPlay) {
  if (!musicToPlay || !musicToPlay.musicFile) {
    console.warn('无效的音效配置，使用默认音效');
    playInquirySound();
    return;
  }
  
  // 防止重复播放
  if (window.playingInquirySound === musicToPlay.musicFile) {
    console.log(`音效 ${musicToPlay.musicName} 已在播放中，跳过重复播放`);
    return;
  }
  
  console.log(`正在播放自定义音效: ${musicToPlay.musicName}`);
  
  // 设置当前播放标记
  window.playingInquirySound = musicToPlay.musicFile;
  
  // 检查用户是否已交互
  if (!window.userHasInteracted && !sessionStorage.getItem('userHasInteracted')) {
    console.warn('用户尚未交互，无法播放音效，显示交互提示');
    showInteractionNeededMessage();
    setupInteractionListener();
    window.playingInquirySound = null; // 重置播放标记
    return;
  }
  
  // 创建临时音频元素
  const tempAudio = document.createElement('audio');
  tempAudio.src = `/music/${musicToPlay.musicFile}`;
  tempAudio.volume = 1.0;
  
  // 添加加载错误处理
  tempAudio.onerror = function() {
    console.error(`自定义音效 ${musicToPlay.musicName} 加载失败，使用默认音效`);
    window.playingInquirySound = null; // 重置播放标记
    playInquirySound();
  };
  
  // 播放完成后移除元素和重置标记
  tempAudio.onended = function() {
    window.playingInquirySound = null;
    tempAudio.remove();
  };
  
  // 播放音频
  try {
    await tempAudio.play();
  } catch (error) {
    console.error('自定义音效播放失败:', error);
    // 在播放失败时尝试解锁音频系统
    handleAudioPlayError();
    // 播放失败后使用默认音效
    window.playingInquirySound = null; // 重置播放标记
    setTimeout(() => playInquirySound(), 500);
  }
}

// 显示音频启用消息的简化版本，不触发完整初始化
function defaultShowAudioEnableMessage() {
  // 检查是否已有提示消息
  if (document.querySelector('.audio-enable-message')) {
    return;
  }
  
  const message = document.createElement('div');
  message.className = 'audio-enable-message';
  message.style.position = 'fixed';
  message.style.top = '20px';
  message.style.left = '50%';
  message.style.transform = 'translateX(-50%)';
  message.style.backgroundColor = '#2196F3';
  message.style.color = 'white';
  message.style.padding = '10px 20px';
  message.style.borderRadius = '4px';
  message.style.zIndex = '1000';
  message.style.boxShadow = '0 2px 5px rgba(0,0,0,0.2)';
  message.style.cursor = 'pointer';
  message.textContent = '点击屏幕启用音效播放';
  
  document.body.appendChild(message);
  
  // 点击消息时也解锁音频
  message.addEventListener('click', function() {
    // 尝试快速播放并暂停音频，以解锁音频系统
    inquirySound.play().then(() => inquirySound.pause()).catch(() => {});
    deleteSound.play().then(() => deleteSound.pause()).catch(() => {});
    
    // 移除消息
    if (this.parentNode) {
      this.parentNode.removeChild(this);
    }
  });
  
  // 3秒后自动移除
  setTimeout(() => {
    if (message.parentNode) {
      message.parentNode.removeChild(message);
    }
  }, 3000);
}

if (typeof window.__showAudioEnableMessageImpl !== 'function') {
  window.__showAudioEnableMessageImpl = defaultShowAudioEnableMessage;
}

// 显示并播报文案
function displayAndSpeakAnnouncement(text, callback) {
  // 清除之前可能存在的文本
  const announcementContainer = document.getElementById('announcementContainer');
  const announcementText = document.getElementById('announcementText');
  
  if (!announcementContainer || !announcementText) {
    console.error('找不到文案显示元素');
    if (typeof callback === 'function') {
      callback();
    }
    return;
  }
  
  // 设置新文本
  announcementText.textContent = text;
  
  // 显示容器
  announcementContainer.style.display = 'block';
  setTimeout(() => {
    announcementContainer.classList.add('show');
    announcementContainer.classList.add('blink');
    announcementText.classList.add('pop');
  }, 100);
  
  // 两秒后停止闪烁效果
  setTimeout(() => {
    announcementContainer.classList.remove('blink');
    announcementText.classList.remove('pop');
  }, 2000);
  
  // 判断是否是初始提示语音
  if (text === '语音唤醒成功') {
    // 检查是否已经初始化过并且已经播放过提示音
    if (window.audioSystemInitialized && sessionStorage.getItem('audioSystemInitializedPlayedPrompt') === 'true') {
      console.log('系统已经初始化并播放过语音唤醒成功的提示，跳过重复播放');
      // 隐藏文案
      setTimeout(() => {
        announcementContainer.classList.remove('show');
        setTimeout(() => {
          announcementContainer.style.display = 'none';
        }, 500);
      }, 1000);
      
      // 直接执行回调，不播放语音
      if (typeof callback === 'function') {
        setTimeout(callback, 1000);
      }
      return;
    }
    
    // 仅在首次音频系统初始化时播放语音唤醒成功提示
    if (!sessionStorage.getItem('audioSystemInitializedPlayedPrompt')) {
      console.log('首次初始化音频系统，播放语音唤醒成功提示');
      sessionStorage.setItem('audioSystemInitializedPlayedPrompt', 'true');
      speakText(text, callback);
    } else {
      // 已初始化但未标记为播放过，可能是重置后的状态
      console.log('音频系统已初始化但未标记为播放过提示，执行标记并跳过');
      sessionStorage.setItem('audioSystemInitializedPlayedPrompt', 'true');
      
      // 隐藏文案并执行回调，不播放语音
      setTimeout(() => {
        announcementContainer.classList.remove('show');
        setTimeout(() => {
          announcementContainer.style.display = 'none';
        }, 500);
      }, 1000);
      
      if (typeof callback === 'function') {
        setTimeout(callback, 1000);
      }
    }
  } else {
    // 正常播报其他文案
    speakText(text, callback);
  }
}

// 专门处理文本转语音功能
function speakText(text, callback) {
  if (!text || text.trim() === '') {
    console.log('没有文本需要播报');
    if (typeof callback === 'function') {
      callback();
    }
    return;
  }

  // 在所有环境下都使用预生成MP3播放语音
  console.log('使用预生成MP3播放语音');
  
  // 记录浏览器环境信息
  console.log('浏览器环境:', {
    userAgent: navigator.userAgent,
    isTv: detectTvBrowser(),
    screenSize: `${window.innerWidth}x${window.innerHeight}`,
    isTouch: 'ontouchstart' in window,
    audioContext: typeof AudioContext !== 'undefined' || typeof webkitAudioContext !== 'undefined'
  });
  
  speakUsingPreGeneratedMp3(text, callback);
  return;
}

// 使用预生成的MP3文件播放语音
function speakUsingPreGeneratedMp3(text, callback) {
  // 创建一个标志，表示当前是否正在播放TTS音频
  window.ttsAudioPlaying = true;
  
  // 先显示文本
  const announcementContainer = document.getElementById('announcementContainer');
  const announcementText = document.getElementById('announcementText');
  
  if (announcementContainer && announcementText) {
    // 设置文本
    announcementText.textContent = text;
    
    // 显示容器
    announcementContainer.style.display = 'block';
    setTimeout(() => {
      announcementContainer.classList.add('show');
    }, 100);
  }
  
  console.log('开始预生成TTS MP3：', text);
  
  // 检测设备并添加调试信息
  const isTvBrowser = detectTvBrowser();
  const deviceInfo = {
    isTv: isTvBrowser,
    userAgent: navigator.userAgent,
    screenSize: `${window.innerWidth}x${window.innerHeight}`,
    isTouch: 'ontouchstart' in window
  };
  
  console.log('设备信息:', deviceInfo);
  
  // 设置超时保护，最长等待10秒
  const ttsFallbackTimeout = setTimeout(() => {
    console.warn('TTS请求超时，继续执行回调');
    window.ttsAudioPlaying = false;
    
    // 显示文案更长时间，然后隐藏
    setTimeout(() => {
      if (announcementContainer) {
        announcementContainer.classList.remove('show');
        setTimeout(() => {
          announcementContainer.style.display = 'none';
        }, 500);
      }
    }, 3000);
    
    // 执行回调
    if (typeof callback === 'function') {
      callback();
    }
  }, 10000);
  
  // 添加额外的请求标记参数，用于识别设备类型
  // 调用API获取预生成的MP3文件
  fetch('/api/text-to-speech', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ 
      // 预处理文本，去除多余空格
      text: text.replace(/\s+/g, ' '),
      deviceType: isTvBrowser ? 'tv' : 'browser',
      screenSize: `${window.innerWidth}x${window.innerHeight}`
    })
  })
  .then(response => {
    // 检查HTTP状态
    if (!response.ok) {
      console.error('TTS HTTP请求失败:', response.status, response.statusText);
      // 返回错误响应，让catch处理
      return response.json().then(err => {
        throw new Error(`HTTP错误: ${response.status}，${err.message || '未知错误'}`);
      });
    }
    return response.json();
  })
  .then(data => {
    // 清除超时保护
    clearTimeout(ttsFallbackTimeout);
    
    if (data.success && data.audioPath) {
      console.log('获取到TTS音频文件:', data.audioPath);
      
      // 创建一个临时的音频元素播放生成的MP3
      const audioElement = document.createElement('audio');
      
      // 添加详细日志
      console.log('创建TTS音频元素:', {
        audioElementType: audioElement.constructor.name,
        supportedEvents: ['canplay', 'canplaythrough', 'play', 'playing', 'ended', 'error'].map(e => 
          `${e}: ${typeof audioElement['on' + e] !== 'undefined'}`
        ).join(', ')
      });
      
      // 添加时间戳防止缓存
      audioElement.src = `${data.audioPath}?t=${Date.now()}`;
      audioElement.volume = 1.0;
      
      // 预加载音频
      audioElement.preload = 'auto';
      
      // 音频加载失败
      audioElement.onerror = function(e) {
        console.error('语音音频加载失败', e);
        console.error('音频源:', audioElement.src);
        window.ttsAudioPlaying = false;
        
        // 尝试重新加载一次，使用原始路径
        console.log('尝试使用原始路径重新加载音频...');
        audioElement.src = data.audioPath;
        
        const retryPlay = audioElement.play();
        if (retryPlay !== undefined) {
          retryPlay.catch(retryError => {
            console.error('重试播放也失败:', retryError);
            
            // 隐藏文案
            if (announcementContainer) {
              announcementContainer.classList.remove('show');
              setTimeout(() => {
                announcementContainer.style.display = 'none';
              }, 500);
            }
            
            // 即使出错也执行回调
            if (typeof callback === 'function') {
              console.log('音频加载重试失败，继续执行回调');
              callback();
            }
          });
        }
      };
      
      // 音频播放结束
      audioElement.onended = function() {
        console.log('语音播报结束');
        window.ttsAudioPlaying = false;
        
        // 隐藏文案
        if (announcementContainer) {
          announcementContainer.classList.remove('show');
          setTimeout(() => {
            announcementContainer.style.display = 'none';
          }, 500);
        }
        
        // 执行回调
        if (typeof callback === 'function') {
          console.log('语音播报成功结束，执行回调');
          callback();
        }
        
        // 移除音频元素
        audioElement.remove();
      };
      
      // 设置超时，防止音频卡住
      const timeout = calculateSpeechTimeout(text);
      console.log('语音文本长度:', text.length + '字符, 计算超时时间:', (timeout/1000) + '秒');
      
      const maxPlayTimeout = setTimeout(() => {
        if (window.ttsAudioPlaying) {
          console.warn('语音播报超时，可能卡住，强制结束');
          audioElement.pause();
          window.ttsAudioPlaying = false;
          
          // 隐藏文案
          if (announcementContainer) {
            announcementContainer.classList.remove('show');
            setTimeout(() => {
              announcementContainer.style.display = 'none';
            }, 500);
          }
          
          // 执行回调
          if (typeof callback === 'function') {
            console.log('语音播报超时，强制执行回调');
            callback();
          }
        }
      }, timeout);
      
      // 添加canplaythrough事件监听
      audioElement.addEventListener('canplaythrough', function() {
        console.log('音频已加载完成，可以开始播放');
      }, { once: true });
      
      // 添加到DOM以增加兼容性（特别是在TV浏览器上）
      document.body.appendChild(audioElement);
      
      // 播放音频
      console.log('尝试播放TTS音频:', audioElement.src);
      const playPromise = audioElement.play();
      
      if (playPromise !== undefined) {
        playPromise.then(() => {
          console.log('语音播报开始');
          
          // 记录详细的音频状态
          console.log('TTS音频状态:', {
            currentTime: audioElement.currentTime,
            duration: audioElement.duration,
            paused: audioElement.paused,
            ended: audioElement.ended,
            muted: audioElement.muted,
            volume: audioElement.volume,
            readyState: audioElement.readyState,
            networkState: audioElement.networkState,
            error: audioElement.error
          });
        })
        .catch(error => {
          console.error('播放语音音频失败:', error);
          
          // 记录错误详情
          console.error('音频播放错误详情:', {
            errorName: error.name,
            errorMessage: error.message,
            errorStack: error.stack,
            audioError: audioElement.error ? {
              code: audioElement.error.code,
              message: audioElement.error.message
            } : 'no audio error'
          });
          
          window.ttsAudioPlaying = false;
          clearTimeout(maxPlayTimeout);
          
          // 隐藏文案
          if (announcementContainer) {
            announcementContainer.classList.remove('show');
            setTimeout(() => {
              announcementContainer.style.display = 'none';
            }, 500);
          }
          
          // 即使出错也执行回调
          if (typeof callback === 'function') {
            console.log('播放失败，继续执行回调');
            callback();
          }
        });
      }
    } else {
      console.error('获取TTS音频失败:', data.message || '未知错误');
      window.ttsAudioPlaying = false;
      
      // 显示文案更长时间，然后隐藏
      setTimeout(() => {
        if (announcementContainer) {
          announcementContainer.classList.remove('show');
          setTimeout(() => {
            announcementContainer.style.display = 'none';
          }, 500);
        }
      }, 3000);
      
      // 即使出错也执行回调
      if (typeof callback === 'function') {
        console.log('TTS生成失败，继续执行回调');
        callback();
      }
    }
  })
  .catch(error => {
    // 清除超时保护
    clearTimeout(ttsFallbackTimeout);
    
    console.error('TTS API请求失败:', error);
    console.error('请求详情: ', {
      text: text,
      deviceType: isTvBrowser ? 'tv' : 'browser',
      errorMessage: error.message,
      errorStack: error.stack
    });
    window.ttsAudioPlaying = false;
    
    // 显示文案更长时间，然后隐藏
    setTimeout(() => {
      if (announcementContainer) {
        announcementContainer.classList.remove('show');
        setTimeout(() => {
          announcementContainer.style.display = 'none';
        }, 500);
      }
    }, 3000);
    
    // 即使出错也执行回调
    if (typeof callback === 'function') {
      console.log('TTS API请求失败，继续执行回调');
      callback();
    }
  });
}

// 检测是否是TV浏览器
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

// 根据文本长度计算语音播报超时时间
function calculateSpeechTimeout(text) {
  if (!text) return 10000; // 默认10秒
  
  // 估算每个字符的平均朗读时间（以毫秒计）
  // 中文约300毫秒/字，包含标点符号和其他字符
  const averageCharTime = 300;
  
  // 计算基础超时时间：字符数 * 平均时间 + 2秒缓冲
  const baseTimeout = text.length * averageCharTime + 2000;
  
  // 设置最小超时时间为10秒，最大为30秒
  const timeout = Math.min(Math.max(baseTimeout, 10000), 30000);
  
  // 打印日志
  console.log(`语音文本长度: ${text.length}字符, 计算超时时间: ${timeout/1000}秒`);
  
  return timeout;
}
 