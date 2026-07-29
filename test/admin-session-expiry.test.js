const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');

function loadApiModule() {
  const filePath = path.join(__dirname, '../src/admin/api.ts');
  const source = fs.readFileSync(filePath, 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020
    }
  }).outputText;
  const loadedModule = { exports: {} };
  new Function('module', 'exports', 'require', compiled)(
    loadedModule,
    loadedModule.exports,
    require
  );
  return loadedModule.exports;
}

function jsonResponse(status, payload) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' }
  });
}

test('管理员 API 返回 401 时只触发一次会话失效跳转', async (t) => {
  const originalWindow = global.window;
  const originalFetch = global.fetch;
  const redirects = [];
  global.window = {
    location: {
      replace(url) {
        redirects.push(url);
      }
    }
  };
  global.fetch = async () => jsonResponse(401, { success: false, message: '未授权访问' });
  t.after(() => {
    global.window = originalWindow;
    global.fetch = originalFetch;
  });

  const { apiGet, isRedirectingToLogin } = loadApiModule();
  await assert.rejects(apiGet('/api/admin/profile'), /登录已过期/);
  await assert.rejects(apiGet('/api/admin/profile'), /登录已过期/);

  assert.deepEqual(redirects, ['/login?reason=session-expired']);
  assert.equal(isRedirectingToLogin(), true);
});

test('管理员 API 的非 401 错误不会触发登录跳转', async (t) => {
  const originalWindow = global.window;
  const originalFetch = global.fetch;
  const redirects = [];
  global.window = {
    location: {
      replace(url) {
        redirects.push(url);
      }
    }
  };
  global.fetch = async () => jsonResponse(403, { success: false, message: '请先修改默认密码' });
  t.after(() => {
    global.window = originalWindow;
    global.fetch = originalFetch;
  });

  const { apiGet, isRedirectingToLogin } = loadApiModule();
  await assert.rejects(apiGet('/api/admin/profile'), /请先修改默认密码/);

  assert.deepEqual(redirects, []);
  assert.equal(isRedirectingToLogin(), false);
});
