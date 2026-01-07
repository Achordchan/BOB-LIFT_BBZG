// 全屏庆祝动画效果
(function() {
  // 初始化
  function init() {
    // 创建样式
    createStyles();
    // 创建DOM
    createDom();
    // 绑定到全局
    window.showCelebration = showCelebration;
  }
  
  // 创建样式
  function createStyles() {
    const styleEl = document.createElement('style');
    styleEl.id = 'celebration-styles';
    styleEl.innerHTML = `
      /* 全屏庆祝动画样式 */
      .celebration-overlay {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background-color: rgba(0, 0, 0, 0.85);
        display: none;
        justify-content: center;
        align-items: center;
        z-index: 3000;
        overflow: hidden;
        perspective: 1000px;
      }
      .celebration-content {
        text-align: center;
        position: relative;
        animation: celebrationZoom 1s ease-out;
        transform-style: preserve-3d;
      }
      .celebration-person {
        font-size: 60px;
        font-weight: bold;
        color: #FFD700;
        margin-bottom: 20px;
        text-shadow: 0 0 10px rgba(255, 215, 0, 0.7);
        animation: personPulse 2s infinite;
      }
      .celebration-amount {
        font-size: 48px;
        color: #4CAF50;
        margin-bottom: 30px;
        text-shadow: 0 0 10px rgba(76, 175, 80, 0.7);
        animation: amountShine 3s infinite;
      }
      .celebration-platform {
        font-size: 36px;
        color: #2196F3;
        margin-bottom: 40px;
        text-shadow: 0 0 10px rgba(33, 150, 243, 0.7);
        animation: platformWave 2s infinite;
      }
      .celebration-message {
        font-size: 32px;
        color: white;
        line-height: 1.4;
        animation: messageAppear 1s ease-out;
      }
      .celebration-confetti {
        position: absolute;
        width: 10px;
        height: 10px;
        background-color: #FFD700;
        border-radius: 50%;
        opacity: 0.8;
        z-index: -1;
      }
      .celebration-coin {
        position: absolute;
        width: 30px;
        height: 30px;
        background-color: gold;
        border-radius: 50%;
        color: #B27E29;
        display: flex;
        justify-content: center;
        align-items: center;
        font-weight: bold;
        font-size: 20px;
        z-index: -1;
        box-shadow: 0 0 10px rgba(255, 215, 0, 0.7);
        animation: spin 2s infinite linear;
      }
      .celebration-close-btn {
        position: absolute;
        top: 20px;
        right: 20px;
        width: 40px;
        height: 40px;
        background-color: rgba(255, 255, 255, 0.3);
        border-radius: 50%;
        display: flex;
        justify-content: center;
        align-items: center;
        color: white;
        font-size: 24px;
        cursor: pointer;
        transition: all 0.3s;
        z-index: 3001;
      }
      .celebration-close-btn:hover {
        background-color: rgba(255, 255, 255, 0.6);
        transform: scale(1.1);
      }
      
      /* 庆祝动画关键帧 */
      @keyframes celebrationZoom {
        0% { transform: scale(0.1) rotate(-10deg); opacity: 0; }
        70% { transform: scale(1.1) rotate(5deg); opacity: 1; }
        100% { transform: scale(1) rotate(0deg); opacity: 1; }
      }
      @keyframes personPulse {
        0% { transform: scale(1); }
        50% { transform: scale(1.1); }
        100% { transform: scale(1); }
      }
      @keyframes amountShine {
        0% { text-shadow: 0 0 10px rgba(76, 175, 80, 0.7); }
        50% { text-shadow: 0 0 30px rgba(76, 175, 80, 1); }
        100% { text-shadow: 0 0 10px rgba(76, 175, 80, 0.7); }
      }
      @keyframes platformWave {
        0% { transform: translateX(-5px); }
        50% { transform: translateX(5px); }
        100% { transform: translateX(-5px); }
      }
      @keyframes messageAppear {
        0% { opacity: 0; transform: translateY(20px); }
        100% { opacity: 1; transform: translateY(0); }
      }
      @keyframes confettiFall {
        0% { transform: translateY(-100vh) rotate(0deg); opacity: 1; }
        100% { transform: translateY(100vh) rotate(360deg); opacity: 0; }
      }
      @keyframes coinFall {
        0% { transform: translateY(-50vh) rotate(0deg); opacity: 1; }
        100% { transform: translateY(100vh) rotate(720deg); opacity: 0; }
      }
      @keyframes spin {
        0% { transform: rotateY(0deg); }
        100% { transform: rotateY(360deg); }
      }
      @keyframes flash {
        0% { background-color: rgba(0, 0, 0, 0.85); }
        50% { background-color: rgba(76, 175, 80, 0.3); }
        100% { background-color: rgba(0, 0, 0, 0.85); }
      }
    `;
    document.head.appendChild(styleEl);
  }
  
  // 创建DOM元素
  function createDom() {
    const overlay = document.createElement('div');
    overlay.className = 'celebration-overlay';
    overlay.id = 'celebrationOverlay';
    
    const content = document.createElement('div');
    content.className = 'celebration-content';
    
    const person = document.createElement('div');
    person.className = 'celebration-person';
    person.id = 'celebrationPerson';
    person.textContent = '张三';
    
    const amount = document.createElement('div');
    amount.className = 'celebration-amount';
    amount.id = 'celebrationAmount';
    amount.textContent = '¥ 10,000';
    
    const platform = document.createElement('div');
    platform.className = 'celebration-platform';
    platform.id = 'celebrationPlatform';
    platform.textContent = '阿里巴巴';
    
    const message = document.createElement('div');
    message.className = 'celebration-message';
    message.id = 'celebrationMessage';
    message.innerHTML = '恭喜恭喜！又一大单入账！<br>这个月KPI稳了！';
    
    const closeBtn = document.createElement('div');
    closeBtn.className = 'celebration-close-btn';
    closeBtn.id = 'celebrationCloseBtn';
    closeBtn.innerHTML = '✖';
    closeBtn.title = '关闭庆祝动画';
    closeBtn.addEventListener('click', function() {
      closeCelebration();
    });
    
    content.appendChild(person);
    content.appendChild(amount);
    content.appendChild(platform);
    content.appendChild(message);
    overlay.appendChild(content);
    overlay.appendChild(closeBtn);
    
    document.body.appendChild(overlay);
  }
  
  // 关闭庆祝动画
  function closeCelebration() {
    const overlay = document.getElementById('celebrationOverlay');
    if (overlay) {
      overlay.style.animation = '';
      overlay.style.display = 'none';
      
      // 清除自动关闭定时器
      if (window.celebrationTimerId) {
        clearTimeout(window.celebrationTimerId);
        window.celebrationTimerId = null;
      }
    }
  }
  
  // 显示全屏庆祝动画效果
  function showCelebration(person, amount, platform, message) {
    const overlay = document.getElementById('celebrationOverlay');
    const personElement = document.getElementById('celebrationPerson');
    const amountElement = document.getElementById('celebrationAmount');
    const platformElement = document.getElementById('celebrationPlatform');
    const messageElement = document.getElementById('celebrationMessage');
    
    // 设置内容 - 确保名字和平台不会显示异常
    personElement.textContent = person && person.replace(/[""'"]/g, '').trim() || '未知负责人';
    amountElement.textContent = '¥ ' + (typeof amount === 'number' ? amount.toLocaleString('zh-CN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }) : amount || '0.00');
    platformElement.textContent = platform && platform.replace(/[""'"]/g, '').trim() || '未知平台';
    
    // 从消息中提取最有力的部分
    let celebrationMsg = '';
    if (message) {
      const parts = message.split(/[!！]/);
      if (parts.length > 1 && parts[0].length > 10) {
        celebrationMsg = parts[0] + '！';
      } else if (parts.length > 1) {
        celebrationMsg = parts[0] + '！' + parts[1] + '！';
      } else {
        celebrationMsg = message;
      }
    } else {
      celebrationMsg = '又一单成交！牛哇！';
    }
    
    messageElement.innerHTML = celebrationMsg.replace(/。/g, '！');
    
    // 清除之前的特效元素
    clearCelebrationEffects();
    
    // 显示遮罩层
    overlay.style.display = 'flex';
    
    // 添加背景闪烁动画
    overlay.style.animation = 'flash 1s infinite';
    
    // 播放庆祝音效
    playSpecialCelebrationSound();
    
    // 生成彩色纸屑特效
    generateConfetti(150);
    
    // 生成金币特效
    generateCoins(30);
    
    // 清除之前的定时器
    if (window.celebrationTimerId) {
      clearTimeout(window.celebrationTimerId);
    }
    
    // 3分钟后自动隐藏庆祝动画（180秒）
    window.celebrationTimerId = setTimeout(() => {
      closeCelebration();
    }, 180000); // 3分钟
    
    // 每30秒刷新一次特效，保持动画活力
    let refreshCount = 0;
    const maxRefreshes = 6; // 3分钟内刷新6次
    
    function refreshEffects() {
      if (refreshCount < maxRefreshes && overlay.style.display !== 'none') {
        refreshCount++;
        generateConfetti(50);
        generateCoins(10);
        setTimeout(refreshEffects, 30000); // 每30秒刷新一次
      }
    }
    
    // 启动特效刷新
    setTimeout(refreshEffects, 30000);
  }
  
  // 清除之前的特效元素
  function clearCelebrationEffects() {
    const overlay = document.getElementById('celebrationOverlay');
    
    // 移除所有彩色纸屑
    const confetti = overlay.querySelectorAll('.celebration-confetti');
    confetti.forEach(element => element.remove());
    
    // 移除所有金币
    const coins = overlay.querySelectorAll('.celebration-coin');
    coins.forEach(element => element.remove());
  }
  
  // 生成彩色纸屑特效
  function generateConfetti(count) {
    const overlay = document.getElementById('celebrationOverlay');
    const colors = ['#FFD700', '#FF6347', '#4CAF50', '#2196F3', '#9C27B0', '#FF9800'];
    
    for (let i = 0; i < count; i++) {
      const confetti = document.createElement('div');
      confetti.className = 'celebration-confetti';
      
      // 随机位置
      confetti.style.left = Math.random() * 100 + 'vw';
      
      // 随机颜色
      confetti.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
      
      // 随机大小
      const size = 5 + Math.random() * 10;
      confetti.style.width = size + 'px';
      confetti.style.height = size + 'px';
      
      // 随机形状（圆形或方形）
      confetti.style.borderRadius = Math.random() > 0.5 ? '50%' : '0';
      
      // 随机动画持续时间
      const duration = 3 + Math.random() * 5;
      confetti.style.animation = `confettiFall ${duration}s linear forwards`;
      
      // 随机延迟
      confetti.style.animationDelay = Math.random() * 7 + 's';
      
      overlay.appendChild(confetti);
    }
  }
  
  // 生成金币特效
  function generateCoins(count) {
    const overlay = document.getElementById('celebrationOverlay');
    
    for (let i = 0; i < count; i++) {
      const coin = document.createElement('div');
      coin.className = 'celebration-coin';
      coin.textContent = '¥';
      
      // 随机位置
      coin.style.left = Math.random() * 100 + 'vw';
      
      // 随机大小
      const size = 20 + Math.random() * 30;
      coin.style.width = size + 'px';
      coin.style.height = size + 'px';
      coin.style.fontSize = size * 0.6 + 'px';
      
      // 随机动画持续时间
      const duration = 3 + Math.random() * 4;
      coin.style.animation = `coinFall ${duration}s linear forwards, spin ${duration / 2}s linear infinite`;
      
      // 随机延迟
      coin.style.animationDelay = Math.random() * 5 + 's';
      
      overlay.appendChild(coin);
    }
  }
  
  // 播放特殊庆祝音效
  function playSpecialCelebrationSound() {
    // 检查现有音效或创建新音效
    let celebrationSound = document.getElementById('celebrationSound');
    
    if (!celebrationSound) {
      celebrationSound = document.createElement('audio');
      celebrationSound.id = 'celebrationSound';
      celebrationSound.style.display = 'none';
      
      // 添加多个音源以增加兼容性
      const mp3Source = document.createElement('source');
      mp3Source.src = 'https://cdn.jsdelivr.net/gh/freeCodeCamp/cdn/build/testable-projects-fcc/audio/beam-up.mp3';
      mp3Source.type = 'audio/mpeg';
      
      const wavSource = document.createElement('source');
      wavSource.src = 'https://cdn.jsdelivr.net/gh/freeCodeCamp/cdn/build/testable-projects-fcc/audio/beam-up.wav';
      wavSource.type = 'audio/wav';
      
      celebrationSound.appendChild(mp3Source);
      celebrationSound.appendChild(wavSource);
      
      document.body.appendChild(celebrationSound);
    }
    
    // 尝试播放音效
    celebrationSound.currentTime = 0;
    celebrationSound.volume = 0.8;
    celebrationSound.play().catch(error => {
      console.warn('无法播放庆祝音效:', error);
    });
  }
  
  // 初始化
  init();
})();

// 暴露给showDealAnimation使用的函数
function extractInfoAndShowCelebration(amount, announcement) {
  // 解析交易信息
  let personName = '未知负责人';
  let platform = '未知平台';
  let amountValue = amount;
  
  // 尝试从公告中提取信息
  if (announcement) {
    // 优化人名提取正则表达式
    const personMatch = announcement.match(/([^\s!！,，。:：]+(?:-[^\s!！,，。:：]+)?)\s*(?:在|从|刚刚搞定|用实力|的超级业绩|又来一单)/);
    if (personMatch && personMatch[1]) {
      personName = personMatch[1].trim();
      // 清理名字中可能的多余符号
      personName = personName.replace(/["'""「」【】]/g, '');
    }
    
    // 优化平台提取正则表达式
    const platformMatch = announcement.match(/(?:在|从|搞定)\s*([^\s!！,，。:：]+)\s*(?:疯狂|斩获|一大波|攻陷|刚刚被|被我们承包)/);
    if (platformMatch && platformMatch[1]) {
      platform = platformMatch[1].trim();
      // 清理平台名中可能的多余符号
      platform = platform.replace(/["'""「」【】]/g, '');
    }
  }
  
  // 显示全屏庆祝动画
  window.showCelebration(personName, amountValue, platform, announcement);
} 