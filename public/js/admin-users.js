/**
 * 加载用户列表
 */
function loadUsers() {
  fetch('/api/users')
    .then(response => response.json())
    .then(data => {
      const userList = document.getElementById('userList');
      userList.innerHTML = '';
      
      const userSelect = document.getElementById('configUser');
      // 保存当前选中值
      const selectedValue = userSelect.value;
      // 清空除了第一个以外的所有选项
      userSelect.innerHTML = '<option value="">请选择用户</option>';
      
      data.users.forEach((user, index) => {
        // 创建用户名首字母头像
        const getInitials = (name) => {
          return name.split('-')[0].trim().charAt(0).toUpperCase();
        };
        
        // 获取用户名首字母
        const userInitial = getInitials(user.name);
        
        // 使用模板创建用户卡片
        const template = document.getElementById('userCardTemplate');
        const clone = document.importNode(template.content, true);
        
        // 判断是否设置了音乐
        const hasMusicSet = !!user.musicName;
        
        // 判断是否是第一名（MVP）
        const isFirstPlace = index === 0;
        const mvpCrownHtml = isFirstPlace ? `
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M5 16C5 16 8 13 12 13C16 13 19 16 19 16L17 20H7L5 16Z" fill="#FFD700" stroke="#B8860B" stroke-width="1"/>
            <circle cx="7" cy="11" r="2" fill="#FFD700"/>
            <circle cx="12" cy="8" r="2.5" fill="#FFD700"/>
            <circle cx="17" cy="11" r="2" fill="#FFD700"/>
            <path d="M7 18H17" stroke="#B8860B" stroke-width="1.5" stroke-linecap="round"/>
          </svg>
          <span class="mvp-text">MVP</span>
        ` : '';
        
        // 填充模板内容
        const cardContent = clone.querySelector('.user-card-content');
        cardContent.innerHTML = cardContent.innerHTML
          .replace(/{initial}/g, userInitial)
          .replace(/{name}/g, user.name)
          .replace(/{position}/g, user.position)
          .replace(/{sortPosition}/g, index + 1)
          .replace(/{mvpCrown}/g, mvpCrownHtml)
          .replace(/{musicName}/g, hasMusicSet ? user.musicName : '未设置成交音乐')
          .replace(/{musicStatus}/g, hasMusicSet ? '已配置成交时播放的音乐' : '请配置成交时播放的音乐')
          .replace(/{musicStatusClass}/g, !hasMusicSet ? 'not-set' : '')
          .replace(/{id}/g, user.id);
        
        // 设置按钮属性
        const buttons = clone.querySelectorAll('button');
        buttons.forEach(button => {
          button.setAttribute('data-user-id', user.id);
          if (button.classList.contains('edit-user-btn') || button.classList.contains('config-music-btn')) {
            button.setAttribute('data-user-name', user.name);
            button.setAttribute('data-user-position', user.position);
          }
          
          if (button.classList.contains('edit-user-btn')) {
            button.setAttribute('data-photo-url', user.photoUrl || '');
            button.setAttribute('data-full-photo-url', user.fullPhotoUrl || '');
          }
        });
        
        // 绑定删除按钮事件
        clone.querySelector('.button-danger').addEventListener('click', function() {
          const userId = this.getAttribute('data-user-id');
          deleteUser(userId);
        });
        
        // 绑定编辑用户按钮事件
        clone.querySelector('.edit-user-btn').addEventListener('click', function() {
          const userId = this.getAttribute('data-user-id');
          const userName = this.getAttribute('data-user-name');
          const userPosition = this.getAttribute('data-user-position');
          const photoUrl = this.getAttribute('data-photo-url');
          const fullPhotoUrl = this.getAttribute('data-full-photo-url');
          
          // 打开编辑用户模态框
          openEditUserModal(userId, userName, userPosition, photoUrl, fullPhotoUrl);
        });
        
        // 绑定排序按钮事件并设置状态
        const sortUpBtn = clone.querySelector('.sort-up-btn');
        const sortDownBtn = clone.querySelector('.sort-down-btn');
        
        // 第一个用户禁用上移按钮
        if (index === 0 && sortUpBtn) {
          sortUpBtn.classList.add('disabled');
          sortUpBtn.disabled = true;
          sortUpBtn.title = '已经是第一个';
        }
        
        // 最后一个用户禁用下移按钮
        if (index === data.users.length - 1 && sortDownBtn) {
          sortDownBtn.classList.add('disabled');
          sortDownBtn.disabled = true;
          sortDownBtn.title = '已经是最后一个';
        }
        
        if (sortUpBtn && !sortUpBtn.disabled) {
          sortUpBtn.addEventListener('click', function() {
            const userId = this.getAttribute('data-user-id');
            updateUserSort(userId, 'up');
          });
        }
        
        if (sortDownBtn && !sortDownBtn.disabled) {
          sortDownBtn.addEventListener('click', function() {
            const userId = this.getAttribute('data-user-id');
            updateUserSort(userId, 'down');
          });
        }

        // 给用户卡片中的所有照片元素添加data-user-id属性，便于后续更新
        const userPhotoElements = clone.querySelectorAll('img[src*="/images/users/"]');
        if (userPhotoElements.length > 0) {
          userPhotoElements.forEach(img => {
            img.setAttribute('data-user-id', user.id);
          });
        }
        
        // 设置用户卡片本身的ID属性
        clone.querySelector('.user-card').setAttribute('data-user-id', user.id);
        
        userList.appendChild(clone);
        
        // 添加到选择框
        const option = document.createElement('option');
        option.value = user.id;
        option.textContent = user.name;
        userSelect.appendChild(option);
      });
      
      // 恢复选中值
      if (selectedValue) {
        userSelect.value = selectedValue;
        // 触发change事件
        const event = new Event('change');
        userSelect.dispatchEvent(event);
      }
    })
    .catch(error => {
      console.error('加载用户列表失败:', error);
      showMessage('加载用户列表失败，请重试', 'error');
    });
}

