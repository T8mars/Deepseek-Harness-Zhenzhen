import sys, json
sys.dont_write_bytecode = True
from palette import ALIAS, ZHEN
from contrast import cr

def A(tok, mode): return ALIAS[tok][mode]
def Z(tok, mode): return ZHEN[tok][mode]

FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', 'Helvetica Neue', Helvetica, Arial, 'Noto Sans SC', 'Noto Sans CJK SC', 'Source Han Sans SC', sans-serif"

# (canvas token, DSH source description, light, dark)
def build():
    rows = []
    def add(tok, src, l, d): rows.append((tok, src, l, d))
    add('appBg', '--dsw-alias-bg-base', A('--dsw-alias-bg-base',0), A('--dsw-alias-bg-base',1))
    add('canvasBg', 'light=--dsw-alias-bg-document-preview；dark=画布专用（比 appBg 略浅，避免两者完全相同）', A('--dsw-alias-bg-document-preview',0), '#0D191E')
    add('panelBg', '--dsw-alias-bg-layer-1', A('--dsw-alias-bg-layer-1',0), A('--dsw-alias-bg-layer-1',1))
    add('panelBgElevated', '--dsw-alias-bg-layer-2', A('--dsw-alias-bg-layer-2',0), A('--dsw-alias-bg-layer-2',1))
    add('panelBgMuted', '--dsw-alias-bg-module-platform', A('--dsw-alias-bg-module-platform',0), A('--dsw-alias-bg-module-platform',1))
    add('nodeBg', '--dsw-alias-bg-layer-2(不透明 hex)', A('--dsw-alias-bg-layer-2',0), A('--dsw-alias-bg-layer-2',1))
    add('nodeHeaderBg', '--dsw-alias-state-business-tertiary', A('--dsw-alias-state-business-tertiary',0), A('--dsw-alias-state-business-tertiary',1))
    add('textMain', '--dsw-alias-label-primary', A('--dsw-alias-label-primary',0), A('--dsw-alias-label-primary',1))
    add('textMuted', '--dsw-alias-label-secondary', A('--dsw-alias-label-secondary',0), A('--dsw-alias-label-secondary',1))
    add('textDim', '--dsw-alias-label-tertiary', A('--dsw-alias-label-tertiary',0), A('--dsw-alias-label-tertiary',1))
    add('accentText', '--dsw-alias-label-primary-foreground(light)/#04222A(dark)', '#FFFFFF', '#04222A')
    add('border', '--dsw-alias-border-l2', 'rgba(8,70,88,0.12)', 'rgba(214,240,245,0.12)')
    add('borderStrong', '画布专用派生(accent α0.45)', 'rgba(11,122,140,0.45)', 'rgba(79,209,220,0.45)')
    add('shadowPanel', '≈--dsw-shadow-lv3(去发丝线)', '0 12px 32px rgba(8,70,88,0.10)', '0 12px 32px rgba(0,0,0,0.45)')
    add('shadowButton', '≈--dsw-shadow-lv1', '0 2px 4px rgba(8,70,88,0.06)', '0 2px 4px rgba(0,0,0,0.30)')
    add('shadowStrong', '画布专用派生', '0 18px 48px rgba(8,70,88,0.16)', '0 18px 48px rgba(0,0,0,0.55)')
    add('radiusPanel', '--dsw-radius 阶梯 16', '16px', '16px')
    add('radiusButton', '--dsw-radius 阶梯 8', '8px', '8px')
    add('radiusNode', '--dsw-radius 阶梯 12', '12px', '12px')
    add('accent', '--dsw-alias-state-business-primary', A('--dsw-alias-state-business-primary',0), A('--dsw-alias-state-business-primary',1))
    add('accentHover', '--dsw-static-deepseek-600(light)/450(dark) 重映射', '#0A6070', '#2FB3C2')
    add('secondary', '--dsw-alias-zhen-secondary(新增)', Z('--dsw-alias-zhen-secondary',0), Z('--dsw-alias-zhen-secondary',1))
    add('warning', '画布专用(light 加深以便作文字使用;dark=--dsw-alias-state-warn-primary)', '#9A5B00', A('--dsw-alias-state-warn-primary',1))
    add('danger', '--dsw-alias-state-error-primary', A('--dsw-alias-state-error-primary',0), A('--dsw-alias-state-error-primary',1))
    add('success', '--dsw-alias-state-success-primary', A('--dsw-alias-state-success-primary',0), A('--dsw-alias-state-success-primary',1))
    add('gridDot', '画布专用（light 介于 bluish-200/300；dark = bluish-850）', '#C9DBE0', '#223840')
    add('edge', '画布专用（light 介于 bluish-500/600；dark = bluish-500）', '#6E8790', '#7F989F')
    add('edgeSelected', '--dsw-alias-state-business-primary', A('--dsw-alias-state-business-primary',0), A('--dsw-alias-state-business-primary',1))
    add('selectionBg', '画布专用(accent α)', 'rgba(11,122,140,0.12)', 'rgba(79,209,220,0.14)')
    add('selectionBorder', '--dsw-alias-state-business-primary', A('--dsw-alias-state-business-primary',0), A('--dsw-alias-state-business-primary',1))
    for p in ('text','image','video','audio'):
        add('port'+p.capitalize(), f'--dsw-alias-zhen-port-{p}(新增)', Z(f'--dsw-alias-zhen-port-{p}',0), Z(f'--dsw-alias-zhen-port-{p}',1))
    add('fontFamily', '--dsh-font-family-text-default', FONT, FONT)
    add('displayFont', '--dsh-font-family-text-default', FONT, FONT)
    return rows

