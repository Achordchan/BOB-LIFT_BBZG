/**
 * 登录页脚本
 * 错误提示、密码显隐、Caps Lock 提示、提交加载态
 */

window.addEventListener('DOMContentLoaded', function () {
  var params = new URLSearchParams(window.location.search);
  if (params.has('error')) {
    var box = document.getElementById('errorMessage');
    var text = document.getElementById('errorText');
    text.textContent = params.get('error') === 'locked'
      ? '登录尝试次数过多，账号已被临时锁定，请稍后再试。'
      : '账号或密码错误，请重试。';
    box.classList.add('show');
  }

  var password = document.getElementById('password');
  var toggle = document.getElementById('togglePassword');

  // 用 class 控制图标显隐，与 CSS 的 .is-visible 规则对应
  if (toggle && password) {
    toggle.addEventListener('click', function () {
      var show = password.type === 'password';
      password.type = show ? 'text' : 'password';
      toggle.classList.toggle('is-visible', show);
      toggle.setAttribute('aria-pressed', String(show));
      toggle.setAttribute('aria-label', show ? '隐藏密码' : '显示密码');
      password.focus();
    });
  }

  // Caps Lock 提示，减少「密码明明是对的」类误判
  var capsHint = document.getElementById('capsHint');
  if (password && capsHint) {
    var syncCaps = function (event) {
      if (typeof event.getModifierState !== 'function') return;
      capsHint.hidden = !event.getModifierState('CapsLock');
    };
    password.addEventListener('keydown', syncCaps);
    password.addEventListener('keyup', syncCaps);
    password.addEventListener('blur', function () { capsHint.hidden = true; });
  }

  var form = document.getElementById('loginForm');
  var submitBtn = document.getElementById('submitBtn');
  if (form && submitBtn) {
    form.addEventListener('submit', function (event) {
      // novalidate 下手动校验，避免空表单也进入加载态卡住
      if (!form.checkValidity()) {
        event.preventDefault();
        var invalid = form.querySelector(':invalid');
        if (invalid) invalid.focus();
        return;
      }
      submitBtn.classList.add('is-loading');
      submitBtn.disabled = true;
    });
  }

  var username = document.getElementById('username');
  if (username && !username.value) username.focus();
});