/**
 * 删除用户
 * @param {string} userId - 用户ID
 */
function deleteUser(userId) {
  if (!confirm('确定要删除这个用户吗？')) {
    return;
  }
  
  fetch(`/api/users/delete/${userId}`, {
    method: 'DELETE'
  })
  .then(response => response.json())
  .then(data => {
    if (data.success) {
      showMessage('用户删除成功');
      // 重新加载用户列表
      loadUsers();
    } else {
      showMessage(data.message || '用户删除失败', 'error');
    }
  })
  .catch(error => {
    console.error('删除用户失败:', error);
    showMessage('删除用户失败，请重试', 'error');
  });
}

/**
 * 添加用户事件处理
 */
function initUserEvents() {
  // 添加用户按钮和表单显示控制
  document.getElementById('showAddUserFormBtn').addEventListener('click', function() {
    document.getElementById('addUserModal').style.display = 'flex';
  });
  
  // 关闭模态框
  document.querySelector('#addUserModal .close').addEventListener('click', function() {
    document.getElementById('addUserModal').style.display = 'none';
    // 清空输入框
    document.getElementById('username').value = '';
    document.getElementById('userPosition').value = '';
  });
  
  // 点击模态框外部关闭
  document.getElementById('addUserModal').addEventListener('click', function(e) {
    if (e.target === this) {
      this.style.display = 'none';
      // 清空输入框
      document.getElementById('username').value = '';
      document.getElementById('userPosition').value = '';
    }
  });
  
  // 取消添加用户
  document.getElementById('cancelAddUserBtn').addEventListener('click', function() {
    document.getElementById('addUserModal').style.display = 'none';
    // 清空输入框
    document.getElementById('username').value = '';
    document.getElementById('userPosition').value = '';
  });
  
  // 获取钉钉成员按钮
  document.getElementById('getDingTalkUsersBtn').addEventListener('click', function() {
    // 显示提示信息
    showMessage('此功能将在后续版本中支持钉钉通讯录集成', 'info');
  });
  
  // 添加用户
  document.getElementById('addUserBtn').addEventListener('click', function() {
    const username = document.getElementById('username').value.trim();
    const position = document.getElementById('userPosition').value.trim();
    
    if (!username || !position) {
      showMessage('请填写用户名称和位置', 'error');
      return;
    }
    
    fetch('/api/users/add', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: username,
        position: position
      })
    })
    .then(response => response.json())
    .then(data => {
      if (data.success) {
        showMessage('用户添加成功');
        // 清空输入框
        document.getElementById('username').value = '';
        document.getElementById('userPosition').value = '';
        // 隐藏模态框
        document.getElementById('addUserModal').style.display = 'none';
        // 重新加载用户列表
        loadUsers();
      } else {
        showMessage(data.message || '用户添加失败', 'error');
      }
    })
    .catch(error => {
      console.error('添加用户失败:', error);
      showMessage('添加用户失败，请重试', 'error');
    });
  });
  
  // 用户选择变更时加载对应数据
  document.getElementById('configUser').addEventListener('change', function() {
    const userId = this.value;
    if (!userId) {
      document.getElementById('configPosition').value = '';
      return;
    }
    
    fetch(`/api/users/${userId}`)
      .then(response => response.json())
      .then(data => {
        if (data.user) {
          document.getElementById('configPosition').value = data.user.position;
          
          // 设置音乐选择和阈值
          if (data.user.musicId) {
            document.getElementById('configMusic').value = data.user.musicId;
          } else {
            document.getElementById('configMusic').value = '';
          }
        }
      })
      .catch(error => {
        console.error('加载用户信息失败:', error);
        showMessage('加载用户信息失败，请重试', 'error');
      });
  });
  
  // 用户音乐配置
  document.getElementById('saveConfigBtn').addEventListener('click', function() {
    const userId = document.getElementById('configUser').value;
    const musicId = document.getElementById('configMusic').value;
    
    if (!userId) {
      showMessage('请选择用户', 'error');
      return;
    }
    
    if (!musicId) {
      showMessage('请选择音乐', 'error');
      return;
    }
    
    fetch('/api/users/config', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        userId,
        musicId
      })
    })
    .then(response => response.json())
    .then(data => {
      if (data.success) {
        showMessage('用户配置已保存');
        loadUsers();
      } else {
        showMessage(data.message || '保存失败', 'error');
      }
    })
    .catch(error => {
      console.error('保存用户音乐配置失败:', error);
      showMessage('保存配置失败，请重试', 'error');
    });
  });
}

