// 平台目标管理模块
class AdminPlatformsManager {
  constructor() {
    this.platforms = [];
    this.editingPlatform = null;
    
    this.initElements();
    this.bindEvents();
    this.loadPlatforms();
    this.loadDisplaySettings();
  }
  
  initElements() {
    this.platformsList = document.getElementById('platformsList');
    this.addPlatformBtn = document.getElementById('addPlatformBtn');
    this.resetPlatformDataBtn = document.getElementById('resetPlatformDataBtn');
    this.refreshPlatformDataBtn = document.getElementById('refreshPlatformDataBtn');
    
    // 平台显示控制开关
    this.platformDisplayToggle = document.getElementById('platformDisplayToggle');
    
    // 模态框元素
    this.addPlatformModal = document.getElementById('addPlatformModal');
    this.platformNameInput = document.getElementById('platformName');
    this.platformTargetInput = document.getElementById('platformTarget');
    this.confirmAddPlatformBtn = document.getElementById('confirmAddPlatformBtn');
    this.cancelAddPlatformBtn = document.getElementById('cancelAddPlatformBtn');
    
    // 模态框关闭按钮
    this.modalCloseBtn = this.addPlatformModal.querySelector('.close');
  }
  
  bindEvents() {
    // 按钮事件
    this.addPlatformBtn.addEventListener('click', () => this.showAddPlatformModal());
    this.resetPlatformDataBtn.addEventListener('click', () => this.resetPlatformData());
    this.refreshPlatformDataBtn.addEventListener('click', () => this.loadPlatforms());
    
    // 平台显示开关事件
    this.platformDisplayToggle.addEventListener('change', () => this.saveDisplaySettings());
    
    // 模态框事件
    this.confirmAddPlatformBtn.addEventListener('click', () => this.addPlatform());
    this.cancelAddPlatformBtn.addEventListener('click', () => this.hideAddPlatformModal());
    this.modalCloseBtn.addEventListener('click', () => this.hideAddPlatformModal());
    
    // 点击模态框外部关闭
    this.addPlatformModal.addEventListener('click', (e) => {
      if (e.target === this.addPlatformModal) {
        this.hideAddPlatformModal();
      }
    });
  }
  
  // 加载平台数据
  async loadPlatforms() {
    try {
      this.platformsList.innerHTML = '<div class="loading-spinner">加载中...</div>';
      
      const response = await fetch('/api/platforms/targets');
      
      // 检查响应状态
      if (!response.ok) {
        if (response.status === 404) {
          throw new Error(`API端点不存在: ${response.url}`);
        } else if (response.status === 401) {
          throw new Error('需要重新登录');
        } else {
          throw new Error(`服务器错误: ${response.status} ${response.statusText}`);
        }
      }
      
      const data = await response.json();
      
      if (data.success) {
        this.platforms = data.platforms || [];
        this.renderPlatforms();
      } else {
        throw new Error(data.message || '获取平台数据失败');
      }
    } catch (error) {
      console.error('加载平台数据失败:', error);
      
      let errorMessage = error.message;
      let retryButton = '<button onclick="adminPlatformsManager.loadPlatforms()" class="button-primary">重试</button>';
      
      if (error.message.includes('需要重新登录')) {
        errorMessage = '会话已过期，请重新登录';
        retryButton = '<button onclick="window.location.href=\'/login\'" class="button-primary">重新登录</button>';
      } else if (error.message.includes('API端点不存在')) {
        errorMessage = 'API端点不存在，可能是服务器版本问题';
        retryButton = '<button onclick="window.location.reload()" class="button-primary">刷新页面</button>';
      }

      const safeErrorMessage = window.escapeHtml ? window.escapeHtml(errorMessage) : errorMessage;
      
      this.platformsList.innerHTML = `
        <div style="text-align: center; color: var(--text-secondary); padding: 40px;">
          <p>加载平台数据失败: ${safeErrorMessage}</p>
          ${retryButton}
        </div>
      `;
    }
  }
  
