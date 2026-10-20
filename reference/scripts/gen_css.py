import sys, datetime
sys.dont_write_bytecode = True
from palette import *

OUT = '/tmp/claude-0/-home-claude/91e4798b-1101-52aa-b272-a861cf0cdb8f/scratchpad/memos/03-tokens.css'

def block(selector, items, indent='  '):
    lines = [selector + ' {']
    for k, v in items:
        lines.append(f'{indent}{k}: {v};')
    lines.append('}')
    return '\n'.join(lines)

def ramp_items(prefix, ramp):
    return [(f'--dsw-static-{prefix}-{k}', v) for k, v in ramp.items()]

out = []
w = out.append
w('''/* ==========================================================================
 * DSH-zhen · 03-tokens.css  —  “潮汐 / Tide” 主题覆盖层（设计规范附件）
 * 配套文档：03-ui-design-spec.md（对比度数值由 scripts/contrast.py 计算并写入该文档）
 *
 * 本文件 = 对上游 packages/client/ui-theme/src/styles/ 中已存在变量的“覆盖”：
 *   - A–G 段：全部变量名均已在上游样式表中确认存在（脚本逐名比对，0 个杜撰）。
 *   - H 段：zhen 扩展变量，上游并不存在（--dsw-alias-zhen-* / --dsw-zhen-*），
 *           需在 fork 的 ui-theme 新增，或由 ctx.theme.overrideTokens 以动态 token 注入。
 *
 * 两种接入方式（任选其一，详见文档 §2.5）：
 *   ① 作为全局样式表，在 ui-theme 全部样式表之后加载（同特异性，靠后者胜）；
 *   ② 按 {light, dark} 成对拆成 ctx.theme.overrideTokens('dsh-zhen', {...})（行内变量，
 *      优先级最高，且随 light/dark 自动切换）。elevation 三件套属 `body, body *` 逐元素声明，
 *      行内覆盖无效，必须走①（见 E 段）。
 *
 * 特异性注意：上游把变量声明在 `body` 与 `body[data-ds-dark-theme]`；因此本文件对每个变量
 * 同时给出这两个选择器的值；macOS 的 `html[data-platform='darwin'] body` 菜单填充单独处理（C 段）。
 * ========================================================================== */
''')

w('/* ---------- A. 静态色阶重映射（兜底：未被语义层显式覆盖的消费者仍随主题着色） ---------- */')
ramps = ramp_items('deepseek', DEEPSEEK_RAMP) + ramp_items('neutral-bluish', BLUISH_RAMP)
w(block('body,\nbody[data-ds-dark-theme]', ramps))
w('')

for mode, sel, title in ((0, 'body', 'Light · 浅滩 Shoal'), (1, 'body[data-ds-dark-theme]', 'Dark · 深潮 Abyss')):
    w(f'/* ---------- B{mode+1}. 语义 alias — {title} ---------- */')
    items = [(k, v[mode]) for k, v in ALIAS.items()]
    items += [(k, v[mode]) for k, v in MENU.items()]
    items.append(('--dsw-specific-menu', 'var(--dsw-menu-surface-fill)'))
    w(block(sel, items))
    w('')

w('/* ---------- C. macOS 桌面端菜单填充（上游以 html[data-platform] 提高特异性，需同级覆盖） ---------- */')
w(block("html[data-platform='darwin'] body", [('--dsw-specific-menu', MENU_DARWIN[0])]))
w(block("html[data-platform='darwin'] body[data-ds-dark-theme]", [('--dsw-specific-menu', MENU_DARWIN[1])]))
w('')

w('/* ---------- D. 代码高亮（shiki css-variables 主题；浅色在 :root，深色在 body 属性上） ---------- */')
w(block(':root', [(k, v[0]) for k, v in SHIKI.items()]))
w(block('body[data-ds-dark-theme]', [(k, v[1]) for k, v in SHIKI.items()]))
w('')

w('''/* ---------- E. 阴影 / Elevation ----------
 * --dsw-shadow-lv1..3 声明在 body 上，行内覆盖有效。
 * --dsw-elevation-panel/prominent/soft 由上游以 `body, body *` 逐元素重声明（为了让组件重绑
 * --dsw-elevation-stroke-color 生效），因此只能用同样的选择器在其后覆盖；行内 token 覆盖无效。
 * 描边仍走 var(--dsw-elevation-stroke)，保持“0.5px 发丝线 + border:0”的上游契约。 */''')
