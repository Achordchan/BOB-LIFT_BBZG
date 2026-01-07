/**
 * admin-modals.js
 * 管理页面模态框相关函数
 */

// 全局变量
let currentUserId = null;

/**
 * 初始化用户音乐配置模态框
 */
function initConfigMusicModal() {
  // 关闭模态框的方法
  function closeConfigModal() {
    try {
      const audio = document.getElementById('modalMusicAudio');
      if (audio) {
        audio.pause();
        audio.currentTime = 0;
      }
      const preview = document.getElementById('modalMusicPreview');
      if (preview) preview.style.display = 'none';
    } catch (e) {}
    document.getElementById('configMusicModal').style.display = 'none';
  }

  if (window.ModalCore && typeof window.ModalCore.bindModalClose === 'function') {
    window.ModalCore.bindModalClose('configMusicModal', {
      closeSelector: '#closeConfigMusicModal',
      cancelId: 'modalConfigCancelBtn',
      overlayClose: true,
      onClose: closeConfigModal
    });
  } else {
    // 关闭按钮事件
    document.getElementById('closeConfigMusicModal').addEventListener('click', closeConfigModal);
    document.getElementById('modalConfigCancelBtn').addEventListener('click', closeConfigModal);

    // 点击模态框外部关闭
    window.addEventListener('click', function(event) {
      const modal = document.getElementById('configMusicModal');
      if (event.target === modal) {
        closeConfigModal();
      }
    });
  }
  
  // 音乐选择变更时显示预览
  document.getElementById('modalConfigMusic').addEventListener('change', function() {
    const musicId = this.value;
    const preview = document.getElementById('modalMusicPreview');
    
    if (!musicId) {
      preview.style.display = 'none';
      return;
    }
    
    // 查找选中的音乐
    (window.getCachedMusicList ? window.getCachedMusicList() : fetch('/api/music').then(r => r.json()).then(d => d.music || []))
      .then(list => {
        const music = list.find(m => m.id === musicId);
        if (music) {
          const audio = document.getElementById('modalMusicAudio');
          // 设置 preload="none" 避免自动加载
          audio.setAttribute('preload', 'none');
          
          audio.src = `/music/${music.filename}`;
          
          preview.style.display = 'block';
          
          // 更新输入框文本
          document.getElementById('modalConfigMusicInput').value = music.name;
        }
      })
      .catch(error => console.error('获取音乐失败:', error));
  });
  
  // 自定义下拉选择框的点击事件
  document.getElementById('modalConfigMusicInput').addEventListener('click', function() {
    const dropdown = document.querySelector('.custom-select-dropdown');
    dropdown.style.display = dropdown.style.display === 'none' ? 'block' : 'none';
  });
  
  // 点击选项时
  document.addEventListener('click', function(e) {
    const container = document.querySelector('.custom-select-container');
    const dropdown = document.querySelector('.custom-select-dropdown');
    
    // 点击外部时关闭下拉框
    if (container && !container.contains(e.target)) {
      if (dropdown) {
        dropdown.style.display = 'none';
      }
    }
    
    // 点击选项时更新选择
    if (e.target.classList.contains('custom-select-option') || e.target.closest('.custom-select-option')) {
      const option = e.target.classList.contains('custom-select-option') ? e.target : e.target.closest('.custom-select-option');
      const value = option.getAttribute('data-value');
      const select = document.getElementById('modalConfigMusic');
      select.value = value;
      
      // 触发select的change事件
      const event = new Event('change');
      select.dispatchEvent(event);
      
      // 关闭下拉框
      dropdown.style.display = 'none';
    }
  });
  
  // 保存配置按钮事件
  document.getElementById('modalConfigSaveBtn').addEventListener('click', function() {
    const userId = document.getElementById('modalConfigUserId').value;
    const musicId = document.getElementById('modalConfigMusic').value;
    
    if (!userId) {
      showMessage('用户ID无效', 'error');
      return;
    }
    
    if (!musicId) {
      showMessage('请选择音乐', 'error');
      return;
    }
    
    // 保存配置
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
        closeConfigModal();
        // 使用window对象上的loadUsers函数
        if (typeof window.loadUsers === 'function') {
          window.loadUsers(); // 重新加载用户列表
        } else {
          console.warn('loadUsers函数未找到，但配置已保存');
        }
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
 * 打开用户音乐配置模态框
 * @param {string} userId - 用户ID
 * @param {string} userName - 用户名
 * @param {string} userPosition - 用户职位
 */
function openConfigMusicModal(userId, userName, userPosition) {
  // 填充表单
  document.getElementById('modalConfigUser').value = userName;
  document.getElementById('modalConfigUserId').value = userId;
  document.getElementById('modalConfigPosition').value = userPosition;
  
  // 重置音乐选择和预览
  document.getElementById('modalConfigMusic').innerHTML = '<option value="">请选择音乐</option>';
  const dropdown = document.querySelector('.custom-select-dropdown');
  dropdown.innerHTML = '<div class="custom-select-option" data-value="" style="padding: 12px 16px; cursor: pointer; transition: background-color 0.2s;">请选择音乐</div>';
  document.getElementById('modalConfigMusicInput').value = '';
  document.getElementById('modalMusicPreview').style.display = 'none';
  
  // 加载该用户当前的音乐配置
  fetch(`/api/users/${userId}`)
    .then(response => response.json())
    .then(userData => {
      // 加载所有音乐列表
      return (window.getCachedMusicList ? window.getCachedMusicList() : fetch('/api/music').then(r => r.json()).then(d => d.music || []))
        .then(musicList => {
          return { user: userData.user, music: musicList };
        });
    })
    .then(data => {
      const musicSelect = document.getElementById('modalConfigMusic');
      const dropdown = document.querySelector('.custom-select-dropdown');
      
      // 分别处理音乐和音效
      const musicFiles = data.music.filter(music => !music.isSound);
      
      if (musicFiles.length > 0) {
        const musicOptgroup = document.createElement('optgroup');
        musicOptgroup.label = '音乐';
        
        musicFiles.forEach(music => {
          // 添加到隐藏的select
          const option = document.createElement('option');
          option.value = music.id;
          option.textContent = music.name;
          if (music.lrcFilename) {
            option.setAttribute('data-has-lrc', 'true');
          }
          musicOptgroup.appendChild(option);
          
          // 添加到自定义下拉框
          const dropdownOption = document.createElement('div');
          dropdownOption.className = 'custom-select-option';
          dropdownOption.setAttribute('data-value', music.id);
          dropdownOption.style.padding = '12px 16px';
          dropdownOption.style.cursor = 'pointer';
          dropdownOption.style.transition = 'background-color 0.2s';
          dropdownOption.style.display = 'flex';
          dropdownOption.style.alignItems = 'center';
          dropdownOption.style.justifyContent = 'space-between';
          
          // 音乐名称
          dropdownOption.textContent = music.name;
          
          // 如果有歌词，添加标签
          if (music.lrcFilename) {
            const lrcTag = document.createElement('span');
            lrcTag.style.backgroundColor = '#ff9500';
            lrcTag.style.color = 'white';
            lrcTag.style.padding = '2px 8px';
            lrcTag.style.borderRadius = '12px';
            lrcTag.style.fontSize = '12px';
            lrcTag.style.marginLeft = '8px';
            lrcTag.textContent = '歌词';
            dropdownOption.appendChild(lrcTag);
          }
          
          dropdown.appendChild(dropdownOption);
        });
        
        musicSelect.appendChild(musicOptgroup);
      }
      
      // 设置当前选中的音乐
      if (data.user && data.user.musicId) {
        musicSelect.value = data.user.musicId;
        
        // 触发change事件，显示预览
        const event = new Event('change');
        musicSelect.dispatchEvent(event);
      }
    })
    .catch(error => {
      console.error('加载用户和音乐数据失败:', error);
      showMessage('加载数据失败，请重试', 'error');
    });
  
  // 显示模态框
  document.getElementById('configMusicModal').style.display = 'flex';
}

/**
 * 初始化修改密码模态框
 */
function initChangePasswordModal() {
  const changePasswordModal = document.getElementById('changePasswordModal');
  const changePasswordBtn = document.getElementById('changePasswordBtn');
  const cancelBtn = document.getElementById('cancelChangePasswordBtn');
  const closeBtn = changePasswordModal ? changePasswordModal.querySelector('.close') : null;

  if (!changePasswordModal || !changePasswordBtn) {
    console.warn('[initChangePasswordModal] 未找到按钮或模态框，跳过绑定');
    return;
  }

  // 避免被父级 stacking context 影响，必要时提升到 body
  try {
    if (changePasswordModal && changePasswordModal.parentNode !== document.body) {
      document.body.appendChild(changePasswordModal);
    }
  } catch (_) {}

  function closeChangePasswordModal() {
    changePasswordModal.style.display = 'none';
    changePasswordModal.style.zIndex = '';
  }

  function openChangePasswordModal(e) {
    if (e) e.preventDefault();
    changePasswordModal.style.display = 'flex';
    // 确保在其它模态框之上
    changePasswordModal.style.zIndex = '4000';
    // 默认聚焦第一个输入框，提示用户
    const firstInput = changePasswordModal.querySelector('input[type=\"password\"], input[type=\"text\"]');
    if (firstInput) {
      try { firstInput.focus(); } catch (_) {}
    }
  }

  changePasswordBtn.addEventListener('click', openChangePasswordModal);

  window.ModalCore.bindModalClose('changePasswordModal', {
    closeSelector: '.close',
    cancelId: 'cancelChangePasswordBtn',
    overlayClose: true,
    onClose: closeChangePasswordModal,
    escClose: true
  });
  
  // 保存密码按钮
  document.getElementById('savePasswordBtn').addEventListener('click', function() {
    const currentPassword = document.getElementById('currentPassword').value;
    const newPassword = document.getElementById('newPassword').value;
    const confirmPassword = document.getElementById('confirmPassword').value;
    
    // 验证输入
    if (!currentPassword || !newPassword || !confirmPassword) {
      showMessage('请填写所有密码字段', 'error');
      return;
    }
    
    if (newPassword !== confirmPassword) {
      showMessage('两次输入的新密码不一致', 'error');
      return;
    }
    
    // 发送修改密码请求
    fetch('/api/change-password', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        currentPassword,
        newPassword
      })
    })
    .then(response => response.json())
    .then(data => {
      if (data.success) {
        showMessage('密码修改成功');
        closeChangePasswordModal();
        // 清空输入框
        document.getElementById('currentPassword').value = '';
        document.getElementById('newPassword').value = '';
        document.getElementById('confirmPassword').value = '';
      } else {
        showMessage(data.message || '密码修改失败', 'error');
      }
    })
    .catch(error => {
      console.error('修改密码失败:', error);
      showMessage('修改密码失败，请重试', 'error');
    });
  });
}

