(function () {
  function showMessage(message, type = 'success') {
    const messageContainer = document.getElementById('messageContainer');
    if (!messageContainer) {
      console.error('Message container not found');
      return;
    }

    messageContainer.textContent = message;
    messageContainer.className = `message ${type}`;

    setTimeout(() => {
      messageContainer.className = 'message hidden';
    }, 5000);
  }

  async function apiRequest(url, options = {}) {
    try {
      console.log(`API请求: ${options.method || 'GET'} ${url}`);

      const timeoutMs = typeof options.timeoutMs === 'number' ? options.timeoutMs : 8000;
      const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
      const timeoutId = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;

      const headers = {
        ...(options.headers || {})
      };

      const bodyIsFormData = typeof FormData !== 'undefined' && options.body instanceof FormData;
      const hasContentTypeHeader = Object.keys(headers).some(k => k.toLowerCase() === 'content-type');
      if (!hasContentTypeHeader && options.body && !bodyIsFormData) {
        headers['Content-Type'] = 'application/json';
      }

      const response = await fetch(url, {
        ...options,
        headers,
        ...(controller ? { signal: controller.signal } : {})
      }).finally(() => {
        if (timeoutId) clearTimeout(timeoutId);
      });

      if (!response.ok) {
        let errorMessage;

        switch (response.status) {
          case 404:
            errorMessage = `API端点不存在: ${url}`;
            console.error('API 404错误 - 可能是服务器版本不匹配');
            break;
          case 401:
            errorMessage = '会话已过期，需要重新登录';
            setTimeout(() => {
              if (window.location.pathname !== '/login') {
                window.location.href = '/login';
              }
            }, 2000);
            break;
          case 403:
            errorMessage = '权限不足';
            break;
          case 500:
            errorMessage = '服务器内部错误';
            break;
          default:
            errorMessage = `请求失败: ${response.status} ${response.statusText}`;
        }

        const error = new Error(errorMessage);
        error.status = response.status;
        error.response = response;
        throw error;
      }

      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        return await response.json();
      }

      const text = await response.text();
      if (text.includes('<!DOCTYPE')) {
        throw new Error('服务器返回了HTML页面而不是JSON，可能是路由配置问题');
      }
      return text;
    } catch (error) {
      console.error('API请求失败:', error);
      if (error.name === 'TypeError' && error.message.includes('fetch')) {
        error.message = '网络连接失败，请检查网络连接';
      }
      throw error;
    }
  }

  window.AppCore = {
    showMessage,
    apiRequest
  };

  window.showMessage = showMessage;
  window.apiRequest = apiRequest;
})();
