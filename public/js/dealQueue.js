/**
 * 成交排队系统
 * 管理多个成交请求的排队和播放
 */

// 全局排队队列 - 强制初始化为数组
if (!Array.isArray(window.dealQueue)) {
  window.dealQueue = [];
}
if (typeof window.isProcessingDeal === 'undefined') {
  window.isProcessingDeal = false;
}

console.log('🎵 [排队系统] 初始化完成');
console.log('🎵 [排队系统] dealQueue 类型:', typeof window.dealQueue);
console.log('🎵 [排队系统] dealQueue 是否为数组:', Array.isArray(window.dealQueue));

/**
 * 添加成交到队列
 * @param {Object} dealData - 成交数据
 */
function addToQueue(dealData) {
  console.log('🎵 [排队系统] 添加成交到队列:', dealData);
  console.log('🎵 [排队系统] 当前队列长度:', window.dealQueue.length);
  console.log('🎵 [排队系统] 是否正在处理:', window.isProcessingDeal);
  
  // 添加到队列
  window.dealQueue.push(dealData);
  
  console.log('🎵 [排队系统] 添加后队列长度:', window.dealQueue.length);
  
  // 更新队列显示
  updateQueueUI();
  
  // 如果当前没有正在处理的成交，开始处理
  if (!window.isProcessingDeal) {
    console.log('🎵 [排队系统] 当前空闲，立即开始处理');
    processNextDeal();
  } else {
    console.log('🎵 [排队系统] 正在处理中，已加入等待队列');
  }
}

/**
 * 处理下一个成交
 */
function processNextDeal() {
  console.log('🎵 [排队系统] processNextDeal 被调用');
  console.log('🎵 [排队系统] 当前队列长度:', window.dealQueue.length);
  console.log('🎵 [排队系统] 当前处理状态:', window.isProcessingDeal);
  
  // 如果队列为空，隐藏队列UI
  if (window.dealQueue.length === 0) {
    console.log('🎵 [排队系统] 队列为空，停止处理');
    window.isProcessingDeal = false;
    hideQueueUI();
    return;
  }
  
  // 如果正在处理中，不重复处理（等待当前的播放完成）
  if (window.isProcessingDeal) {
    console.log('🎵 [排队系统] 已有成交正在处理中，等待播放完成');
    return;
  }
  
  // 标记正在处理
  window.isProcessingDeal = true;
  console.log('🎵 [排队系统] 设置 isProcessingDeal = true');
  
  // 取出队列的第一个成交
  const dealData = window.dealQueue[0];
  console.log('🎵 [排队系统] 开始处理成交:', dealData);
  
  // 更新队列UI，标记第一个为正在播放
  updateQueueUI();
  
  // 播放成交动画和音乐
  const { amount, announcement, musicToPlay } = dealData;
  
  console.log('🎵 [排队系统] 调用 showDealAnimation');
  console.log('🎵 [排队系统] amount:', amount);
  console.log('🎵 [排队系统] announcement:', announcement);
  console.log('🎵 [排队系统] musicToPlay:', musicToPlay);
  
  // 检查函数是否存在
  if (typeof window.showDealAnimation === 'function') {
    console.log('🎵 [排队系统] showDealAnimation 函数存在，开始调用');
    window.showDealAnimation(amount, announcement, musicToPlay);
  } else {
    console.error('🎵 [排队系统] showDealAnimation 函数不存在！');
    // 如果函数不存在，尝试直接调用（可能在全局作用域）
    if (typeof showDealAnimation === 'function') {
      console.log('🎵 [排队系统] 使用全局 showDealAnimation');
      showDealAnimation(amount, announcement, musicToPlay);
    } else {
      console.error('🎵 [排队系统] 无法找到 showDealAnimation 函数');
    }
  }
  
  // 监听音乐播放结束事件
  const userDealSound = document.getElementById('userDealSound');
  
  if (userDealSound) {
    // 移除之前的监听器（如果有）
    if (window.dealEndHandler) {
      userDealSound.removeEventListener('ended', window.dealEndHandler);
    }
    
    // 创建新的结束处理器
    window.dealEndHandler = function() {
      console.log('🎵 [排队系统] 成交音乐播放完成');
      console.log('🎵 [排队系统] 当前队列长度:', window.dealQueue.length);
      
      // 从队列中移除已完成的成交
      if (window.dealQueue.length > 0) {
        const finishedDeal = window.dealQueue.shift();
        console.log('🎵 [排队系统] 移除已完成的成交:', finishedDeal);
      }
      
      // 重置处理标志
      window.isProcessingDeal = false;
      console.log('🎵 [排队系统] 设置 isProcessingDeal = false');
      
      // 延迟一下再处理下一个，避免太快
      setTimeout(() => {
        console.log('🎵 [排队系统] 准备处理下一个，当前队列:', window.dealQueue.length);
        processNextDeal();
      }, 1000);
    };
    
    // 添加ended事件监听器（音乐正常播放结束）
    userDealSound.addEventListener('ended', window.dealEndHandler);
    console.log('🎵 [排队系统] 已设置 ended 事件监听器');
  } else {
    console.error('🎵 [排队系统] userDealSound 元素未找到，无法监听播放结束');
    
    // 如果找不到音频元素，延迟后处理下一个
    setTimeout(() => {
      if (window.dealQueue.length > 0) {
        window.dealQueue.shift();
      }
      window.isProcessingDeal = false;
      console.log('🎵 [排队系统] 未找到元素，重置 isProcessingDeal = false');
      processNextDeal();
    }, 10000); // 10秒后处理下一个
  }
}