  // 渲染平台列表
  renderPlatforms() {
    if (this.platforms.length === 0) {
      this.platformsList.innerHTML = `
        <div style="text-align: center; color: var(--text-secondary); padding: 40px;">
          <p>暂无平台数据</p>
          <p>点击"添加平台"按钮创建第一个平台目标</p>
        </div>
      `;
      return;
    }
    
    const html = this.platforms.map(platform => this.renderPlatformCard(platform)).join('');
    this.platformsList.innerHTML = html;
    
    // 绑定卡片事件
    this.bindPlatformEvents();
  }
  
  // 渲染单个平台卡片
  renderPlatformCard(platform) {
    const safeName = window.escapeHtml ? window.escapeHtml(platform.name) : platform.name;
    const percentage = platform.target > 0 ? Math.round((platform.current / platform.target) * 100) : 0;
    const progressWidth = Math.min(percentage, 100);
    
    return `
      <div class="platform-card" data-platform-id="${platform.id}">
        <div class="platform-header">
          <div class="platform-name">${safeName}</div>
          <div class="platform-actions">
            <div class="platform-toggle ${platform.enabled ? 'enabled' : ''}" 
                 data-platform-id="${platform.id}" 
                 title="${platform.enabled ? '点击禁用' : '点击启用'}">
            </div>
            <button class="button-small button-edit edit-platform-btn" data-platform-id="${platform.id}">编辑</button>
            <button class="button-small button-delete delete-platform-btn" data-platform-id="${platform.id}">删除</button>
          </div>
        </div>
        
        <div class="platform-stats">
          <div class="stat-item">
            <div class="stat-label">目标金额</div>
            <div class="stat-value target">¥${this.formatNumber(platform.target)}</div>
          </div>
          <div class="stat-item">
            <div class="stat-label">当前金额</div>
            <div class="stat-value current">¥${this.formatNumber(platform.current)}</div>
          </div>
          <div class="stat-item">
            <div class="stat-label">完成度</div>
            <div class="stat-value percentage">${percentage}%</div>
          </div>
        </div>
        
        <div class="platform-progress">
          <div class="progress-bar-platform">
            <div class="progress-fill-platform" style="width: ${progressWidth}%"></div>
          </div>
        </div>
        
        <div class="platform-form" data-platform-id="${platform.id}">
          <div class="form-group">
            <label>平台名称</label>
            <input type="text" class="edit-name" value="${safeName}">
          </div>
          <div class="form-group">
            <label>目标金额</label>
            <input type="number" class="edit-target" value="${platform.target}" min="0" step="1000">
          </div>
          <div class="form-group">
            <label>当前金额</label>
            <input type="number" class="edit-current" value="${platform.current}" min="0" step="1000">
          </div>
          <div class="platform-form-actions">
            <button class="button-small button-cancel cancel-edit-btn" data-platform-id="${platform.id}">取消</button>
            <button class="button-small button-save save-edit-btn" data-platform-id="${platform.id}">保存</button>
          </div>
        </div>
      </div>
    `;
  }
  
