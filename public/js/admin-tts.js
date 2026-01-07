/**
 * 阿里云TTS配置相关功能
 */

// 当页面加载完成时执行初始化
document.addEventListener('DOMContentLoaded', function() {
  // 初始化阿里云TTS配置UI
  initAliyunTtsConfig();
});

function syncAccessKeySecretVisibility() {
  const showAccessKeySecret = document.getElementById('showAccessKeySecret');
  const accessKeySecretInput = document.getElementById('aliyunTtsAccessKeySecret');
  if (!showAccessKeySecret || !accessKeySecretInput) return;
  accessKeySecretInput.type = showAccessKeySecret.checked ? 'text' : 'password';
}

/**
 * 初始化阿里云TTS配置功能
 */
function initAliyunTtsConfig() {
  console.log('初始化阿里云TTS配置UI...');
  // 加载当前配置
  loadAliyunTtsConfig();
  
  // 音量滑块事件
  const volumeRange = document.getElementById('aliyunTtsVolumeRange');
  const volumeValue = document.getElementById('aliyunTtsVolumeValue');
  if (volumeRange && volumeValue) {
    volumeRange.addEventListener('input', function() {
      volumeValue.textContent = this.value;
    });
  }
  
  // 语速滑块事件
  const speechRateRange = document.getElementById('aliyunTtsSpeechRateRange');
  const speechRateValue = document.getElementById('aliyunTtsSpeechRateValue');
  if (speechRateRange && speechRateValue) {
    speechRateRange.addEventListener('input', function() {
      speechRateValue.textContent = this.value;
    });
  }
  
  // 音调滑块事件
  const pitchRateRange = document.getElementById('aliyunTtsPitchRateRange');
  const pitchRateValue = document.getElementById('aliyunTtsPitchRateValue');
  if (pitchRateRange && pitchRateValue) {
    pitchRateRange.addEventListener('input', function() {
      pitchRateValue.textContent = this.value;
    });
  }
  
  // 显示/隐藏密钥切换
  const showAccessKeySecret = document.getElementById('showAccessKeySecret');
  const accessKeySecretInput = document.getElementById('aliyunTtsAccessKeySecret');
  if (showAccessKeySecret && accessKeySecretInput) {
    showAccessKeySecret.addEventListener('change', function() {
      if (accessKeySecretInput.value === '******') {
        this.checked = false;
        syncAccessKeySecretVisibility();
        showMessage('出于安全考虑，系统不会返回已保存的AccessKey Secret；如需查看/修改请重新输入。', 'error');
        return;
      }
      syncAccessKeySecretVisibility();
    });
    syncAccessKeySecretVisibility();
  }
  
  // 保存配置按钮事件
  const saveBtn = document.getElementById('saveAliyunTtsBtn');
  if (saveBtn) {
    saveBtn.addEventListener('click', saveAliyunTtsConfig);
  }
  
  // 测试按钮事件
  const testBtn = document.getElementById('testAliyunTtsBtn');
  if (testBtn) {
    testBtn.addEventListener('click', testAliyunTts);
  }
  
  // 测试Token按钮事件
  const testTokenBtn = document.getElementById('testAliyunTokenBtn');
  if (testTokenBtn) {
    testTokenBtn.addEventListener('click', testAliyunToken);
  }
  
  // 清理TTS文件按钮事件
  const cleanupTtsBtn = document.getElementById('cleanupTtsBtn');
  if (cleanupTtsBtn) {
    cleanupTtsBtn.addEventListener('click', cleanupTtsFiles);
  }
  
  console.log('阿里云TTS配置UI初始化完成');
}

/**
 * 加载阿里云TTS配置
 */
