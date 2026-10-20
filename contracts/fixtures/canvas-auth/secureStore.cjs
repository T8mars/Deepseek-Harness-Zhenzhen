'use strict';

const { spawnSync } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const STORE_SCHEMA = 't8-zcanvas-secure-store-v1';
const STORE_LIMIT = 256 * 1024;
const DPAPI_ENTROPY = 't8-zcanvas-agent-control-v1';

class SecureStoreError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'SecureStoreError';
    this.code = code;
  }
}

function storePath(options = {}) {
  const explicit = String(options.env?.ZCANVAS_AUTH_STORE || process.env.ZCANVAS_AUTH_STORE || '').trim();
  if (explicit) return path.resolve(explicit);
  return path.join(options.homeDir || os.homedir(), '.zcanvas', 'credentials-v1.json');
}

function encodedPowerShell(script) {
  return Buffer.from(script, 'utf16le').toString('base64');
}

function runDpapi(mode, value, options = {}) {
  const executable = options.powerShell || 'powershell.exe';
  const protect = mode === 'protect';
  const operation = protect
    ? '[Security.Cryptography.ProtectedData]::Protect($b,$e,[Security.Cryptography.DataProtectionScope]::CurrentUser)'
    : '[Security.Cryptography.ProtectedData]::Unprotect([Convert]::FromBase64String($v),$e,[Security.Cryptography.DataProtectionScope]::CurrentUser)';
  const prefix = protect ? '$b=[Text.Encoding]::UTF8.GetBytes($v);' : '';
  const suffix = protect ? '[Convert]::ToBase64String($o)' : '[Text.Encoding]::UTF8.GetString($o)';
  const script = [
    '$ErrorActionPreference="Stop";',
    'Add-Type -AssemblyName System.Security;',
    '$v=[Console]::In.ReadToEnd();',
    `$e=[Text.Encoding]::UTF8.GetBytes("${DPAPI_ENTROPY}");`,
    prefix,
    `$o=${operation};`,
    `[Console]::Out.Write(${suffix});`,
  ].join('');
  const run = options.spawnSync || spawnSync;
  const attemptLimit = Number.isInteger(options.dpapiAttempts)
    ? Math.max(1, Math.min(5, options.dpapiAttempts))
    : 3;
  let result = null;
  for (let attempt = 0; attempt < attemptLimit; attempt += 1) {
    result = run(executable, [
      '-NoLogo',
      '-NoProfile',
      '-NonInteractive',
      '-ExecutionPolicy',
      'Bypass',
      '-EncodedCommand',
      encodedPowerShell(script),
    ], {
      input: String(value),
      encoding: 'utf8',
      windowsHide: true,
      timeout: 10_000,
      maxBuffer: 64 * 1024,
      shell: false,
    });
    if (!result.error && result.status === 0 && String(result.stdout || '').trim()) {
      return String(result.stdout).trim();
    }
  }
  throw new SecureStoreError(
    'CREDENTIAL_STORE_UNAVAILABLE',
    'Windows 当前用户加密存储不可用，未保存 Agent 凭据',
  );
}

function protectValue(value, options = {}) {
  if (typeof options.protect === 'function') return options.protect(String(value));
  const platform = options.platform || process.platform;
  if (platform === 'win32') return runDpapi('protect', value, options);
  if ((options.env || process.env).ZCANVAS_ALLOW_FILE_CREDENTIALS === '1') {
    return Buffer.from(String(value), 'utf8').toString('base64');
  }
  throw new SecureStoreError(
    'CREDENTIAL_STORE_UNAVAILABLE',
    '当前系统没有可用的安全凭据存储；未保存 Agent 凭据',
  );
}

function unprotectValue(value, options = {}) {
  if (typeof options.unprotect === 'function') return options.unprotect(String(value));
  const platform = options.platform || process.platform;
  if (platform === 'win32') return runDpapi('unprotect', value, options);
  if ((options.env || process.env).ZCANVAS_ALLOW_FILE_CREDENTIALS === '1') {
    return Buffer.from(String(value), 'base64').toString('utf8');
  }
  throw new SecureStoreError(
    'CREDENTIAL_STORE_UNAVAILABLE',
    '当前系统没有可用的安全凭据存储；无法读取 Agent 凭据',
  );
}

function emptyStore() {
  return {
    schema: STORE_SCHEMA,
    sessions: {},
    pending: {},
    contexts: {},
    approvals: {},
    recipeSigning: null,
  };
}

