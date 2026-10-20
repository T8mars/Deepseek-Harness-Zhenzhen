import re, json, sys
sys.dont_write_bytecode = True
from palette import *

def parse(c):
    c = c.strip()
    m = re.fullmatch(r'#([0-9a-fA-F]{6})', c)
    if m:
        h = m.group(1); return (int(h[0:2],16), int(h[2:4],16), int(h[4:6],16), 1.0)
    m = re.fullmatch(r'rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)', c)
    if m:
        return (int(m.group(1)), int(m.group(2)), int(m.group(3)), float(m.group(4) or 1))
    raise ValueError(c)

def over(fg, bg):
    r,g,b,a = parse(fg); R,G,B,_ = parse(bg)
    return (round(r*a+R*(1-a)), round(g*a+G*(1-a)), round(b*a+B*(1-a)), 1.0)

def lum(rgb):
    def ch(v):
        v/=255
        return v/12.92 if v<=0.03928 else ((v+0.055)/1.055)**2.4
    return 0.2126*ch(rgb[0])+0.7152*ch(rgb[1])+0.0722*ch(rgb[2])

def cr(fg, bg_hex):
    bg = parse(bg_hex)
    f = over(fg, bg_hex) if parse(fg)[3] < 1 else parse(fg)
    l1, l2 = lum(f), lum(bg)
    hi, lo = max(l1,l2), min(l1,l2)
    return (hi+0.05)/(lo+0.05)

def hexs(rgb): return '#%02X%02X%02X' % rgb[:3]

def val(tok, mode):
    for d in (ALIAS, MENU, SHIKI, ZHEN):
        if tok in d: return d[tok][mode]
    raise KeyError(tok)