/**
 * 更新用户排序
 */
function updateUserSort(userId, direction) {
  // 显示加载状态
  const sortBtns = document.querySelectorAll(`[data-user-id="${userId}"].sort-btn`);
  sortBtns.forEach(btn => {
    btn.disabled = true;
    btn.style.opacity = '0.6';
  });

  fetch('/api/users/update-sort', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      userId: userId,
      direction: direction
    })
  })
  .then(response => {
    if (!response.ok) {
      if (response.status === 404) {
        throw new Error('API端点不存在，可能是服务器版本问题');
      } else if (response.status === 401) {
        throw new Error('会话已过期，请重新登录');
      } else {
        throw new Error(`服务器错误: ${response.status} ${response.statusText}`);
      }
    }
    return response.json();
  })
  .then(data => {
    if (data.success) {
      showMessage(`用户${direction === 'up' ? '上移' : '下移'}成功`);
      // 重新加载用户列表
      loadUsers();
    } else {
      showMessage(data.message || `用户${direction === 'up' ? '上移' : '下移'}失败`, 'error');
    }
  })
  .catch(error => {
    console.error('更新用户排序失败:', error);
    
    if (error.message.includes('会话已过期')) {
      showMessage('会话已过期，请重新登录', 'error');
      setTimeout(() => {
        window.location.href = '/login';
      }, 2000);
    } else if (error.message.includes('API端点不存在')) {
      showMessage('服务器版本不匹配，请联系管理员', 'error');
    } else {
      showMessage(`用户${direction === 'up' ? '上移' : '下移'}失败，请重试`, 'error');
    }
  })
  .finally(() => {
    // 恢复按钮状态
    sortBtns.forEach(btn => {
      btn.disabled = false;
      btn.style.opacity = '1';
    });
  });
}

// 确保函数在全局范围内可见
window.loadUsers = loadUsers;
window.deleteUser = deleteUser;
window.initUserEvents = initUserEvents; 