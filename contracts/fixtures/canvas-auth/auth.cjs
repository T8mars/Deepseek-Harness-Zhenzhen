const crypto = require('node:crypto');

const AGENT_CONTROL_SCOPES = Object.freeze([
  'canvas:read',
  'canvas:write',
  'run:read',
  'run:execute',
  'asset:read',
  'asset:transfer',
  'browser:handoff',
]);
const AGENT_CONTROL_SCOPE_SET = new Set(AGENT_CONTROL_SCOPES);
const DEFAULT_PAIRING_TTL_MS = 5 * 60 * 1000;
const DEFAULT_SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const PAIRING_LIMIT = 32;
const SESSION_LIMIT = 128;
const USER_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

class AgentControlAuthError extends Error {
  constructor(code, message, status = 400) {
    super(message);
    this.name = 'AgentControlAuthError';
    this.code = code;
    this.status = status;
  }
}

function sha256(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function randomSecret() {
  return crypto.randomBytes(32).toString('base64url');
}

function randomUserCode(length = 8) {
  const bytes = crypto.randomBytes(length);
  return Array.from(bytes, (value) => USER_CODE_ALPHABET[value % USER_CODE_ALPHABET.length]).join('');
}

function normalizedLabel(value, field, maxLength = 80) {
  const normalized = String(value || '').normalize('NFKC').trim();
  if (!normalized || normalized.length > maxLength || /[\u0000-\u001f\u007f]/.test(normalized)) {
    throw new AgentControlAuthError('PAIRING_REQUEST_INVALID', `${field} 无效`, 400);
  }
  return normalized;
}

function normalizedScopes(value, fallback = ['canvas:read', 'run:read', 'asset:read'], allowEmpty = false) {
  const source = Array.isArray(value) && value.length ? value : fallback;
  const scopes = [...new Set(source.map((item) => String(item || '').trim()).filter(Boolean))];
  if ((!allowEmpty && !scopes.length) || scopes.some((scope) => !AGENT_CONTROL_SCOPE_SET.has(scope))) {
    throw new AgentControlAuthError('PAIRING_SCOPE_INVALID', '请求的 Agent 权限范围无效', 400);
  }
  return scopes;
}

function developmentAuthServiceOptions(env = process.env) {
  if (String(env.NODE_ENV || '') !== 'development' || String(env.T8PC_PACKAGED || '') === '1') {
    return {};
  }
  const pairingTtlMs = Number(env.T8PC_AGENT_CONTROL_PAIRING_TTL_MS);
  if (!Number.isFinite(pairingTtlMs)) return {};
  return {
    pairingTtlMs,
    minimumPairingTtlMs: 1_000,
  };
}

function createAgentControlAuthService(options = {}) {
  const now = typeof options.now === 'function' ? options.now : () => Date.now();
  const minimumPairingTtlMs = Math.max(
    1_000,
    Math.min(30_000, Number(options.minimumPairingTtlMs) || 30_000),
  );
  const pairingTtlMs = Math.max(
    minimumPairingTtlMs,
    Math.min(15 * 60 * 1000, Number(options.pairingTtlMs) || DEFAULT_PAIRING_TTL_MS),
  );
  const sessionTtlMs = Math.max(5 * 60 * 1000, Math.min(24 * 60 * 60 * 1000, Number(options.sessionTtlMs) || DEFAULT_SESSION_TTL_MS));
  const pairings = new Map();
  const sessions = new Map();

  function cleanup() {
    const current = now();
    for (const [pairingId, record] of pairings) {
      if (record.expiresAt <= current) pairings.delete(pairingId);
    }
    for (const [tokenHash, session] of sessions) {
      if (session.expiresAt <= current || session.revokedAt) sessions.delete(tokenHash);
    }
  }

  function createPairing(input = {}) {
    cleanup();
    if (pairings.size >= PAIRING_LIMIT) {
      throw new AgentControlAuthError('PAIRING_LIMIT_REACHED', '待确认的 Agent 配对过多，请先处理已有请求', 429);
    }
    const pairingId = crypto.randomUUID();
    const pollSecret = randomSecret();
    const record = {
      pairingId,
      clientName: normalizedLabel(input.clientName || 'Local Agent', 'Agent 名称'),
      agentKind: normalizedLabel(input.agentKind || 'generic', 'Agent 类型', 40).toLowerCase(),
      requestedScopes: normalizedScopes(input.requestedScopes),
      userCode: randomUserCode(),
      pollSecretHash: sha256(pollSecret),
      createdAt: now(),
      expiresAt: now() + pairingTtlMs,
      approvedAt: null,
      deniedAt: null,
      approvedBy: null,
      issuedAt: null,
      accessToken: null,
      sessionId: null,
    };
    pairings.set(pairingId, record);
    return {
      pairingId,
      pollSecret,
      userCode: record.userCode,
      clientName: record.clientName,
      agentKind: record.agentKind,
      requestedScopes: record.requestedScopes,
      expiresAt: new Date(record.expiresAt).toISOString(),
      status: 'pending',
    };
  }

  function listPendingPairings() {
    cleanup();
    return [...pairings.values()]
      .filter((record) => !record.approvedAt && !record.deniedAt)
      .map((record) => ({
        pairingId: record.pairingId,
        userCode: record.userCode,
        clientName: record.clientName,
        agentKind: record.agentKind,
        requestedScopes: [...record.requestedScopes],
        createdAt: new Date(record.createdAt).toISOString(),
        expiresAt: new Date(record.expiresAt).toISOString(),
      }))
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  }

  function connectionSummary() {
    cleanup();
    const active = [...sessions.values()]
      .filter((session) => !session.revokedAt && session.expiresAt > now());
    const codex = active.filter((session) => session.agentKind === 'codex');
    const pendingPairingCount = [...pairings.values()]
      .filter((record) => !record.approvedAt && !record.deniedAt)
      .length;
    const codexScopes = [...new Set(codex.flatMap((session) => session.scopes))]
      .filter((scope) => AGENT_CONTROL_SCOPE_SET.has(scope))
      .sort();
    const nextExpiry = codex
      .map((session) => session.expiresAt)
      .filter((value) => Number.isFinite(value))
      .sort((left, right) => left - right)[0];
    return {
      schema: 't8-agent-control-connection-summary-v1',
      connected: active.length > 0,
      activeSessionCount: active.length,
      codexConnected: codex.length > 0,
      codexSessionCount: codex.length,
      pendingPairingCount,
      codexScopes,
      nextCodexExpiryAt: nextExpiry ? new Date(nextExpiry).toISOString() : null,
    };
  }

  function approvePairing(input = {}) {
    cleanup();
    const pairingId = String(input.pairingId || '').trim();
    const record = pairings.get(pairingId);
    if (!record) throw new AgentControlAuthError('PAIRING_NOT_FOUND', '配对请求不存在或已过期', 404);
    if (record.approvedAt) return { pairingId, status: 'approved', sessionId: record.sessionId };
    if (String(input.userCode || '').trim().toUpperCase() !== record.userCode) {
      throw new AgentControlAuthError('PAIRING_CODE_MISMATCH', '配对验证码不匹配', 403);
    }
    if (sessions.size >= SESSION_LIMIT) {
      throw new AgentControlAuthError('SESSION_LIMIT_REACHED', 'Agent 会话过多，请先撤销旧会话', 429);
    }
    const approvedScopes = normalizedScopes(input.approvedScopes, record.requestedScopes);
    if (approvedScopes.some((scope) => !record.requestedScopes.includes(scope))) {
      throw new AgentControlAuthError('PAIRING_SCOPE_ESCALATION', '批准权限不得超出 Agent 请求范围', 403);
    }
    const accessToken = randomSecret();
    const sessionId = crypto.randomUUID();
    const approvedAt = now();
    sessions.set(sha256(accessToken), {
      sessionId,
      actorId: `agent:${sessionId}`,
      clientName: record.clientName,
      agentKind: record.agentKind,
      scopes: approvedScopes,
      createdAt: approvedAt,
      expiresAt: approvedAt + sessionTtlMs,
      revokedAt: null,
    });
    Object.assign(record, {
      approvedAt,
      approvedBy: normalizedLabel(input.approvedBy || 'local-owner', '批准者', 80),
      accessToken,
      sessionId,
    });
    return { pairingId, status: 'approved', sessionId };
  }

  function denyPairing(pairingId) {
    cleanup();
    const record = pairings.get(String(pairingId || '').trim());
    if (!record) throw new AgentControlAuthError('PAIRING_NOT_FOUND', '配对请求不存在或已过期', 404);
    record.deniedAt = now();
    record.accessToken = null;
    return { pairingId: record.pairingId, status: 'denied' };
  }

  function pollPairing(input = {}) {
    cleanup();
    const pairingId = String(input.pairingId || '').trim();
    const record = pairings.get(pairingId);
    if (!record) throw new AgentControlAuthError('PAIRING_NOT_FOUND', '配对请求不存在或已过期', 404);
    if (sha256(String(input.pollSecret || '')) !== record.pollSecretHash) {
      throw new AgentControlAuthError('PAIRING_POLL_FORBIDDEN', '配对轮询凭据无效', 403);
    }
    if (record.deniedAt) return { pairingId, status: 'denied' };
    if (!record.approvedAt) return { pairingId, status: 'pending' };
    if (!record.accessToken) return { pairingId, status: 'issued', sessionId: record.sessionId };
    const accessToken = record.accessToken;
    record.accessToken = null;
    record.issuedAt = now();
    return {
      pairingId,
      status: 'approved',
      accessToken,
      sessionId: record.sessionId,
      expiresAt: new Date(sessions.get(sha256(accessToken)).expiresAt).toISOString(),
    };
  }

  function authenticate(accessToken, requiredScopes = []) {
    cleanup();
    const normalized = String(accessToken || '').trim();
    if (!/^[A-Za-z0-9_-]{43,128}$/.test(normalized)) {
      throw new AgentControlAuthError('PAIRING_REQUIRED', '请先在贞贞无限画布中批准 Agent 配对', 401);
    }
    const session = sessions.get(sha256(normalized));
    if (!session || session.revokedAt || session.expiresAt <= now()) {
      throw new AgentControlAuthError('AUTH_EXPIRED', 'Agent 配对已失效，请重新配对', 401);
    }
    const required = normalizedScopes(requiredScopes, [], true);
    if (required.some((scope) => !session.scopes.includes(scope))) {
      throw new AgentControlAuthError('AUTH_SCOPE_FORBIDDEN', '当前 Agent 未获此操作权限', 403);
    }
    return {
      sessionId: session.sessionId,
      actorId: session.actorId,
      clientName: session.clientName,
      agentKind: session.agentKind,
      scopes: [...session.scopes],
      expiresAt: new Date(session.expiresAt).toISOString(),
    };
  }

  function revoke(accessToken) {
    const normalized = String(accessToken || '').trim();
    const tokenHash = sha256(normalized);
    const session = sessions.get(tokenHash);
    if (!session) return { revoked: false };
    session.revokedAt = now();
    sessions.delete(tokenHash);
    return { revoked: true, sessionId: session.sessionId };
  }

  return {
    approvePairing,
    authenticate,
    cleanup,
    connectionSummary,
    createPairing,
    denyPairing,
    listPendingPairings,
    pollPairing,
    revoke,
  };
}

const agentControlAuthService = createAgentControlAuthService(developmentAuthServiceOptions());

module.exports = {
  AGENT_CONTROL_SCOPES,
  AgentControlAuthError,
  agentControlAuthService,
  createAgentControlAuthService,
  developmentAuthServiceOptions,
  normalizedScopes,
};
