// 添加+1动效
function showIncrementAnimation() {
  const counterElement = document.getElementById('inquiryCount');
  const animElement = document.createElement('div');
  animElement.className = 'increment-animation';
  animElement.textContent = '+1';
  
  // 随机左右位置，让动效每次位置略有不同
  const randomOffset = (Math.random() * 60) - 30;
  animElement.style.left = `calc(50% + ${randomOffset}px)`;
  
  counterElement.appendChild(animElement);
  
  // 添加数字脉动效果
  counterElement.classList.add('pulse');
  
  // 移除旧的动画元素和脉动效果
  setTimeout(() => {
    counterElement.classList.remove('pulse');
    animElement.remove();
  }, 1500);
}

// 添加-1动效
function showDecrementAnimation() {
  const counterElement = document.getElementById('inquiryCount');
  const animElement = document.createElement('div');
  animElement.className = 'decrement-animation';
  animElement.textContent = '-1';
  
  // 随机左右位置，让动效每次位置略有不同
  const randomOffset = (Math.random() * 60) - 30;
  animElement.style.left = `calc(50% + ${randomOffset}px)`;
  
  counterElement.appendChild(animElement);
  
  // 添加数字脉动效果
  counterElement.classList.add('pulse');
  
  // 移除旧的动画元素和脉动效果
  setTimeout(() => {
    counterElement.classList.remove('pulse');
    animElement.remove();
  }, 1500);
}

