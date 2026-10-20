import type { Context } from '@deepseek-ai/cordis';
import type {} from '@deepseek-ai/dsh-api-remotes/client';
import type {} from '@deepseek-ai/dsh-client-ui-layout/client';
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client';
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client';
import type {} from '@deepseek-ai/dsh-client-ui-theme/client';
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client';
import React, { useEffect, useState } from 'react';
import { GatewayCheck } from './GatewayCheck.tsx';
import { TaskCenter } from './TaskCenter.tsx';
import zhenRemote from 'dsh-zhen/remote';
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol';
import type { ZhenStatus, Wallet } from 'dsh-zhen';
function unwrap<T>(result: RemoteResult<T>): T { if (!result.ok) throw result.error; return result.value; }
import css from './style.css';
import { Knowledge } from './Knowledge.tsx';
import { Market } from './Market.tsx';
import { Connections } from './Connections.tsx';
import { Updates } from './Updates.tsx';
import { ArtSettings, BrandMark, HeroArtwork } from './Art.tsx';
import { connectDefaultArt } from './default-art-client.ts';
import { Capabilities } from './Capabilities.tsx';
import { RagToolView } from './RagSources.tsx';
import ragCss from './rag.css';

export const inject = ['slots', 'layout', 'theme', 'remote'];

function TideMark({ size = 28 }: { size?: number }): React.ReactElement {
  return <BrandMark size={size}/>;
}

