'use strict';

/**
 * 统一日志（winston + 按天切割文件）。
 *
 * - 控制台：彩色、可读；文件：结构化 JSON，便于检索。
 * - 文件按天切割、限制单文件大小与保留天数，避免长期堆积占满磁盘。
 * - 所有输出经 sanitizeLogValue 脱敏（Bearer/token/cookie/password 等）。
 * - httpLogger：为每个请求分配 requestId，记录方法/URL/状态/耗时/IP/UA/来源/角色。
 * - installConsoleBridge：把 console.* 接管进 winston，历史日志零改动全部落盘。
 * - installProcessHandlers：未捕获异常与未处理的 Promise 拒绝也入日志。
 *
 * 环境变量：
 *   BBZG_LOG_DIR    日志目录（默认 <cwd>/logs）
 *   BBZG_LOG_LEVEL  级别（默认 production=info，其它=debug）
 *   BBZG_LOG_MAX_SIZE  单文件上限（默认 20m）
 *   BBZG_LOG_MAX_FILES 保留（默认 14d；错误日志 30d）
 */

const path = require('path');
const fs = require('fs');
const util = require('util');
const winston = require('winston');
require('winston-daily-rotate-file');
const { v4: uuidv4 } = require('uuid');
const { sanitizeLogValue } = require('./safe-error');
const { getClientIp } = require('./request-ip');

const isProduction = String(process.env.NODE_ENV || '').toLowerCase() === 'production'
  || String(process.env.BBZG_ENV || '').toLowerCase() === 'production';

const LOG_DIR = String(process.env.BBZG_LOG_DIR || path.join(process.cwd(), 'logs')).trim();
const LOG_LEVEL = String(process.env.BBZG_LOG_LEVEL || (isProduction ? 'info' : 'debug')).trim();
const MAX_SIZE = String(process.env.BBZG_LOG_MAX_SIZE || '20m').trim();
const MAX_FILES = String(process.env.BBZG_LOG_MAX_FILES || '14d').trim();

try {
  fs.mkdirSync(LOG_DIR, { recursive: true });
} catch (error) {
  // 目录创建失败不应阻断启动；退化为仅控制台输出
  // eslint-disable-next-line no-console
  process.stderr.write(`创建日志目录失败，将仅输出到控制台: ${LOG_DIR} ${error && error.message}\n`);
}

// 敏感字段名：命中即整体打码，避免 { password: 'hunter2' } 这类裸值漏出
// （sanitizeLogValue 依赖字符串里同时出现字段名，裸值无法识别）
const SENSITIVE_KEY_RE = /(pass(word)?|secret|token|authorization|cookie|session|api[_-]?key|access[_-]?key|credential|sign(ature)?)/i;

// 递归脱敏：字符串走 sanitizeLogValue，敏感键名直接打码，
// 对象/数组浅递归（限制深度，超出深度不回挂未处理对象）
function deepSanitize(value, depth) {
  const d = typeof depth === 'number' ? depth : 4;
  if (value == null) return value;
  if (typeof value === 'string') return sanitizeLogValue(value);
  if (typeof value !== 'object') return value;
  // 深度耗尽：不返回未脱敏的原对象，降级为占位符
  if (d <= 0) return Array.isArray(value) ? '[array]' : '[object]';
  if (Array.isArray(value)) return value.map((v) => deepSanitize(v, d - 1));
  const out = {};
  for (const key of Object.keys(value)) {
    try {
      if (SENSITIVE_KEY_RE.test(key)) {
        const v = value[key];
        out[key] = (v == null || v === '') ? v : '***';
        continue;
      }
      out[key] = deepSanitize(value[key], d - 1);
    } catch (_) {
      out[key] = '[unserializable]';
    }
  }
  return out;
}

const sanitizeFormat = winston.format((info) => {
  if (typeof info.message === 'string') info.message = sanitizeLogValue(info.message);
  if (typeof info.stack === 'string') info.stack = sanitizeLogValue(info.stack);
  // 其余附加字段（元数据）逐一脱敏
  for (const key of Object.keys(info)) {
    if (key === 'level' || key === 'message' || key === 'stack' || key === 'timestamp') continue;
    if (SENSITIVE_KEY_RE.test(key)) {
      const v = info[key];
      info[key] = (v == null || v === '') ? v : '***';
      continue;
    }
    info[key] = deepSanitize(info[key], 4);
  }
  return info;
});

