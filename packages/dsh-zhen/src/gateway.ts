/** Host-only, bounded read operations. No media submit operation is exported. */
export interface Wallet {
  amount: number;
  usedAmount: number;
  currency: string;
  checkedAt: string;
}

export class GatewayError extends Error {
  readonly code: string;
  constructor(code: string, message: string) { super(message); this.name = 'GatewayError'; this.code = code; }
}

export async function readWallet(key: string, fetcher: typeof fetch = fetch, signal?: AbortSignal): Promise<Wallet> {
  let response: Response;
  try {
    response = await fetcher('https://api.seedance.nz/api/usage/wallet/', {
      headers: { Authorization: `Bearer ${key}`, Accept: 'application/json' },
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(15000)]) : AbortSignal.timeout(15000), redirect: 'error',
    });
  } catch { throw new GatewayError('NETWORK', '钱包暂时无法连接，请稍后刷新。'); }
  if (!response.ok) {
    await response.body?.cancel();
    if (response.status === 401 || response.status === 403) throw new GatewayError('AUTH', '钱包访问被拒绝，请检查 API 令牌权限。');
    if (response.status === 429) throw new GatewayError('RATE_LIMIT', '请求频率过高，请稍后刷新。');
    throw new GatewayError('UPSTREAM', '钱包服务暂时不可用。');
  }
  const reader = response.body?.getReader();
  if (!reader) throw new GatewayError('RESPONSE', '钱包返回空响应。');
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 65536) { await reader.cancel(); throw new GatewayError('RESPONSE', '钱包响应超出大小限制。'); }
      chunks.push(value);
    }
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as { code?: unknown; data?: Record<string, unknown> };
    const data = body.data;
    if (body.code !== true || !data || typeof data.amount !== 'number' || !Number.isFinite(data.amount)
      || typeof data.used_amount !== 'number' || !Number.isFinite(data.used_amount)
      || typeof data.display_type !== 'string' || !/^[A-Z]{3,8}$/.test(data.display_type)) {
      throw new GatewayError('RESPONSE', '钱包响应格式已变化，请更新兼容配置。');
    }
    return { amount: data.amount, usedAmount: data.used_amount, currency: data.display_type, checkedAt: new Date().toISOString() };
  } catch (error) {
    if (error instanceof GatewayError) throw error;
    throw new GatewayError('RESPONSE', '钱包响应无法读取。');
  } finally { reader.releaseLock(); }
}
