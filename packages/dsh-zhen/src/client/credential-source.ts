/** Shared client-safe presence facts; never forward provider source strings or paths. */
export const credentialSources = ['none', 'stored', 'environment', 'fallback', 'unknown'] as const;
export type CredentialSource = typeof credentialSources[number];
type Presence = { credentialConfigured: boolean; credentialSource?: CredentialSource };

export function credentialSource(configured: boolean, source?: string): CredentialSource {
  if (!configured) return 'none';
  if (source === 'file') return 'stored';
  if (source === 'env') return 'environment';
  return source ? 'fallback' : 'unknown';
}
export function credentialLabel(status?: Presence): string {
  if (!status?.credentialConfigured) return '待添加令牌';
  return status.credentialSource === 'stored' ? '已保存本地令牌'
    : status.credentialSource === 'environment' ? '使用启动环境令牌'
    : status.credentialSource === 'fallback' ? '使用其他来源令牌' : '令牌已配置';
}
export function canRemoveLocalCredential(status?: Presence): boolean {
  return status?.credentialConfigured === true && (!status.credentialSource || status.credentialSource === 'stored' || status.credentialSource === 'unknown');
}
export function credentialRemovalNotice(status: Presence): string {
  if (!status.credentialConfigured) return '本地令牌已移除，当前没有可用令牌。';
  if (status.credentialSource === 'environment') return '本地令牌已移除，当前使用启动环境中的令牌。如需停用，请从启动环境移除后重启 DSH。';
  if (status.credentialSource === 'stored') return '已完成移除操作；当前仍有本地令牌，请检查其他窗口的设置。';
  return '本地令牌已移除，凭据服务仍报告有其他来源的令牌；如需停用，请检查对应来源。';
}
