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

  // 渲染平台目标（DOM 节点，避免平台名 XSS）
  renderPlatformTargets() {
    if (!this.platformTargets) return;

    const platformCount = this.platformData.length;
    const useListLayout = platformCount >= 3;
    const singlePlatform = platformCount === 1;

    let layoutClass = useListLayout ? 'list-layout' : 'card-layout';
    if (platformCount >= 6) {
      layoutClass += ' many-platforms';
    }
    this.platformTargets.className = `platform-targets ${layoutClass}`;
    this.platformTargets.textContent = '';

    if (this.platformData.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'empty-state';
      const icon = document.createElement('div');
      icon.className = 'empty-icon';
      icon.textContent = '暂无';
      const title = document.createElement('h3');
      title.textContent = '暂无平台目标';
      const desc = document.createElement('p');
      desc.textContent = '请在管理后台添加平台目标';
      empty.appendChild(icon);
      empty.appendChild(title);
      empty.appendChild(desc);
      this.platformTargets.appendChild(empty);
      return;
    }

    this.platformData.forEach((platform) => {
      const percentage = platform.target > 0 ?
        Math.round((platform.current / platform.target) * 100) : 0;

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

      const remaining = Math.max(0, platform.target - platform.current);
      const item = document.createElement('div');
      item.className = useListLayout
        ? 'platform-item list-item'
        : ('platform-item' + (singlePlatform ? ' single-platform' : ''));

      const header = document.createElement('div');
      header.className = 'platform-header';
      const nameEl = document.createElement('h4');
      nameEl.className = 'platform-name';
      nameEl.textContent = String(platform.name || '未命名平台');
      const statusEl = document.createElement('span');
      statusEl.className = statusClass;
      statusEl.textContent = statusText;
      header.appendChild(nameEl);
      header.appendChild(statusEl);
      item.appendChild(header);

      if (useListLayout) {
        const progressSection = document.createElement('div');
        progressSection.className = 'platform-progress-section';
        const progressHeader = document.createElement('div');
        progressHeader.className = 'progress-header';
        const progressLabel = document.createElement('span');
        progressLabel.className = 'progress-label';
        progressLabel.textContent = '目标进度';
        const progressPercentage = document.createElement('span');
        progressPercentage.className = 'progress-percentage';
        progressPercentage.textContent = percentage + '%';
        progressHeader.appendChild(progressLabel);
        progressHeader.appendChild(progressPercentage);
        const barWrapper = document.createElement('div');
        barWrapper.className = 'progress-bar-wrapper';
        const barFill = document.createElement('div');
        barFill.className = 'progress-bar-fill';
        barFill.style.width = Math.min(percentage, 100) + '%';
        barWrapper.appendChild(barFill);
        progressSection.appendChild(progressHeader);
        progressSection.appendChild(barWrapper);
        item.appendChild(progressSection);

        const listInfo = document.createElement('div');
        listInfo.className = 'list-item-info';
        const amountWrap = document.createElement('div');
        amountWrap.className = 'list-item-amount';
        const currentAmount = document.createElement('span');
        currentAmount.className = 'current-amount';
        currentAmount.textContent = '¥' + this.formatNumber(platform.current);
        const targetAmount = document.createElement('span');
        targetAmount.className = 'target-amount';
        targetAmount.textContent = '目标: ¥' + this.formatNumber(platform.target);
        amountWrap.appendChild(currentAmount);
        amountWrap.appendChild(targetAmount);
        listInfo.appendChild(amountWrap);
        item.appendChild(listInfo);
      } else {
        const metrics = document.createElement('div');
        metrics.className = 'platform-metrics' + (singlePlatform ? ' single-platform-metrics' : '');
        const cards = [
          { value: '¥' + this.formatNumber(platform.current), label: '当前金额' },
          { value: '¥' + this.formatNumber(platform.target), label: '目标金额' }
        ];
        if (singlePlatform) {
          cards.push(
            { value: '¥' + this.formatNumber(remaining), label: '还需金额' },
            { value: percentage + '%', label: '完成进度' }
          );
        }
        cards.forEach((card) => {
          const cardEl = document.createElement('div');
          cardEl.className = 'metric-card';
          const valueEl = document.createElement('span');
          valueEl.className = 'metric-value';
          valueEl.textContent = card.value;
          const labelEl = document.createElement('span');
          labelEl.className = 'metric-label';
          labelEl.textContent = card.label;
          cardEl.appendChild(valueEl);
          cardEl.appendChild(labelEl);
          metrics.appendChild(cardEl);
        });
        item.appendChild(metrics);

        const progressSection = document.createElement('div');
        progressSection.className = 'platform-progress-section';
        const progressHeader = document.createElement('div');
        progressHeader.className = 'progress-header';
        const progressLabel = document.createElement('span');
        progressLabel.className = 'progress-label';
        progressLabel.textContent = '完成进度';
        const progressPercentage = document.createElement('span');
        progressPercentage.className = 'progress-percentage';
        progressPercentage.textContent = percentage + '%';
        progressHeader.appendChild(progressLabel);
        progressHeader.appendChild(progressPercentage);
        const barWrapper = document.createElement('div');
        barWrapper.className = 'progress-bar-wrapper';
        const barFill = document.createElement('div');
        barFill.className = 'progress-bar-fill';
        barFill.style.width = Math.min(percentage, 100) + '%';
        barWrapper.appendChild(barFill);
        progressSection.appendChild(progressHeader);
        progressSection.appendChild(barWrapper);
        item.appendChild(progressSection);
      }

      this.platformTargets.appendChild(item);
    });
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
