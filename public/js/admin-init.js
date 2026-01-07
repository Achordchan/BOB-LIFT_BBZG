/**
 * 初始化标签页切换
 */
function initTabs() {
  const tabs = document.querySelectorAll('.tab');
  const tabContents = document.querySelectorAll('.tab-content');
  
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const tabId = tab.getAttribute('data-tab');
      
      // 更新标签页状态
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      
      // 更新内容区域
      tabContents.forEach(content => {
        content.classList.remove('active');
        if (content.id === tabId + 'Tab') {
          content.classList.add('active');
        }
      });

      if (tabId === 'music') {
        if (typeof window.initMusicSubTabs === 'function') {
          window.initMusicSubTabs();
        }
      }
    });
  });
}

function initCollapsibleSections() {
  const blocks = document.querySelectorAll('.section[data-collapsible="true"], .subsection[data-collapsible="true"]');
  blocks.forEach(block => {
    const title = block.querySelector('h2, h3');
    if (!title) return;

    title.addEventListener('click', function() {
      const isCollapsed = block.getAttribute('data-collapsed') === 'true';
      block.setAttribute('data-collapsed', isCollapsed ? 'false' : 'true');
    });
  });
}

function initMusicSubTabs() {
  const container = document.querySelector('#musicTab .music-sub-tabs');
  if (!container) return;

  const tabs = container.querySelectorAll('.sub-tab');
  const sections = document.querySelectorAll('#musicTab .section[data-music-subtab]');
  if (!tabs.length) return;

  function setActiveSubTab(key) {
    tabs.forEach(t => {
      t.classList.toggle('active', t.getAttribute('data-music-subtab') === key);
    });

    sections.forEach(sec => {
      const secKey = sec.getAttribute('data-music-subtab');
      sec.style.display = secKey === key ? '' : 'none';
    });
  }

  tabs.forEach(t => {
    t.addEventListener('click', function() {
      const key = t.getAttribute('data-music-subtab');
      if (!key) return;
      setActiveSubTab(key);
    });
  });

  const active = container.querySelector('.sub-tab.active');
  const defaultKey = active ? active.getAttribute('data-music-subtab') : 'library';
  setActiveSubTab(defaultKey || 'library');
}

window.initMusicSubTabs = initMusicSubTabs;

/**
 * 初始化API测试事件
 */
