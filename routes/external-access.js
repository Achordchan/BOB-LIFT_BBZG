const {
  createExternalWriteToken,
  getExternalWriteTokenStatus
} = require('../lib/external-write-token');

function registerExternalAccessRoutes(app, deps) {
  const { getData, saveData, updateData, requireLogin } = deps;

  app.get('/api/admin/external-write-token', requireLogin, (req, res) => {
    res.json({
      success: true,
      ...getExternalWriteTokenStatus(getData())
    });
  });

  app.post('/api/admin/external-write-token/regenerate', requireLogin, (req, res) => {
    const generated = createExternalWriteToken();
    const mutator = (data) => {
      data.externalWriteAccess = generated.record;
      return data;
    };

    let saved = false;
    if (typeof updateData === 'function') {
      const result = updateData(mutator);
      saved = !!(result && result.ok);
    } else {
      const data = getData();
      mutator(data);
      saved = !!saveData(data);
    }

    if (!saved) {
      return res.status(500).json({ success: false, message: '生成绑定 Token 失败' });
    }

    res.json({
      success: true,
      message: '新的绑定 Token 已生成，旧 Token 已失效',
      token: generated.token,
      ...getExternalWriteTokenStatus({ externalWriteAccess: generated.record })
    });
  });
}

module.exports = {
  registerExternalAccessRoutes
};
