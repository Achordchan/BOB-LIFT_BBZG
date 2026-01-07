// 更新成交金额显示
function updateDealAmount() {
  fetch('/api/deals')
    .then(response => response.json())
    .then(data => {
      dealAmountElement.textContent = data.dealAmount.toLocaleString('zh-CN', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      });
    })
    .catch(error => console.error('获取成交金额失败:', error));
}

async function applyInquirySnapshot(snapshot) {
  const currentCount = snapshot && typeof snapshot.inquiryCount === 'number' ? snapshot.inquiryCount : 0;
  const latestInquiry = snapshot ? snapshot.latestInquiry : null;

  const inquiryEl = document.getElementById('inquiryCount');
  if (inquiryEl) inquiryEl.textContent = currentCount;

  if (lastInquiryCount === null) {
    lastInquiryCount = currentCount;
    return;
  }

  if (currentCount > lastInquiryCount) {
    const incrementAmount = currentCount - lastInquiryCount;

    let latestData = null;
    if (latestInquiry && typeof latestInquiry === 'object') {
      latestData = { success: true, latestInquiry };
    } else {
      try {
        const latestResponse = await (window.fetchWithTimeout ? window.fetchWithTimeout('/api/inquiries/latest') : fetch('/api/inquiries/latest'));
        latestData = await latestResponse.json();
      } catch (error) {
        latestData = null;
      }
    }

    if (latestData && latestData.success && latestData.latestInquiry && latestData.latestInquiry.fromAdmin) {
      console.log('从管理页面设置询盘数量，不触发动效和音效');
      lastInquiryCount = currentCount;
      return;
    }

    if (window.inquirySoundDebounceTimer) {
      clearTimeout(window.inquirySoundDebounceTimer);
    }

    window.inquirySoundDebounceTimer = setTimeout(() => {
      if (latestData && latestData.success && latestData.latestInquiry && latestData.latestInquiry.type === 'add' && latestData.latestInquiry.musicToPlay) {
        playCustomSound(latestData.latestInquiry.musicToPlay);
      } else {
        playInquirySound();
      }
    }, 300);

    if (window.incrementAnimationTimers) {
      window.incrementAnimationTimers.forEach(timer => clearTimeout(timer));
    }
    window.incrementAnimationTimers = [];

    for (let i = 0; i < incrementAmount; i++) {
      const timer = setTimeout(() => {
        showIncrementAnimation();
      }, i * 300);
      window.incrementAnimationTimers.push(timer);
    }
  } else if (currentCount < lastInquiryCount) {
    const decrementAmount = lastInquiryCount - currentCount;

    let latestData = null;
    if (latestInquiry && typeof latestInquiry === 'object') {
      latestData = { success: true, latestInquiry };
    } else {
      try {
        const latestResponse = await (window.fetchWithTimeout ? window.fetchWithTimeout('/api/inquiries/latest') : fetch('/api/inquiries/latest'));
        latestData = await latestResponse.json();
      } catch (error) {
        latestData = null;
      }
    }

    if (latestData && latestData.success && latestData.latestInquiry && latestData.latestInquiry.fromAdmin) {
      console.log('从管理页面设置询盘数量，不触发动效和音效');
      lastInquiryCount = currentCount;
      return;
    }

    if (window.inquirySoundDebounceTimer) {
      clearTimeout(window.inquirySoundDebounceTimer);
    }

    window.inquirySoundDebounceTimer = setTimeout(() => {
      if (latestData && latestData.success && latestData.latestInquiry && latestData.latestInquiry.type === 'reduce' && latestData.latestInquiry.musicToPlay) {
        playCustomSound(latestData.latestInquiry.musicToPlay);
      } else {
        playDeleteSound();
      }
    }, 300);

    if (window.decrementAnimationTimers) {
      window.decrementAnimationTimers.forEach(timer => clearTimeout(timer));
    }
    window.decrementAnimationTimers = [];

    for (let i = 0; i < decrementAmount; i++) {
      const timer = setTimeout(() => {
        showDecrementAnimation();
      }, i * 300);
      window.decrementAnimationTimers.push(timer);
    }
  }

  lastInquiryCount = currentCount;
}

