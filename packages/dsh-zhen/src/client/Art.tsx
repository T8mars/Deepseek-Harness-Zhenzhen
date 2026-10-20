import React, { useEffect, useRef, useState } from 'react';
import { DEFAULT_ART_PREFERENCES, importArtDirectory, removeArt, saveArt, saveArtPreferences, useArt } from './art-store.ts';
import type { ArtPreferences, ArtSlot } from './art-store.ts';
import { reloadDefaultArt } from './default-art-client.ts';

export function AbstractMark({ size = 28 }: { size?: number }): React.ReactElement {
  return <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true"><circle cx="16" cy="16" r="5" fill="currentColor"/><circle cx="16" cy="16" r="10" stroke="currentColor" strokeWidth="1.4"/><path d="M16 1a15 15 0 0 1 15 15M16 31A15 15 0 0 1 1 16" stroke="currentColor" strokeWidth="1.4"/></svg>;
}

function Artwork({ src, fallback, className, style, label }: { src?: string; fallback: React.ReactNode; className?: string; style?: React.CSSProperties; label: string }): React.ReactElement {
  const [failed, setFailed] = useState('');
  return src && failed !== src ? <img src={src} alt={label} className={className} style={style} onError={() => setFailed(src)} draggable={false}/> : <>{fallback}</>;
}

export function BrandMark({ size = 28, kind = 'sidebar' }: { size?: number; kind?: 'sidebar' | 'hero' }): React.ReactElement {
  const art = useArt();
  const enabled = art.loaded && art.preferences.mode !== 'off';
  const light = enabled ? (kind === 'hero' ? art.assets['hero-mark']?.url ?? art.assets.mark?.url : art.assets.mark?.url) : undefined;
  const dark = enabled ? (kind === 'hero' ? art.assets['hero-mark-dark']?.url ?? art.assets['mark-dark']?.url ?? light : art.assets['mark-dark']?.url ?? light) : undefined;
  return <span className="zhen-brand-art" style={{ width: size, height: size }}>
    <span className="zhen-art-light"><Artwork src={light} label="用户提供的品牌标记" fallback={<AbstractMark size={size}/>} style={{ width: size, height: size, objectFit: 'contain' }}/></span>
    <span className="zhen-art-dark"><Artwork src={dark} label="用户提供的品牌标记" fallback={<AbstractMark size={size}/>} style={{ width: size, height: size, objectFit: 'contain' }}/></span>
  </span>;
}

export function HeroArtwork(): React.ReactElement {
  const art = useArt(), prefs = art.preferences;
  const element = useRef<HTMLDivElement>(null), [width, setWidth] = useState(0);
  useEffect(() => {
    const workspace = element.current?.closest('.zhen-workspace');
    if (!workspace) return;
    setWidth(workspace.clientWidth);
    const observer = new ResizeObserver(entries => { if (entries[0]) setWidth(entries[0].contentRect.width); });
    observer.observe(workspace); return () => observer.disconnect();
  }, []);
  const enabled = art.loaded && prefs.mode !== 'off' && prefs.mode !== 'mark' && (prefs.mode !== 'auto' || width >= 900);
  const style = { objectPosition: `${prefs.x * 100}% ${prefs.y * 100}%`, transform: `scale(${prefs.scale})` };
  const fallback = <div className="zhen-art-fallback" role="img" aria-label="原创水纹装饰"><div className="zhen-ripple zhen-ripple-a"/><div className="zhen-ripple zhen-ripple-b"/><div className="zhen-ripple zhen-ripple-c"/><div className="zhen-orb"/><span className="zhen-art-caption">灵感正在泛起涟漪</span></div>;
  return <div className="zhen-hero-art" data-art-mode={prefs.mode} ref={element}>
    <div className="zhen-art-stage">
      <div className="zhen-art-light"><Artwork src={enabled ? art.assets.portrait?.url : undefined} label="用户提供的社区角色素材" className="zhen-portrait" style={style} fallback={fallback}/></div>
      <div className="zhen-art-dark"><Artwork src={enabled ? art.assets['portrait-dark']?.url ?? art.assets.portrait?.url : undefined} label="用户提供的社区角色素材" className="zhen-portrait" style={style} fallback={fallback}/></div>
    </div>
    <div className="zhen-hero-mark"><BrandMark size={34} kind="hero"/></div>
  </div>;
}