function initApiTestEvents() {
  function setApiResult(preId, payload) {
    const el = document.getElementById(preId);
    if (!el) return;
    try {
      el.textContent = typeof payload === 'string' ? payload : JSON.stringify(payload, null, 2);
    } catch (e) {
      el.textContent = String(payload);
    }
    el.style.display = 'block';
  }

  function safeFetchJson(url, options) {
    return fetch(url, options).then(async r => {
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        const msg = (data && data.message) ? data.message : `请求失败(${r.status})`;
        throw new Error(msg);
      }
      return data;
    });
  }

  const testPingBtn = document.getElementById('testPingBtn');
  if (testPingBtn) {
    testPingBtn.addEventListener('click', function() {
      safeFetchJson('/api/ping')
        .then(data => {
          setApiResult('apiBaseResult', data);
          showMessage('请求成功');
        })
        .catch(error => {
          console.error('测试 /api/ping 失败:', error);
          setApiResult('apiBaseResult', { success: false, message: error.message });
          showMessage(error.message || '请求失败', 'error');
        });
    });
  }

  const listRoutesBtn = document.getElementById('listRoutesBtn');
  if (listRoutesBtn) {
    listRoutesBtn.addEventListener('click', function() {
      safeFetchJson('/api/debug/routes')
        .then(data => {
          setApiResult('apiBaseResult', data);
          showMessage('请求成功');
        })
        .catch(error => {
          console.error('获取路由列表失败:', error);
          setApiResult('apiBaseResult', { success: false, message: error.message });
          showMessage(error.message || '请求失败', 'error');
        });
    });
  }

  // 测试API接口
  const testApiBtn = document.getElementById('testApiBtn');
  if (testApiBtn) {
    testApiBtn.addEventListener('click', function() {
      const amount = document.getElementById('testAmount').value.trim();
      const name = document.getElementById('testName').value.trim() || '未知负责人';
      const platform = document.getElementById('testPlatform').value.trim() || '未知平台';
      const userName = document.getElementById('testUserName').value.trim() || '';
      
      if (!amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
        showMessage('请输入有效的成交金额', 'error');
        return;
      }
      
      const url = `/api/deals/add?zongjine=${amount}&fuzeren=${encodeURIComponent(name)}&laiyuanpingtai=${encodeURIComponent(platform)}${userName ? `&userName=${encodeURIComponent(userName)}` : ''}`;
      
      fetch(url)
        .then(response => response.json())
        .then(data => {
          if (data.success) {
            showMessage(`成交金额增加成功！当前总金额: ¥${data.amount.toLocaleString('zh-CN')}`);
            setApiResult('apiDealResult', data);
          } else {
            showMessage(data.message || '请求失败', 'error');
            setApiResult('apiDealResult', data);
          }
        })
        .catch(error => {
          console.error('测试API失败:', error);
          showMessage('测试API失败，请重试', 'error');
          setApiResult('apiDealResult', { success: false, message: error.message });
        });
    });
  }
  
  // 测试增加询盘按钮
  const testAddInquiryBtn = document.getElementById('testAddInquiryBtn');
  if (testAddInquiryBtn) {
    testAddInquiryBtn.addEventListener('click', function() {
      fetch('/api/inquiries/add')
        .then(response => response.json())
        .then(data => {
          if (data.success) {
            let message = `询盘数量增加成功！当前总数: ${data.count}`;
            if (data.musicToPlay) {
              message += `，将播放音效: ${data.musicToPlay.musicName}`;
            }
            showMessage(message);
            setApiResult('apiInquiryResult', data);
          } else {
            showMessage(data.message || '请求失败', 'error');
            setApiResult('apiInquiryResult', data);
          }
        })
        .catch(error => {
          console.error('测试增加询盘失败:', error);
          showMessage('测试增加询盘失败，请重试', 'error');
          setApiResult('apiInquiryResult', { success: false, message: error.message });
        });
    });
  }
  
  // 测试减少询盘按钮
  const testReduceInquiryBtn = document.getElementById('testReduceInquiryBtn');
  if (testReduceInquiryBtn) {
    testReduceInquiryBtn.addEventListener('click', function() {
      fetch('/api/inquiries/reduce')
        .then(response => response.json())
        .then(data => {
          if (data.success) {
            let message = `询盘数量减少成功！当前总数: ${data.count}`;
            if (data.musicToPlay) {
              message += `，将播放音效: ${data.musicToPlay.musicName}`;
            }
            showMessage(message);
            setApiResult('apiInquiryResult', data);
          } else {
            showMessage(data.message || '请求失败', 'error');
            setApiResult('apiInquiryResult', data);
          }
        })
        .catch(error => {
          console.error('测试减少询盘失败:', error);
          showMessage('测试减少询盘失败，请重试', 'error');
          setApiResult('apiInquiryResult', { success: false, message: error.message });
        });
    });
  }

  const getLatestInquiryBtn = document.getElementById('getLatestInquiryBtn');
  if (getLatestInquiryBtn) {
    getLatestInquiryBtn.addEventListener('click', function() {
      safeFetchJson('/api/inquiries/latest')
        .then(data => {
          setApiResult('apiInquiryResult', data);
          showMessage('请求成功');
        })
        .catch(error => {
          console.error('获取最近一次询盘失败:', error);
          setApiResult('apiInquiryResult', { success: false, message: error.message });
          showMessage(error.message || '请求失败', 'error');
        });
    });
  }

  const getLatestDealBtn = document.getElementById('getLatestDealBtn');
  if (getLatestDealBtn) {
    getLatestDealBtn.addEventListener('click', function() {
      safeFetchJson('/api/deals/latest')
        .then(data => {
          setApiResult('apiDealResult', data);
          showMessage('请求成功');
        })
        .catch(error => {
          console.error('获取最近一次成交失败:', error);
          setApiResult('apiDealResult', { success: false, message: error.message });
          showMessage(error.message || '请求失败', 'error');
        });
    });
  }

  const getDealLeaderboardBtn = document.getElementById('getDealLeaderboardBtn');
  if (getDealLeaderboardBtn) {
    getDealLeaderboardBtn.addEventListener('click', function() {
      safeFetchJson('/api/deals/leaderboard')
        .then(data => {
          setApiResult('apiDealResult', data);
          showMessage('请求成功');
        })
        .catch(error => {
          console.error('获取成交排行榜失败:', error);
          setApiResult('apiDealResult', { success: false, message: error.message });
          showMessage(error.message || '请求失败', 'error');
        });
    });
  }

  const getDealRecentBtn = document.getElementById('getDealRecentBtn');
  if (getDealRecentBtn) {
    getDealRecentBtn.addEventListener('click', function() {
      safeFetchJson('/api/deals/recent')
        .then(data => {
          setApiResult('apiDealResult', data);
          showMessage('请求成功');
        })
        .catch(error => {
          console.error('获取最近成交列表失败:', error);
          setApiResult('apiDealResult', { success: false, message: error.message });
          showMessage(error.message || '请求失败', 'error');
        });
    });
  }
  
  // 设置询盘数量按钮点击事件
  const setInquiryCountBtn = document.getElementById('setInquiryCountBtn');
  if (setInquiryCountBtn) {
    setInquiryCountBtn.addEventListener('click', function() {
      const count = document.getElementById('defaultInquiryCount').value.trim();
      
      if (count === '' || isNaN(parseInt(count)) || parseInt(count) < 0) {
        showMessage('请输入有效的询盘数量', 'error');
        return;
      }
      
      fetch('/api/inquiries/set', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ count: parseInt(count) })
      })
      .then(response => response.json())
      .then(data => {
        if (data.success) {
          showMessage(`询盘数量已设置为 ${data.count}`);
          setApiResult('apiInquiryResult', data);
        } else {
          showMessage(data.message || '设置失败', 'error');
          setApiResult('apiInquiryResult', data);
        }
      })
      .catch(error => {
        console.error('设置询盘数量失败:', error);
        showMessage('设置询盘数量失败，请重试', 'error');
        setApiResult('apiInquiryResult', { success: false, message: error.message });
      });
    });
  }
  
  // 设置成交金额按钮点击事件
  const setDealAmountBtn = document.getElementById('setDealAmountBtn');
  if (setDealAmountBtn) {
    setDealAmountBtn.addEventListener('click', function() {
      const amount = document.getElementById('defaultDealAmount').value.trim();
      
      if (amount === '' || isNaN(parseFloat(amount)) || parseFloat(amount) < 0) {
        showMessage('请输入有效的成交金额', 'error');
        return;
      }
      
      fetch('/api/deals/set', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ amount: parseFloat(amount) })
      })
      .then(response => response.json())
      .then(data => {
        if (data.success) {
          showMessage(`成交金额已设置为 ${data.amount}`);
          setApiResult('apiDealResult', data);
        } else {
          showMessage(data.message || '设置失败', 'error');
          setApiResult('apiDealResult', data);
        }
      })
      .catch(error => {
        console.error('设置成交金额失败:', error);
        showMessage('设置成交金额失败，请重试', 'error');
        setApiResult('apiDealResult', { success: false, message: error.message });
      });
    });
  }

  const getTargetsBtn = document.getElementById('getTargetsBtn');
  if (getTargetsBtn) {
    getTargetsBtn.addEventListener('click', function() {
      safeFetchJson('/api/targets')
        .then(data => {
          setApiResult('apiConfigResult', data);
          showMessage('请求成功');
        })
        .catch(error => {
          console.error('获取目标设置失败:', error);
          setApiResult('apiConfigResult', { success: false, message: error.message });
          showMessage(error.message || '请求失败', 'error');
        });
    });
  }

  const getPageSettingsBtn = document.getElementById('getPageSettingsBtn');
  if (getPageSettingsBtn) {
    getPageSettingsBtn.addEventListener('click', function() {
      safeFetchJson('/api/page-settings')
        .then(data => {
          setApiResult('apiConfigResult', data);
          showMessage('请求成功');
        })
        .catch(error => {
          console.error('获取首页设置失败:', error);
          setApiResult('apiConfigResult', { success: false, message: error.message });
          showMessage(error.message || '请求失败', 'error');
        });
    });
  }

  const apiTestTtsBtn = document.getElementById('apiTestTtsBtn');
  if (apiTestTtsBtn) {
    apiTestTtsBtn.addEventListener('click', function() {
      const input = document.getElementById('apiTtsText');
      const text = input ? String(input.value || '').trim() : '';
      if (!text) {
        showMessage('请输入测试文本', 'error');
        return;
      }

      apiTestTtsBtn.disabled = true;
      apiTestTtsBtn.textContent = '请求中...';

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
        .then(r => r.json())
        .then(data => {
          setApiResult('apiTtsResult', data);
          if (data && data.success && data.audioPath) {
            const wrap = document.getElementById('apiTtsAudioWrap');
            const audio = document.getElementById('apiTtsAudio');
            if (wrap && audio) {
              const source = audio.querySelector('source');
              const src = `${data.audioPath}?t=${Date.now()}`;
              if (source) source.src = src;
              audio.removeAttribute('src');
              audio.load();
              wrap.style.display = 'block';
            }
            showMessage('合成成功');
          } else {
            showMessage((data && data.message) ? data.message : '合成失败', 'error');
          }
        })
        .catch(error => {
          console.error('TTS 调试失败:', error);
          setApiResult('apiTtsResult', { success: false, message: error.message });
          showMessage('TTS 调试失败', 'error');
        })
        .finally(() => {
          apiTestTtsBtn.disabled = false;
          apiTestTtsBtn.textContent = '合成并返回音频';
        });
    });
  }
}