function Workspace({ ctx }: { ctx: Context }): React.ReactElement {
  const [status, setStatus] = useState<ZhenStatus>();
  const [wallet, setWallet] = useState<Wallet>();
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [section, setSection] = useState<'home' | 'settings' | 'knowledge' | 'market' | 'connections' | 'updates' | 'art' | 'tasks'>('home');
  useEffect(() => {
    let mounted = true;
    ctx.remote.zhen.status().then(value => { if (mounted) setStatus(unwrap(value)); }).catch(() => { if (mounted) setNotice('扩展服务暂时不可用，请检查连接。'); });
    return () => { mounted = false; };
  }, [ctx]);
  async function action(run: () => Promise<void>): Promise<void> {
    setBusy(true); setNotice('');
    try { await run(); } catch (error) { setNotice(error instanceof Error ? error.message : '操作未完成，请重试。'); }
    finally { setBusy(false); }
  }
  const configured = status?.credentialConfigured === true;
  return <div className="zhen-workspace">
    <header className="zhen-topbar">
      <div className="zhen-wordmark"><TideMark size={22}/><span>创作空间</span><span className="zhen-edition">COMMUNITY</span></div>
      <div className="zhen-actions">
        <button type="button" className="zhen-link" onClick={() => setSection('updates')}>更新</button>
        <button type="button" className="zhen-link" onClick={() => setSection(section === 'home' ? 'settings' : 'home')}>{section === 'home' ? '连接与设置' : '返回首页'}</button>
        <button type="button" className="zhen-icon-button" aria-label="切换浅色或深色主题" onClick={() => ctx.theme.setTheme(document.body.hasAttribute('data-ds-dark-theme') ? 'light' : 'dark')}>◐</button>
      </div>
    </header>
    <main className="zhen-content">
      {section === 'home' ? <><div className="zhen-eyebrow"><span className="zhen-line"/>YOUR IDEAS, IN MOTION</div>
      <div className="zhen-hero">
        <div><h1>{section === 'home' ? <>让灵感，<br/>有处落笔。</> : <>准备好，<br/>开始创作。</>}</h1>
          <p className="zhen-intro">从一个想法出发，整理素材、打磨脚本，<br className="zhen-wide"/>把你的下一部作品慢慢做出来。</p></div>
        <HeroArtwork/>
      </div></> : <div className="zhen-page-heading"><div className="zhen-eyebrow"><span className="zhen-line"/>YOUR CREATIVE TOOLKIT</div><h1>{section === 'tasks' ? '让每次生成，有迹可循。' : section === 'market' ? '让好方法，随手可用。' : section === 'knowledge' ? '让资料，成为创作的底气。' : section === 'updates' ? '跟上变化，安心创作。' : section === 'art' ? '让工作空间，有你的印记。' : '连接你的创作工具。'}</h1></div>}
      {section === 'home' ? <>
        <div className="zhen-start-card">
          <div className="zhen-start-copy"><span className="zhen-small-label">今天想创作点什么？</span><h2>把第一个念头写下来。</h2><p>在会话中继续构思，使用 / 调用已安装技能。</p></div>
          <button type="button" className="zhen-primary" onClick={() => configured ? ctx.layout.selectPanel(null) : setSection('settings')}>{configured ? '进入创作会话' : '连接 Seedance'}<span aria-hidden="true">↗</span></button>
        </div>
        <div className="zhen-section-heading"><h2>从这里开始</h2><span>创作的每一步，都有自己的位置</span></div>
        <div className="zhen-grid">
          <button type="button" className="zhen-feature" onClick={() => ctx.layout.selectPanel(null)}><span className="zhen-feature-number">01 / WRITE</span><h3>构思与写作 <span>↗</span></h3><p>写下一段故事，拆出镜头，<br/>把模糊的想法变成具体的方案。</p></button>
          <button type="button" className="zhen-feature" onClick={() => setSection('settings')}><span className="zhen-feature-number">02 / CONNECT</span><h3>模型与钱包 <span>↗</span></h3><p>配置创作模型，查看账户余额，<br/>清楚知道每一次连接的去向。</p></button>
        <button type="button" className="zhen-feature" onClick={() => setSection('knowledge')}><span className="zhen-feature-number">03 / KNOWLEDGE</span><h3>本地知识库 <span>↗</span></h3><p>整理你授权的文字资料，<br/>按项目查找有出处的参考。</p></button></div>
        <button type="button" className="zhen-market-entry" onClick={() => setSection('market')}><div><span className="zhen-feature-number">CREATIVE SKILLS</span><h3>把创作方法，装进口袋。</h3><p>浏览技能市场，找到适合你的写作、分镜和制作流程。</p></div><span aria-hidden="true">↗</span></button>
        <button type="button" className="zhen-market-entry" onClick={() => setSection('connections')}><div><span className="zhen-feature-number">CONNECTED TOOLS</span><h3>接上你的创作画布。</h3><p>连接现有 T8 画布，查看能力、项目和任务。</p></div><span aria-hidden="true">↗</span></button>
        <button type="button" className="zhen-market-entry" onClick={() => setSection('tasks')}><div><span className="zhen-feature-number">GENERATION TASKS</span><h3>看见创作进度与实扣费用。</h3><p>按已有任务编号持续追踪，断线后继续查询原任务。</p></div><span aria-hidden="true">↗</span></button>
        <button type="button" className="zhen-link zhen-margin" onClick={() => setSection('art')}>外观与社区角色素材 ↗</button>
      </> : section === 'tasks' ? <TaskCenter api={ctx.remote.zhen} onSettings={() => setSection('settings')} onConnections={() => setSection('connections')}/> : section === 'knowledge' ? <Knowledge api={ctx.remote.zhen}/> : section === 'market' ? <Market api={ctx.remote.zhen}/> : section === 'connections' ? <Connections api={ctx.remote.zhen}/> : section === 'updates' ? <Updates api={ctx.remote.zhen}/> : section === 'art' ? <ArtSettings/> : <div className="zhen-settings">
        <section className="zhen-card"><div className="zhen-section-heading"><h2>Seedance 连接</h2><span>{configured ? '已保存令牌' : '待添加令牌'}</span></div>
          <p>默认模型 <strong>deepseek/deepseek-v4.1-flash</strong></p>
          <p className="zhen-muted">令牌由本机 DSH 凭据服务保存。钱包查询由 Host 发起；保存令牌不代表已验证聊天权限。</p>
          <form onSubmit={event => { event.preventDefault(); const value = key; setKey(''); setWallet(undefined); void action(async () => { unwrap(await ctx.remote.zhen.saveCredential(value)); setStatus(unwrap(await ctx.remote.zhen.status())); setNotice('令牌已保存。可以进入会话或手动查询钱包。'); }); }}>
            <label className="zhen-label" htmlFor="zhen-key">API 令牌</label>
            <div className="zhen-input-row"><input id="zhen-key" type="password" value={key} onChange={event => setKey(event.target.value)} autoComplete="off" spellCheck={false} placeholder="粘贴 Seedance API 令牌" maxLength={4096}/><button className="zhen-primary" disabled={busy || !key || status?.credentialWritable === false}>保存令牌</button></div>
          </form>
          <div className="zhen-actions zhen-margin"><a href="https://api.seedance.nz/keys" target="_blank" rel="noreferrer">管理 API 令牌 ↗</a>{configured && <button type="button" className="zhen-link" disabled={busy || !status?.credentialWritable} onClick={() => void action(async () => { unwrap(await ctx.remote.zhen.removeCredential()); setWallet(undefined); setStatus(unwrap(await ctx.remote.zhen.status())); setNotice('本地令牌已移除。'); })}>移除本地令牌</button>}</div>
        </section>
        <section className="zhen-card"><div className="zhen-section-heading"><h2>账户钱包</h2><button type="button" className="zhen-secondary" disabled={busy || !configured} onClick={() => void action(async () => { setWallet(unwrap(await ctx.remote.zhen.wallet())); })}>刷新余额</button></div>
          <div className="zhen-balance">{wallet ? `${wallet.currency} ${wallet.amount.toFixed(2)}` : '尚未查询'}</div><p className="zhen-muted">{wallet ? `查询时间：${new Date(wallet.checkedAt).toLocaleString()}。账户余额不等于令牌可用额度。` : '只在你点击刷新时查询，不会发起生成任务。'}</p>
        </section>
        <GatewayCheck api={ctx.remote.zhen} configured={configured}/>
        <Capabilities api={ctx.remote.zhen} onConversation={() => ctx.layout.selectPanel(null)} onConnections={() => setSection('connections')}/>
      </div>}
      {notice && <div className="zhen-notice" role="status">{notice}</div>}
      <footer className="zhen-footer"><span><TideMark size={17}/> DSH-zhen · 创作者的工作空间</span><span>非官方社区修改版，与 DeepSeek 无隶属关系</span></footer>
    </main>
  </div>;
}