function loadAliyunTtsConfig() {
  console.log('获取阿里云TTS配置...');
  
  fetch('/api/aliyun-tts-config')
    .then(response => response.json())
    .then(data => {
      if (data.success && data.config) {
        console.log('加载阿里云TTS配置成功');
        const config = data.config;
        
        // 填充表单
        document.getElementById('aliyunTtsUrl').value = config.url || '';
        document.getElementById('aliyunTtsAccessKeyId').value = config.accessKeyId || '';
        document.getElementById('aliyunTtsAppKey').value = config.appKey || '';
        document.getElementById('aliyunTtsAccessKeySecret').value = config.accessKeySecret || '';
        document.getElementById('aliyunTtsVoice').value = config.voice || 'xiaoyun';
        document.getElementById('aliyunTtsFormat').value = config.format || 'mp3';
        document.getElementById('aliyunTtsSampleRate').value = config.sampleRate || '16000';
        
        // 设置滑块值
        const volumeRange = document.getElementById('aliyunTtsVolumeRange');
        const volumeValue = document.getElementById('aliyunTtsVolumeValue');
        if (volumeRange && volumeValue) {
          volumeRange.value = config.volume || 50;
          volumeValue.textContent = config.volume || 50;
        }
        
        const speechRateRange = document.getElementById('aliyunTtsSpeechRateRange');
        const speechRateValue = document.getElementById('aliyunTtsSpeechRateValue');
        if (speechRateRange && speechRateValue) {
          speechRateRange.value = config.speechRate || 0;
          speechRateValue.textContent = config.speechRate || 0;
        }
        
        const pitchRateRange = document.getElementById('aliyunTtsPitchRateRange');
        const pitchRateValue = document.getElementById('aliyunTtsPitchRateValue');
        if (pitchRateRange && pitchRateValue) {
          pitchRateRange.value = config.pitchRate || 0;
          pitchRateValue.textContent = config.pitchRate || 0;
        }

        const showAccessKeySecret = document.getElementById('showAccessKeySecret');
        if (showAccessKeySecret) {
          showAccessKeySecret.checked = false;
        }
        syncAccessKeySecretVisibility();
      } else {
        console.error('获取阿里云TTS配置失败:', data.message);
        showMessage('获取阿里云TTS配置失败', 'error');
      }
    })
    .catch(error => {
      console.error('获取阿里云TTS配置时发生错误:', error);
      showMessage('获取阿里云TTS配置失败', 'error');
    });
}

/**
 * 保存阿里云TTS配置
 */
function saveAliyunTtsConfig() {
  console.log('准备保存阿里云TTS配置...');
  const url = document.getElementById('aliyunTtsUrl').value;
  const accessKeyId = document.getElementById('aliyunTtsAccessKeyId').value;
  const appKey = document.getElementById('aliyunTtsAppKey').value;
  const accessKeySecret = document.getElementById('aliyunTtsAccessKeySecret').value;
  const voice = document.getElementById('aliyunTtsVoice').value;
  const format = document.getElementById('aliyunTtsFormat').value;
  const sampleRate = document.getElementById('aliyunTtsSampleRate').value;
  const volume = document.getElementById('aliyunTtsVolumeRange').value;
  const speechRate = document.getElementById('aliyunTtsSpeechRateRange').value;
  const pitchRate = document.getElementById('aliyunTtsPitchRateRange').value;
  
  if (!url || !accessKeyId || !appKey) {
    console.error('缺少必要参数: url、accessKeyId或appKey为空');
    showMessage('请填写服务地址、AccessKey ID和AppKey', 'error');
    return;
  }
  
  // 构建请求数据
  const data = {
    url,
    accessKeyId,
    appKey,
    voice,
    format,
    sampleRate,
    volume,
    speechRate,
    pitchRate
  };
  
  // 如果密钥字段有值并且不是占位符，添加到请求中
  if (accessKeySecret && accessKeySecret !== '******') {
    data.accessKeySecret = accessKeySecret;
    console.log('检测到新的AccessKey Secret，将更新配置');
  } else {
    console.log('未检测到新的AccessKey Secret，将保持原配置');
  }
  
  console.log('发送阿里云TTS配置数据:', JSON.stringify({...data, accessKeySecret: accessKeySecret ? '******' : '' }));
  
  fetch('/api/aliyun-tts-config', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(data)
  })
    .then(response => response.json())
    .then(result => {
      if (result.success) {
        console.log('阿里云TTS配置保存成功:', result);
        showMessage('阿里云TTS配置已保存', 'success');
      } else {
        console.error('保存阿里云TTS配置失败:', result.message);
        showMessage(result.message || '保存阿里云TTS配置失败', 'error');
      }
    })
    .catch(error => {
      console.error('保存阿里云TTS配置时发生错误:', error);
      showMessage('保存阿里云TTS配置失败', 'error');
    });
}

/**
 * 测试阿里云TTS功能
 */