function initMusicConfigModals() {
  if (window.AdminModals && typeof window.AdminModals.initMusicConfigModals === 'function') {
    window.AdminModals.initMusicConfigModals();
    return;
  }

  console.warn('[initMusicConfigModals] AdminModals.initMusicConfigModals 未找到，跳过绑定');
}

/**
 * 加载当前成交金额
 */
function loadCurrentDealAmount() {
  const defaultDealAmount = document.getElementById('defaultDealAmount');
  if (defaultDealAmount) {
    fetch('/api/deals')
      .then(response => response.json())
      .then(data => {
        defaultDealAmount.value = data.dealAmount || 0;
      })
      .catch(error => {
        console.error('获取成交金额失败:', error);
      });
  }
}

/**
 * 加载当前询盘数量
 */
function loadCurrentInquiryCount() {
  const defaultInquiryCount = document.getElementById('defaultInquiryCount');
  if (defaultInquiryCount) {
    fetch('/api/inquiries')
      .then(response => response.json())
      .then(data => {
        defaultInquiryCount.value = data.inquiryCount || 0;
      })
      .catch(error => {
        console.error('获取询盘数量失败:', error);
      });
  }
}

/**
 * 初始化默认战歌管理功能
 */
function initDefaultBattleSong() {
  if (window.MusicPresenter && typeof window.MusicPresenter.initDefaultBattleSong === 'function') {
    window.MusicPresenter.initDefaultBattleSong();
    return;
  }

  console.warn('[initDefaultBattleSong] MusicPresenter.initDefaultBattleSong 未找到，跳过绑定');
}

