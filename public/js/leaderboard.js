// 全局变量 - 存储数据
let leaderboardData = [];
let activityData = [];
let lastUpdateTime = null;
let pageSettings = {}; // 存储页面设置

// 实时时间更新
function updateDateTime() {
  if (typeof document !== 'undefined' && document.hidden) return;
  const dateTimeElement = document.getElementById('dateTimeDisplay');
  if (!dateTimeElement) return;
  
  const now = new Date();
  
  // 获取日期
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const date = now.getDate();
  
  // 获取星期
  const weekDays = ['日', '一', '二', '三', '四', '五', '六'];
  const weekDay = weekDays[now.getDay()];
  
  // 获取时间
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  
  // 格式化为 YYYY年MM月DD日 周x HH:MM:SS
  const formattedDateTime = `${year}年${month}月${date}日 周${weekDay} ${hours}:${minutes}:${seconds}`;
  
  // 更新显示并添加动画效果
  if (dateTimeElement.textContent !== formattedDateTime) {
    dateTimeElement.textContent = formattedDateTime;
    
    // 添加闪烁效果当秒数变化时
    if (seconds === '00') {
      flashElement(dateTimeElement);
    }
  }
}

// 闪烁元素的动画效果
function flashElement(element) {
  element.classList.add('pulse-animation');
  setTimeout(() => {
    element.classList.remove('pulse-animation');
  }, 2000);
}

// 获取汇率信息 - 已禁用
async function fetchExchangeRate() {
  // 汇率显示已禁用
  return;
}

// 获取并更新成交排行榜
async function updateLeaderboard() {
  // 不再更新排行榜，因为相关DOM元素已经移除
  console.log("排行榜更新功能已禁用");
  return; // 直接返回，不再处理
}

// 显示更新通知
function showUpdateNotification(message) {
  // 如果已有通知，先移除
  const existingNotification = document.querySelector('.update-notification');
  if (existingNotification) {
    existingNotification.remove();
  }
  
  // 创建新通知
  const notification = document.createElement('div');
  notification.className = 'update-notification';
  notification.textContent = message;
  
  // 添加到页面
  document.body.appendChild(notification);
  
  // 淡入动画
  setTimeout(() => {
    notification.classList.add('show');
  }, 10);
  
  // 3秒后淡出
  setTimeout(() => {
    notification.classList.remove('show');
    setTimeout(() => {
      notification.remove();
    }, 500);
  }, 3000);
}

// 渲染排行榜
function renderLeaderboard(leaderboardData) {
  // 不再尝试渲染排行榜，因为相关DOM元素已经移除
  console.log("排行榜功能已禁用");
  return; // 直接返回，不再处理
}

// 获取最近成交动态
async function updateRecentActivity() {
  if (typeof document !== 'undefined' && document.hidden) return;
  try {
    // 获取数据
    const response = await fetch('/api/deals/recent');
    const data = await response.json();
    
    if (!data.success) {
      console.error('获取最近成交失败:', data.message);
      return;
    }
    
    const deals = data.deals || [];
    const sig = deals.length ? `${deals[0].timestamp || ''}|${deals.length}` : 'empty';
    if (window.__recentActivitySig && window.__recentActivitySig === sig) {
      return;
    }
    window.__recentActivitySig = sig;

    // 存储数据
    activityData = deals;
    
    // 保存到本地存储，用于页面刷新后快速显示
    localStorage.setItem('activityData', JSON.stringify(activityData));
    localStorage.setItem('activityUpdateTime', new Date().toString());
    
    // 更新最近成交
    renderRecentActivity(activityData, true);
  } catch (error) {
    console.error('获取最近成交数据失败:', error);
    
    // 如果API失败，尝试使用缓存数据
    const cachedData = localStorage.getItem('activityData');
    if (cachedData) {
      activityData = JSON.parse(cachedData);
      renderRecentActivity(activityData, false);
    } else {
      // 如果没有缓存数据，使用模拟数据
      generateMockActivity();
    }
  }
}

// 渲染最近动态
function renderRecentActivity(activityData, animate = false) {
  const activityList = document.getElementById('activityList');
  
  if (!activityList || !activityData) {
    console.warn('活动列表元素不存在或数据为空');
    return;
  }
  
  // 清空列表
  activityList.innerHTML = '';
  
  // 渲染活动
  activityData.forEach((activity, index) => {
    const activityItem = createActivityItem(activity);
    
    if (animate) {
      // 添加动画效果
      activityItem.style.opacity = '0';
      activityItem.style.transform = 'translateX(20px)';
      activityItem.classList.add('new-activity'); // 新消息高亮
    }
    
    activityList.appendChild(activityItem);
    
    if (animate) {
      // 延迟显示，创建级联效果
      setTimeout(() => {
        activityItem.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
        activityItem.style.opacity = '1';
        activityItem.style.transform = 'translateX(0)';
      }, index * 50);
    }
  });
  
  // 设置自动滚动
  setupActivityAutoScroll();
}