const labels: Record<ArtSlot, string> = { portrait: '首页素材（通用）', 'portrait-dark': '首页素材（深色替代，可选）', mark: '侧栏品牌标记（通用）', 'mark-dark': '侧栏品牌标记（深色替代，可选）', 'hero-mark': '首页小标记（可选）', 'hero-mark-dark': '首页小标记（深色替代，可选）' };

export function ArtSettings(): React.ReactElement {
  const art = useArt();
  const [draft, setDraft] = useState<ArtPreferences>(art.preferences);
  const [busy, setBusy] = useState(false), [notice, setNotice] = useState('');
  useEffect(() => { setDraft(art.preferences); }, [art.preferences]);
  async function action(work: () => Promise<void>): Promise<void> { setBusy(true); setNotice(''); try { await work(); } catch (error) { setNotice(error instanceof Error ? error.message : '素材操作未完成。'); } finally { setBusy(false); } }
  return <div className="zhen-settings">
    <section className="zhen-card"><div className="zhen-section-heading"><h2>鲸鱼娘与品牌素材</h2><span>默认美术 + 个人替换</span></div><p>默认美术用于首页和品牌位。你导入的图片优先替换对应位置，也可以单独提供深色主题图片。</p><p className="zhen-muted">使用静态 PNG、JPEG 或 WebP，单张不超过 2 MiB，尺寸不超过 4096 × 4096。个人替换只保存在当前浏览器。</p><label className="zhen-label" htmlFor="zhen-art-package">导入完整美术包文件夹</label><input id="zhen-art-package" type="file" className="zhen-file-input" multiple {...{ webkitdirectory: '', directory: '' }} disabled={busy || !art.loaded} onChange={event => { const files = Array.from(event.currentTarget.files ?? []); event.currentTarget.value = ''; if (files.length) void action(async () => { await importArtDirectory(files); setNotice('美术包已保存在本机；当前槽位与署名设置已按清单替换。'); }); }}/><p className="zhen-muted">文件夹需要 manifest.json 和对应静态图片。完整导入会替换个人槽位和署名；原文件保留。也可以在下方逐张选择。</p>{art.storageError && <p role="status" className="zhen-notice">浏览器素材记录暂不可用，个人替换尚未载入。当前使用可用的默认显示。</p>}</section>
    <section className="zhen-card"><h2>本机默认美术</h2><p role="status">{art.defaultArt.status === 'loading' ? '正在载入默认美术…' : art.defaultArt.status === 'ready' ? art.defaultArt.pack!.name : art.defaultArt.status === 'none' ? '当前未配置默认美术，可导入个人素材。' : '默认美术暂未载入，可重新读取。'}</p>{art.defaultArt.pack && <><p>{art.defaultArt.pack.credit.artist}</p><p className="zhen-source-path">来源：{art.defaultArt.pack.credit.source}</p><p>{art.defaultArt.pack.credit.license}</p>{art.defaultArt.pack.credit.url && <a href={art.defaultArt.pack.credit.url} target="_blank" rel="noreferrer">查看素材来源</a>}{art.defaultArt.pack.credit.notice && <details className="zhen-margin"><summary>作者与许可说明</summary><pre className="zhen-source-path" style={{ whiteSpace: 'pre-wrap' }}>{art.defaultArt.pack.credit.notice}</pre></details>}</>}<button type="button" className="zhen-secondary zhen-margin" disabled={busy || art.defaultArt.status === 'loading'} onClick={() => void action(reloadDefaultArt)}>重新读取默认美术</button></section>
    <div className="zhen-grid">{(Object.keys(labels) as ArtSlot[]).map(slot => <section className="zhen-card" key={slot}>
      <h2>{labels[slot]}</h2><div className="zhen-upload-preview"><Artwork src={art.assets[slot]?.url} label={labels[slot]} fallback={<AbstractMark size={50}/>}/></div>
      <p className="zhen-source-path">{art.assets[slot] ? `${art.customSlots.includes(slot) ? '个人替换' : '默认美术'} · ${art.assets[slot]!.name} · ${art.assets[slot]!.width} × ${art.assets[slot]!.height}` : '尚未导入，使用水纹图形。'}</p>
      <label className="zhen-label" htmlFor={`zhen-art-${slot}`}>选择{labels[slot]}</label><input id={`zhen-art-${slot}`} className="zhen-file-input" type="file" accept="image/png,image/jpeg,image/webp" disabled={busy || !art.loaded} onChange={event => { const file = event.currentTarget.files?.[0]; event.currentTarget.value = ''; if (file) void action(async () => { await saveArt(slot, file); setNotice('素材已保存在本机，首页与品牌位已更新。'); }); }}/>
      {art.customSlots.includes(slot) && <button type="button" className="zhen-link zhen-margin" aria-label={`移除${labels[slot]}`} disabled={busy} onClick={() => void action(async () => { await removeArt(slot); setNotice('已移除此个人替换，恢复默认显示。原文件保留。'); })}>移除此个人替换</button>}
    </section>)}</div>
    <section className="zhen-card"><h2>显示方式</h2><form onSubmit={event => { event.preventDefault(); void action(async () => { await saveArtPreferences(draft); setNotice('显示设置已保存。'); }); }}>
      <label className="zhen-label" htmlFor="zhen-art-mode">角色显示模式</label><select className="zhen-input" id="zhen-art-mode" value={draft.mode} disabled={busy} onChange={event => setDraft({ ...draft, mode: event.target.value as ArtPreferences['mode'] })}>{[['auto', '自动适配'], ['stage', '舞台展示'], ['peek', '紧凑展示'], ['mark', '仅品牌标记'], ['off', '关闭用户素材']].map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
      <p className="zhen-muted">自动模式按创作区宽度切换展示。窄屏保留品牌标记；缺少对应素材时使用原创抽象图形。</p>
      <div className="zhen-art-ranges">{([['x', '水平焦点', 0, 1], ['y', '垂直焦点', 0, 1], ['scale', '显示比例', .5, 1.5]] as const).map(([key, label, min, max]) => <label className="zhen-label" key={key}>{label} · {draft[key].toFixed(2)}<input type="range" min={min} max={max} step="0.01" value={draft[key]} disabled={busy} onChange={event => setDraft({ ...draft, [key]: Number(event.target.value) })}/></label>)}</div>
      <div className="zhen-input-pair"><label className="zhen-label">作者署名<input className="zhen-input" maxLength={200} value={draft.artist} onChange={event => setDraft({ ...draft, artist: event.target.value })}/></label><label className="zhen-label">素材来源<input className="zhen-input" maxLength={500} value={draft.source} onChange={event => setDraft({ ...draft, source: event.target.value })}/></label></div>
      <label className="zhen-label">许可备注<textarea className="zhen-input" maxLength={1000} value={draft.license} onChange={event => setDraft({ ...draft, license: event.target.value })}/></label>
      <div className="zhen-actions zhen-wrap"><button className="zhen-primary" disabled={busy || !art.loaded}>保存显示设置</button><button type="button" className="zhen-secondary" disabled={busy} onClick={() => setDraft({ ...draft, mode: DEFAULT_ART_PREFERENCES.mode, x: DEFAULT_ART_PREFERENCES.x, y: DEFAULT_ART_PREFERENCES.y, scale: DEFAULT_ART_PREFERENCES.scale })}>重置显示选项</button></div>
    </form></section>
    <section className="zhen-card"><h2>四种底色预览</h2><p className="zhen-muted">检查通用和深色素材在实际底色上的可辨识度。这里只调整容器显示，不会改变原始图片。</p><div className="zhen-art-surfaces">{['#F4F9FA', '#FFFFFF', '#0A1418', '#14242A'].map((background, index) => <div className="zhen-art-surface" style={{ background }} key={background}><Artwork src={(index > 1 ? art.assets['portrait-dark'] ?? art.assets.portrait : art.assets.portrait)?.url} label={`${background} 底色上的用户素材`} fallback={<AbstractMark size={48}/>} style={{ objectPosition: `${draft.x * 100}% ${draft.y * 100}%`, transform: `scale(${draft.scale})` }}/><span style={{ color: index > 1 ? '#EAF5F7' : '#0B1F26' }}>{background}</span></div>)}</div></section>
    {notice && <div className="zhen-notice" role="status">{notice}</div>}
  </div>;
}