/**
 * 初始化保存询盘音效配置事件
 */
function initInquiryMusicConfigEvents() {
  if (window.MusicPresenter && typeof window.MusicPresenter.initInquiryMusicConfigEvents === 'function') {
    window.MusicPresenter.initInquiryMusicConfigEvents();
    return;
  }

  console.warn('[initInquiryMusicConfigEvents] MusicPresenter.initInquiryMusicConfigEvents 未找到，跳过绑定');
}

/**
 * 初始化目标设置功能
 */
function initTargetSettings() {
  // 加载当前目标设置
  loadCurrentTargets();
  
  // 设置询盘目标
  document.getElementById('setTargetInquiryBtn').addEventListener('click', function() {
    const targetInput = document.getElementById('targetInquiryCount');
    const targetValue = parseInt(targetInput.value);
    
    if (isNaN(targetValue) || targetValue < 0) {
      showMessage('请输入有效的目标数值', 'error');
      return;
    }
    
    saveTargetSetting('inquiry', targetValue)
      .then(() => {
        showMessage('询盘目标设置成功');
        updateTargetPreview();
      })
      .catch(error => {
        console.error('设置询盘目标失败:', error);
        showMessage('设置询盘目标失败', 'error');
      });
  });
  
  // 设置成交目标
  document.getElementById('setTargetDealBtn').addEventListener('click', function() {
    const targetInput = document.getElementById('targetDealAmount');
    const targetValue = parseInt(targetInput.value);
    
    if (isNaN(targetValue) || targetValue < 0) {
      showMessage('请输入有效的目标金额', 'error');
      return;
    }
    
    saveTargetSetting('deal', targetValue)
      .then(() => {
        showMessage('成交目标设置成功');
        updateTargetPreview();
      })
      .catch(error => {
        console.error('设置成交目标失败:', error);
        showMessage('设置成交目标失败', 'error');
      });
  });
}