  // 绑定平台卡片事件
  bindPlatformEvents() {
    // 切换启用/禁用
    document.querySelectorAll('.platform-toggle').forEach(toggle => {
      toggle.addEventListener('click', (e) => {
        const platformId = e.target.dataset.platformId;
        this.togglePlatform(platformId);
      });
    });
    
    // 编辑按钮
    document.querySelectorAll('.edit-platform-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const platformId = e.target.dataset.platformId;
        this.startEditPlatform(platformId);
      });
    });
    
    // 删除按钮
    document.querySelectorAll('.delete-platform-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const platformId = e.target.dataset.platformId;
        this.deletePlatform(platformId);
      });
    });
    
    // 保存编辑
    document.querySelectorAll('.save-edit-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const platformId = e.target.dataset.platformId;
        this.saveEditPlatform(platformId);
      });
    });
    
    // 取消编辑
    document.querySelectorAll('.cancel-edit-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const platformId = e.target.dataset.platformId;
        this.cancelEditPlatform(platformId);
      });
    });
  }
  
  // 显示添加平台模态框
  showAddPlatformModal() {
    this.platformNameInput.value = '';
    this.platformTargetInput.value = '';
    this.addPlatformModal.style.display = 'block';
    this.platformNameInput.focus();
  }
  
  // 隐藏添加平台模态框
  hideAddPlatformModal() {
    this.addPlatformModal.style.display = 'none';
  }
  
  // 添加平台
  async addPlatform() {
    const name = this.platformNameInput.value.trim();
    const target = parseFloat(this.platformTargetInput.value) || 0;
    
    if (!name) {
      this.showMessage('请输入平台名称', 'error');
      return;
    }
    
    // 检查平台名称是否已存在
    if (this.platforms.some(p => p.name === name)) {
      this.showMessage('平台名称已存在', 'error');
      return;
    }
    
    try {
      const newPlatform = {
        name: name,
        target: target,
        current: 0,
        enabled: true
      };
      
      const updatedPlatforms = [...this.platforms, newPlatform];
      
      const response = await fetch('/api/platforms/targets', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ platforms: updatedPlatforms })
      });
      
      const data = await response.json();
      
      if (data.success) {
        this.platforms = data.platforms;
        this.renderPlatforms();
        this.hideAddPlatformModal();
        this.showMessage('平台添加成功', 'success');
      } else {
        throw new Error(data.message || '添加平台失败');
      }
    } catch (error) {
      console.error('添加平台失败:', error);
      this.showMessage('添加平台失败: ' + error.message, 'error');
    }
  }
  
  // 切换平台启用状态
  async togglePlatform(platformId) {
    const platform = this.platforms.find(p => p.id === platformId);
    if (!platform) return;
    
    platform.enabled = !platform.enabled;
    
    try {
      const response = await fetch('/api/platforms/targets', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ platforms: this.platforms })
      });
      
      const data = await response.json();
      
      if (data.success) {
        this.platforms = data.platforms;
        this.renderPlatforms();
        this.showMessage(`平台已${platform.enabled ? '启用' : '禁用'}`, 'success');
      } else {
        throw new Error(data.message || '更新平台状态失败');
      }
    } catch (error) {
      console.error('更新平台状态失败:', error);
      this.showMessage('更新平台状态失败: ' + error.message, 'error');
    }
  }
  
  // 开始编辑平台
  startEditPlatform(platformId) {
    // 取消其他正在编辑的平台
    if (this.editingPlatform && this.editingPlatform !== platformId) {
      this.cancelEditPlatform(this.editingPlatform);
    }
    
    this.editingPlatform = platformId;
    const card = document.querySelector(`[data-platform-id="${platformId}"]`);
    const form = card.querySelector('.platform-form');
    
    card.classList.add('editing');
    form.classList.add('show');
  }
  
  // 取消编辑平台
  cancelEditPlatform(platformId) {
    this.editingPlatform = null;
    const card = document.querySelector(`[data-platform-id="${platformId}"]`);
    const form = card.querySelector('.platform-form');
    
    card.classList.remove('editing');
    form.classList.remove('show');
    
    // 恢复原始值
    const platform = this.platforms.find(p => p.id === platformId);
    if (platform) {
      form.querySelector('.edit-name').value = platform.name;
      form.querySelector('.edit-target').value = platform.target;
      form.querySelector('.edit-current').value = platform.current;
    }
  }
  
  // 保存编辑平台
  async saveEditPlatform(platformId) {
    const card = document.querySelector(`[data-platform-id="${platformId}"]`);
    const form = card.querySelector('.platform-form');
    
    const name = form.querySelector('.edit-name').value.trim();
    const target = parseFloat(form.querySelector('.edit-target').value) || 0;
    const current = parseFloat(form.querySelector('.edit-current').value) || 0;
    
    if (!name) {
      this.showMessage('请输入平台名称', 'error');
      return;
    }
    
    // 检查平台名称是否与其他平台重复
    if (this.platforms.some(p => p.name === name && p.id !== platformId)) {
      this.showMessage('平台名称已存在', 'error');
      return;
    }
    
    try {
      const platformIndex = this.platforms.findIndex(p => p.id === platformId);
      if (platformIndex === -1) return;
      
      this.platforms[platformIndex] = {
        ...this.platforms[platformIndex],
        name: name,
        target: target,
        current: current
      };
      
      const response = await fetch('/api/platforms/targets', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ platforms: this.platforms })
      });
      
      const data = await response.json();
      
      if (data.success) {
        this.platforms = data.platforms;
        this.editingPlatform = null;
        this.renderPlatforms();
        this.showMessage('平台更新成功', 'success');
      } else {
        throw new Error(data.message || '更新平台失败');
      }
    } catch (error) {
      console.error('更新平台失败:', error);
      this.showMessage('更新平台失败: ' + error.message, 'error');
    }
  }
  
  // 删除平台
  async deletePlatform(platformId) {
    const platform = this.platforms.find(p => p.id === platformId);
    if (!platform) return;
    
    if (!confirm(`确定要删除平台"${platform.name}"吗？\n删除后该平台的所有数据将丢失！`)) {
      return;
    }
    
    try {
      const updatedPlatforms = this.platforms.filter(p => p.id !== platformId);
      
      const response = await fetch('/api/platforms/targets', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ platforms: updatedPlatforms })
      });
      
      const data = await response.json();
      
      if (data.success) {
        this.platforms = data.platforms;
        this.renderPlatforms();
        this.showMessage('平台删除成功', 'success');
      } else {
        throw new Error(data.message || '删除平台失败');
      }
    } catch (error) {
      console.error('删除平台失败:', error);
      this.showMessage('删除平台失败: ' + error.message, 'error');
    }
  }
  
  // 重置平台数据
  async resetPlatformData() {
    if (!confirm('确定要重置所有平台的当前金额数据吗？\n此操作将清空所有平台的累计金额！')) {
      return;
    }
    
    try {
      const response = await fetch('/api/platforms/reset', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      const data = await response.json();
      
      if (data.success) {
        this.platforms = data.platforms;
        this.renderPlatforms();
        this.showMessage('平台数据重置成功', 'success');
      } else {
        throw new Error(data.message || '重置平台数据失败');
      }
    } catch (error) {
      console.error('重置平台数据失败:', error);
      this.showMessage('重置平台数据失败: ' + error.message, 'error');
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
  
  // 加载平台显示设置
  async loadDisplaySettings() {
    try {
      const response = await fetch('/api/platform-display-settings');
      const data = await response.json();
      
      if (data.success) {
        this.platformDisplayToggle.checked = data.settings.showPlatformTargets;
      } else {
        console.error('获取平台显示设置失败:', data.message);
      }
    } catch (error) {
      console.error('加载平台显示设置失败:', error);
    }
  }
  
  // 保存平台显示设置
  async saveDisplaySettings() {
    try {
      const settings = {
        showPlatformTargets: this.platformDisplayToggle.checked,
        autoScroll: true,
        scrollInterval: 3000
      };
      
      const response = await fetch('/api/platform-display-settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ settings: settings })
      });
      
      const data = await response.json();
      
      if (data.success) {
        this.showMessage(
          `平台目标滚动显示已${settings.showPlatformTargets ? '开启' : '关闭'}`,
          'success'
        );
      } else {
        console.error('保存平台显示设置失败:', data.message);
        this.showMessage('保存设置失败: ' + data.message, 'error');
      }
    } catch (error) {
      console.error('保存平台显示设置失败:', error);
      this.showMessage('保存设置失败', 'error');
    }
  }

  // 显示消息
  showMessage(message, type = 'info') {
    if (window.showMessage) {
      window.showMessage(message, type);
    } else {
      alert(message);
    }
  }
}

// 全局实例
let adminPlatformsManager = null;

// 初始化平台管理器
document.addEventListener('DOMContentLoaded', function() {
  // 延迟初始化，确保其他组件已加载
  setTimeout(() => {
    adminPlatformsManager = new AdminPlatformsManager();
    
    // 将实例绑定到全局，供其他模块使用
    window.adminPlatformsManager = adminPlatformsManager;
  }, 1000);
});

// 导出给其他模块使用
if (typeof module !== 'undefined' && module.exports) {
  module.exports = AdminPlatformsManager;
} 