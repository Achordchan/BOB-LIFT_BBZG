/**
 * 登录页面脚本
 * 处理URL参数并显示错误提示信息
 */

// 页面加载完成后执行
window.addEventListener('DOMContentLoaded', function() {
  // 检查URL中是否有error参数
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.has('error')) {
    // 显示错误信息容器
    document.getElementById('errorMessage').style.display = 'block';
  }
}); 