// 加载当前目标设置
async function loadCurrentTargets() {
  try {
    // 从服务器获取最新数据
    const response = await fetch('/api/targets');
    
    if (!response.ok) {
      throw new Error('服务器响应错误');
    }
    
    const data = await response.json();
    
    // 更新输入框值
    document.getElementById('targetInquiryCount').value = data.inquiryTarget || 0;
    document.getElementById('targetDealAmount').value = data.dealTarget || 0;
    
    // 更新本地存储
    localStorage.setItem('targetData', JSON.stringify({
      inquiryTarget: data.inquiryTarget,
      dealTarget: data.dealTarget,
      lastResetTime: data.lastResetTime
    }));
    
    // 更新预览显示
    updateTargetPreviewWithData(data);
  } catch (error) {
    console.error('从服务器加载目标数据失败:', error);
    // 从本地存储加载
    loadTargetsFromLocalStorage();
  }
}

// 从本地存储加载目标设置
function loadTargetsFromLocalStorage() {
  try {
    const savedData = localStorage.getItem('targetData');
    let targetData;
    
    if (savedData) {
      targetData = JSON.parse(savedData);
    } else {
      // 如果没有保存的数据，使用默认值
      targetData = {
        inquiryTarget: 0,
        dealTarget: 0,
        lastResetTime: new Date().toISOString()
      };
      // 保存默认值到本地存储
      localStorage.setItem('targetData', JSON.stringify(targetData));
    }
    
    // 更新输入框值
    document.getElementById('targetInquiryCount').value = targetData.inquiryTarget || 0;
    document.getElementById('targetDealAmount').value = targetData.dealTarget || 0;
    
    // 更新预览显示
    updateTargetPreviewWithData(targetData);
  } catch (error) {
    console.error('从本地存储加载目标数据失败:', error);
    // 出错时使用默认值
    const defaultData = {
      inquiryTarget: 0,
      dealTarget: 0,
      lastResetTime: new Date().toISOString()
    };
    
    document.getElementById('targetInquiryCount').value = defaultData.inquiryTarget;
    document.getElementById('targetDealAmount').value = defaultData.dealTarget;
    
    updateTargetPreviewWithData(defaultData);
  }
}