def check(mode):
    A = lambda t: val(t, mode)
    rows = []
    def add(group, label, fg, bg, need, note=''):
        r = cr(fg, bg)
        rows.append((group, label, fg, bg, need, r, 'PASS' if r >= need else 'FAIL', note))
    base = A('--dsw-alias-bg-base'); l1 = A('--dsw-alias-bg-layer-1'); l2 = A('--dsw-alias-bg-layer-2')
    side = A('--dsw-specific-sidebar-fill'); bub = A('--dsw-specific-bubble')
    code = A('--dsw-alias-markdown-code-block'); ovl = A('--dsw-alias-bg-overlay')
    inl = A('--dsw-alias-markdown-inline-code'); inp = A('--dsw-specific-input-major')
    # text hierarchy
    for tok,need in (('primary',7),('secondary',4.5),('tertiary',4.5),('caption',4.5)):
        fg = A('--dsw-alias-label-'+tok)
        for nm,bg in (('bg-base',base),('layer-1',l1),('sidebar',side),('composer(input-major)',inp),('user-bubble',bub),('code-block',code)):
            add('文字层级', f'label-{tok} on {nm}', fg, bg, need, 'AAA目标' if tok=='primary' else '')
    # active nav item text
    nav = A('--dsw-specific-sidebar-nav-item-active')
    add('文字层级','label-primary on nav-item-active', A('--dsw-alias-label-primary'), nav, 4.5)
    add('文字层级','label-secondary on nav-item-active', A('--dsw-alias-label-secondary'), nav, 4.5)
    sel = A('--dsw-alias-bg-document-selection')
    for nm,bg in (('layer-1',l1),('bg-base',base)):
        add('文字层级', f'label-primary on text-selection(over {nm})', A('--dsw-alias-label-primary'), hexs(over(sel, bg)), 4.5)
    # link & accent as text
    for nm,bg in (('bg-base',base),('layer-1',l1),('user-bubble',bub),('code-block',code)):
        add('链接/强调', f'link on {nm}', A('--dsw-alias-link'), bg, 4.5)
    for nm,bg in (('bg-base',base),('layer-1',l1)):
        add('链接/强调', f'state-business-primary(text) on {nm}', A('--dsw-alias-state-business-primary'), bg, 4.5)
    add('链接/强调','label-primary-bluish on business-tertiary(预览徽章)', A('--dsw-alias-label-primary-bluish'), A('--dsw-alias-state-business-tertiary'), 4.5)
    # buttons
    add('按钮','primary button text on button-primary-fill', A('--dsw-alias-label-primary-foreground'), A('--dsw-alias-button-primary-fill'), 4.5)
    add('按钮','primary button text on button-primary-hover', A('--dsw-alias-label-primary-foreground'), A('--dsw-alias-button-primary-hover'), 4.5)
    add('按钮','send arrow(static #FFF) on button-info-fill', '#FFFFFF', A('--dsw-alias-button-info-fill'), 4.5, 'InputBar.module.css:389 写死 #fff')
    add('按钮','send arrow(static #FFF) on button-info-hover', '#FFFFFF', A('--dsw-alias-button-info-hover'), 4.5, '同上')
    add('按钮','label-primary on button-primary-dimmed', A('--dsw-alias-label-primary'), A('--dsw-alias-button-primary-dimmed'), 4.5)
    # status text
    for st,tert in (('success','state-success-tertiary'),('warn','state-warn-tertiary'),('error','state-error-primary')):
        pass
    succ = A('--dsw-alias-state-success-primary'); warnL = A('--dsw-alias-state-warn-label'); err = A('--dsw-alias-state-error-primary')
    for nm,bg in (('layer-1',l1),('bg-base',base)):
        add('状态文字', f'success text on {nm}', succ, bg, 4.5 if mode==1 else 4.5, 'success-primary 同时用于图标与文字，已按文字标准 4.5:1 取值' )
        add('状态文字', f'warn-label on {nm}', warnL, bg, 4.5)
        add('状态文字', f'error text on {nm}', err, bg, 4.5)
    add('状态文字','warn-label on warn-tertiary', warnL, A('--dsw-alias-state-warn-tertiary'), 4.5)
    add('状态文字','success-primary on success-tertiary', succ, A('--dsw-alias-state-success-tertiary'), 4.5)
    # non-text 3:1
    for nm,bg in (('bg-base',base),('layer-1',l1),('composer',inp)):
        add('非文字(≥3:1)', f'focus ring(state-business-primary) vs {nm}', A('--dsw-alias-state-business-primary'), bg, 3.0, 'WCAG 1.4.11/2.4.11')
    for st in ('success','warn','error'):
        add('非文字(≥3:1)', f'state-{st}-primary dot vs layer-1', A(f'--dsw-alias-state-{st}-primary'), l1, 3.0)
    add('非文字(≥3:1)','switch/checkbox fill brand-primary vs layer-1', A('--dsw-alias-brand-primary'), l1, 3.0)
    add('非文字(≥3:1)','scrollbar thumb vs bg-base', A('--dsw-alias-scrollbar-bg-l1'), base, 1.0, '装饰性，无要求')
    # chrome
    add('浮层','toast label on toast-bg', A('--dsw-alias-toast-label'), A('--dsw-alias-toast-bg'), 4.5)
    add('浮层','tooltip text(#FFF) on tooltip-bg', '#FFFFFF', A('--dsw-alias-tooltip-bg'), 4.5)
    # code
    for k in ('constant','string','comment','keyword','parameter','function','string-expression','punctuation','link'):
        add('语法高亮', f'shiki-{k} on code-block', A(f'--shiki-token-{k}'), code, 4.5)
    # zhen ext
    for k in ('text','image','video','audio'):
        add('端口色(扩展)', f'zhen-port-{k} on layer-1', A(f'--dsw-alias-zhen-port-{k}'), l1, 4.5 if mode==0 else 4.5)
    add('端口色(扩展)','zhen-secondary on layer-1', A('--dsw-alias-zhen-secondary'), l1, 4.5)
    add('端口色(扩展)','zhen-secondary on secondary-tertiary', A('--dsw-alias-zhen-secondary'), A('--dsw-alias-zhen-secondary-tertiary'), 4.5)
    # border visibility (informational)
    for k in ('l1','l2','l3','l4'):
        tok = A('--dsw-alias-border-'+k)
        add('边框可见度(信息)', f'border-{k} over layer-1', tok, l1, 1.0, '发丝线为装饰/分隔，不计入 1.4.11')
        add('边框可见度(信息)', f'border-{k} over bg-base', tok, base, 1.0, '')
    return rows

if __name__ == '__main__':
    out = {}
    for mode,name in ((0,'light'),(1,'dark')):
        rows = check(mode)
        out[name] = rows
        fails = [r for r in rows if r[6]=='FAIL']
        print('==', name, 'rows', len(rows), 'FAIL', len(fails))
        for r in fails: print('  FAIL %-34s %s on %s need %.1f got %.2f' % (r[1][:34], r[2], r[3], r[4], r[5]))
    json.dump(out, open('contrast.json','w'), ensure_ascii=False, indent=1)