// 为最近动态列表添加自动滚动功能 - 已禁用
function setupActivityAutoScroll() {
  // 自动滚动功能已禁用，因为它不稳定
  console.log("最近动态自动滚动功能已禁用");
  return;
  
  // 以下是原来的代码，现已禁用
  /*
  const activityList = document.getElementById('activityList');
  if (!activityList) return;
  
  // 克隆所有活动项目以允许无缝滚动
  if (activityList.children.length > 0) {
    const itemHeight = activityList.children[0].offsetHeight;
    const containerHeight = activityList.offsetHeight;
    
    // 检查是否需要滚动 - 内容是否多于容器高度
    if (activityList.scrollHeight > containerHeight) {
      let currentPosition = 0;
      const totalItems = activityList.children.length;
      
      // 创建滚动功能
      const scrollDown = () => {
        currentPosition += 1;
        
        // 滚动到指定位置
        activityList.scrollTop = currentPosition;
        
        // 当滚动到底部时，回到顶部并继续
        if (currentPosition >= activityList.scrollHeight - containerHeight) {
          // 停顿一会，然后回到顶部
          setTimeout(() => {
            currentPosition = 0;
            activityList.scrollTop = 0;
          }, 2000);
        }
      };
      
      // 滚动速度 - 每100毫秒滚动1像素
      const scrollInterval = setInterval(scrollDown, 100);
      
      // 存储interval id便于清除
      activityList.setAttribute('data-scroll-interval', scrollInterval);
    }
  }
  */
}

// 创建活动项目元素
function createActivityItem(activity) {
  const activityItem = document.createElement('div');
  activityItem.className = 'activity-item';
  
  // 格式化时间
  const time = formatTime(new Date(activity.timestamp));
  
  // 确定图标
  let icon = '💰';
  if (activity.type === 'inquiry') {
    icon = activity.action === 'add' ? '📈' : '📉';
  }
  
  // 创建时间元素
  const timeElement = document.createElement('div');
  timeElement.className = 'activity-time';
  timeElement.textContent = time;
  
  // 创建图标元素
  const iconElement = document.createElement('div');
  iconElement.className = 'activity-icon';
  iconElement.textContent = icon;
  
  // 创建内容元素
  const contentElement = document.createElement('div');
  contentElement.className = 'activity-content';
  
  // 创建金额元素
  const amountElement = document.createElement('div');
  amountElement.className = 'activity-amount';
  
  // 根据活动类型设置内容
  if (activity.type === 'deal') {
    // 成交事件
    contentElement.textContent = `${activity.person || '未知用户'} 在 ${activity.platform || '未知平台'} 成交`;
    amountElement.textContent = `¥${formatNumber(activity.amount)}`;
    amountElement.style.color = '#c1121f'; // 成交金额使用红色
  } else if (activity.type === 'inquiry') {
    // 询盘事件
    contentElement.textContent = activity.action === 'add' ? '询盘数量+1' : '询盘数量-1';
    amountElement.textContent = `${activity.count}`;
    amountElement.style.color = activity.action === 'add' ? '#4caf50' : '#ff9800'; // 增加使用绿色，减少使用橙色
  }
  
  // 组装活动项
  activityItem.appendChild(timeElement);
  activityItem.appendChild(iconElement);
  activityItem.appendChild(contentElement);
  activityItem.appendChild(amountElement);
  
  return activityItem;
}

// 生成模拟排行榜数据
function generateMockLeaderboard() {
  // 不再生成模拟数据，因为排行榜已被移除
  console.log("排行榜模拟数据功能已禁用");
  return; // 直接返回，不再处理
}