const timestampFormat = winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' });

const fileFormat = winston.format.combine(
  timestampFormat,
  winston.format.errors({ stack: true }),
  sanitizeFormat(),
  winston.format.json()
);

const consoleFormat = winston.format.combine(
  timestampFormat,
  winston.format.errors({ stack: true }),
  sanitizeFormat(),
  winston.format.colorize(),
  winston.format.printf((info) => {
    const { timestamp, level, message, stack } = info;
    const meta = Object.assign({}, info);
    delete meta.timestamp; delete meta.level; delete meta.message; delete meta.stack;
    delete meta[Symbol.for('level')]; delete meta[Symbol.for('message')]; delete meta[Symbol.for('splat')];
    let metaStr = '';
    const keys = Object.keys(meta);
    if (keys.length) {
      try { metaStr = ' ' + JSON.stringify(meta); } catch (_) { metaStr = ''; }
    }
    return `${timestamp} ${level}: ${stack || message}${metaStr}`;
  })
);

const transports = [
  new winston.transports.Console({ level: LOG_LEVEL, format: consoleFormat, handleExceptions: false }),
];

try {
  transports.push(new winston.transports.DailyRotateFile({
    dirname: LOG_DIR,
    filename: 'app-%DATE%.log',
    datePattern: 'YYYY-MM-DD',
    zippedArchive: true,
    maxSize: MAX_SIZE,
    maxFiles: MAX_FILES,
    level: LOG_LEVEL,
    format: fileFormat
  }));
  transports.push(new winston.transports.DailyRotateFile({
    dirname: LOG_DIR,
    filename: 'error-%DATE%.log',
    datePattern: 'YYYY-MM-DD',
    zippedArchive: true,
    maxSize: MAX_SIZE,
    maxFiles: String(process.env.BBZG_LOG_ERROR_MAX_FILES || '30d').trim(),
    level: 'error',
    format: fileFormat
  }));
} catch (error) {
  process.stderr.write(`初始化文件日志失败，仅控制台输出: ${error && error.message}\n`);
}

const logger = winston.createLogger({
  level: LOG_LEVEL,
  transports,
  exitOnError: false
});

// 文件 transport 的失败是异步事件（目录不可写、磁盘满、轮转失败），
// 构造期 try/catch 捕获不到；若无监听器，winston 重发的 error 会变成
// 未捕获异常并触发致命退出，服务重启后可能继续崩溃。
// 这里消费该错误并摘掉故障 transport，真正退化为仅控制台输出。
function attachTransportErrorHandler(transport, label) {
  transport.on('error', (error) => {
    try { logger.remove(transport); } catch (_) { /* 已移除 */ }
    try {
      // 此时故障 transport 已摘除，不会递归触发同一错误
      logger.warn(`文件日志（${label}）写入失败，已停用该输出，仅保留控制台`, {
        tag: 'logger',
        message: error && error.message
      });
    } catch (_) {
      process.stderr.write(`文件日志（${label}）写入失败: ${error && error.message}\n`);
    }
  });
}
for (const transport of logger.transports) {
  if (transport instanceof winston.transports.DailyRotateFile) {
    attachTransportErrorHandler(transport, transport.filename || 'file');
  }
}
// logger 自身的错误同样兜底，避免冒泡成未捕获异常
logger.on('error', (error) => {
  process.stderr.write(`日志系统错误: ${error && error.message}\n`);
});

/** 判断是否为无需逐条记录的静态资源/噪声请求 */
function isNoisyPath(url) {
  const p = String(url || '').split('?')[0];
  return /\.(?:js|mjs|css|map|png|jpe?g|gif|svg|ico|webp|woff2?|ttf|eot|mp3|wav|flac|m4a)$/i.test(p);
}