function testAliyunTts() {
  console.log('开始测试阿里云TTS功能...');
  const testText = document.getElementById('aliyunTtsTestText').value;
  
  if (!testText) {
    console.error('测试文本为空');
    showMessage('请输入测试文本', 'error');
    return;
  }
  
  console.log(`测试文本: "${testText}"`);
  
  // 先保存当前配置
  console.log('保存当前TTS配置...');
  saveAliyunTtsConfig();
  
  // 显示加载状态
  const testBtn = document.getElementById('testAliyunTtsBtn');
  if (testBtn) {
    const originalText = testBtn.textContent;
    testBtn.textContent = '生成中...';
    testBtn.disabled = true;
    
    console.log('发送文本到TTS接口...');
    // 发送文本到TTS接口
    fetch('/api/text-to-speech', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ text: testText })
    })
      .then(response => {
        console.log('收到TTS接口响应，状态码:', response.status);
        return response.json();
      })
      .then(data => {
        // 恢复按钮状态
        testBtn.textContent = originalText;
        testBtn.disabled = false;
        
        if (data.success) {
          console.log('TTS生成成功，音频路径:', data.audioPath);
          const testResult = document.getElementById('aliyunTtsTestResult');
          const testAudio = document.getElementById('aliyunTtsTestAudio');
          
          if (testResult && testAudio) {
            testResult.style.display = 'block';
            
            const audioSource = testAudio.querySelector('source');
            if (audioSource) {
              audioSource.src = data.audioPath;
              testAudio.load();
              
              // 监听音频加载和错误事件
              testAudio.onloadeddata = () => {
                console.log('音频加载成功，准备播放');
              };
              
              testAudio.onerror = (e) => {
                console.error('音频加载失败:', e);
                showMessage('音频加载失败，请检查生成的文件', 'error');
              };
              
              testAudio.play().catch(err => {
                console.error('播放音频失败:', err);
                showMessage('播放音频失败: ' + err.message, 'error');
              });
            }
          }
          
          showMessage('语音生成成功', 'success');
        } else {
          console.error('TTS生成失败:', data.message, data.error);
          let errorMsg = data.message || '语音生成失败';
          if (data.error) {
            errorMsg += ': ' + data.error;
          }
          showMessage(errorMsg, 'error');
        }
      })
      .catch(error => {
        // 恢复按钮状态
        testBtn.textContent = originalText;
        testBtn.disabled = false;
        
        console.error('测试阿里云TTS出现异常:', error);
        showMessage('测试阿里云TTS失败: ' + (error.message || '未知错误'), 'error');
      });
  }
}

/**
 * 测试阿里云Token获取
 */
function testAliyunToken() {
  console.log('测试阿里云Token获取...');
  
  // 先保存当前配置
  saveAliyunTtsConfig();
  
  // 显示加载状态
  const testTokenBtn = document.getElementById('testAliyunTokenBtn');
  if (!testTokenBtn) return;
  
  const originalText = testTokenBtn.textContent;
  testTokenBtn.textContent = '获取中...';
  testTokenBtn.disabled = true;
  
  // 清空之前的结果
  const tokenResultElem = document.getElementById('aliyunTokenTestResult');
  if (tokenResultElem) {
    tokenResultElem.style.display = 'none';
    tokenResultElem.innerHTML = '';
  }
  
  // 发送请求测试Token获取
  fetch('/api/test-aliyun-tts', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    }
  })
    .then(response => {
      console.log('收到Token测试响应，状态码:', response.status);
      return response.json();
    })
    .then(data => {
      // 恢复按钮状态
      testTokenBtn.textContent = originalText;
      testTokenBtn.disabled = false;
      
      if (data.success) {
        console.log('Token获取成功:', data);
        const expireDate = new Date(data.token.expireTime);
        const expireDateStr = expireDate.toLocaleString();
        
        if (tokenResultElem) {
          tokenResultElem.style.display = 'block';
          tokenResultElem.innerHTML = `
            <div class="token-result success">
              <h4>Token获取成功</h4>
              <p><strong>Token:</strong> <span class="token-value">${data.token.id.substring(0, 15)}...${data.token.id.substring(data.token.id.length - 10)}</span></p>
              <p><strong>过期时间:</strong> ${expireDateStr}</p>
            </div>
          `;
        }
        
        showMessage('Token获取成功，请查看详细信息', 'success');
      } else {
        console.error('Token获取失败:', data);
        let errorMessage = data.message || '获取Token失败';
        if (data.error) {
          errorMessage += ': ' + data.error;
        }
        
        if (tokenResultElem) {
          tokenResultElem.style.display = 'block';
          tokenResultElem.innerHTML = `
            <div class="token-result error">
              <h4>Token获取失败</h4>
              <p><strong>错误:</strong> ${errorMessage}</p>
              ${data.apiResponse ? `<p><strong>API响应:</strong> <pre>${JSON.stringify(data.apiResponse, null, 2)}</pre></p>` : ''}
            </div>
          `;
        }
        
        showMessage(errorMessage, 'error');
      }
    })
    .catch(error => {
      // 恢复按钮状态
      testTokenBtn.textContent = originalText;
      testTokenBtn.disabled = false;
      
      console.error('测试Token获取出现异常:', error);
      
      if (tokenResultElem) {
        tokenResultElem.style.display = 'block';
        tokenResultElem.innerHTML = `
          <div class="token-result error">
            <h4>Token测试出错</h4>
            <p><strong>错误:</strong> ${error.message || '未知错误'}</p>
          </div>
        `;
      }
      
      showMessage('测试Token获取失败: ' + (error.message || '未知错误'), 'error');
    });
}