// 生成模拟活动数据
function generateMockActivity() {
  // 从缓存中加载数据
  const cachedData = localStorage.getItem('activityData');
  if (cachedData) {
    activityData = JSON.parse(cachedData);
    renderRecentActivity(activityData);
    return;
  }
  
  const activityList = document.getElementById('activityList');
  
  if (!activityList) {
    return;
  }
  
  // 模拟数据
  const mockActivities = [
    { type: 'deal', person: 'Jolin', platform: '阿里巴巴', amount: 56789, timestamp: new Date(Date.now() - 5 * 60000).toISOString() },
    { type: 'inquiry', timestamp: new Date(Date.now() - 15 * 60000).toISOString() },
    { type: 'deal', person: 'Linda', platform: '速卖通', amount: 34567, timestamp: new Date(Date.now() - 35 * 60000).toISOString() },
    { type: 'inquiry', timestamp: new Date(Date.now() - 55 * 60000).toISOString() },
    { type: 'deal', person: 'Nancy', platform: '谷歌', amount: 78901, timestamp: new Date(Date.now() - 85 * 60000).toISOString() },
    { type: 'inquiry', timestamp: new Date(Date.now() - 95 * 60000).toISOString() },
    { type: 'deal', person: 'Eula', platform: '亚马逊', amount: 12345, timestamp: new Date(Date.now() - 125 * 60000).toISOString() },
    { type: 'inquiry', timestamp: new Date(Date.now() - 145 * 60000).toISOString() }
  ];
  
  // 存储活动数据
  activityData = mockActivities;
  
  // 清空列表
  activityList.innerHTML = '';
  
  // 渲染活动并添加动画
  mockActivities.forEach((activity, index) => {
    const activityItem = createActivityItem(activity);
    
    // 添加动画效果
    activityItem.style.opacity = '0';
    activityItem.style.transform = 'translateX(20px)';
    
    activityList.appendChild(activityItem);
    
    // 延迟显示，创建级联效果
    setTimeout(() => {
      activityItem.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
      activityItem.style.opacity = '1';
      activityItem.style.transform = 'translateX(0)';
    }, index * 50);
  });
}

// 初始化数据
function initLeaderboardData() {
  // 不再初始化排行榜相关数据
  const cachedActivityData = localStorage.getItem('activityData');
  
  // 只处理最近动态数据
  if (cachedActivityData) {
    activityData = JSON.parse(cachedActivityData);
    renderRecentActivity(activityData);
  } else {
    generateMockActivity();
  }
  
  // 只获取最近动态数据
  updateRecentActivity();
  
  // 加载团队成员照片
  loadTeamMembers();
}

// 工具函数：格式化数字
function formatNumber(num) {
  if (num >= 10000) {
    return (num / 10000).toFixed(1) + 'W';
  } else if (num >= 1000) {
    return (num / 1000).toFixed(1) + 'K';
  }
  return new Intl.NumberFormat('zh-CN').format(num);
}