// 保存目标设置
async function saveTargetSetting(type, value) {
  try {
    // 保存到本地存储
    saveTargetToLocalStorage(type, value);
    
    // 构建请求数据
    const requestData = {};
    
    switch (type) {
      case 'inquiry':
        requestData.inquiryTarget = value;
        break;
      case 'deal':
        requestData.dealTarget = value;
        break;
    }
    
    // 发送到服务器
    const response = await fetch('/api/targets', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestData)
    });
    
    if (!response.ok) {
      throw new Error('服务器响应错误');
    }
    
    const result = await response.json();
    
    if (!result.success) {
      throw new Error(result.message || '保存失败');
    }
    
    // 显示保存成功消息
    showMessage(`${type === 'inquiry' ? '询盘目标' : '成交目标'}设置成功`);
    
    // 更新预览
    updateTargetPreview();
    
    return true;
  } catch (error) {
    console.error('保存目标设置失败:', error);
    showMessage('保存目标设置失败: ' + error.message, 'error');
    return false;
  }
}

// 保存目标设置到本地存储
function saveTargetToLocalStorage(type, value) {
  try {
    // 先获取现有数据
    let savedData = localStorage.getItem('targetData');
    let targetData = savedData ? JSON.parse(savedData) : {
      inquiryTarget: 0,
      dealTarget: 0,
      lastResetTime: new Date().toISOString()
    };
    
    // 更新相应字段
    switch (type) {
      case 'inquiry':
        targetData.inquiryTarget = value;
        break;
      case 'deal':
        targetData.dealTarget = value;
        break;
    }
    
    // 保存回本地存储
    localStorage.setItem('targetData', JSON.stringify(targetData));
  } catch (error) {
    console.error('保存目标数据到本地存储失败:', error);
  }
}

// 更新目标预览显示
function updateTargetPreview() {
  try {
    // 从本地存储获取最新数据
    const savedData = localStorage.getItem('targetData');
    if (savedData) {
      const parsedData = JSON.parse(savedData);
      updateTargetPreviewWithData(parsedData);
    } else {
      // 使用表单中的当前值
      const formData = {
        inquiryTarget: parseInt(document.getElementById('targetInquiryCount').value) || 0,
        dealTarget: parseInt(document.getElementById('targetDealAmount').value) || 0,
        resetPeriod: document.getElementById('targetResetPeriod').value
      };
      
      updateTargetPreviewWithData(formData);
    }
  } catch (error) {
    console.error('更新目标预览失败:', error);
  }
}

// 使用指定数据更新目标预览显示
function updateTargetPreviewWithData(data) {
  // 更新询盘目标显示
  const currentTargetInquiry = document.getElementById('currentTargetInquiry');
  currentTargetInquiry.textContent = data.inquiryTarget > 0 ? 
    data.inquiryTarget.toLocaleString() : 
    '尚未设置';
  
  // 更新成交目标显示
  const currentTargetDeal = document.getElementById('currentTargetDeal');
  currentTargetDeal.textContent = data.dealTarget > 0 ? 
    `¥${data.dealTarget.toLocaleString()}` : 
    '尚未设置';
  
  // 重置周期显示为手动重置
  const currentTargetReset = document.getElementById('currentTargetReset');
  if (currentTargetReset) {
    currentTargetReset.textContent = '手动重置';
  }
  
  // 下次重置时间显示为手动重置
  const nextResetTimeElement = document.getElementById('nextResetTime');
  if (nextResetTimeElement) {
    nextResetTimeElement.textContent = '手动重置';
  }
}

/**
 * 初始化页面设置相关功能
 */
function initPageSettings() {
  // 加载当前页面设置
  loadPageSettings();

  // 保存页面设置按钮点击事件
  const saveSettingsBtn = document.getElementById('saveSettingsBtn');
  if (saveSettingsBtn) {
    saveSettingsBtn.addEventListener('click', function() {
      savePageSettings();
    });
  }
}

/**
 * 加载页面设置
 */
