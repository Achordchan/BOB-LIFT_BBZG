// 平台目标管理系统
class PlatformTargetsManager {
  constructor() {
    this.currentView = 'activity'; // 'activity' 或 'platforms'
    this.switchInterval = null;
    this.switchDelay = 8000; // 8秒切换一次
    this.platformData = [];
    this.lastPlatformFetchAt = 0;
    
    this.initElements();
    this.checkDisplaySettings(); // 改为先检查显示设置
    this.loadPlatformData();
  }
  
  initElements() {
    this.sectionTitle = document.getElementById('sectionTitle');
    this.activityList = document.getElementById('activityList');
    this.platformTargets = document.getElementById('platformTargets');
    this.activityDot = document.getElementById('activityDot');
    this.platformDot = document.getElementById('platformDot');
  }
  
  // 检查显示设置
  async checkDisplaySettings() {
    try {
      const response = await fetch('/api/platform-display-settings');
      const data = await response.json();
      
      if (data.success && data.settings.showPlatformTargets) {
        // 只有当后台设置为显示平台目标时，才启动自动切换
        this.startAutoSwitch();
      } else {
        // 如果关闭了平台目标显示，确保显示最近动态
        this.showRecentActivity();
      }
    } catch (error) {
      console.error('获取平台显示设置失败:', error);
      // 出错时默认显示最近动态，不启动轮播
      this.showRecentActivity();
    }
    
    // 启动定期检查设置更新
    this.startSettingsMonitor();
  }
  
  // 启动设置监控
  startSettingsMonitor() {
    // 每5秒检查一次设置更新
    setInterval(async () => {
      if (typeof document !== 'undefined' && document.hidden) return;
      try {
        const response = await fetch('/api/platform-display-settings');
        const data = await response.json();
        
        if (data.success) {
          const shouldShow = data.settings.showPlatformTargets;
          const isCurrentlyActive = this.switchInterval !== null;
          
          if (shouldShow && !isCurrentlyActive) {
            // 设置改为显示，但当前没有轮播，启动轮播
            this.startAutoSwitch();
          } else if (!shouldShow && isCurrentlyActive) {
            // 设置改为不显示，但当前在轮播，停止轮播并显示最近动态
            this.stopAutoSwitch();
            this.showRecentActivity();
          }
        }
      } catch (error) {
        console.error('检查平台显示设置失败:', error);
      }
    }, 60000);
  }
  
  // 开始自动切换
  startAutoSwitch() {
    // 先清除可能存在的定时器
    this.stopAutoSwitch();
    
    this.switchInterval = setInterval(() => {
      this.switchView();
    }, this.switchDelay);
  }
  
  // 停止自动切换
  stopAutoSwitch() {
    if (this.switchInterval) {
      clearInterval(this.switchInterval);
      this.switchInterval = null;
    }
  }
  
  // 切换视图
  switchView() {
    if (this.currentView === 'activity') {
      this.showPlatformTargets();
    } else {
      this.showRecentActivity();
    }
  }
  
  // 显示最近动态
  showRecentActivity() {
    this.currentView = 'activity';
    this.sectionTitle.textContent = '最近动态';
    this.activityList.style.display = 'flex';
    this.platformTargets.style.display = 'none';
    this.activityDot.classList.add('active');
    this.platformDot.classList.remove('active');
  }
  
  // 显示平台目标
  showPlatformTargets() {
    this.currentView = 'platforms';
    this.sectionTitle.textContent = '平台目标';
    this.activityList.style.display = 'none';
    this.platformTargets.style.display = 'flex';
    this.activityDot.classList.remove('active');
    this.platformDot.classList.add('active');
    
    // 刷新平台数据
    this.loadPlatformData();
  }
  
  // 加载平台数据
  async loadPlatformData() {
    const now = Date.now();
    if (this.lastPlatformFetchAt && now - this.lastPlatformFetchAt < 30000) {
      this.renderPlatformTargets();
      return;
    }
    try {
      const response = await fetch('/api/platforms/targets');
      if (response.ok) {
        const data = await response.json();
        this.platformData = data.platforms || [];
        this.lastPlatformFetchAt = Date.now();
        this.renderPlatformTargets();
      } else {
        console.warn('获取平台数据失败，使用模拟数据');
        this.loadMockData();
      }
    } catch (error) {
      console.error('加载平台数据时出错:', error);
      this.loadMockData();
    }
  }
  
  // 加载模拟数据（开发阶段使用）
  loadMockData() {
    this.platformData = [
      {
        name: '阿里巴巴',
        target: 8000000,
        current: 4500000,
        percentage: 56
      },
      {
        name: '独立站',
        target: 6000000,
        current: 3200000,
        percentage: 53
      },
      {
        name: '亚马逊',
        target: 5000000,
        current: 2800000,
        percentage: 56
      },
      {
        name: '1688',
        target: 3000000,
        current: 1156549,
        percentage: 39
      },
      {
        name: '其他平台',
        target: 2000000,
        current: 800000,
        percentage: 40
      }
    ];
    this.renderPlatformTargets();
  }
  
