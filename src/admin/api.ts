import { message } from 'antd';
import type { ApiResult } from './types';

async function parseResponse<T>(response: Response): Promise<ApiResult<T>> {
  const type = response.headers.get('content-type') || '';
  const isJson = type.includes('application/json');
  const payload = isJson ? await response.json().catch(() => ({})) : await response.text();
  const redirectedToLogin = response.redirected && response.url.includes('/login');

  if (response.status === 401 || redirectedToLogin || (!isJson && typeof payload === 'string' && payload.includes('<title') && payload.includes('登录'))) {
    message.error('登录已过期，请重新登录');
    window.location.href = '/login';
    throw new Error('未授权访问');
  }

  if (!response.ok) {
    const msg = typeof payload === 'object' && payload && 'message' in payload ? String((payload as any).message) : `请求失败(${response.status})`;
    throw new Error(msg);
  }

  if (!isJson) {
    throw new Error('接口返回格式异常');
  }

  return payload as ApiResult<T>;
}

export async function apiGet<T>(url: string) {
  return parseResponse<T>(await fetch(url, { credentials: 'same-origin' }));
}


export async function apiText(url: string) {
  const response = await fetch(url, { credentials: 'same-origin' });
  const type = response.headers.get('content-type') || '';
  const text = await response.text();

  if (response.status === 401 || (response.redirected && response.url.includes('/login')) || (text.includes('<title') && text.includes('登录'))) {
    message.error('登录已过期，请重新登录');
    window.location.href = '/login';
    throw new Error('未授权访问');
  }

  if (!response.ok) {
    if (type.includes('application/json')) {
      try {
        const payload = JSON.parse(text);
        throw new Error(payload.message || `请求失败(${response.status})`);
      } catch (error: any) {
        throw new Error(error.message || `请求失败(${response.status})`);
      }
    }
    throw new Error(`请求失败(${response.status})`);
  }

  return text;
}

export async function apiJson<T>(url: string, method: 'POST' | 'PUT' | 'DELETE', body?: unknown) {
  return parseResponse<T>(await fetch(url, {
    method,
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body)
  }));
}

export async function apiForm<T>(url: string, form: FormData) {
  return parseResponse<T>(await fetch(url, { method: 'POST', credentials: 'same-origin', body: form }));
}

export function audioUrl(filename?: string) {
  if (!filename) return '';
  return filename.startsWith('/music/') ? filename : `/music/${filename}`;
}

export function money(value?: number) {
  return new Intl.NumberFormat('zh-CN', { style: 'currency', currency: 'CNY', maximumFractionDigits: 0 }).format(Number(value || 0));
}

export function dateTime(value?: string | number) {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('zh-CN', { hour12: false });
}