function loadPageSettings() {
  try {
    // 从服务器加载设置
    fetch('/api/page-settings')
      .then(response => response.json())
      .then(data => {
        if (data.success) {
          const settings = data.settings;
          
          // 设置各输入框的值
          document.getElementById('mainTitle').value = settings.mainTitle || '徐州巴布';
          document.getElementById('subTitle').value = settings.subTitle || '缜锦木断，水滴石穿';
          document.getElementById('inquiryTitle').value = settings.inquiryTitle || '询盘总数';
          document.getElementById('dealTitle').value = settings.dealTitle || '成交金额';
          document.getElementById('progressTitle').value = settings.progressTitle || '目标进度';
          document.getElementById('teamTitle').value = settings.teamTitle || '团队成员';
          document.getElementById('activityTitle').value = settings.activityTitle || '最近动态';
        } else {
          console.error('获取页面设置失败:', data.message);
          showMessage('获取页面设置失败', 'error');
        }
      })
      .catch(error => {
        console.error('加载页面设置失败:', error);
        showMessage('加载页面设置失败', 'error');
      });
  } catch (error) {
    console.error('加载页面设置失败:', error);
    showMessage('加载页面设置失败', 'error');
  }
}

/**
 * 保存页面设置
 */
function savePageSettings() {
  try {
    // 获取输入框的值
    const settings = {
      mainTitle: document.getElementById('mainTitle').value.trim() || '徐州巴布',
      subTitle: document.getElementById('subTitle').value.trim() || '缜锦木断，水滴石穿',
      inquiryTitle: document.getElementById('inquiryTitle').value.trim() || '询盘总数',
      dealTitle: document.getElementById('dealTitle').value.trim() || '成交金额',
      progressTitle: document.getElementById('progressTitle').value.trim() || '目标进度',
      teamTitle: document.getElementById('teamTitle').value.trim() || '团队成员',
      activityTitle: document.getElementById('activityTitle').value.trim() || '最近动态'
    };
    
    // 发送到服务器保存
    fetch('/api/page-settings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ settings: settings })
    })
    .then(response => response.json())
    .then(data => {
      if (data.success) {
        showMessage('页面设置保存成功');
        
        // 同时保存到本地存储作为备份
        localStorage.setItem('pageSettings', JSON.stringify(settings));
      } else {
        console.error('保存页面设置失败:', data.message);
        showMessage('保存页面设置失败: ' + data.message, 'error');
      }
    })
    .catch(error => {
      console.error('保存页面设置失败:', error);
      showMessage('保存页面设置失败', 'error');
    });
  } catch (error) {
    console.error('保存页面设置失败:', error);
    showMessage('保存页面设置失败', 'error');
  }
}

/**
 * 页面加载完成后执行的初始化
 */
function runAdminBoot() {
  if (window.__adminBootInited) {
    return;
  }
  window.__adminBootInited = true;

  function callOptional(fn) {
    if (typeof fn === 'function') {
      fn();
    }
  }

  // 初始化选项卡
  initTabs();

  initCollapsibleSections();
  initMusicSubTabs();
  
  // 初始化用户事件
  callOptional(window.initUserEvents);
  
  // 初始化LRC编辑器
  callOptional(window.initLrcEditor);
  
  // 初始化编辑音乐模态框
  callOptional(window.initEditMusicModal);
  
  // 初始化用户编辑模态框
  callOptional(window.initEditUserModal);
  
  // 初始化音乐上传事件
  callOptional(window.initMusicUploadEvents);
  
  // 初始化修改密码模态框
  callOptional(window.initChangePasswordModal);
  
  // 初始化庆祝语管理
  callOptional(window.initCelebrationMessages);
  
  // 初始化保存询盘音效配置事件
  initInquiryMusicConfigEvents();
  
  // 初始化API测试事件
  initApiTestEvents();
  
  // 初始化默认战歌管理
  initDefaultBattleSong();

  // 初始化播放配置模态框（默认战歌/询盘音效/阿里云TTS）
  initMusicConfigModals();
  
  // 加载API URL信息
  callOptional(window.loadApiUrls);
  
  // 加载当前询盘数量
  loadCurrentInquiryCount();
  
  // 加载当前成交金额
  loadCurrentDealAmount();
  
  // 加载用户列表
  callOptional(window.loadUsers);
  
  // 加载音乐列表
  callOptional(window.loadMusic);
  
  // 初始化目标设置功能
  initTargetSettings();
  
  // 初始化页面设置功能
  initPageSettings();

  callOptional(window.initAudioPlaybackConfig);
}

document.addEventListener('DOMContentLoaded', function() {
  runAdminBoot();
}); 