  // 渲染平台目标
  renderPlatformTargets() {
    if (!this.platformTargets) return;
    
    const platformCount = this.platformData.length;
    // 根据平台数量选择布局模式
    const useListLayout = platformCount >= 3;
    const singlePlatform = platformCount === 1;
    
    // 设置容器样式类，为多平台添加特殊类
    let layoutClass = useListLayout ? 'list-layout' : 'card-layout';
    if (platformCount >= 6) {
      layoutClass += ' many-platforms';
    }
    this.platformTargets.className = `platform-targets ${layoutClass}`;
    
    const html = this.platformData.map((platform, index) => {
      const percentage = platform.target > 0 ? 
        Math.round((platform.current / platform.target) * 100) : 0;
      
      // 根据完成度确定状态
      let statusClass = 'platform-status';
      let statusText = '正常';
      if (percentage >= 100) {
        statusText = '已完成';
      } else if (percentage >= 70) {
        statusClass += ' warning';
        statusText = '接近目标';
      } else if (percentage < 30) {
        statusClass += ' danger';
        statusText = '需努力';
      }
      
      // 计算还需金额
      const remaining = Math.max(0, platform.target - platform.current);
      
      if (useListLayout) {
        // 列表布局模式 - 适用于多平台
        return `
          <div class="platform-item list-item">
            <div class="platform-header">
              <h4 class="platform-name">${platform.name}</h4>
              <span class="${statusClass}">${statusText}</span>
            </div>
            
            <div class="platform-progress-section">
              <div class="progress-header">
                <span class="progress-label">目标进度</span>
                <span class="progress-percentage">${percentage}%</span>
              </div>
              <div class="progress-bar-wrapper">
                <div class="progress-bar-fill" style="width: ${Math.min(percentage, 100)}%"></div>
              </div>
            </div>
            
            <div class="list-item-info">
              <div class="list-item-amount">
                <span class="current-amount">¥${this.formatNumber(platform.current)}</span>
                <span class="target-amount">目标: ¥${this.formatNumber(platform.target)}</span>
              </div>
            </div>
          </div>
        `;
      } else {
        // 卡片布局模式 - 适用于少量平台
        return `
          <div class="platform-item ${singlePlatform ? 'single-platform' : ''}">
            <div class="platform-header">
              <h4 class="platform-name">${platform.name}</h4>
              <span class="${statusClass}">${statusText}</span>
            </div>
            
            <div class="platform-metrics ${singlePlatform ? 'single-platform-metrics' : ''}">
              <div class="metric-card">
                <span class="metric-value">¥${this.formatNumber(platform.current)}</span>
                <span class="metric-label">当前金额</span>
              </div>
              <div class="metric-card">
                <span class="metric-value">¥${this.formatNumber(platform.target)}</span>
                <span class="metric-label">目标金额</span>
              </div>
              ${singlePlatform ? `
              <div class="metric-card">
                <span class="metric-value">¥${this.formatNumber(remaining)}</span>
                <span class="metric-label">还需金额</span>
              </div>
              <div class="metric-card">
                <span class="metric-value">${percentage}%</span>
                <span class="metric-label">完成进度</span>
              </div>
              ` : ''}
            </div>
            
            <div class="platform-progress-section">
              <div class="progress-header">
                <span class="progress-label">完成进度</span>
                <span class="progress-percentage">${percentage}%</span>
              </div>
              <div class="progress-bar-wrapper">
                <div class="progress-bar-fill" style="width: ${Math.min(percentage, 100)}%"></div>
              </div>
            </div>
          </div>
        `;
      }
    }).join('');
    
    // 如果没有平台数据，显示空状态
    if (this.platformData.length === 0) {
      this.platformTargets.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">📊</div>
          <h3>暂无平台目标</h3>
          <p>请在管理后台添加平台目标</p>
        </div>
      `;
    } else {
      this.platformTargets.innerHTML = html;
    }
  }
  
  // 格式化数字
  formatNumber(num) {
    if (num >= 10000) {
      return (num / 10000).toFixed(1) + 'W';
    } else if (num >= 1000) {
      return (num / 1000).toFixed(1) + 'K';
    }
    return num.toLocaleString();
  }
  
  // 更新平台数据（当有新成交时调用）
  updatePlatformData(platform, amount) {
    const platformItem = this.platformData.find(p => p.name === platform);
    if (platformItem) {
      platformItem.current += amount;
      platformItem.percentage = platformItem.target > 0 ? 
        Math.round((platformItem.current / platformItem.target) * 100) : 0;
      
      // 如果当前显示的是平台目标，立即更新显示
      if (this.currentView === 'platforms') {
        this.renderPlatformTargets();
      }
    }
  }
}

// 全局实例
let platformTargetsManager = null;

// 初始化平台目标管理器
document.addEventListener('DOMContentLoaded', function() {
  // 延迟初始化，确保其他组件已加载
  setTimeout(() => {
    platformTargetsManager = new PlatformTargetsManager();
    
    // 将实例绑定到全局，供其他模块使用
    window.platformTargetsManager = platformTargetsManager;
  }, 2000);
});

// 导出给其他模块使用
if (typeof module !== 'undefined' && module.exports) {
  module.exports = PlatformTargetsManager;
} 