export async function apply(ctx: Context): Promise<void> {
  const unmount = await ctx.remote.$mount(zhenRemote);
  ctx.effect(() => () => { void unmount(); }, 'zhen: remote');
  ctx.effect(() => { const style = document.createElement('style'); style.dataset.dshZhen = ''; style.textContent = css; document.head.append(style); return () => style.remove(); }, 'zhen: styles');
  ctx.effect(() => {
    const previous = document.title;
    document.title = 'DSH-zhen';
    const observer = new MutationObserver(() => {
      if (document.title.includes('DeepSeek Harness')) document.title = document.title.replaceAll('DeepSeek Harness', 'DSH-zhen');
    });
    const title = document.querySelector('title');
    if (title) observer.observe(title, { childList: true, subtree: true, characterData: true });
    return () => { observer.disconnect(); if (document.title === 'DSH-zhen') document.title = previous; };
  }, 'zhen: title');
  ctx.effect(() => ctx.theme.overrideTokens('dsh-zhen', {
    '--dsw-alias-bg-base': { light: '#F4F9FA', dark: '#0A1418' },
    '--dsw-alias-bg-layer-1': { light: '#FFFFFF', dark: '#14242A' },
    '--dsw-alias-label-primary': { light: '#0B1F26', dark: '#EAF5F7' },
    '--dsw-alias-label-secondary': { light: '#34494F', dark: '#BED0D5' },
    '--dsw-specific-sidebar-fill': { light: '#EAF3F5', dark: '#0F1C21' },
    '--dsw-alias-button-primary-fill': { light: '#0F5B6B', dark: '#7AD3DD' },
    '--dsw-alias-button-primary-hover': { light: '#0A4654', dark: '#9DE3E8' },
    '--dsw-alias-brand-primary': { light: '#0F5B6B', dark: '#7AD3DD' },
  }), 'zhen: theme');
  ctx.inject(['remote.zhen'], inner => {
    inner.effect(() => connectDefaultArt(inner.remote.zhen), 'zhen: confirmed local default art');
    inner.slots.inject('main', () => inner.slots.register({ name: 'main', key: 'zhen', inject: () => ({ ctx: inner }) }, Workspace));
  });
  ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({ name: 'sidebar.panellist', id: 'zhen', order: -100, label: '创作空间' }, TideMark));
  ctx.slots.inject('sidebar.brand.mark', () => ctx.slots.register({ name: 'sidebar.brand.mark' }, TideMark));
  ctx.slots.inject('sidebar.brand.name', () => ctx.slots.register({ name: 'sidebar.brand.name' }, () => <span>DSH-zhen</span>));
  ctx.slots.inject('conversation.hero.brand.mark', () => ctx.slots.register({ name: 'conversation.hero.brand.mark' }, () => <BrandMark kind="hero"/>));
  ctx.effect(() => { const style = document.createElement('style'); style.textContent = ragCss; document.head.append(style); return () => style.remove(); }, 'zhen: source cards');
  for (const key of ['zhen_rag_search', 'zhen_rag_open']) ctx.slots.inject('tool.call.toolview', () => ctx.slots.register({ name: 'tool.call.toolview', key }, RagToolView));
}
