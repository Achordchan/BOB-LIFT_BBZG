// 平台目标管理系统
class PlatformTargetsManager {
  constructor() {
    this.currentView = 'activity'; // 'activity' 或 'platforms'
    this.switchInterval = null;
    this.switchDelay = 8000; // 8秒切换一次
    this.platformData = [];
    this.lastPlatformFetchAt = 0;

    this.initElements();
    this.checkDisplaySettings();
    this.renderPlatformTargets();
  }

  initElements() {
    this.sectionTitle = document.getElementById('sectionTitle');
    this.activityList = document.getElementById('activityList');
    this.platformTargets = document.getElementById('platformTargets');
    this.activityDot = document.getElementById('activityDot');
    this.platformDot = document.getElementById('platformDot');
  }

  // 检查显示设置
  checkDisplaySettings() {
    // 首页不再主动拉取设置，统一由 SSE snapshot 驱动。
    this.applyDisplaySettings({ showPlatformTargets: false });
  }

  // 启动设置监控
  startSettingsMonitor() {
    // 设置由 SSE snapshot 驱动，不再轮询
  }

  applyDisplaySettings(settings) {
    const shouldShow = !!(settings && settings.showPlatformTargets);
    const isCurrentlyActive = this.switchInterval !== null;

    if (shouldShow && !isCurrentlyActive) {
      this.startAutoSwitch();
    } else if (!shouldShow && isCurrentlyActive) {
      this.stopAutoSwitch();
      this.showRecentActivity();
    } else if (!shouldShow) {
      this.showRecentActivity();
    }
  }

  applyMainStreamSnapshot(snapshot, rawPayload) {
    const source = snapshot && typeof snapshot === 'object' ? snapshot : {};
    const payload = rawPayload && typeof rawPayload === 'object' ? rawPayload : {};

    const settings = source.platformDisplaySettings || payload.platformDisplaySettings;
    if (settings && typeof settings === 'object') {
      this.applyDisplaySettings(settings);
    }

    const targets = source.platformTargets || payload.platformTargets;
    if (Array.isArray(targets)) {
      this.platformData = targets;
      this.lastPlatformFetchAt = Date.now();
      this.renderPlatformTargets();
    }
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

    this.renderPlatformTargets();
  }

  // 加载平台数据
  async loadPlatformData() {
    // 首页平台数据统一由 SSE snapshot 驱动，不再主动拉取。
    this.renderPlatformTargets();
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
let pendingMainStreamSnapshot = null;

// 初始化平台目标管理器
document.addEventListener('DOMContentLoaded', function() {
  // 延迟初始化，确保其他组件已加载
  setTimeout(() => {
    platformTargetsManager = new PlatformTargetsManager();

    // 将实例绑定到全局，供其他模块使用
    window.platformTargetsManager = platformTargetsManager;

    if (pendingMainStreamSnapshot) {
      platformTargetsManager.applyMainStreamSnapshot(pendingMainStreamSnapshot.snapshot, pendingMainStreamSnapshot.rawPayload);
      pendingMainStreamSnapshot = null;
    }
  }, 2000);
});

window.applyMainStreamSnapshotForPlatformTargets = function applyMainStreamSnapshotForPlatformTargets(snapshot, rawPayload) {
  if (platformTargetsManager) {
    platformTargetsManager.applyMainStreamSnapshot(snapshot, rawPayload);
  } else {
    pendingMainStreamSnapshot = { snapshot, rawPayload };
  }
};

// 导出给其他模块使用
if (typeof module !== 'undefined' && module.exports) {
  module.exports = PlatformTargetsManager;
}