rows = build()
tok = {m: {r[0]: r[2+m] for r in rows} for m in (0,1)}

def checks(m):
    t = tok[m]
    out = []
    def c(label, fg, bg, need, kind='文本'):
        r = cr(fg, bg); out.append((label, fg, bg, need, r, 'PASS' if r >= need else 'FAIL', kind))
    # canvas validateTheme.ts pairs (bg, fg) — need 4.5
    c('[画布校验] appBg/textMain', t['textMain'], t['appBg'], 4.5)
    c('[画布校验] panelBg/textMain', t['textMain'], t['panelBg'], 4.5)
    c('[画布校验] nodeBg/textMain', t['textMain'], t['nodeBg'], 4.5)
    c('[画布校验] panelBg/textMuted', t['textMuted'], t['panelBg'], 4.5)
    c('[画布校验] accent/accentText', t['accentText'], t['accent'], 4.5)
    # extras
    c('textDim on panelBg', t['textDim'], t['panelBg'], 4.5)
    c('textMain on nodeHeaderBg', t['textMain'], t['nodeHeaderBg'], 4.5)
    c('accentText on accentHover', t['accentText'], t['accentHover'], 4.5)
    c('success on panelBg', t['success'], t['panelBg'], 4.5)
    c('warning on panelBg', t['warning'], t['panelBg'], 4.5)
    c('danger on panelBg', t['danger'], t['panelBg'], 4.5)
    for p in ('Text','Image','Video','Audio'):
        c(f'port{p} vs nodeBg', t['port'+p], t['nodeBg'], 3.0, '非文本')
    c('edge vs canvasBg', t['edge'], t['canvasBg'], 3.0, '非文本')
    c('edgeSelected vs canvasBg', t['edgeSelected'], t['canvasBg'], 3.0, '非文本')
    c('nodeBg vs canvasBg(节点跳出)', t['nodeBg'], t['canvasBg'], 1.0, '参考')
    c('secondary vs panelBg', t['secondary'], t['panelBg'], 3.0, '非文本')
    return out

res = {'rows': rows, 'light': checks(0), 'dark': checks(1)}
json.dump(res, open('canvas_map.json','w'), ensure_ascii=False, indent=1)
for m in ('light','dark'):
    print(m)
    for r in res[m]:
        print('  %-40s %s on %s need %.1f got %.2f %s' % (r[0], r[1], r[2], r[3], r[4], r[5]))