w(block('body', [
 ('--dsw-shadow-lv1', '0 2px 4px 0 rgba(8, 70, 88, 0.06)'),
 ('--dsw-shadow-lv1-blur', '0 4px 12px 0 rgba(8, 70, 88, 0.03)'),
 ('--dsw-shadow-lv2', '0 4px 12px 0 rgba(8, 70, 88, 0.03), 0 2px 8px 0 rgba(8, 70, 88, 0.05)'),
 ('--dsw-shadow-lv3', '0 0 1px 0 rgba(8, 70, 88, 0.22), 0 0 4px 0 rgba(8, 70, 88, 0.03), 0 12px 32px 0 rgba(8, 70, 88, 0.10)'),
 ('--dsw-elevation-stroke-color', 'var(--dsw-alias-border-l4)'),
 ('--dsw-linear-gradient-think', 'linear-gradient(180deg, #F4F9FA 20.19%, rgba(244, 249, 250, 0) 100%)'),
 ('--dsw-linear-think-select', 'linear-gradient(180deg, #EEF6F8 20.19%, rgba(238, 246, 248, 0) 100%)'),
]))
w(block('body[data-ds-dark-theme]', [
 ('--dsw-shadow-lv1', '0 2px 4px 0 rgba(0, 0, 0, 0.30)'),
 ('--dsw-shadow-lv1-blur', '0 4px 12px 0 rgba(0, 0, 0, 0.16)'),
 ('--dsw-shadow-lv2', '0 4px 12px 0 rgba(0, 0, 0, 0.20), 0 2px 8px 0 rgba(0, 0, 0, 0.26)'),
 ('--dsw-shadow-lv3', '0 0 1px 0 rgba(214, 240, 245, 0.20), 0 0 4px 0 rgba(0, 0, 0, 0.20), 0 12px 32px 0 rgba(0, 0, 0, 0.45)'),
 ('--dsw-linear-gradient-think', 'linear-gradient(180deg, #0A1418 20.19%, rgba(10, 20, 24, 0) 100%)'),
 ('--dsw-linear-think-select', 'linear-gradient(180deg, #14242A 20.19%, rgba(20, 36, 42, 0) 100%)'),
]))
w(block('body,\nbody *', [
 ('--dsw-elevation-panel', 'var(--dsw-elevation-stroke), 0 3px 8px 0 rgba(8, 70, 88, 0.05), 0 0 16px 0 rgba(8, 70, 88, 0.04)'),
 ('--dsw-elevation-prominent', 'var(--dsw-elevation-stroke), 0 4px 10px 0 rgba(8, 70, 88, 0.06), 0 0 22px 0 rgba(8, 70, 88, 0.07)'),
 ('--dsw-elevation-soft', 'var(--dsw-elevation-stroke), 0 6px 20px 0 rgba(8, 70, 88, 0.05), 0 0 28px 0 rgba(79, 209, 220, 0.12)'),
]))
w(block('body[data-ds-dark-theme],\nbody[data-ds-dark-theme] *', [
 ('--dsw-elevation-panel', 'var(--dsw-elevation-stroke), 0 3px 8px 0 rgba(0, 0, 0, 0.28), 0 0 16px 0 rgba(0, 0, 0, 0.18)'),
 ('--dsw-elevation-prominent', 'var(--dsw-elevation-stroke), 0 4px 10px 0 rgba(0, 0, 0, 0.34), 0 0 22px 0 rgba(0, 0, 0, 0.26)'),
 ('--dsw-elevation-soft', 'var(--dsw-elevation-stroke), 0 6px 20px 0 rgba(0, 0, 0, 0.26), 0 0 28px 0 rgba(79, 209, 220, 0.10)'),
]))
w('')

w('''/* ---------- F. 字体 / 动效 / 圆角 ----------
 * 字体：只改“内置默认栈”，用户在 Settings 里填写的字体仍排在最前（上游 base.css 的 body 层合成规则不变）。
 * 默认栈沿用上游结构（系统 UI 字体负责拉丁，PingFang/YaHei 负责中文），尾部补 Noto/思源（均为 OFL，
 * 仅在用户本机已安装时命中，不随包分发）。HarmonyOS Sans / MiSans 授权条款待核实，故不进默认栈。
 * 圆角阶梯 4/8/12/16/20/28 与 superellipse(1.5) 保持上游不变（docs/ui-radius.md 为准），此处不覆盖。
 * 动效沿用上游 --ds-* 曲线与时长；reduced-motion 由各组件自带，本文件仅对 zhen 装饰动效做归零。 */''')
w(block('body', [
 ('--dsh-font-family-text-default', "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', 'Helvetica Neue', Helvetica, Arial, 'Noto Sans SC', 'Noto Sans CJK SC', 'Source Han Sans SC', sans-serif"),
 ('--dsh-font-family-code-default', "'SF Mono', 'JetBrains Mono', 'Fira Code', Consolas, 'Liberation Mono', Menlo, Courier, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans Mono CJK SC'"),
 ('--dsw-font-family-brand', "'Montserrat', var(--dsh-font-family-text-default)"),
]))
w('')

w('/* ---------- G. 首次引导（Desktop onboarding）配色 ---------- */')
w(block('body', [
 ('--dsw-alias-onboarding-accent', 'rgb(11, 122, 140)'),
 ('--dsw-gradient-onboarding-violet-stops', '#3A2F8F 33.102%, #7A6BE0 50.954%, #CFC8FF 85.326%, #3A2F8F'),
 ('--dsw-gradient-onboarding-blue-stops', '#0B5E8C 18.75%, #2C9AD1 51.78%, #8FDCF2 86.252%, #0B5E8C'),
 ('--dsw-gradient-onboarding-cyan-stops', '#087C8C 21.154%, #2DC8D6 50.954%, #B6F3F4 85.326%, #087C8C'),
]))
w('')

w('''/* ==========================================================================
 * H. zhen 扩展变量（上游不存在！）—— 命名空间 --dsw-alias-zhen-* / --dsw-zhen-*
 *    用途：hero/侧栏水纹与潮汐装饰、副色（海葵紫）、画布端口类型色、装饰动效时长。
 *    落地：fork 的 ui-theme 新增一张 zhen.css；或经 ctx.theme.overrideTokens 作为动态 token 注入。
 * ========================================================================== */''')
w(block('body', [(k, v[0]) for k, v in ZHEN.items()] + [
 ('--dsw-zhen-duration-ripple', '2400ms'),
 ('--dsw-zhen-duration-drift', '48s'),
 ('--dsw-zhen-duration-bubble', '5200ms'),
]))
w(block('body[data-ds-dark-theme]', [(k, v[1]) for k, v in ZHEN.items()]))
w('''
@media (prefers-reduced-motion: reduce) {
  body {
    --dsw-zhen-duration-ripple: 0ms;
    --dsw-zhen-duration-drift: 0s;
    --dsw-zhen-duration-bubble: 0ms;
  }
}
''')

open(OUT, 'w').write('\n'.join(out))
print('wrote', OUT)