// 工具函数：格式化时间为 HH:MM
function formatTime(date) {
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

// 工具函数：从名字中获取缩写
function getInitials(name) {
  if (!name) return '';
  
  // 尝试提取中文名字第一个字或英文名字首字母
  if (/[\u4e00-\u9fa5]/.test(name)) {
    // 是中文名
    return name.charAt(0);
  } else {
    // 是英文名或其他
    return name.charAt(0).toUpperCase();
  }
}

// 工具函数：根据名字生成颜色
function getColorFromName(name) {
  if (!name) return '#1976D2';
  
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  
  const colors = [
    '#1976D2', '#D32F2F', '#388E3C', '#7B1FA2', 
    '#FBC02D', '#E64A19', '#5D4037', '#00796B',
    '#303F9F', '#C2185B', '#689F38', '#512DA8',
    '#FFA000', '#F57C00', '#616161', '#455A64'
  ];
  
  return colors[Math.abs(hash) % colors.length];
}

// 加载页面设置
let __lastPageSettingsFetchAt = 0;

function loadPageSettings(force) {
  try {
    const now = Date.now();
    if (!force && __lastPageSettingsFetchAt && (now - __lastPageSettingsFetchAt) < 60000) {
      return;
    }
    __lastPageSettingsFetchAt = now;

    // 从服务器加载设置
    fetch('/api/page-settings')
      .then(response => response.json())
      .then(data => {
        if (data.success) {
          pageSettings = data.settings;
          
          // 应用页面设置
          applyPageSettings();
          
          // 同时保存到本地存储作为备份
          localStorage.setItem('pageSettings', JSON.stringify(data.settings));
        } else {
          console.error('获取页面设置失败:', data.message);
          // 失败时使用本地存储的备份
          const fallbackSettings = JSON.parse(localStorage.getItem('pageSettings')) || {};
          pageSettings = fallbackSettings;
          applyPageSettings();
        }
      })
      .catch(error => {
        console.error('加载页面设置失败:', error);
        // 网络错误时使用本地存储的备份
        const fallbackSettings = JSON.parse(localStorage.getItem('pageSettings')) || {};
        pageSettings = fallbackSettings;
        applyPageSettings();
      });
  } catch (error) {
    console.error('加载页面设置失败:', error);
  }
}

// 应用页面设置
function applyPageSettings() {
  // 设置页面主标题和副标题
  const mainTitleElement = document.querySelector('.main-title');
  if (mainTitleElement && pageSettings.mainTitle) {
    mainTitleElement.textContent = pageSettings.mainTitle;
  }
  
  const subTitleElement = document.querySelector('.sub-title');
  if (subTitleElement && pageSettings.subTitle) {
    subTitleElement.textContent = pageSettings.subTitle;
  }
  
  // 设置左侧各标题
  const inquiryTitleElement = document.querySelector('.stats-card:nth-child(1) h3');
  if (inquiryTitleElement && pageSettings.inquiryTitle) {
    inquiryTitleElement.textContent = pageSettings.inquiryTitle;
  }
  
  const dealTitleElement = document.querySelector('.stats-card:nth-child(2) h3');
  if (dealTitleElement && pageSettings.dealTitle) {
    dealTitleElement.textContent = pageSettings.dealTitle;
  }
  
  // 设置目标进度标题
  const progressLabelElements = document.querySelectorAll('.progress-label');
  if (progressLabelElements.length > 0 && pageSettings.progressTitle) {
    progressLabelElements.forEach(element => {
      element.textContent = pageSettings.progressTitle;
    });
  }
  
  // 设置团队成员标题
  const teamTitleElement = document.querySelector('.team-members h3');
  if (teamTitleElement && pageSettings.teamTitle) {
    teamTitleElement.textContent = pageSettings.teamTitle;
  }
  
  // 设置最近动态标题
  const activityTitleElement = document.querySelector('.recent-activity-section h3');
  if (activityTitleElement && pageSettings.activityTitle) {
    activityTitleElement.textContent = pageSettings.activityTitle;
  }
}

// 页面加载完成后执行
document.addEventListener('DOMContentLoaded', function() {
  // 加载页面设置
  loadPageSettings(false);
  
  // 立即更新一次时间
  updateDateTime();
  
  // 设置定时更新时间
  setInterval(updateDateTime, 1000);
  
  // 加载团队成员
  loadTeamMembers();
  
  // 汇率显示已禁用
  // fetchExchangeRate();
  // setInterval(fetchExchangeRate, 3600000); // 每小时更新一次汇率
  
  // 初始化数据
  initLeaderboardData();
  
  // 平台显示控制已移动到platform-targets.js中的PlatformTargetsManager统一处理
  // 不再在这里重复初始化平台显示控制
  
  // 设置定时刷新最近动态
  setInterval(updateRecentActivity, 30000); // 每30秒刷新一次
  
  // 添加窗口焦点事件，当用户回到页面时刷新数据
  window.addEventListener('focus', function() {
    updateRecentActivity();
    // 重新加载页面设置，以应用可能的更改
    loadPageSettings(true);
  });
  
  // 添加CSS样式
  addDynamicStyles();
});

// 加载团队成员照片
async function loadTeamMembers() {
  try {
    // 从API获取用户数据
    const response = await fetch('/api/users');
    const data = await response.json();
    
    if (!data.success || !data.users || !Array.isArray(data.users)) {
      console.error('获取用户数据失败:', data.message || '未知错误');
      return;
    }
    
    const teamPhotosElement = document.getElementById('teamPhotos');
    
    if (!teamPhotosElement) {
      console.warn('团队照片容器不存在');
      return;
    }
    
    // 清空容器
    teamPhotosElement.innerHTML = '';
    
    // 过滤有照片的用户
    const usersWithPhotos = data.users.filter(user => user.photoUrl || user.fullPhotoUrl);
    
    if (usersWithPhotos.length === 0) {
      teamPhotosElement.innerHTML = '<div class="no-photos-message">暂无团队成员照片，请在管理后台上传</div>';
      return;
    }
    
    // 创建最多6个成员元素，以便形成3x2的网格布局
    const maxMembersToShow = Math.min(6, usersWithPhotos.length);
    
    // 为每个用户创建照片元素
    for (let i = 0; i < maxMembersToShow; i++) {
      const user = usersWithPhotos[i];
      
      // 优先使用半身照，如果没有则使用全身照
      const photoUrl = user.photoUrl || user.fullPhotoUrl;
      if (!photoUrl) continue;
      
      // 找到当前用户在原始排序用户列表中的位置
      const originalIndex = data.users.findIndex(u => u.id === user.id);
      const isFirstPlace = originalIndex === 0;
      
      const memberElement = document.createElement('div');
      memberElement.className = 'team-member';
      if (isFirstPlace) {
        memberElement.classList.add('mvp-member');
      }
      
      const photoContainer = document.createElement('div');
      photoContainer.className = 'team-photo';
      
      // 为第一名添加MVP皇冠
      if (isFirstPlace) {
        const crownElement = document.createElement('div');
        crownElement.className = 'team-mvp-crown';
        crownElement.innerHTML = `
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M5 16C5 16 8 13 12 13C16 13 19 16 19 16L17 20H7L5 16Z" fill="#FFD700" stroke="#B8860B" stroke-width="1"/>
            <circle cx="7" cy="11" r="2" fill="#FFD700"/>
            <circle cx="12" cy="8" r="2.5" fill="#FFD700"/>
            <circle cx="17" cy="11" r="2" fill="#FFD700"/>
            <path d="M7 18H17" stroke="#B8860B" stroke-width="1.5" stroke-linecap="round"/>
          </svg>
          <span class="team-mvp-text">MVP</span>
        `;
        photoContainer.appendChild(crownElement);
      }
      
      const photoElement = document.createElement('img');
      photoElement.src = photoUrl;
      photoElement.alt = user.name || '团队成员';
      photoElement.setAttribute('data-user-id', user.id);
      
      photoContainer.appendChild(photoElement);
      
      const nameElement = document.createElement('div');
      nameElement.className = 'team-name';
      nameElement.textContent = user.name || '未命名';
      
      // 简化职位显示
      const positionElement = document.createElement('div');
      positionElement.className = 'team-position';
      
      // 不需要在JS中截断职位，CSS已经处理了
      positionElement.textContent = user.position || '团队成员';
      
      memberElement.appendChild(photoContainer);
      memberElement.appendChild(nameElement);
      memberElement.appendChild(positionElement);
      
      // 添加到容器
      teamPhotosElement.appendChild(memberElement);
    }
    
    // 如果成员数量不足6个，添加占位元素保持布局
    for (let i = maxMembersToShow; i < 6; i++) {
      const placeholderElement = document.createElement('div');
      placeholderElement.className = 'team-member placeholder';
      teamPhotosElement.appendChild(placeholderElement);
    }
    
  } catch (error) {
    console.error('加载团队成员照片失败:', error);
    
    // 显示错误信息
    const teamPhotosElement = document.getElementById('teamPhotos');
    if (teamPhotosElement) {
      teamPhotosElement.innerHTML = '<div class="error-message">加载团队成员照片失败，请刷新页面重试</div>';
    }
  }
}

// 为团队照片区域添加自动滚动效果
function setupTeamPhotosAutoScroll() {
  const teamPhotosElement = document.getElementById('teamPhotos');
  if (!teamPhotosElement) return;
  
  // 检查内容是否需要滚动
  if (teamPhotosElement.scrollHeight > teamPhotosElement.clientHeight) {
    let scrollPosition = 0;
    const maxScrollPosition = teamPhotosElement.scrollHeight - teamPhotosElement.clientHeight;
    
    // 每30秒完成一次滚动循环
    setInterval(() => {
      // 缓慢滚动到新位置
      scrollPosition += 1;
      
      // 重置滚动位置当达到最大值
      if (scrollPosition > maxScrollPosition) {
        // 平滑回到顶部
        scrollPosition = 0;
        teamPhotosElement.scrollTo({
          top: 0,
          behavior: 'smooth'
        });
      } else {
        // 平滑滚动到下一个位置
        teamPhotosElement.scrollTo({
          top: scrollPosition,
          behavior: 'smooth'
        });
      }
    }, 100); // 每100毫秒滚动一点
  }
}

// 添加额外的动态样式
function addDynamicStyles() {
  const style = document.createElement('style');
  style.textContent = `
    .update-notification {
      position: fixed;
      top: 20px;
      right: 20px;
      background-color: var(--primary-color);
      color: white;
      padding: 10px 20px;
      border-radius: 4px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.2);
      z-index: 1000;
      opacity: 0;
      transform: translateY(-20px);
      transition: opacity 0.3s, transform 0.3s;
    }
    
    .update-notification.show {
      opacity: 1;
      transform: translateY(0);
    }
    
    .avatar-transition {
      transition: opacity 0.3s ease;
    }
    
    @keyframes celebrate {
      0% { transform: scale(1); }
      10% { transform: scale(1.1); }
      20% { transform: scale(1); }
      30% { transform: scale(1.05); }
      40% { transform: scale(1); }
      100% { transform: scale(1); }
    }
    
    .celebrate {
      animation: celebrate 1s ease;
    }
  `;
  document.head.appendChild(style);
} 