function readStore(options = {}) {
  const filePath = storePath(options);
  try {
    const stat = fs.lstatSync(filePath);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > STORE_LIMIT) {
      throw new SecureStoreError('CREDENTIAL_STORE_INVALID', 'Agent 凭据存储无效');
    }
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (parsed?.schema !== STORE_SCHEMA
      || !parsed.sessions || typeof parsed.sessions !== 'object'
      || !parsed.pending || typeof parsed.pending !== 'object'
      || (parsed.contexts != null && typeof parsed.contexts !== 'object')
      || (parsed.approvals != null && typeof parsed.approvals !== 'object')
      || (parsed.recipeSigning != null && typeof parsed.recipeSigning !== 'object')) {
      throw new SecureStoreError('CREDENTIAL_STORE_INVALID', 'Agent 凭据存储格式不兼容');
    }
    if (!parsed.contexts) parsed.contexts = {};
    if (!parsed.approvals) parsed.approvals = {};
    if (!parsed.recipeSigning) parsed.recipeSigning = null;
    return parsed;
  } catch (error) {
    if (error?.code === 'ENOENT') return emptyStore();
    if (error instanceof SecureStoreError) throw error;
    throw new SecureStoreError('CREDENTIAL_STORE_INVALID', '无法读取 Agent 凭据存储');
  }
}

function writeStore(store, options = {}) {
  const filePath = storePath(options);
  const directory = path.dirname(filePath);
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  const serialized = `${JSON.stringify(store)}\n`;
  if (Buffer.byteLength(serialized, 'utf8') > STORE_LIMIT) {
    throw new SecureStoreError('CREDENTIAL_STORE_FULL', 'Agent 凭据存储超过安全限制');
  }
  try {
    fs.writeFileSync(tempPath, serialized, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
    fs.renameSync(tempPath, filePath);
    try { fs.chmodSync(filePath, 0o600); } catch (_) {}
  } finally {
    try { fs.rmSync(tempPath, { force: true }); } catch (_) {}
  }
}

function storePending(instance, pairing, options = {}) {
  const store = readStore(options);
  store.pending[instance.instanceId] = {
    instanceId: instance.instanceId,
    origin: instance.origin,
    pairingId: pairing.pairingId,
    userCode: pairing.userCode,
    expiresAt: pairing.expiresAt,
    pollSecretProtected: protectValue(pairing.pollSecret, options),
    protection: (options.platform || process.platform) === 'win32' ? 'windows-dpapi-current-user' : 'restricted-file',
  };
  writeStore(store, options);
  return { ...store.pending[instance.instanceId], pollSecretProtected: undefined };
}

function loadPending(instanceId, options = {}) {
  const store = readStore(options);
  const record = store.pending[String(instanceId || '')];
  if (!record) return null;
  return {
    ...record,
    pollSecret: unprotectValue(record.pollSecretProtected, options),
    pollSecretProtected: undefined,
  };
}

function deletePending(instanceId, options = {}) {
  const store = readStore(options);
  const existed = Boolean(store.pending[String(instanceId || '')]);
  delete store.pending[String(instanceId || '')];
  writeStore(store, options);
  return existed;
}

function storeSession(instance, session, options = {}) {
  const store = readStore(options);
  store.sessions[instance.instanceId] = {
    instanceId: instance.instanceId,
    origin: instance.origin,
    sessionId: session.sessionId,
    expiresAt: session.expiresAt,
    accessTokenProtected: protectValue(session.accessToken, options),
    protection: (options.platform || process.platform) === 'win32' ? 'windows-dpapi-current-user' : 'restricted-file',
  };
  delete store.pending[instance.instanceId];
  writeStore(store, options);
  return { ...store.sessions[instance.instanceId], accessTokenProtected: undefined };
}

function loadSession(instanceId, options = {}) {
  const store = readStore(options);
  const record = store.sessions[String(instanceId || '')];
  if (!record) return null;
  return {
    ...record,
    accessToken: unprotectValue(record.accessTokenProtected, options),
    accessTokenProtected: undefined,
  };
}

function deleteSession(instanceId, options = {}) {
  const store = readStore(options);
  const existed = Boolean(store.sessions[String(instanceId || '')]);
  delete store.sessions[String(instanceId || '')];
  writeStore(store, options);
  return existed;
}

function configuredInstances(options = {}) {
  const store = readStore(options);
  const current = Number(options.now) || Date.now();
  const remainsValid = (record) => Date.parse(String(record?.expiresAt || '')) > current;
  return {
    sessions: Object.values(store.sessions)
      .filter(remainsValid)
      .map((record) => ({
        instanceId: record.instanceId,
        origin: record.origin,
        sessionId: record.sessionId,
        expiresAt: record.expiresAt,
        configured: true,
      })),
    pending: Object.values(store.pending)
      .filter(remainsValid)
      .map((record) => ({
        instanceId: record.instanceId,
        origin: record.origin,
        pairingId: record.pairingId,
        userCode: record.userCode,
        expiresAt: record.expiresAt,
        configured: true,
      })),
  };
}

function getRecipeSigningSecret(options = {}) {
  const store = readStore(options);
  if (store.recipeSigning?.secretProtected) {
    return {
      keyId: String(store.recipeSigning.keyId || ''),
      secret: unprotectValue(store.recipeSigning.secretProtected, options),
    };
  }
  const secret = crypto.randomBytes(32).toString('base64url');
  const keyId = crypto.createHash('sha256').update(secret).digest('hex').slice(0, 20);
  store.recipeSigning = {
    keyId,
    secretProtected: protectValue(secret, options),
    protection: (options.platform || process.platform) === 'win32'
      ? 'windows-dpapi-current-user'
      : 'restricted-file',
    createdAt: new Date().toISOString(),
  };
  writeStore(store, options);
  return { keyId, secret };
}

function setWorkspaceContext(instanceId, context, options = {}) {
  const store = readStore(options);
  const key = String(instanceId || '').trim();
  const projectId = String(context?.projectId || '').trim();
  const canvasId = String(context?.canvasId || '').trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/.test(key)
    || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/.test(projectId)
    || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/.test(canvasId)) {
    throw new SecureStoreError('WORKSPACE_CONTEXT_INVALID', '工作区项目或画布 ID 无效');
  }
  store.contexts[key] = {
    instanceId: key,
    projectId,
    canvasId,
    selectedAt: new Date().toISOString(),
  };
  writeStore(store, options);
  return store.contexts[key];
}