/**
 * 更新队列UI显示
 */
function updateQueueUI() {
  const queueContainer = document.getElementById('dealQueue');
  const queueList = document.getElementById('queueList');
  const queueCount = document.getElementById('queueCount');
  
  if (!queueContainer || !queueList || !queueCount) {
    return;
  }
  
  // 如果队列为空或只有1个，隐藏（1个不算排队）
  if (window.dealQueue.length <= 1) {
    hideQueueUI();
    return;
  }
  
  // 只有2个及以上才显示队列容器
  queueContainer.style.display = 'block';
  
  // 更新计数
  queueCount.textContent = window.dealQueue.length;
  
  // 清空列表
  queueList.innerHTML = '';
  
  // 渲染队列项（textContent，避免持久化 XSS）
  window.dealQueue.forEach((deal, index) => {
    const queueItem = document.createElement('div');
    queueItem.className = 'queue-item' + (index === 0 ? ' playing' : '');

    const userName = deal.musicToPlay ? deal.musicToPlay.userName : deal.person || '未知';
    const userInitial = String(userName).charAt(0).toUpperCase();

    const avatar = document.createElement('div');
    avatar.className = 'queue-item-avatar';
    avatar.textContent = userInitial;

    const info = document.createElement('div');
    info.className = 'queue-item-info';

    const nameEl = document.createElement('div');
    nameEl.className = 'queue-item-name';
    nameEl.textContent = String(userName || '未知');

    const amountEl = document.createElement('div');
    amountEl.className = 'queue-item-amount';
    const amountNumber = Number(deal.amount);
    amountEl.textContent = '¥' + (Number.isFinite(amountNumber)
      ? amountNumber.toLocaleString('zh-CN', { minimumFractionDigits: 2 })
      : '0.00');

    const platformEl = document.createElement('div');
    platformEl.className = 'queue-item-platform';
    platformEl.textContent = String(deal.platform || '未知平台');

    info.appendChild(nameEl);
    info.appendChild(amountEl);
    info.appendChild(platformEl);
    queueItem.appendChild(avatar);
    queueItem.appendChild(info);

    if (index === 0) {
      const playing = document.createElement('div');
      playing.style.color = '#4ade80';
      playing.style.fontSize = '11px';
      playing.style.fontWeight = '600';
      playing.textContent = '播放中';
      queueItem.appendChild(playing);
    }

    queueList.appendChild(queueItem);
  });
}

/**
 * 隐藏队列UI
 */
function hideQueueUI() {
  const queueContainer = document.getElementById('dealQueue');
  if (queueContainer) {
    queueContainer.style.display = 'none';
  }
}

/**
 * 清空队列
 */
function clearQueue() {
  window.dealQueue = [];
  window.isProcessingDeal = false;
  updateQueueUI();
}

// 暴露到全局
window.addToQueue = addToQueue;
window.processNextDeal = processNextDeal;
window.updateQueueUI = updateQueueUI;
window.clearQueue = clearQueue;