/**
 * 清理TTS文件
 */
function cleanupTtsFiles() {
  console.log('开始执行TTS文件清理...');
  
  // 创建自定义对话框
  const days = prompt('请输入要保留的TTS文件天数 (1-30)，输入0将清理所有TTS文件:', '7');
  
  // 如果用户取消了对话框，直接返回
  if (days === null) {
    console.log('用户取消了TTS文件清理');
    return;
  }
  
  // 解析用户输入的天数
  const maxAgeInDays = parseInt(days);
  
  // 验证输入是否有效
  if (isNaN(maxAgeInDays) || maxAgeInDays < 0 || maxAgeInDays > 30) {
    alert('请输入有效的天数 (0-30)');
    return;
  }
  
  // 对于清理全部文件，再次确认
  let confirmMessage = '';
  if (maxAgeInDays === 0) {
    confirmMessage = '警告：您选择了清理所有TTS文件！\n\n这将删除TTS文件夹中的所有音频文件，且操作不可恢复。\n确定要继续吗？';
  } else {
    confirmMessage = `确定要清理旧的TTS文件吗？\n\n这将删除生成时间超过${maxAgeInDays}天的所有TTS音频文件。\n此操作不可恢复，请谨慎操作！`;
  }
  
  // 显示确认对话框
  if (!confirm(confirmMessage)) {
    console.log('用户取消了TTS文件清理');
    return;
  }
  
  const cleanupBtn = document.getElementById('cleanupTtsBtn');
  if (cleanupBtn) {
    const originalText = cleanupBtn.textContent;
    cleanupBtn.textContent = '清理中...';
    cleanupBtn.disabled = true;
    
    fetch('/api/cleanup-tts-files', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ maxAgeInDays: maxAgeInDays }) // 使用用户指定的天数
    })
      .then(response => {
        // 检查HTTP状态码
        if (!response.ok) {
          // 如果是401或404，可能是未登录或会话过期
          if (response.status === 401 || response.status === 404) {
            throw new Error('会话可能已过期，请刷新页面重新登录');
          }
          throw new Error('服务器返回错误: ' + response.status);
        }
        return response.json();
      })
      .then(data => {
        cleanupBtn.textContent = originalText;
        cleanupBtn.disabled = false;
        
        if (data.success) {
          console.log('TTS文件清理成功:', data);
          let successMsg = maxAgeInDays === 0 ? 
            'TTS文件清理任务已执行，所有文件将被清理' : 
            `TTS文件清理任务已执行，将保留最近${maxAgeInDays}天的文件`;
          showMessage(successMsg, 'success');
        } else {
          console.error('TTS文件清理失败:', data.message);
          showMessage(data.message || 'TTS文件清理失败', 'error');
        }
      })
      .catch(error => {
        cleanupBtn.textContent = originalText;
        cleanupBtn.disabled = false;
        
        console.error('TTS文件清理请求失败:', error);
        
        // 对于特定错误给出更明确的提示
        if (error.message.includes('会话')) {
          showMessage('会话已过期，请刷新页面后重试', 'error');
          setTimeout(() => {
            window.location.reload();
          }, 2000); // 2秒后自动刷新页面
        } else {
          showMessage('TTS文件清理请求失败: ' + (error.message || '未知错误'), 'error');
        }
      });
  }
} 