function getWorkspaceContext(instanceId, options = {}) {
  const store = readStore(options);
  const context = store.contexts[String(instanceId || '')];
  return context ? { ...context } : null;
}

function storeApproval(instance, approval, options = {}) {
  const store = readStore(options);
  const approvalRequestId = String(approval.approvalRequestId || '');
  if (!approvalRequestId) {
    throw new SecureStoreError('APPROVAL_INVALID', '待确认操作缺少 approvalRequestId');
  }
  const key = `${instance.instanceId}:${approvalRequestId}`;
  store.approvals[key] = {
    instanceId: instance.instanceId,
    origin: instance.origin,
    approvalRequestId,
    action: String(approval.action || ''),
    creativeAction: String(approval.preview?.creator?.action || approval.creativeAction || ''),
    operationId: String(approval.operationId || ''),
    patchId: String(approval.patchId || ''),
    projectId: String(approval.projectId || ''),
    canvasId: String(approval.canvasId || ''),
    expiresAt: String(approval.expiresAt || ''),
    pollSecretProtected: protectValue(approval.pollSecret, options),
    protection: (options.platform || process.platform) === 'win32' ? 'windows-dpapi-current-user' : 'restricted-file',
  };
  writeStore(store, options);
  return { ...store.approvals[key], pollSecretProtected: undefined };
}

function approvalRecordsForInstance(store, instanceId) {
  const key = String(instanceId || '');
  return Object.values(store.approvals || {})
    .filter((record) => record && String(record.instanceId || '') === key)
    .sort((left, right) => String(right.expiresAt || '').localeCompare(String(left.expiresAt || '')));
}

function loadApproval(instanceId, approvalRequestIdOrOptions = {}, maybeOptions = {}) {
  const approvalRequestId = typeof approvalRequestIdOrOptions === 'string'
    ? approvalRequestIdOrOptions
    : '';
  const options = typeof approvalRequestIdOrOptions === 'string'
    ? maybeOptions
    : approvalRequestIdOrOptions;
  const store = readStore(options);
  const records = approvalRecordsForInstance(store, instanceId);
  const record = approvalRequestId
    ? records.find((item) => item.approvalRequestId === approvalRequestId)
    : records[0];
  if (!record) return null;
  return {
    ...record,
    pollSecret: unprotectValue(record.pollSecretProtected, options),
    pollSecretProtected: undefined,
  };
}

function deleteApproval(instanceId, approvalRequestIdOrOptions = {}, maybeOptions = {}) {
  const approvalRequestId = typeof approvalRequestIdOrOptions === 'string'
    ? approvalRequestIdOrOptions
    : '';
  const options = typeof approvalRequestIdOrOptions === 'string'
    ? maybeOptions
    : approvalRequestIdOrOptions;
  const store = readStore(options);
  let existed = false;
  for (const [key, record] of Object.entries(store.approvals || {})) {
    if (String(record?.instanceId || '') !== String(instanceId || '')) continue;
    if (approvalRequestId && record.approvalRequestId !== approvalRequestId) continue;
    existed = true;
    delete store.approvals[key];
  }
  writeStore(store, options);
  return existed;
}

module.exports = {
  DPAPI_ENTROPY,
  STORE_LIMIT,
  STORE_SCHEMA,
  SecureStoreError,
  configuredInstances,
  deletePending,
  deleteApproval,
  deleteSession,
  loadPending,
  loadApproval,
  loadSession,
  getWorkspaceContext,
  getRecipeSigningSecret,
  protectValue,
  readStore,
  runDpapi,
  storePath,
  storePending,
  storeApproval,
  storeSession,
  setWorkspaceContext,
  unprotectValue,
  writeStore,
};