function applyDealSnapshot(snapshot) {
  const currentAmount = snapshot && typeof snapshot.dealAmount === 'number' ? snapshot.dealAmount : 0;
  const latestDeal = snapshot ? snapshot.latestDeal : null;

  if (typeof dealAmountElement !== 'undefined' && dealAmountElement) {
    dealAmountElement.textContent = currentAmount.toLocaleString('zh-CN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }

  if (lastDealAmount === null) {
    lastDealAmount = currentAmount;
    return Promise.resolve();
  }

  if (currentAmount > lastDealAmount) {
    const increasedAmount = currentAmount - lastDealAmount;
    console.log('💰 [成交检测] 检测到成交金额增加:', increasedAmount);
    console.log('💰 [成交检测] 上次金额:', lastDealAmount, '当前金额:', currentAmount);
    lastDealAmount = currentAmount;

    const dealPromise = (async () => {
      let dealData = null;
      if (latestDeal && typeof latestDeal === 'object') {
        dealData = latestDeal;
      } else {
        try {
          const resp = await (window.fetchWithTimeout ? window.fetchWithTimeout('/api/deals/latest') : fetch('/api/deals/latest'));
          dealData = await resp.json();
        } catch (e) {
          dealData = {
            announcement: `震惊！运营团队又创造佳绩！新成交${increasedAmount}元，这个月KPI稳了！`,
            musicToPlay: null
          };
        }
      }

      console.log('💰 [成交检测] 获取到成交详情:', dealData);
      console.log('💰 [成交检测] window.addToQueue 存在?', typeof window.addToQueue);

      if (typeof window.addToQueue === 'function') {
        console.log('💰 [成交检测] 使用排队系统');
        window.addToQueue({
          amount: increasedAmount,
          announcement: dealData.announcement,
          musicToPlay: dealData.musicToPlay,
          person: dealData.person || '未知',
          platform: dealData.platform || '未知平台'
        });
      } else {
        console.log('💰 [成交检测] 排队系统未加载，直接播放');
        if (typeof window.showDealAnimation === 'function') {
          window.showDealAnimation(increasedAmount, dealData.announcement, dealData.musicToPlay);
        } else if (typeof showDealAnimation === 'function') {
          showDealAnimation(increasedAmount, dealData.announcement, dealData.musicToPlay);
        } else {
          console.error('💰 [成交检测] showDealAnimation 函数不存在！');
        }
      }

      if (window.platformTargetsManager && dealData.platform) {
        window.platformTargetsManager.updatePlatformData(dealData.platform, increasedAmount);
      }
    })();

    return dealPromise;
  }

  lastDealAmount = currentAmount;
  return Promise.resolve();
}

// 获取并显示当前询盘数
async function fetchInquiryCount() {
  try {
    const response = await (window.fetchWithTimeout ? window.fetchWithTimeout('/api/inquiries') : fetch('/api/inquiries'));
    const data = await response.json();
    await applyInquirySnapshot({ inquiryCount: data.inquiryCount });
  } catch (error) {
    console.error('获取询盘数据失败:', error);
  }
}

// 监听成交金额变化
function checkDealAmountChange() {
  return (window.fetchWithTimeout ? window.fetchWithTimeout('/api/deals') : fetch('/api/deals'))
    .then(response => response.json())
    .then(data => applyDealSnapshot({ dealAmount: data.dealAmount || 0 }))
    .catch(error => console.error('检查成交金额变化失败:', error));
}

// 加载询盘音效配置
function loadInquiryMusicConfig() {
  (window.fetchWithTimeout ? window.fetchWithTimeout('/api/inquiries/config') : fetch('/api/inquiries/config'))
    .then(response => response.json())
    .then(data => {
      if (data.success && data.inquiryConfig) {
        window.inquiryMusicConfig = data.inquiryConfig;
        console.log('询盘音效配置已加载', data.inquiryConfig);
      }
    })
    .catch(error => {
      console.error('加载询盘音效配置失败:', error);
    });
}

// 目标数据对象
const targetData = {
  inquiryTarget: 0,
  dealTarget: 0,
  lastResetTime: null,
  nextResetTime: null
};

/**
 * 加载目标数据
 */
async function loadTargetData() {
  try {
    console.log('开始加载目标数据...');
    const response = await (window.fetchWithTimeout ? window.fetchWithTimeout('/api/targets') : fetch('/api/targets'));
    
    if (!response.ok) {
      throw new Error(`获取目标数据失败，状态码: ${response.status}`);
    }
    
    const data = await response.json();
    console.log('获取到目标数据:', data);
    
    if (data.success !== undefined && !data.success) {
      console.warn('API返回失败状态:', data.message);
      // 尝试从本地存储加载
      loadTargetDataFromLocalStorage();
      return;
    }
    
    // 确保数据有效性
    if (data.inquiryTarget === undefined || data.dealTarget === undefined) {
      console.warn('获取到的目标数据不完整，尝试从本地存储加载');
      loadTargetDataFromLocalStorage();
      return;
    }
    
    // 更新目标数据
    targetData.inquiryTarget = typeof data.inquiryTarget === 'number' ? data.inquiryTarget : parseInt(data.inquiryTarget) || 0;
    targetData.dealTarget = typeof data.dealTarget === 'number' ? data.dealTarget : parseInt(data.dealTarget) || 0;
    targetData.lastResetTime = data.lastResetTime ? new Date(data.lastResetTime) : null;
    targetData.nextResetTime = null; // 不设置下次重置时间
    
    console.log('目标数据已更新:', targetData);
    
    // 更新UI显示
    updateTargetUI();
    
    // 保存到本地存储备份
    localStorage.setItem('targetData', JSON.stringify({
      inquiryTarget: targetData.inquiryTarget,
      dealTarget: targetData.dealTarget,
      lastResetTime: targetData.lastResetTime ? targetData.lastResetTime.toISOString() : null
    }));
  } catch (error) {
    console.error('获取目标数据时出错:', error);
    // 尝试从本地存储加载
    loadTargetDataFromLocalStorage();
  }
}

/**
 * 从本地存储加载目标数据
 */
function loadTargetDataFromLocalStorage() {
  try {
    const savedData = localStorage.getItem('targetData');
    if (savedData) {
      const parsedData = JSON.parse(savedData);
      
      targetData.inquiryTarget = parsedData.inquiryTarget || 0;
      targetData.dealTarget = parsedData.dealTarget || 0;
      targetData.lastResetTime = parsedData.lastResetTime ? new Date(parsedData.lastResetTime) : null;
      targetData.nextResetTime = null; // 不设置下次重置时间
      
      // 更新UI显示
      updateTargetUI();
    }
  } catch (error) {
    console.error('从本地存储加载目标数据时出错:', error);
  }
}

/**
 * 更新目标UI显示
 */
function updateTargetUI() {
  // 获取当前询盘数和成交金额
  const currentInquiryCount = parseInt(document.getElementById('inquiryCount').textContent.replace(/,/g, '')) || 0;
  const currentDealAmount = parseFloat(document.getElementById('dealAmount').textContent.replace(/[^\d.]/g, '')) || 0;
  
  // 计算完成百分比
  let inquiryPercentage = targetData.inquiryTarget > 0 ? Math.min(100, Math.round((currentInquiryCount / targetData.inquiryTarget) * 100)) : 0;
  let dealPercentage = targetData.dealTarget > 0 ? Math.min(100, Math.round((currentDealAmount / targetData.dealTarget) * 100)) : 0;
  
  // 超过目标特殊标记
  let inquiryExceeded = currentInquiryCount > targetData.inquiryTarget && targetData.inquiryTarget > 0;
  let dealExceeded = currentDealAmount > targetData.dealTarget && targetData.dealTarget > 0;
  
  // 更新目标信息显示
  const inquiryTargetInfoEl = document.getElementById('inquiryTargetInfo');
  const dealTargetInfoEl = document.getElementById('dealTargetInfo');
  
  if (inquiryTargetInfoEl) {
    inquiryTargetInfoEl.textContent = targetData.inquiryTarget > 0 ? 
      `目标: ${targetData.inquiryTarget.toLocaleString()} (当前: ${currentInquiryCount.toLocaleString()})` : 
      '目标: 尚未设置';
    inquiryTargetInfoEl.style.display = 'block'; // 确保元素可见
  }
  
  if (dealTargetInfoEl) {
    dealTargetInfoEl.textContent = targetData.dealTarget > 0 ? 
      `目标: ¥${targetData.dealTarget.toLocaleString()} (当前: ¥${currentDealAmount.toLocaleString('zh-CN', {maximumFractionDigits: 2})})` : 
      '目标: 尚未设置';
    dealTargetInfoEl.style.display = 'block'; // 确保元素可见
    console.log('已更新成交目标信息:', dealTargetInfoEl.textContent);
  }
  
  // 更新百分比显示和样式
  const inquiryPercentageEl = document.getElementById('inquiryPercentage');
  const dealPercentageEl = document.getElementById('dealPercentage');
  
  inquiryPercentageEl.textContent = inquiryExceeded ? 
    `${inquiryPercentage}% 🎯` : 
    `${inquiryPercentage}%`;
  dealPercentageEl.textContent = dealExceeded ? 
    `${dealPercentage}% 🎯` : 
    `${dealPercentage}%`;
  
  // 为超过目标的百分比添加特殊样式
  if (inquiryExceeded) {
    inquiryPercentageEl.classList.add('percentage-exceed');
  } else {
    inquiryPercentageEl.classList.remove('percentage-exceed');
  }
  
  if (dealExceeded) {
    dealPercentageEl.classList.add('percentage-exceed');
  } else {
    dealPercentageEl.classList.remove('percentage-exceed');
  }
  
  // 更新进度条
  const inquiryProgressBar = document.getElementById('inquiryProgressBar');
  const dealProgressBar = document.getElementById('dealProgressBar');
  
  inquiryProgressBar.style.width = `${inquiryPercentage}%`;
  dealProgressBar.style.width = `${dealPercentage}%`;
  
  // 添加超出目标时的特效
  if (inquiryExceeded) {
    inquiryProgressBar.classList.add('exceed');
    // 保持进度条满格
    inquiryProgressBar.style.width = '100%';
  } else {
    inquiryProgressBar.classList.remove('exceed');
  }
  
  if (dealExceeded) {
    dealProgressBar.classList.add('exceed');
    // 保持进度条满格
    dealProgressBar.style.width = '100%';
  } else {
    dealProgressBar.classList.remove('exceed');
  }
}

// 初始化时加载目标数据
document.addEventListener('DOMContentLoaded', function() {
  // 初始加载目标数据
  if (typeof updateTargetUI === 'function') {
    updateTargetUI();
  }
});