/**
 * 密码显示/隐藏切换
 * @param {string} inputId - 密码输入框ID
 * @param {HTMLElement} button - 切换按钮
 */
function togglePasswordVisibility(inputId, button) {
  const input = document.getElementById(inputId);
  if (input.type === "password") {
    input.type = "text";
    button.innerHTML = `
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
        <line x1="1" y1="1" x2="23" y2="23"></line>
      </svg>
    `;
  } else {
    input.type = "password";
    button.innerHTML = `
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
        <circle cx="12" cy="12" r="3"></circle>
      </svg>
    `;
  }
}

/**
 * 初始化用户编辑模态框
 */
function initEditUserModal() {
  // 用户照片裁剪器
  let userPhotoCropper = null;
  let userFullPhotoCropper = null;
  let photoCropData = null;
  let fullPhotoCropData = null;

  const saveUserBtn = document.getElementById('saveUserBtn');
  let selectedMusicMeta = null;

  function setSaveEnabled(enabled) {
    if (!saveUserBtn) return;
    saveUserBtn.disabled = !enabled;
  }

  function setSelectedMusicValidity(isValid) {
    const select = document.getElementById('editUserMusic');
    if (select) {
      select.dataset.musicValid = isValid ? 'true' : 'false';
    }
    setSaveEnabled(isValid);
  }

  function stopEditUserMusicPreview() {
    try {
      const audio = document.getElementById('editUserMusicAudio');
      if (audio) {
        audio.pause();
        audio.currentTime = 0;
      }
      const playerRoot = document.querySelector('#editUserMusicPreview [data-audio-player="editUserMusic"]');
      if (playerRoot && playerRoot.__playerBinding && typeof playerRoot.__playerBinding.resetUI === 'function') {
        playerRoot.__playerBinding.resetUI();
      }
    } catch (e) {}
  }
  
  // 切换照片编辑标签页
  const formTabs = document.querySelectorAll('.form-tab');
  formTabs.forEach(tab => {
    tab.addEventListener('click', function() {
      const tabId = this.getAttribute('data-tab');
      
      // 移除所有标签页和内容的活动状态
      document.querySelectorAll('.form-tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.photo-tab-content').forEach(c => c.classList.remove('active'));
      
      // 设置当前标签页和内容为活动状态
      this.classList.add('active');
      document.getElementById(tabId + 'Tab').classList.add('active');
    });
  });
  
  // 添加音乐选择相关事件
  // 音乐选择变更时显示预览
  document.getElementById('editUserMusic').addEventListener('change', function() {
    const musicId = this.value;
    const preview = document.getElementById('editUserMusicPreview');
    
    if (!musicId) {
      selectedMusicMeta = null;
      setSelectedMusicValidity(true);
      preview.style.display = 'none';
      return;
    }
    
    // 查找选中的音乐
    (window.getCachedMusicList ? window.getCachedMusicList() : fetch('/api/music').then(r => r.json()).then(d => d.music || []))
      .then(list => {
        const music = list.find(m => m.id === musicId);
        if (music) {
          const audio = document.getElementById('editUserMusicAudio');
          const playerRoot = preview.querySelector('[data-audio-player="editUserMusic"]');
          const src = `/music/${music.filename}`;

          // 先更新输入框文本，让用户立即看到选择结果
          document.getElementById('editUserMusicInput').value = music.name;

          selectedMusicMeta = {
            filename: music.filename || '',
            src
          };

          // 本地音乐：先做 HEAD 检测，通过后才设置 src，避免触发 GET 404
          const isLocalFile = !!music.filename;
          const headCheck = isLocalFile
            ? fetch(src, { method: 'HEAD', cache: 'no-cache' })
            : Promise.resolve({ ok: true });

          return headCheck.then(res => {
            if (!res || !res.ok) {
              if (audio) {
                const source = audio.querySelector('source');
                if (source) source.src = '';
                audio.removeAttribute('src');
                audio.load();
              }

              if (playerRoot && playerRoot.__playerBinding && typeof playerRoot.__playerBinding.resetUI === 'function') {
                playerRoot.__playerBinding.resetUI();
              }

              preview.style.display = 'none';
              setSelectedMusicValidity(false);
              showMessage('该音乐文件已丢失/无法访问，请换一首歌后再保存', 'error');
              return;
            }

            setSelectedMusicValidity(true);

            if (audio) {
              audio.setAttribute('preload', 'none');
              const source = audio.querySelector('source');
              if (source) source.src = src;
              audio.removeAttribute('src');
              audio.load();
            }

            preview.style.display = 'block';

            if (playerRoot && window.bindAudioPlayer) {
              if (!playerRoot.__playerBinding) {
                playerRoot.__playerBinding = window.bindAudioPlayer(playerRoot);
              }
              if (playerRoot.__playerBinding && typeof playerRoot.__playerBinding.resetUI === 'function') {
                playerRoot.__playerBinding.resetUI();
              }
            }
          });
        }
      })
      .catch(error => console.error('获取音乐失败:', error));
  });
  
  // 自定义下拉选择框的点击事件
  document.getElementById('editUserMusicInput').addEventListener('click', function() {
    const dropdown = document.querySelector('.editUser-select-dropdown');
    dropdown.style.display = dropdown.style.display === 'none' ? 'block' : 'none';
  });
  
  // 点击选项时
  document.addEventListener('click', function(e) {
    const container = document.getElementById('editUserModal').querySelector('.custom-select-container');
    const dropdown = document.querySelector('.editUser-select-dropdown');
    
    // 编辑用户模态框中点击外部时关闭下拉框
    if (container && !container.contains(e.target)) {
      if (dropdown) {
        dropdown.style.display = 'none';
      }
    }
    
    // 编辑用户模态框中点击选项时更新选择
    if (e.target.closest('.editUser-select-dropdown .custom-select-option') || e.target.matches('.editUser-select-dropdown .custom-select-option')) {
      const option = e.target.closest('.custom-select-option') || e.target;
      const value = option.getAttribute('data-value');
      const select = document.getElementById('editUserMusic');
      select.value = value;
      
      // 触发select的change事件
      const event = new Event('change');
      select.dispatchEvent(event);
      
      // 关闭下拉框
      dropdown.style.display = 'none';
    }
  });
  
  // 半身照文件选择处理
  document.getElementById('userPhoto').addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (!file) return;
    
    // 销毁现有的裁剪器
    if (userPhotoCropper) {
      userPhotoCropper.destroy();
      userPhotoCropper = null;
    }
    
    // 显示裁剪区域，隐藏预览
    const preview = document.getElementById('userPhotoPreview');
    const cropper = document.getElementById('userPhotoCropper');
    const cropperImage = document.getElementById('userPhotoCropperImage');
    const cropControls = document.querySelector('#halfPhotoTab .crop-controls');
    
    preview.style.display = 'none';
    cropper.style.display = 'block';
    cropControls.style.display = 'flex';
    
    // 完全替换裁剪控制区域
    cropControls.innerHTML = `
      <div style="display: flex; justify-content: center; width: 100%; margin-top: 15px; background: #f5f5f5; padding: 10px; border-radius: 4px; z-index: 9999;">
        <button id="cropUserPhotoBtn" type="button" 
          style="display: inline-block !important; visibility: visible !important; opacity: 1 !important; 
          background-color: #4CAF50 !important; color: white !important; padding: 8px 16px !important; 
          border-radius: 4px !important; margin: 5px !important; cursor: pointer !important; 
          border: 1px solid #ccc !important; font-weight: bold !important; z-index: 9999 !important;">
          确认裁剪
        </button>
        <button id="cancelCropUserPhotoBtn" type="button"
          style="display: inline-block !important; visibility: visible !important; opacity: 1 !important; 
          background-color: #f44336 !important; color: white !important; padding: 8px 16px !important; 
          border-radius: 4px !important; margin: 5px !important; cursor: pointer !important; 
          border: 1px solid #ccc !important; font-weight: bold !important; z-index: 9999 !important;">
          取消
        </button>
      </div>
    `;
    
    // 重新绑定裁剪按钮事件
    document.getElementById('cropUserPhotoBtn').addEventListener('click', cropUserPhoto);
    document.getElementById('cancelCropUserPhotoBtn').addEventListener('click', cancelCropUserPhoto);
    
    // 创建图片URL
    const url = URL.createObjectURL(file);
    cropperImage.src = url;
    
    // 等待图片加载完成后初始化裁剪器
    cropperImage.onload = function() {
      // 添加缩放控制元素
      let zoomControls = cropper.querySelector('.zoom-controls');
      if (!zoomControls) {
        zoomControls = document.createElement('div');
        zoomControls.className = 'zoom-controls';
        zoomControls.innerHTML = `
          <button type="button" class="zoom-out">-</button>
          <span class="zoom-value">100%</span>
          <button type="button" class="zoom-in">+</button>
        `;
        cropper.appendChild(zoomControls);
      }

      userPhotoCropper = new Cropper(cropperImage, {
        aspectRatio: 1, // 1:1的比例
        viewMode: 2, // 修改为限制裁剪框不超出画布
        guides: true,
        center: true,
        highlight: false,
        cropBoxResizable: true,
        dragMode: 'move',
        toggleDragModeOnDblclick: false,
        minContainerWidth: 300,
        minContainerHeight: 300,
        minCropBoxWidth: 100,
        minCropBoxHeight: 100,
        responsive: true,
        zoomOnWheel: true,
        zoomOnTouch: true,
        autoCropArea: 0.8, // 自动裁剪区域大小设为容器的80%
        checkOrientation: true, // 自动根据EXIF信息调整图片方向
        checkCrossOrigin: false,
        rotatable: true,
        scalable: true, 
        ready: function() {
          // 初始缩放，使图片适合显示
          this.cropper.zoomTo(0.5);
          
          // 获取图片信息
          const imageData = this.cropper.getImageData();
          console.log('初始化图片信息:', imageData);
          
          // 如果图片有旋转，自动处理
          if (imageData.rotate) {
            console.log('检测到图片有旋转:', imageData.rotate);
          }
        },
        zoom: function() {
          // 监听缩放事件并更新缩放值显示
          updateZoomValue();
        }
      });
      
      // 绑定缩放控制按钮事件
      const zoomInBtn = zoomControls.querySelector('.zoom-in');
      const zoomOutBtn = zoomControls.querySelector('.zoom-out');
      const zoomValue = zoomControls.querySelector('.zoom-value');
      
      zoomInBtn.addEventListener('click', function() {
        userPhotoCropper.zoom(0.1);
        updateZoomValue();
      });
      
      zoomOutBtn.addEventListener('click', function() {
        userPhotoCropper.zoom(-0.1);
        updateZoomValue();
      });
      
      // 更新缩放值显示
      function updateZoomValue() {
        const imageData = userPhotoCropper.getImageData();
        const percent = Math.round(imageData.width / imageData.naturalWidth * 100);
        zoomValue.textContent = `${percent}%`;
      }
      
      // 初始更新缩放值
      setTimeout(updateZoomValue, 100);
    };
  });
  
  // 全身照文件选择处理
  document.getElementById('userFullPhoto').addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (!file) return;
    
    // 销毁现有的裁剪器
    if (userFullPhotoCropper) {
      userFullPhotoCropper.destroy();
      userFullPhotoCropper = null;
    }
    
    // 显示裁剪区域，隐藏预览
    const preview = document.getElementById('userFullPhotoPreview');
    const cropper = document.getElementById('userFullPhotoCropper');
    const cropperImage = document.getElementById('userFullPhotoCropperImage');
    const cropControls = document.querySelector('#fullPhotoTab .crop-controls');
    
    preview.style.display = 'none';
    cropper.style.display = 'block';
    cropControls.style.display = 'flex';
    
    // 完全替换裁剪控制区域
    cropControls.innerHTML = `
      <div style="display: flex; justify-content: center; width: 100%; margin-top: 15px; background: #f5f5f5; padding: 10px; border-radius: 4px; z-index: 9999;">
        <button id="cropUserFullPhotoBtn" type="button" 
          style="display: inline-block !important; visibility: visible !important; opacity: 1 !important; 
          background-color: #4CAF50 !important; color: white !important; padding: 8px 16px !important; 
          border-radius: 4px !important; margin: 5px !important; cursor: pointer !important; 
          border: 1px solid #ccc !important; font-weight: bold !important; z-index: 9999 !important;">
          确认裁剪
        </button>
        <button id="cancelCropUserFullPhotoBtn" type="button"
          style="display: inline-block !important; visibility: visible !important; opacity: 1 !important; 
          background-color: #f44336 !important; color: white !important; padding: 8px 16px !important; 
          border-radius: 4px !important; margin: 5px !important; cursor: pointer !important; 
          border: 1px solid #ccc !important; font-weight: bold !important; z-index: 9999 !important;">
          取消
        </button>
      </div>
    `;
    
    // 重新绑定裁剪按钮事件
    document.getElementById('cropUserFullPhotoBtn').addEventListener('click', cropUserFullPhoto);
    document.getElementById('cancelCropUserFullPhotoBtn').addEventListener('click', cancelCropUserFullPhoto);
    
    // 创建图片URL
    const url = URL.createObjectURL(file);
    cropperImage.src = url;
    
    // 等待图片加载完成后初始化裁剪器
    cropperImage.onload = function() {
      // 添加缩放控制元素
      let zoomControls = cropper.querySelector('.zoom-controls');
      if (!zoomControls) {
        zoomControls = document.createElement('div');
        zoomControls.className = 'zoom-controls';
        zoomControls.innerHTML = `
          <button type="button" class="zoom-out">-</button>
          <span class="zoom-value">100%</span>
          <button type="button" class="zoom-in">+</button>
        `;
        cropper.appendChild(zoomControls);
      }

      userFullPhotoCropper = new Cropper(cropperImage, {
        aspectRatio: 2/3, // 2:3的比例
        viewMode: 2, // 修改为限制裁剪框不超出画布
        guides: true,
        center: true,
        highlight: false,
        cropBoxResizable: true,
        dragMode: 'move',
        toggleDragModeOnDblclick: false,
        minContainerWidth: 300,
        minContainerHeight: 450,
        minCropBoxWidth: 100,
        minCropBoxHeight: 150,
        responsive: true,
        zoomOnWheel: true,
        zoomOnTouch: true,
        autoCropArea: 0.8, // 自动裁剪区域大小设为容器的80%
        checkOrientation: true, // 自动根据EXIF信息调整图片方向
        checkCrossOrigin: false,
        rotatable: true,
        scalable: true,
        ready: function() {
          // 初始缩放，使图片适合显示
          this.cropper.zoomTo(0.5);
          
          // 获取图片信息
          const imageData = this.cropper.getImageData();
          console.log('全身照初始化图片信息:', imageData);
          
          // 如果图片有旋转，自动处理
          if (imageData.rotate) {
            console.log('检测到全身照有旋转:', imageData.rotate);
          }
        },
        zoom: function() {
          // 监听缩放事件并更新缩放值显示
          updateZoomValue();
        }
      });
      
      // 绑定缩放控制按钮事件
      const zoomInBtn = zoomControls.querySelector('.zoom-in');
      const zoomOutBtn = zoomControls.querySelector('.zoom-out');
      const zoomValue = zoomControls.querySelector('.zoom-value');
      
      zoomInBtn.addEventListener('click', function() {
        userFullPhotoCropper.zoom(0.1);
        updateZoomValue();
      });
      
      zoomOutBtn.addEventListener('click', function() {
        userFullPhotoCropper.zoom(-0.1);
        updateZoomValue();
      });
      
      // 更新缩放值显示
      function updateZoomValue() {
        const imageData = userFullPhotoCropper.getImageData();
        const percent = Math.round(imageData.width / imageData.naturalWidth * 100);
        zoomValue.textContent = `${percent}%`;
      }
      
      // 初始更新缩放值
      setTimeout(updateZoomValue, 100);
    };
  });
  
  // 封装裁剪半身照函数（用于事件绑定）
  function cropUserPhoto() {
    if (!userPhotoCropper) return;
    
    try {
      // 获取图片自然尺寸和当前尺寸
      const imageData = userPhotoCropper.getImageData();
      console.log('图片数据:', imageData);
      
      // 获取画布数据
      const canvasData = userPhotoCropper.getCanvasData();
      console.log('画布数据:', canvasData);
      
      // 获取裁剪框数据
      const cropBoxData = userPhotoCropper.getCropBoxData();
      console.log('裁剪框数据:', cropBoxData);
      
      // 处理旋转角度
      const rotation = userPhotoCropper.getData().rotate || 0;
      console.log('旋转角度:', rotation);
      
      // 不依赖rotateTo，直接使用getCroppedCanvas处理旋转
      const canvas = userPhotoCropper.getCroppedCanvas({
        width: 300,
        height: 300,
        minWidth: 256,
        minHeight: 256,
        maxWidth: 4096,
        maxHeight: 4096,
        fillColor: '#fff',
        imageSmoothingEnabled: true,
        imageSmoothingQuality: 'high',
      });
      
      // 将裁剪后的canvas直接显示在预览区域
      const preview = document.getElementById('userPhotoPreview');
      preview.innerHTML = '';
      preview.appendChild(canvas);
      
      // 隐藏裁剪区域，显示预览
      document.getElementById('userPhotoCropper').style.display = 'none';
      document.querySelector('#halfPhotoTab .crop-controls').style.display = 'none';
      preview.style.display = 'block';
      
      // 这里不再设置photoCropData，因为我们将直接使用canvas数据
    } catch (error) {
      console.error('裁剪照片时出错:', error);
      showMessage('裁剪照片时出错: ' + error.message, 'error');
    }
  }
  
  // 封装取消裁剪半身照函数（用于事件绑定）
  function cancelCropUserPhoto() {
    if (userPhotoCropper) {
      userPhotoCropper.destroy();
      userPhotoCropper = null;
    }
    
    // 重置文件输入框
    document.getElementById('userPhoto').value = '';
    
    // 隐藏裁剪区域，显示空预览
    document.getElementById('userPhotoCropper').style.display = 'none';
    document.querySelector('#halfPhotoTab .crop-controls').style.display = 'none';
    
    const preview = document.getElementById('userPhotoPreview');
    preview.innerHTML = `
      <div class="image-preview-empty">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
          <circle cx="8.5" cy="8.5" r="1.5"></circle>
          <polyline points="21 15 16 10 5 21"></polyline>
        </svg>
        <p>请选择半身照片</p>
      </div>
    `;
    preview.style.display = 'flex';
  }
  
  // 封装裁剪全身照函数（用于事件绑定）
  function cropUserFullPhoto() {
    if (!userFullPhotoCropper) return;
    
    try {
      // 获取图片自然尺寸和当前尺寸
      const imageData = userFullPhotoCropper.getImageData();
      console.log('全身照图片数据:', imageData);
      
      // 获取画布数据
      const canvasData = userFullPhotoCropper.getCanvasData();
      console.log('全身照画布数据:', canvasData);
      
      // 获取裁剪框数据
      const cropBoxData = userFullPhotoCropper.getCropBoxData();
      console.log('全身照裁剪框数据:', cropBoxData);
      
      // 处理旋转角度
      const rotation = userFullPhotoCropper.getData().rotate || 0;
      console.log('全身照旋转角度:', rotation);
      
      // 不依赖rotateTo，直接使用getCroppedCanvas处理旋转
      const canvas = userFullPhotoCropper.getCroppedCanvas({
        width: 400,
        height: 600,
        minWidth: 256,
        minHeight: 384,
        maxWidth: 4096,
        maxHeight: 6144,
        fillColor: '#fff',
        imageSmoothingEnabled: true,
        imageSmoothingQuality: 'high',
      });
      
      // 将裁剪后的canvas直接显示在预览区域
      const preview = document.getElementById('userFullPhotoPreview');
      preview.innerHTML = '';
      preview.appendChild(canvas);
      
      // 隐藏裁剪区域，显示预览
      document.getElementById('userFullPhotoCropper').style.display = 'none';
      document.querySelector('#fullPhotoTab .crop-controls').style.display = 'none';
      preview.style.display = 'block';
      
      // 这里不再设置fullPhotoCropData，因为我们将直接使用canvas数据
    } catch (error) {
      console.error('裁剪全身照时出错:', error);
      showMessage('裁剪全身照时出错: ' + error.message, 'error');
    }
  }
  
  // 封装取消裁剪全身照函数（用于事件绑定）
  function cancelCropUserFullPhoto() {
    if (userFullPhotoCropper) {
      userFullPhotoCropper.destroy();
      userFullPhotoCropper = null;
    }
    
    // 重置文件输入框
    document.getElementById('userFullPhoto').value = '';
    
    // 隐藏裁剪区域，显示空预览
    document.getElementById('userFullPhotoCropper').style.display = 'none';
    document.querySelector('#fullPhotoTab .crop-controls').style.display = 'none';
    
    const preview = document.getElementById('userFullPhotoPreview');
    preview.innerHTML = `
      <div class="image-preview-empty">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
          <circle cx="8.5" cy="8.5" r="1.5"></circle>
          <polyline points="21 15 16 10 5 21"></polyline>
        </svg>
        <p>请选择全身照片</p>
      </div>
    `;
    preview.style.display = 'flex';
  }
  
  // 关闭模态框
  function closeEditUserModal() {
    stopEditUserMusicPreview();

    // 销毁裁剪器
    if (userPhotoCropper) {
      userPhotoCropper.destroy();
      userPhotoCropper = null;
    }
    if (userFullPhotoCropper) {
      userFullPhotoCropper.destroy();
      userFullPhotoCropper = null;
    }
    
    // 隐藏裁剪区域
    document.getElementById('userPhotoCropper').style.display = 'none';
    document.getElementById('userFullPhotoCropper').style.display = 'none';
    document.querySelector('#halfPhotoTab .crop-controls').style.display = 'none';
    document.querySelector('#fullPhotoTab .crop-controls').style.display = 'none';
    
    // 重置变量
    // 注意：不要重置currentUserId，以确保照片上传API能正确使用用户ID
    photoCropData = null;
    fullPhotoCropData = null;
    
    // 隐藏模态框
    document.getElementById('editUserModal').style.display = 'none';

    try {
      const loginPassword = document.getElementById('editLoginPassword');
      if (loginPassword) loginPassword.value = '';
    } catch (e) {}

    setSelectedMusicValidity(true);
  }
  
  // 关闭按钮
  document.querySelector('#editUserModal .close').addEventListener('click', closeEditUserModal);
  
  // 取消按钮
  document.getElementById('cancelEditUserBtn').addEventListener('click', closeEditUserModal);
  
  // 点击模态框外部关闭
  document.getElementById('editUserModal').addEventListener('click', function(e) {
    if (e.target === this) {
      closeEditUserModal();
    }
  });
  
  // 保存按钮
  document.getElementById('saveUserBtn').addEventListener('click', function() {
    // 立即停止预览音频，避免保存/关闭过程中仍在播放
    stopEditUserMusicPreview();

    const username = document.getElementById('editUsername').value.trim();
    const userPosition = document.getElementById('editUserPosition').value.trim();
    const musicId = document.getElementById('editUserMusic').value;
    const loginUsernameInput = document.getElementById('editLoginUsername');
    const loginPasswordInput = document.getElementById('editLoginPassword');
    const loginUsername = loginUsernameInput ? loginUsernameInput.value.trim() : '';
    const loginPassword = loginPasswordInput ? String(loginPasswordInput.value || '') : '';
    const select = document.getElementById('editUserMusic');

    if (!username || !userPosition) {
      showMessage('请填写用户名称和职位', 'error');
      return;
    }

    if (select && select.dataset.musicValid === 'false') {
      showMessage('当前选择的音乐文件不可用，请更换后再保存', 'error');
      return;
    }

    const btn = this;

    const uploadPhotos = (formData) => {
      return fetch(`/api/users/${currentUserId}/photo`, {
        method: 'POST',
        body: formData
      }).then(r => r.json());
    };

    const doSave = () => {
      btn.disabled = true;

      fetch(`/api/users/update/${currentUserId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: username,
          position: userPosition,
          musicId: musicId,
          loginUsername: loginUsername,
          loginPassword: loginPassword
        })
      })
      .then(response => response.json())
      .then(data => {
        if (!data || !data.success) {
          showMessage((data && data.message) || '更新失败', 'error');
          return;
        }

        try {
          if (loginPasswordInput) loginPasswordInput.value = '';
        } catch (e) {}

        const photoInput = document.getElementById('userPhoto');
        const fullPhotoInput = document.getElementById('userFullPhoto');
        const photoCanvas = document.getElementById('userPhotoPreview').querySelector('canvas');
        const fullPhotoCanvas = document.getElementById('userFullPhotoPreview').querySelector('canvas');

        const needsUpload =
          (photoInput && photoInput.files && photoInput.files.length > 0) ||
          (fullPhotoInput && fullPhotoInput.files && fullPhotoInput.files.length > 0) ||
          !!photoCanvas ||
          !!fullPhotoCanvas;

        const afterAll = () => {
          closeEditUserModal();
          if (typeof window.loadUsers === 'function') {
            window.loadUsers();
          }
          showMessage('用户信息更新成功');
        };

        if (!needsUpload) {
          afterAll();
          return;
        }

        if (!currentUserId) {
          showMessage('用户ID无效，无法上传照片', 'error');
          return;
        }

        const formData = new FormData();
        const tasks = [];

        if (photoCanvas) {
          tasks.push(new Promise((resolve, reject) => {
            photoCanvas.toBlob(blob => {
              if (!blob) return reject(new Error('创建半身照Blob对象失败'));
              formData.append('userPhoto', blob, 'cropped-user-photo.jpg');
              resolve();
            }, 'image/jpeg', 0.95);
          }));
        } else if (photoInput && photoInput.files && photoInput.files.length > 0) {
          formData.append('userPhoto', photoInput.files[0]);
        }

        if (fullPhotoCanvas) {
          tasks.push(new Promise((resolve, reject) => {
            fullPhotoCanvas.toBlob(blob => {
              if (!blob) return reject(new Error('创建全身照Blob对象失败'));
              formData.append('userFullPhoto', blob, 'cropped-user-full-photo.jpg');
              resolve();
            }, 'image/jpeg', 0.95);
          }));
        } else if (fullPhotoInput && fullPhotoInput.files && fullPhotoInput.files.length > 0) {
          formData.append('userFullPhoto', fullPhotoInput.files[0]);
        }

        Promise.all(tasks)
          .then(() => uploadPhotos(formData))
          .then(photoData => {
            if (!photoData || !photoData.success) {
              throw new Error((photoData && photoData.message) || '处理照片失败');
            }
            afterAll();
          })
          .catch(err => {
            console.error('照片上传失败:', err);
            showMessage('照片上传失败: ' + (err && err.message ? err.message : '未知错误'), 'error');
          });
      })
      .catch(error => {
        console.error('保存用户信息失败:', error);
        showMessage('保存用户信息失败: ' + (error && error.message ? error.message : '未知错误'), 'error');
      })
      .finally(() => {
        btn.disabled = false;
      });
    };

    if (musicId && selectedMusicMeta && selectedMusicMeta.src) {
      btn.disabled = true;
      fetch(selectedMusicMeta.src, { method: 'HEAD', cache: 'no-cache' })
        .then(res => {
          if (!res || !res.ok) {
            if (select) select.dataset.musicValid = 'false';
            showMessage('当前选择的音乐文件已丢失/无法访问，请更换后再保存', 'error');
            return;
          }
          if (select) select.dataset.musicValid = 'true';
          doSave();
        })
        .catch(err => {
          console.error('校验音乐文件失败:', err);
          showMessage('校验音乐文件失败，请更换音乐或稍后再试', 'error');
        })
        .finally(() => {
          btn.disabled = false;
        });
      return;
    }

    doSave();
  });
}

/**
 * 打开用户编辑模态框
 * @param {string} userId - 用户ID
 * @param {string} userName - 用户名称
 * @param {string} userPosition - 用户职位
 * @param {string} photoUrl - 用户照片URL（可选）
 * @param {string} fullPhotoUrl - 用户全身照URL（可选）
 */
function openEditUserModal(userId, userName, userPosition, photoUrl, fullPhotoUrl) {
  // 设置当前用户ID
  currentUserId = userId;
  
  // 添加调试日志
  console.log('打开用户编辑模态框:', {
    userId: userId,
    currentUserId: currentUserId,
    userName: userName,
    userPosition: userPosition
  });
  
  if (!userId) {
    console.error('打开用户编辑模态框失败: 用户ID为空');
    showMessage('用户ID无效', 'error');
    return;
  }
  
  // 填充用户信息
  document.getElementById('editUsername').value = userName;
  document.getElementById('editUserPosition').value = userPosition;

  try {
    const loginUsername = document.getElementById('editLoginUsername');
    if (loginUsername) loginUsername.value = '';
    const loginPassword = document.getElementById('editLoginPassword');
    if (loginPassword) loginPassword.value = '';
  } catch (e) {}
  
  // 重置照片预览
  const photoPreview = document.getElementById('userPhotoPreview');
  const fullPhotoPreview = document.getElementById('userFullPhotoPreview');
  
  // 重置音乐选择和预览
  document.getElementById('editUserMusic').innerHTML = '<option value="">请选择音乐</option>';
  const dropdown = document.querySelector('.editUser-select-dropdown');
  dropdown.innerHTML = '<div class="custom-select-option" data-value="" style="padding: 12px 16px; cursor: pointer; transition: background-color 0.2s;">请选择音乐</div>';
  document.getElementById('editUserMusicInput').value = '';
  document.getElementById('editUserMusicPreview').style.display = 'none';

  const editUserMusicSelect = document.getElementById('editUserMusic');
  if (editUserMusicSelect) {
    editUserMusicSelect.dataset.musicValid = 'true';
  }
  const saveUserBtn = document.getElementById('saveUserBtn');
  if (saveUserBtn) {
    saveUserBtn.disabled = false;
  }

  try {
    if (typeof window.stopAllAudio === 'function') {
      window.stopAllAudio();
    }
    const audio = document.getElementById('editUserMusicAudio');
    if (audio) {
      const source = audio.querySelector('source');
      if (source) source.src = '';
      audio.removeAttribute('src');
      audio.load();
    }
    const playerRoot = document.querySelector('#editUserMusicPreview [data-audio-player="editUserMusic"]');
    if (playerRoot && playerRoot.__playerBinding && typeof playerRoot.__playerBinding.resetUI === 'function') {
      playerRoot.__playerBinding.resetUI();
    }
  } catch (e) {}
  
  // 加载该用户当前的音乐配置
  fetch(`/api/users/${userId}`)
    .then(response => response.json())
    .then(userData => {
      try {
        const loginUsername = document.getElementById('editLoginUsername');
        if (loginUsername) loginUsername.value = (userData && userData.user && userData.user.loginUsername) ? String(userData.user.loginUsername) : '';
      } catch (e) {}

      // 加载所有音乐列表
      return (window.getCachedMusicList ? window.getCachedMusicList() : fetch('/api/music').then(r => r.json()).then(d => d.music || []))
        .then(musicList => {
          return { user: userData.user, music: musicList };
        });
    })
    .then(data => {
      const musicSelect = document.getElementById('editUserMusic');
      const dropdown = document.querySelector('.editUser-select-dropdown');
      
      // 分别处理音乐和音效
      const musicFiles = data.music.filter(music => !music.isSound);
      
      if (musicFiles.length > 0) {
        const musicOptgroup = document.createElement('optgroup');
        musicOptgroup.label = '音乐';
        
        musicFiles.forEach(music => {
          // 添加到隐藏的select
          const option = document.createElement('option');
          option.value = music.id;
          option.textContent = music.name;
          if (music.lrcFilename) {
            option.setAttribute('data-has-lrc', 'true');
          }
          musicOptgroup.appendChild(option);
          
          // 添加到自定义下拉框
          const dropdownOption = document.createElement('div');
          dropdownOption.className = 'custom-select-option';
          dropdownOption.setAttribute('data-value', music.id);
          dropdownOption.style.padding = '12px 16px';
          dropdownOption.style.cursor = 'pointer';
          dropdownOption.style.transition = 'background-color 0.2s';
          dropdownOption.style.display = 'flex';
          dropdownOption.style.alignItems = 'center';
          dropdownOption.style.justifyContent = 'space-between';
          
          // 音乐名称
          dropdownOption.textContent = music.name;
          
          // 如果有歌词，添加标签
          if (music.lrcFilename) {
            const lrcTag = document.createElement('span');
            lrcTag.style.backgroundColor = '#ff9500';
            lrcTag.style.color = 'white';
            lrcTag.style.padding = '2px 8px';
            lrcTag.style.borderRadius = '12px';
            lrcTag.style.fontSize = '12px';
            lrcTag.style.marginLeft = '8px';
            lrcTag.textContent = '歌词';
            dropdownOption.appendChild(lrcTag);
          }
          
          dropdown.appendChild(dropdownOption);
        });
        
        musicSelect.appendChild(musicOptgroup);
      }
      
      // 设置当前选中的音乐
      if (data.user && data.user.musicId) {
        musicSelect.value = data.user.musicId;
        
        // 触发change事件，显示预览
        const event = new Event('change');
        musicSelect.dispatchEvent(event);
      }
    })
    .catch(error => {
      console.error('加载用户和音乐数据失败:', error);
      showMessage('加载数据失败，请重试', 'error');
    });
  
  // 显示半身照预览（如果有）
  if (photoUrl) {
    photoPreview.innerHTML = `<img src="${window.escapeHtml ? window.escapeHtml(photoUrl) : photoUrl}" alt="用户照片">`;
  } else {
    photoPreview.innerHTML = `
      <div class="image-preview-empty">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
          <circle cx="8.5" cy="8.5" r="1.5"></circle>
          <polyline points="21 15 16 10 5 21"></polyline>
        </svg>
        <p>请选择半身照片</p>
      </div>
    `;
  }
  
  // 显示全身照预览（如果有）
  if (fullPhotoUrl) {
    fullPhotoPreview.innerHTML = `<img src="${window.escapeHtml ? window.escapeHtml(fullPhotoUrl) : fullPhotoUrl}" alt="用户全身照">`;
  } else {
    fullPhotoPreview.innerHTML = `
      <div class="image-preview-empty">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
          <circle cx="8.5" cy="8.5" r="1.5"></circle>
          <polyline points="21 15 16 10 5 21"></polyline>
        </svg>
        <p>请选择全身照片</p>
      </div>
    `;
  }
  
  // 重置输入框和裁剪区域
  document.getElementById('userPhoto').value = '';
  document.getElementById('userFullPhoto').value = '';
  document.getElementById('userPhotoCropper').style.display = 'none';
  document.getElementById('userFullPhotoCropper').style.display = 'none';
  document.querySelector('#halfPhotoTab .crop-controls').style.display = 'none';
  document.querySelector('#fullPhotoTab .crop-controls').style.display = 'none';
  
  // 激活半身照标签页
  document.querySelectorAll('.form-tab').forEach(tab => tab.classList.remove('active'));
  document.querySelectorAll('.photo-tab-content').forEach(content => content.classList.remove('active'));
  document.querySelector('.form-tab[data-tab="halfPhoto"]').classList.add('active');
  document.getElementById('halfPhotoTab').classList.add('active');
  
  // 显示模态框
  document.getElementById('editUserModal').style.display = 'flex';
}

if (!window.AdminModals) {
  window.AdminModals = {};
}

window.AdminModals.initMusicConfigModals = function initMusicConfigModals() {
  if (window.AdminModals.__musicConfigModalsInited) {
    return;
  }
  window.AdminModals.__musicConfigModalsInited = true;

  const openDefaultBtn = document.getElementById('openDefaultBattleSongModalBtn');
  const openInquiryBtn = document.getElementById('openInquirySoundConfigModalBtn');
  const openTtsBtn = document.getElementById('openTtsSettingsModalBtn');

  function openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (!modal) return;
    modal.style.display = 'flex';
    try { document.body.style.overflow = 'hidden'; } catch (e) {}
    const firstInput = modal.querySelector('input, textarea, select, button');
    if (firstInput && typeof firstInput.focus === 'function') {
      try { firstInput.focus(); } catch (e) {}
    }
  }

  function onCloseCommon() {
    try { document.body.style.overflow = ''; } catch (e) {}
    try {
      if (typeof window.stopAllAudio === 'function') {
        window.stopAllAudio();
      }
    } catch (e) {}
  }

  if (openDefaultBtn) {
    openDefaultBtn.addEventListener('click', function () {
      openModal('defaultBattleSongModal');
    });
  }
  if (openInquiryBtn) {
    openInquiryBtn.addEventListener('click', function () {
      openModal('inquirySoundConfigModal');
    });
  }
  if (openTtsBtn) {
    openTtsBtn.addEventListener('click', function () {
      openModal('ttsSettingsModal');
    });
  }

  if (window.ModalCore && typeof window.ModalCore.bindModalClose === 'function') {
    window.ModalCore.bindModalClose('defaultBattleSongModal', {
      closeSelector: '.close',
      cancelId: 'cancelDefaultBattleSongBtn',
      overlayClose: true,
      escClose: true,
      onClose: function () {
        try {
          const a = document.getElementById('defaultSongAudio');
          if (a && typeof a.pause === 'function') a.pause();
        } catch (e) {}
        onCloseCommon();
      }
    });

    window.ModalCore.bindModalClose('inquirySoundConfigModal', {
      closeSelector: '.close',
      cancelId: 'cancelInquirySoundConfigBtn',
      overlayClose: true,
      escClose: true,
      onClose: onCloseCommon
    });

    window.ModalCore.bindModalClose('ttsSettingsModal', {
      closeSelector: '.close',
      cancelId: 'cancelTtsSettingsBtn',
      overlayClose: true,
      escClose: true,
      onClose: onCloseCommon
    });
  }
};

window.AdminModals.initUploadMusicModals = function initUploadMusicModals() {
  if (window.AdminModals.__uploadMusicModalsInited) {
    return;
  }
  window.AdminModals.__uploadMusicModalsInited = true;

  const uploadMusicModal = document.getElementById('uploadMusicModal');
  const openUploadMusicModalBtn = document.getElementById('openUploadMusicModalBtn');
  const uploadSoundEffectModal = document.getElementById('uploadSoundEffectModal');
  const openUploadSoundEffectModalBtn = document.getElementById('openUploadSoundEffectModalBtn');

  function openModal(modalEl) {
    if (!modalEl) return;
    modalEl.style.display = 'flex';
    try { document.body.style.overflow = 'hidden'; } catch (e) {}
    const firstInput = modalEl.querySelector('input, textarea, select, button');
    if (firstInput && typeof firstInput.focus === 'function') {
      try { firstInput.focus(); } catch (e) {}
    }
  }

  function clearMusicFormLocal() {
    const ids = ['musicFile', 'lrcFile', 'externalMusicId', 'externalMusicSearchQuery', 'lrcEditor', 'musicName', 'musicDescription'];
    ids.forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      try { el.value = ''; } catch (e) {}
    });
    const results = document.getElementById('externalMusicSearchResults');
    if (results) {
      results.style.display = 'none';
      results.innerHTML = '';
    }
    const selected = document.getElementById('externalMusicSelected');
    if (selected) selected.style.display = 'none';
    const selectedTitle = document.getElementById('externalMusicSelectedTitle');
    if (selectedTitle) selectedTitle.textContent = '';
    const selectedSub = document.getElementById('externalMusicSelectedSub');
    if (selectedSub) selectedSub.textContent = '';
    const auditionWrap = document.getElementById('externalMusicAudition');
    if (auditionWrap) auditionWrap.style.display = 'none';
    const progressWrap = document.getElementById('externalMusicImportProgress');
    if (progressWrap) progressWrap.style.display = 'none';
    const progressFill = document.getElementById('externalMusicImportProgressFill');
    if (progressFill) progressFill.style.width = '0%';
    const progressText = document.getElementById('externalMusicImportProgressText');
    if (progressText) progressText.textContent = '准备中...';
    const progressMeta = document.getElementById('externalMusicImportProgressMeta');
    if (progressMeta) progressMeta.textContent = '';
    const lrcPreview = document.getElementById('lrcPreview');
    if (lrcPreview) lrcPreview.style.display = 'none';

    try {
      const auditionAudio = document.getElementById('externalMusicAuditionAudio');
      if (auditionAudio) {
        auditionAudio.pause();
        auditionAudio.currentTime = 0;
        const srcEl = auditionAudio.querySelector('source');
        if (srcEl) srcEl.setAttribute('src', '');
        try { auditionAudio.load(); } catch (e) {}
      }
    } catch (e) {}
  }

  function clearSoundEffectFormLocal() {
    const fileEl = document.getElementById('soundEffectFile');
    const nameEl = document.getElementById('soundEffectName');
    const descEl = document.getElementById('soundEffectDescription');
    if (fileEl) fileEl.value = '';
    if (nameEl) nameEl.value = '';
    if (descEl) descEl.value = '';
  }

  if (openUploadMusicModalBtn && uploadMusicModal) {
    openUploadMusicModalBtn.addEventListener('click', function () {
      openModal(uploadMusicModal);
    });

    if (window.ModalCore && typeof window.ModalCore.bindModalClose === 'function') {
      window.ModalCore.bindModalClose('uploadMusicModal', {
        closeSelector: '.close',
        cancelId: 'cancelUploadMusicBtn',
        overlayClose: true,
        escClose: true,
        onClose: function () {
          try { document.body.style.overflow = ''; } catch (e) {}
          clearMusicFormLocal();
        }
      });
    }
  }

  if (openUploadSoundEffectModalBtn && uploadSoundEffectModal) {
    openUploadSoundEffectModalBtn.addEventListener('click', function () {
      openModal(uploadSoundEffectModal);
    });

    if (window.ModalCore && typeof window.ModalCore.bindModalClose === 'function') {
      window.ModalCore.bindModalClose('uploadSoundEffectModal', {
        closeSelector: '.close',
        cancelId: 'cancelUploadSoundEffectBtn',
        overlayClose: true,
        escClose: true,
        onClose: function () {
          try { document.body.style.overflow = ''; } catch (e) {}
          clearSoundEffectFormLocal();
        }
      });
    }
  }
};

// 确保函数在全局范围内可见
window.initChangePasswordModal = initChangePasswordModal;
window.togglePasswordVisibility = togglePasswordVisibility;
window.initEditUserModal = initEditUserModal;
window.openEditUserModal = openEditUserModal;