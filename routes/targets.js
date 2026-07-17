function registerTargetsRoutes(app, deps) {
  const { getData, saveData, updateData } = deps;

  function pad2(n) {
    return String(n).padStart(2, '0');
  }

  function getIsoWeekParts(date) {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const week = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
    return { year: d.getUTCFullYear(), week };
  }

  function getPeriodKey(date, period) {
    const y = date.getFullYear();
    const m = date.getMonth() + 1;
    const day = date.getDate();
    switch (period) {
      case 'daily':
        return `${y}-${pad2(m)}-${pad2(day)}`;
      case 'weekly': {
        const { year, week } = getIsoWeekParts(date);
        return `${year}-W${pad2(week)}`;
      }
      case 'monthly':
        return `${y}-${pad2(m)}`;
      case 'yearly':
        return String(y);
      case 'never':
      default:
        return 'never';
    }
  }

  function ensureTargets(data) {
    if (!data.targets || typeof data.targets !== 'object') {
      data.targets = {
        inquiryTarget: 0,
        dealTarget: 0,
        resetPeriod: 'weekly',
        lastResetTime: new Date().toISOString(),
        periodKey: null,
        periodInquiryCount: 0,
        periodDealAmount: 0,
        periodBaselineInquiryCount: 0,
        periodBaselineDealAmount: 0
      };
    }
    if (!Object.prototype.hasOwnProperty.call(data.targets, 'periodInquiryCount')) {
      data.targets.periodInquiryCount = 0;
    }
    if (!Object.prototype.hasOwnProperty.call(data.targets, 'periodDealAmount')) {
      data.targets.periodDealAmount = 0;
    }
    if (!Object.prototype.hasOwnProperty.call(data.targets, 'periodBaselineInquiryCount')) {
      // 不在此处用当前累计值当基线，交给 refreshPeriodProgress 做首次迁移
      data.targets.periodBaselineInquiryCount = 0;
    }
    if (!Object.prototype.hasOwnProperty.call(data.targets, 'periodBaselineDealAmount')) {
      data.targets.periodBaselineDealAmount = 0;
    }
    return data.targets;
  }

  function inferLegacyPeriodKey(targets, now) {
    // 旧数据没有 periodKey：用 lastResetTime 推断当时周期，避免首次访问静默重置本周进度
    if (targets.lastResetTime) {
      const last = new Date(targets.lastResetTime);
      if (!Number.isNaN(last.getTime())) {
        return getPeriodKey(last, targets.resetPeriod || 'weekly');
      }
    }
    return getPeriodKey(now, targets.resetPeriod || 'weekly');
  }

  function getFirstMigrateMode(targets) {
    // preserve-total: 把累计总额当本周期进度（仅显式选择时）
    // zero-progress: 基线=当前累计，本周期进度=0（默认，避免把历史总量伪装成周进度）
    const fromData = String(targets.firstMigrateMode || '').trim().toLowerCase();
    if (fromData === 'preserve-total' || fromData === 'zero-progress') return fromData;
    const fromEnv = String(process.env.BBZG_TARGETS_FIRST_MIGRATE || '').trim().toLowerCase();
    if (fromEnv === 'preserve-total' || fromEnv === 'zero-progress') return fromEnv;
    return 'zero-progress';
  }

  function refreshPeriodProgress(data, { persist = true } = {}) {
    const targets = ensureTargets(data);
    const now = new Date();
    const period = targets.resetPeriod || 'weekly';
    const currentKey = getPeriodKey(now, period);
    let previousKey = targets.periodKey || null;
    let reset = false;
    let migrated = false;

    // 首次迁移：旧数据没有 periodKey。
    // lastResetTime 无法可靠反推本周期新增量；默认不把累计总额伪装成周进度。
    // 管理员可通过 POST /api/targets 写入基线，或设置 firstMigrateMode/BBZG_TARGETS_FIRST_MIGRATE。
    if (!previousKey) {
      const legacyKey = inferLegacyPeriodKey(targets, now);
      const inquiryTotal = Number(data.inquiryCount || 0);
      const dealTotal = Number(data.dealAmount || 0);
      const mode = getFirstMigrateMode(targets);
      targets.periodKey = currentKey;
      if (!targets.lastResetTime) targets.lastResetTime = now.toISOString();

      if (mode === 'preserve-total') {
        targets.periodBaselineInquiryCount = 0;
        targets.periodBaselineDealAmount = 0;
        targets.migrationPending = false;
        targets.migrationNote = '首次迁移使用 preserve-total：累计总额作为本周期进度';
      } else {
        targets.periodBaselineInquiryCount = inquiryTotal;
        targets.periodBaselineDealAmount = dealTotal;
        targets.migrationPending = true;
        targets.migrationNote = '首次迁移无法还原真实周期新增量，已将进度置 0；请在后台写入本周期基线或调整 resetPeriod';
      }

      previousKey = currentKey;
      migrated = true;
      console.log('目标周期首次迁移', {
        mode,
        legacyKey,
        periodKey: currentKey,
        inquiryTotal,
        dealTotal,
        baselineInquiry: targets.periodBaselineInquiryCount,
        baselineDeal: targets.periodBaselineDealAmount
      });
    }

    if (period !== 'never' && previousKey !== currentKey) {
      targets.periodKey = currentKey;
      targets.lastResetTime = now.toISOString();
      targets.periodBaselineInquiryCount = Number(data.inquiryCount || 0);
      targets.periodBaselineDealAmount = Number(data.dealAmount || 0);
      targets.periodInquiryCount = 0;
      targets.periodDealAmount = 0;
      targets.migrationPending = false;
      reset = true;
    }

    // 按累计总额与周期基线差值计算周期进度，避免直接清零全量总额
    const inquiryTotal = Number(data.inquiryCount || 0);
    const dealTotal = Number(data.dealAmount || 0);
    targets.periodInquiryCount = Math.max(0, inquiryTotal - Number(targets.periodBaselineInquiryCount || 0));
    targets.periodDealAmount = Math.max(0, dealTotal - Number(targets.periodBaselineDealAmount || 0));

    if (persist && (reset || migrated)) {
      saveData(data);
      if (reset) console.log('目标进度已进入新周期:', currentKey, now.toISOString());
      if (migrated) console.log('目标周期已完成首次迁移:', targets.periodKey, {
        periodInquiryCount: targets.periodInquiryCount,
        periodDealAmount: targets.periodDealAmount,
        migrationPending: targets.migrationPending
      });
    }

    return {
      reset,
      migrated,
      migrationPending: !!targets.migrationPending,
      periodKey: targets.periodKey,
      periodInquiryCount: targets.periodInquiryCount,
      periodDealAmount: targets.periodDealAmount
    };
  }

  // API: 获取目标设置
  app.get('/api/targets', (req, res) => {
    const data = getData();
    const targets = ensureTargets(data);
    const progress = refreshPeriodProgress(data, { persist: true });

    res.json({
      success: true,
      inquiryTarget: targets.inquiryTarget,
      dealTarget: targets.dealTarget,
      resetPeriod: targets.resetPeriod,
      lastResetTime: targets.lastResetTime,
      periodKey: progress.periodKey,
      periodBaselineInquiryCount: Number(targets.periodBaselineInquiryCount || 0),
      periodBaselineDealAmount: Number(targets.periodBaselineDealAmount || 0),
      migrationPending: !!targets.migrationPending,
      migrationNote: targets.migrationNote || null,
      // 兼容旧前端：进度展示使用周期数据
      periodInquiryCount: progress.periodInquiryCount,
      periodDealAmount: progress.periodDealAmount,
      inquiryCount: Number(data.inquiryCount || 0),
      dealAmount: Number(data.dealAmount || 0),
      revision: Number(data.__revision || 0)
    });
  });

  // API: 设置目标
  app.post('/api/targets', (req, res) => {
    if (!req.session || !req.session.loggedIn) {
      return res.status(401).json({ success: false, message: '未授权访问' });
    }

    const body = req.body && typeof req.body === 'object' ? req.body : {};
    let conflict = null;
    let validationError = null;
    let savedView = null;

    const applyTargetsUpdate = (data) => {
      const targets = ensureTargets(data);

      if (body.inquiryTarget !== undefined) {
        targets.inquiryTarget = parseInt(body.inquiryTarget, 10) || 0;
      }
      if (body.dealTarget !== undefined) {
        targets.dealTarget = parseInt(body.dealTarget, 10) || 0;
      }
      if (body.resetPeriod !== undefined) {
        const validPeriods = ['daily', 'weekly', 'monthly', 'yearly', 'never'];
        if (validPeriods.includes(body.resetPeriod)) {
          const changed = targets.resetPeriod !== body.resetPeriod;
          targets.resetPeriod = body.resetPeriod;
          if (changed) {
            // 切换周期策略时，立即按新策略开新账本
            targets.periodKey = null;
          }
        }
      }

      if (body.firstMigrateMode !== undefined) {
        const mode = String(body.firstMigrateMode || '').trim().toLowerCase();
        if (mode === 'preserve-total' || mode === 'zero-progress') {
          targets.firstMigrateMode = mode;
        }
      }

      // 先完成周期初始化（可能写入默认基线），再应用请求中的显式基线/进度
      refreshPeriodProgress(data, { persist: false });

      const calibrating = body.periodInquiryCount !== undefined
        || body.periodDealAmount !== undefined
        || body.periodBaselineInquiryCount !== undefined
        || body.periodBaselineDealAmount !== undefined;

      // 校准请求必须携带版本/快照；数据已变化则 409，避免过期表单覆盖新进度
      if (calibrating) {
        const currentInquiry = Number(data.inquiryCount || 0);
        const currentDeal = Number(data.dealAmount || 0);
        const currentRevision = Number(data.__revision || 0);
        const calibratingInquiry = body.periodInquiryCount !== undefined
          || body.periodBaselineInquiryCount !== undefined;
        const calibratingDeal = body.periodDealAmount !== undefined
          || body.periodBaselineDealAmount !== undefined;

        const conflictPayload = (message) => ({
          success: false,
          message,
          conflict: true,
          inquiryCount: currentInquiry,
          dealAmount: currentDeal,
          periodInquiryCount: targets.periodInquiryCount,
          periodDealAmount: targets.periodDealAmount,
          revision: currentRevision
        });

        const hasExpectedRevision = body.expectedRevision !== undefined
          && body.expectedRevision !== null
          && body.expectedRevision !== '';
        let revisionOk = false;
        if (hasExpectedRevision) {
          const expectedRevision = Number(body.expectedRevision);
          if (Number.isFinite(expectedRevision) && expectedRevision === currentRevision) {
            revisionOk = true;
          } else {
            conflict = conflictPayload('数据已变化，请刷新后重新确认本周期进度');
            return false;
          }
        }

        // expectedRevision 匹配时可单独通过；否则按实际校准字段强制对应累计快照
        if (!revisionOk) {
          if (calibratingInquiry) {
            if (body.expectedInquiryCount === undefined || body.expectedInquiryCount === null || body.expectedInquiryCount === '') {
              conflict = conflictPayload('询盘校准缺少 expectedInquiryCount，请刷新后重新确认');
              return false;
            }
            const expectedInquiry = Number(body.expectedInquiryCount);
            if (!Number.isFinite(expectedInquiry) || expectedInquiry !== currentInquiry) {
              conflict = conflictPayload('数据已变化，请刷新后重新确认本周期进度');
              return false;
            }
          }
          if (calibratingDeal) {
            if (body.expectedDealAmount === undefined || body.expectedDealAmount === null || body.expectedDealAmount === '') {
              conflict = conflictPayload('成交校准缺少 expectedDealAmount，请刷新后重新确认');
              return false;
            }
            const expectedDeal = Number(body.expectedDealAmount);
            if (!Number.isFinite(expectedDeal) || expectedDeal !== currentDeal) {
              conflict = conflictPayload('数据已变化，请刷新后重新确认本周期进度');
              return false;
            }
          }
          if (!calibratingInquiry && !calibratingDeal) {
            conflict = conflictPayload('校准请求缺少版本信息，请刷新后重新确认');
            return false;
          }
        } else {
          // revision 已匹配时，若额外提供了 expected 字段也必须一致（防脏客户端）
          if (body.expectedInquiryCount !== undefined && body.expectedInquiryCount !== null && body.expectedInquiryCount !== '') {
            const expectedInquiry = Number(body.expectedInquiryCount);
            if (!Number.isFinite(expectedInquiry) || expectedInquiry !== currentInquiry) {
              conflict = conflictPayload('数据已变化，请刷新后重新确认本周期进度');
              return false;
            }
          }
          if (body.expectedDealAmount !== undefined && body.expectedDealAmount !== null && body.expectedDealAmount !== '') {
            const expectedDeal = Number(body.expectedDealAmount);
            if (!Number.isFinite(expectedDeal) || expectedDeal !== currentDeal) {
              conflict = conflictPayload('数据已变化，请刷新后重新确认本周期进度');
              return false;
            }
          }
        }
      }

      const parsedCalibration = {};
      const parseCalibrationValue = (field, label, max, { integer = false } = {}) => {
        if (body[field] === undefined) return undefined;
        const raw = body[field];
        if (raw === null || (typeof raw === 'string' && raw.trim() === '')) {
          validationError = { success: false, message: `${label}不能为空` };
          return undefined;
        }
        if (typeof raw !== 'number' && typeof raw !== 'string') {
          validationError = {
            success: false,
            message: `${label}必须是${integer ? '非负整数' : '非负数字'}`
          };
          return undefined;
        }
        const value = Number(raw);
        if (!Number.isFinite(value) || value < 0 || (integer && !Number.isInteger(value))) {
          validationError = {
            success: false,
            message: `${label}必须是${integer ? '非负整数' : '非负数字'}`
          };
          return undefined;
        }
        if (value > max) {
          validationError = {
            success: false,
            message: `${label}不能超过当前累计值 ${max}`
          };
          return undefined;
        }
        return value;
      };

      parsedCalibration.periodInquiryCount = parseCalibrationValue(
        'periodInquiryCount',
        '本周期询盘进度',
        Number(data.inquiryCount || 0),
        { integer: true }
      );
      if (validationError) return false;
      parsedCalibration.periodDealAmount = parseCalibrationValue(
        'periodDealAmount',
        '本周期成交进度',
        Number(data.dealAmount || 0)
      );
      if (validationError) return false;
      parsedCalibration.periodBaselineInquiryCount = parseCalibrationValue(
        'periodBaselineInquiryCount',
        '询盘基线',
        Number(data.inquiryCount || 0),
        { integer: true }
      );
      if (validationError) return false;
      parsedCalibration.periodBaselineDealAmount = parseCalibrationValue(
        'periodBaselineDealAmount',
        '成交基线',
        Number(data.dealAmount || 0)
      );
      if (validationError) return false;

      // 显式写入本周期基线（推荐部署后由管理员确认）
      if (body.periodBaselineInquiryCount !== undefined) {
        targets.periodBaselineInquiryCount = parsedCalibration.periodBaselineInquiryCount;
        targets.migrationPending = false;
        targets.migrationNote = '管理员已写入询盘基线';
      }
      if (body.periodBaselineDealAmount !== undefined) {
        targets.periodBaselineDealAmount = parsedCalibration.periodBaselineDealAmount;
        targets.migrationPending = false;
        targets.migrationNote = '管理员已写入成交基线';
      }

      // 也可直接写“本周期进度”，服务端反推基线 = 累计 - 进度
      if (body.periodInquiryCount !== undefined) {
        const progressWanted = parsedCalibration.periodInquiryCount;
        const inquiryTotal = Number(data.inquiryCount || 0);
        targets.periodBaselineInquiryCount = inquiryTotal - progressWanted;
        targets.migrationPending = false;
        targets.migrationNote = '管理员已写入本周期询盘进度';
      }
      if (body.periodDealAmount !== undefined) {
        const progressWanted = parsedCalibration.periodDealAmount;
        const dealTotal = Number(data.dealAmount || 0);
        targets.periodBaselineDealAmount = dealTotal - progressWanted;
        targets.migrationPending = false;
        targets.migrationNote = '管理员已写入本周期成交进度';
      }

      // 按最终基线重算进度（不再二次迁移覆盖）
      {
        const inquiryTotal = Number(data.inquiryCount || 0);
        const dealTotal = Number(data.dealAmount || 0);
        targets.periodInquiryCount = Math.max(0, inquiryTotal - Number(targets.periodBaselineInquiryCount || 0));
        targets.periodDealAmount = Math.max(0, dealTotal - Number(targets.periodBaselineDealAmount || 0));
      }

      savedView = {
        success: true,
        message: '目标设置已更新',
        ...targets,
        periodInquiryCount: targets.periodInquiryCount,
        periodDealAmount: targets.periodDealAmount,
        migrationPending: !!targets.migrationPending
      };
      return data;
    };

    if (typeof updateData === 'function') {
      const result = updateData(applyTargetsUpdate);
      if (validationError) {
        return res.status(400).json(validationError);
      }
      if (conflict) {
        return res.status(409).json(conflict);
      }
      if (!result || result.cancelled) {
        return res.status(409).json(conflict || {
          success: false,
          message: '数据已变化，请刷新后重新确认本周期进度',
          conflict: true
        });
      }
      if (!result.ok) {
        return res.status(500).json({
          success: false,
          message: '保存目标设置失败'
        });
      }
      return res.json(savedView || {
        success: true,
        message: '目标设置已更新'
      });
    }

    // 测试/兼容路径：无 updateData 时退回 getData + saveData
    const data = getData();
    const applied = applyTargetsUpdate(data);
    if (validationError) {
      return res.status(400).json(validationError);
    }
    if (conflict || applied === false) {
      return res.status(409).json(conflict || {
        success: false,
        message: '数据已变化，请刷新后重新确认本周期进度',
        conflict: true
      });
    }
    if (saveData(data)) {
      return res.json(savedView || {
        success: true,
        message: '目标设置已更新'
      });
    }
    return res.status(500).json({
      success: false,
      message: '保存目标设置失败'
    });
  });

}

module.exports = {
  registerTargetsRoutes
};