/** Express 中间件：请求级访问日志 + requestId */
function httpLogger(options = {}) {
  const skipNoisy = options.skipNoisy !== false;
  return function httpLoggerMiddleware(req, res, next) {
    const start = process.hrtime.bigint();
    const incoming = req.headers['x-request-id'];
    const requestId = (typeof incoming === 'string' && incoming.trim()) ? incoming.trim().slice(0, 100) : uuidv4();
    req.id = requestId;
    req.requestId = requestId;
    try { res.setHeader('X-Request-Id', requestId); } catch (_) {}

    res.on('finish', () => {
      if (skipNoisy && isNoisyPath(req.originalUrl) && res.statusCode < 400) return;
      let durationMs = 0;
      try { durationMs = Number(process.hrtime.bigint() - start) / 1e6; } catch (_) {}
      const role = (req.session && req.session.loggedIn)
        ? 'admin'
        : ((req.session && req.session.eggUserId) ? 'egg' : 'anon');
      const status = res.statusCode;
      const level = status >= 500 ? 'error' : (status >= 400 ? 'warn' : 'info');
      let ip = 'unknown';
      try { ip = getClientIp(req); } catch (_) {}
      logger.log(level, `${req.method} ${req.originalUrl} ${status} ${durationMs.toFixed(1)}ms`, {
        tag: 'http',
        requestId,
        method: req.method,
        url: req.originalUrl,
        status,
        durationMs: Number(durationMs.toFixed(1)),
        ip,
        length: res.getHeader('content-length'),
        role,
        ua: req.headers['user-agent'],
        referer: req.headers['referer'] || req.headers['referrer']
      });
    });
    next();
  };
}

/** 把 console.* 接管进 winston（仅在真实服务进程调用；测试不调用以免污染输出） */
let consoleBridged = false;
function installConsoleBridge() {
  if (consoleBridged) return;
  consoleBridged = true;
  const map = { log: 'info', info: 'info', warn: 'warn', error: 'error', debug: 'debug' };
  for (const method of Object.keys(map)) {
    const level = map[method];
    // eslint-disable-next-line no-console
    console[method] = (...args) => {
      try {
        logger.log(level, util.format(...args));
      } catch (_) {
        process.stdout.write(util.format(...args) + '\n');
      }
    };
  }
}

/**
 * 未捕获异常 / 未处理的 Promise 拒绝：记录后以非零状态退出。
 *
 * 注册监听会覆盖 Node 默认的崩溃行为，若只记日志继续运行，进程可能带着
 * 损坏或不一致的状态继续对外服务，进程管理器也不会重启它。因此这里在
 * 留出短暂时间供日志落盘后主动退出，交由宝塔/systemd 拉起新实例。
 *
 * options.exitOnFatal 置为 false 可仅记录不退出（仅供测试等特殊场景）。
 */
function installProcessHandlers(options = {}) {
  const exitOnFatal = options.exitOnFatal !== false;
  const exitDelayMs = Number(options.exitDelayMs != null ? options.exitDelayMs : 500);
  const onFatal = typeof options.onFatal === 'function' ? options.onFatal : null;
  let exiting = false;

  const handleFatal = (label, error) => {
    try {
      logger.error(`${label}，进程即将退出`, {
        tag: 'process',
        fatal: true,
        message: error && error.message,
        stack: error && error.stack
      });
    } catch (_) { /* 记录失败也要继续退出流程 */ }

    if (!exitOnFatal || exiting) return;
    exiting = true;
    if (onFatal) {
      try { onFatal(label, error); } catch (_) { /* 清理失败不阻断退出 */ }
    }
    // 留出短暂时间让文件 transport 落盘，再以非零状态退出
    setTimeout(() => process.exit(1), exitDelayMs);
  };

  process.on('uncaughtException', (error) => handleFatal('未捕获异常 uncaughtException', error));
  process.on('unhandledRejection', (reason) => {
    const err = reason instanceof Error ? reason : new Error(String(reason));
    handleFatal('未处理的 Promise 拒绝 unhandledRejection', err);
  });
}

module.exports = {
  logger,
  httpLogger,
  installConsoleBridge,
  installProcessHandlers,
  logDir: LOG_DIR,
  logLevel: LOG_LEVEL
};

// 文件日志可用性需反映运行期状态：transport 故障被移除后应立即变为 false，
// 因此用 getter 实时计算，而非导出初始化时的布尔快照
Object.defineProperty(module.exports, 'fileTransportsOk', {
  enumerable: true,
  get() {
    return logger.transports.some((t) => t instanceof winston.transports.DailyRotateFile);
  }
});
