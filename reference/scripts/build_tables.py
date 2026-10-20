import sys, json
sys.dont_write_bytecode = True
from palette import *
from contrast import check, cr, parse, hexs, val

def mix(c1, p1, c2):
    a = parse(c1); b = parse(c2)
    return '#%02X%02X%02X' % tuple(round(a[i]*p1 + b[i]*(1-p1)) for i in range(3))

# derived: label-deep-diving (thinking label), computed from ramp remap
dd_light = mix(DEEPSEEK_RAMP['500'], 0.70, '#172554')      # blue-950 stays upstream rgb(23,37,84)
dd_dark  = mix(DEEPSEEK_RAMP['450'], 0.55, BLUISH_RAMP['400'])

def fmt(r): return f'{r:.2f}'
def row(label, fg, bg, need, note=''):
    r = cr(fg, bg)
    return (label, fg, bg, need, r, 'PASS' if r >= need else 'FAIL', note)

out = {}
for mode, name in ((0,'light'),(1,'dark')):
    rows = check(mode)
    def pick(*subs):
        sel = []
        for r in rows:
            if all(s in r[1] for s in subs): sel.append(r)
        return sel
    A = lambda t: val(t, mode)
    core = []
    for tier in ('primary','secondary','tertiary','caption'):
        for surf in ('bg-base','sidebar','composer(input-major)','user-bubble'):
            core += pick(f'label-{tier} on {surf}')
    core += pick('link on bg-base') + pick('link on user-bubble')
    core += pick('state-business-primary(text) on layer-1')
    core += pick('primary button text on button-primary-fill') + pick('send arrow(static #FFF) on button-info-fill')
    core += pick('success text on layer-1') + pick('warn-label on layer-1') + pick('error text on layer-1')
    core += pick('warn-label on warn-tertiary')
    core += pick('focus ring(state-business-primary) vs bg-base') + pick('focus ring(state-business-primary) vs composer')
    core += pick('toast label') + pick('tooltip text')
    core += pick('shiki-keyword') + pick('shiki-comment')
    core += pick('zhen-port-')
    core += pick('switch/checkbox')
    dd = dd_light if mode==0 else dd_dark
    bg = A('--dsw-alias-bg-base')
    dr = row('label-deep-diving(思考态标签,派生) on bg-base', dd, bg, 4.5, f'color-mix 结果 {dd}')
    core_t = [(r[1], r[2], r[3], r[4], r[5], r[6], r[7]) for r in core] + [dr]
    allrows = [(r[0], r[1], r[2], r[3], r[4], r[5], r[6], r[7]) for r in rows] + [('派生',)+dr]
    out[name] = {'core': core_t, 'all': allrows, 'deepdiving': dd}

# upstream comparison (values quoted from design-platform.css)
UP_L = [
 ('label-primary (bluish-1000)', 'rgb(15,17,21)', 7), ('label-secondary (bluish-700)','rgb(97,102,107)',4.5),
 ('label-tertiary (bluish-600)','rgb(129,133,140)',4.5), ('label-caption (bluish-400)','rgb(173,178,184)',4.5),
 ('link (deepseek-500)','rgb(65,118,230)',4.5), ('warn-label (amber-600)','rgb(221,134,41)',4.5),
 ('success-primary 作文字 (green-500)','rgb(34,197,94)',4.5), ('error-primary (red-600)','rgb(236,19,19)',4.5),
 ('发送箭头#FFF on info-fill (deepseek-500)','#FFFFFF',4.5),
]
UP_D = [
 ('label-primary (bluish-50)','rgb(249,250,251)',7), ('label-secondary (bluish-300)','rgb(207,211,214)',4.5),
 ('label-tertiary (bluish-400)','rgb(173,178,184)',4.5), ('label-caption (bluish-600)','rgb(129,133,140)',4.5),
 ('link (deepseek-400)','rgb(122,170,255)',4.5), ('warn-label (amber-600)','rgb(221,134,41)',4.5),
 ('error-primary (red-400)','rgb(242,90,90)',4.5), ('发送箭头#FFF on info-fill (deepseek-400)','#FFFFFF',4.5),
]
def up_rows(lst, bg, special_bg=None):
    res = []
    for lab, fg, need in lst:
        b = special_bg if (special_bg and '发送箭头' in lab) else bg
        r = cr(fg, b)
        res.append((lab, fg, b, need, r, 'PASS' if r>=need else 'FAIL'))
    return res
# info-fill backgrounds: light deepseek-500 rgb(65,118,230); dark deepseek-400 rgb(122,170,255)
out['upstream_light'] = up_rows([(a,b if not a.startswith('发送') else '#FFFFFF',c) for a,b,c in UP_L], '#FFFFFF', 'rgb(65,118,230)')
out['upstream_dark']  = up_rows(UP_D, 'rgb(21,21,23)', 'rgb(122,170,255)')

# non-text (WCAG 1.4.11, 3:1) extra checks
def nt(label, fg, bg): 
    r = cr(fg,bg); return (label, fg, bg, 3.0, r, 'PASS' if r>=3.0 else 'FAIL')
NT = {}
for mode,name in ((0,'light'),(1,'dark')):
    g = lambda k: val(k, mode)
    bg = g('--dsw-alias-bg-base'); comp = g('--dsw-specific-input-major'); sb = g('--dsw-specific-sidebar-fill')
    NT[name] = [
      nt('发送按钮填充 info-fill vs 输入卡', g('--dsw-alias-button-info-fill'), comp),
      nt('发送按钮填充 info-fill vs bg-base', g('--dsw-alias-button-info-fill'), bg),
      nt('状态点 success vs bg-base', g('--dsw-alias-state-success-primary'), bg),
      nt('状态点 warn vs bg-base', g('--dsw-alias-state-warn-primary'), bg),
      nt('状态点 error vs bg-base', g('--dsw-alias-state-error-primary'), bg),
      nt('状态点 idle vs bg-base', g('--dsw-alias-state-idle-primary'), bg),
      nt('状态点 idle vs sidebar', g('--dsw-alias-state-idle-primary'), sb),
      nt('强调色 state-business-primary vs sidebar', g('--dsw-alias-state-business-primary'), sb),
      nt('zhen-secondary vs layer-1', g('--dsw-alias-zhen-secondary'), g('--dsw-alias-bg-layer-1')),
    ]
out['nontext'] = NT

json.dump(out, open('tables.json','w'), ensure_ascii=False, indent=1)
print('dd', dd_light, dd_dark)
for k in ('upstream_light','upstream_dark'):
    print(k)
    for r in out[k]: print('  %-44s %.2f %s' % (r[0], r[4], r[5]))
for m in ('light','dark'):
    print(m, 'core rows', len(out[m]['core']), 'fail', sum(1 for r in out[m]['core'] if r[5]=='FAIL'))