// 添加成交动效和文案播报
function showDealAnimation(amount, announcement, musicToPlay) {
  // 金额动效
  const dealElement = document.getElementById('dealAmount');
  const animElement = document.createElement('div');
  animElement.className = 'deal-increment-animation';
  animElement.textContent = '+' + amount.toLocaleString('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
  
  // 随机左右位置，让动效每次位置略有不同
  const randomOffset = (Math.random() * 60) - 30;
  animElement.style.left = `calc(50% + ${randomOffset}px)`;
  
  dealElement.appendChild(animElement);
  
  // 添加数字脉动效果
  dealElement.classList.add('pulse');
  
  // 移除旧的动画元素和脉动效果
  setTimeout(() => {
    dealElement.classList.remove('pulse');
    animElement.remove();
  }, 1500);
  
  // 解析交易信息
  const amountValue = parseFloat(amount) || 0;
  
  let personName = '运营专员';
  let platform = '未知平台';
  
  // 从公告中提取人名和平台
  if (announcement) {
    const personMatch = announcement.match(/([^!！,，。\s]+)在|([^!！,，。\s]+)从|([^!！,，。\s]+)刚刚搞定|([^!！,，。\s]+)用实力|([^!！,，。\s]+)的超级业绩|([^!！,，。\s]+)又来一单/);
    if (personMatch) {
      personName = personMatch[1] || personMatch[2] || personMatch[3] || personMatch[4] || personMatch[5] || personMatch[6];
    }
    
    const platformMatch = announcement.match(/在([^!！,，。\s]+)疯狂|从([^!！,，。\s]+)斩获|搞定([^!！,，。\s]+)一大波|([^!！,，。\s]+)被.+攻陷|([^!！,，。\s]+)刚刚被|([^!！,，。\s]+)被我们承包/);
    if (platformMatch) {
      platform = platformMatch[1] || platformMatch[2] || platformMatch[3] || platformMatch[4] || platformMatch[5] || platformMatch[6];
    }
  }
  
  // 如果有用户配置的音乐，使用用户名称和位置
  if (musicToPlay) {
    personName = musicToPlay.userName || personName;
    platform = musicToPlay.userPosition || platform;
  }
  
  // 提前准备庆祝动画数据，但暂不显示
  prepareShowCelebration(personName, amountValue, platform, announcement);
  
  // 防止全局音效与用户音乐冲突的标记
  if (musicToPlay) {
    window.playingCustomMusic = true;
  }
  
  // 标记当前没有正在播放的语音播报
  window.speakingInProgress = false;
  
  // 显示并播报文案
  if (announcement) {
    // 修改：设置语音播报标志
    window.speakingInProgress = true;
    
    // 先清空任何正在播放的音乐，确保只有语音播报
    if (window.userDealSound && !window.userDealSound.paused) {
      window.userDealSound.pause();
      window.userDealSound.currentTime = 0;
    }
    
    console.log('开始播报成交文案，等待语音播报完成后再播放音乐和显示庆祝框');
    
    // 显示文案并在语音播报完成后播放音乐
    displayAndSpeakAnnouncement(announcement, function() {
      console.log('语音播报完成，可以播放音乐');
      // 清除语音播报标志
      window.speakingInProgress = false;
      
      // 延迟一点时间再播放音乐，确保语音已完全结束
      setTimeout(() => {
        playMusicAfterSpeech(musicToPlay);
      }, 500); // 增加延迟时间，确保语音完全结束
    });
  } else {
    // 如果没有公告，直接播放音乐并显示庆祝动画
    playMusicAfterSpeech(musicToPlay);
  }
}

// 添加新函数：在语音播报完成后播放音乐
function playMusicAfterSpeech(musicToPlay) {
  // 检查是否仍然有语音在播放（TTS音频可能仍在播放中）
  if (window.ttsAudioPlaying) {
    console.log('TTS音频仍在播放中，等待播放结束后再播放音乐和显示庆祝框');
    // 设置一个定时器，每300ms检查一次语音是否播放完毕
    const checkTtsInterval = setInterval(() => {
      if (!window.ttsAudioPlaying) {
        clearInterval(checkTtsInterval);
        console.log('TTS音频播放结束，现在开始播放音乐和显示庆祝框');
        proceedWithMusicPlayback();
      }
    }, 300);
    
    // 设置最大等待时间（15秒），防止无限等待
    setTimeout(() => {
      clearInterval(checkTtsInterval);
      if (window.ttsAudioPlaying) {
        console.warn('等待TTS播放超时，强制继续');
        window.ttsAudioPlaying = false; // 强制重置标志
        proceedWithMusicPlayback();
      }
    }, 15000); // 15秒超时
  } else {
    // 没有语音播报，直接播放音乐
    console.log('没有正在播放的TTS音频，直接播放音乐和显示庆祝框');
    proceedWithMusicPlayback();
  }
  
  // 实际播放音乐的函数
  function proceedWithMusicPlayback() {
    try {
      if (musicToPlay) {
        console.log('开始播放用户自定义音乐并显示庆祝框');
        playUserMusic(musicToPlay, () => {
          // 确保庆祝框显示，即使音乐播放失败
          showPreparedCelebration();
          // 重置标记
          window.playingCustomMusic = false;
        });
      } else {
        // 尝试播放默认战歌
        console.log('开始播放默认战歌并显示庆祝框');
        playUserMusic(null, () => {
          showPreparedCelebration();
          window.playingCustomMusic = false;
        });
      }
    } catch (error) {
      console.error('播放音乐过程中发生错误:', error);
      // 即使播放音乐失败，也显示庆祝框
      showPreparedCelebration();
      window.playingCustomMusic = false;
    }
  }
}

// 将庆祝动画的准备和显示分离，避免语音播报和动画显示的竞争
function prepareShowCelebration(person, amount, platform, message) {
  // 存储庆祝数据，但暂不显示
  celebrationData = {
    person,
    amount,
    platform,
    message
  };
}

// 显示庆祝动画
function showPreparedCelebration() {
  if (!celebrationData) return;
  
  const { person, amount, platform, message } = celebrationData;
  
  const overlay = document.getElementById('celebrationOverlay');
  const personElement = document.getElementById('celebrationPerson');
  const amountElement = document.getElementById('celebrationAmount');
  const platformElement = document.getElementById('celebrationPlatform');
  const messageElement = document.getElementById('celebrationMessage');
  
  // 设置内容
  personElement.textContent = person;
  amountElement.textContent = '¥ ' + amount.toLocaleString('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
  platformElement.textContent = platform;
  
  // 显示简洁的庆祝语，不重复播报内容
  let celebrationMsg = '手拿把掐了哥们';
  messageElement.innerHTML = celebrationMsg;
  
  // 清除之前的特效元素和定时器
  clearCelebrationEffects();
  clearCelebrationTimers();
  
  // 显示遮罩层
  overlay.style.display = 'flex';
  
  // 显示庆祝内容并使用全新的赛博朋克风格
  const contentElement = document.querySelector('.celebration-content');
  if (contentElement) {
    // 确保居中显示
    contentElement.style.margin = '0 auto';
  }
  
  // 减少纸屑数量，降低图形复杂度
  generateSimpleConfetti(40); // 从50降至40，进一步减少
  
  // 存储庆祝状态，以便能在暂停/播放时控制
  window.celebrationActive = true;
  
  // 不自动隐藏，让庆祝效果持续到歌曲结束
}

// 清除之前的特效元素
function clearCelebrationEffects() {
  const overlay = document.getElementById('celebrationOverlay');
  
  // 移除所有彩色纸屑，使用更高效的方式
  const confetti = overlay.querySelectorAll('.celebration-confetti');
  if (confetti.length > 0) {
    for (let i = 0; i < confetti.length; i++) {
      confetti[i].remove();
    }
  }
}

// 清除定时器
function clearCelebrationTimers() {
  // 清除刷新定时器
  if (window.celebrationRefreshInterval) {
    clearInterval(window.celebrationRefreshInterval);
    window.celebrationRefreshInterval = null;
  }
  
  // 清除其他动画定时器
  if (celebrationAnimationTimers && celebrationAnimationTimers.length > 0) {
    celebrationAnimationTimers.forEach(timer => {
      clearTimeout(timer);
      clearInterval(timer);
    });
    
    celebrationAnimationTimers = [];
  }
}

// 隐藏庆祝效果
function hideCelebration() {
  if (!window.celebrationActive) return;
  
  const overlay = document.getElementById('celebrationOverlay');
  
  // 简化隐藏动画，不使用淡出
  overlay.style.display = 'none';
  
  // 清除特效和定时器
  clearCelebrationEffects();
  clearCelebrationTimers();
  
  // 重置状态
  window.celebrationActive = false;
}

// 恢复庆祝效果
function resumeCelebration() {
  if (window.celebrationActive || !celebrationData) return;
  
  const overlay = document.getElementById('celebrationOverlay');
  
  // 简单显示，不使用动画
  overlay.style.display = 'flex';
  
  // 减少纸屑数量
  generateSimpleConfetti(30);
  
  // 设置状态
  window.celebrationActive = true;
}

// 生成简化版的纸屑
function generateSimpleConfetti(count) {
  const overlay = document.getElementById('celebrationOverlay');
  
  // 限制最大数量，防止性能问题
  const maxCount = Math.min(count, 50);
  
  // 如果已经有足够多的纸屑，不再生成
  const existingConfetti = overlay.querySelectorAll('.celebration-confetti');
  if (existingConfetti.length > 30) {
    return;
  }
  
  // 使用文档片段减少DOM操作次数
  const fragment = document.createDocumentFragment();
  
  for (let i = 0; i < maxCount; i++) {
    // 创建纸屑元素
    const confetti = document.createElement('div');
    confetti.className = 'celebration-confetti';
    
    // 简化：仅使用几种基本颜色
    const colors = ['#FFD700', '#FF6347', '#4CAF50', '#2196F3'];
    confetti.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
    
    // 随机位置
    confetti.style.left = (Math.random() * 100) + '%';
    confetti.style.top = -20 + 'px';
    
    // 简化动画：直接使用CSS动画
    confetti.style.animation = `simpleConfettiFall ${3 + Math.random() * 3}s linear forwards`;
    
    // 添加到片段
    fragment.appendChild(confetti);
  }
  
  // 一次性添加到DOM
  overlay.appendChild(fragment);
  
  // 设置定时器清除纸屑，避免内存泄漏
  const cleanupTimer = setTimeout(() => {
    const oldConfetti = overlay.querySelectorAll('.celebration-confetti');
    // 只保留最近生成的50个纸屑
    if (oldConfetti.length > 50) {
      for (let i = 0; i < oldConfetti.length - 50; i++) {
        if (oldConfetti[i] && oldConfetti[i].parentNode) {
          oldConfetti[i].remove();
        }
      }
    }
  }, 6000);
  
  celebrationAnimationTimers.push(cleanupTimer);
}

// 暴露函数到全局作用域
window.showDealAnimation = showDealAnimation;
window.prepareShowCelebration = prepareShowCelebration;
window.showPreparedCelebration = showPreparedCelebration; 