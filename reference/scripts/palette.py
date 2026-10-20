# DSH-zhen palette source of truth. Every value here is emitted into 03-tokens.css
# and every contrast figure in the memo is computed from these same values.
# (light, dark) pairs. Values are '#RRGGBB' or 'rgba(r,g,b,a)' or raw CSS.

# --- semantic colour tokens (all names verified to exist in ui-theme/src/styles) ---
ALIAS = {
 # surfaces
 '--dsw-alias-bg-base':               ('#F4F9FA', '#0A1418'),
 '--dsw-alias-bg-layer-1':            ('#FFFFFF', '#0F1C21'),
 '--dsw-alias-bg-layer-2':            ('#FFFFFF', '#14242A'),
 '--dsw-alias-bg-layer-3':            ('#FFFFFF', '#1A2E35'),
 '--dsw-alias-bg-module-platform':    ('#EEF6F8', '#1A2E35'),
 '--dsw-alias-bg-multi-select':       ('#EEF6F8', '#14242A'),
 '--dsw-alias-bg-overlay':            ('#E1ECEF', '#2D434B'),
 '--dsw-alias-bg-document-preview':   ('#E7F0F3', '#0A1418'),
 '--dsw-alias-bg-skeleton':           ('rgba(8,70,88,0.05)', 'rgba(214,240,245,0.07)'),
 '--dsw-alias-bg-mask-drop':          ('rgba(244,249,250,0.72)', 'rgba(15,28,33,0.72)'),
 '--dsw-alias-bg-document-selection': ('rgba(11,122,140,0.30)', 'rgba(79,209,220,0.32)'),
 '--dsw-specific-sidebar-fill':       ('#EAF3F5', '#0C171B'),
 '--dsw-specific-sidebar-nav-item-hover':  ('#E1EDF0', '#15262C'),
 '--dsw-specific-sidebar-nav-item-active': ('#D6E8EC', '#1F3A43'),
 '--dsw-specific-sidebar-nav-item-active-accent': ('#C4E3E8', '#234650'),
 '--dsw-specific-input-major':        ('#FFFFFF', '#14242A'),
 '--dsw-specific-login-input':        ('#F7FBFC', '#0F1C21'),
 '--dsw-specific-selector':           ('#EEF6F8', '#1A2E35'),
 '--dsw-specific-tip':                ('#EEF6F8', '#1A2E35'),
 '--dsw-specific-bubble':             ('#E1F2F4', '#17323A'),
 '--dsw-specific-bubble-highlight':   ('#C9E7EB', '#234650'),
 # text
 '--dsw-alias-label-primary':         ('#0B1F26', '#E8F4F6'),
 '--dsw-alias-label-secondary':       ('#34494F', '#B7CCD2'),
 '--dsw-alias-label-tertiary':        ('#435C65', '#93AEB6'),
 '--dsw-alias-label-caption':         ('#566F78', '#869FA6'),
 '--dsw-alias-label-dimmed':          ('#C4D6DB', '#2D434B'),
 '--dsw-alias-label-primary-bluish':  ('#0A4A58', '#E8F4F6'),
 '--dsw-alias-label-primary-dimmed':  ('#0E1B20', '#D5E3E7'),
 '--dsw-alias-label-primary-foreground': ('#FFFFFF', '#04222A'),
 '--dsw-alias-label-primary-inverted':   ('#FFFFFF', '#2D434B'),
 '--dsw-alias-label-document-preview':   ('#4D6770', '#BFD1D6'),
 '--dsw-alias-menu-icon':             ('#2D434B', '#D5E3E7'),
 '--dsw-alias-link':                  ('#0A6AA1', '#6CC6F2'),
 # brand / accent
 '--dsw-alias-brand-primary':         ('#0F5B6B', '#8FE3EA'),
 '--dsw-alias-brand-primary-invert':  ('#FFFFFF', '#0F5B6B'),
 '--dsw-alias-brand-text':            ('#0B1F26', '#E8F4F6'),
 '--dsw-alias-brand-primary-new-colorprimary-new-color': ('#0B7A8C', '#4FD1DC'),
 '--dsw-alias-state-business-primary':   ('#0B7A8C', '#4FD1DC'),
 '--dsw-alias-state-business-tertiary':  ('#D5EFF2', '#123A42'),
 '--dsw-alias-button-primary-fill':   ('#0F5B6B', '#8FE3EA'),
 '--dsw-alias-button-primary-hover':  ('#0A4654', '#B3EFF3'),
 '--dsw-alias-button-primary-dimmed': ('#E3EEF1', '#234650'),
 '--dsw-alias-button-contrast-fill':  ('#3D555D', '#E8F4F6'),
 '--dsw-alias-button-info-fill':      ('#0B7285', '#0C7A8A'),
 '--dsw-alias-button-info-hover':     ('#095F70', '#0A6A79'),
 '--dsw-alias-button-elevated-fill':  ('#FFFFFF', '#2C4750'),
 '--dsw-alias-button-floating-fill':  ('#FFFFFF', '#14242A'),
 '--dsw-alias-button-floating-hover': ('#EEF5F7', '#1A2E35'),
 '--dsw-alias-button-ghost-active-border': ('#7F989F', '#66808A'),
 '--dsw-alias-button-ghost-active-fill':   ('#E3EEF1', '#2C4750'),
 '--dsw-alias-button-ghost-active-hover':  ('#D5E3E7', '#3A5760'),
 # interactive overlays
 '--dsw-alias-interactive-bg-hover':        ('rgba(8,70,88,0.06)', 'rgba(214,240,245,0.08)'),
 '--dsw-alias-interactive-bg-active':       ('rgba(8,70,88,0.10)', 'rgba(214,240,245,0.14)'),
 '--dsw-alias-interactive-bg-hover-accent': ('rgba(8,70,88,0.14)', 'rgba(214,240,245,0.24)'),
 '--dsw-alias-interactive-bg-hover-danger': ('rgba(198,45,58,0.06)', 'rgba(255,122,133,0.15)'),
 '--dsw-alias-interactive-bg-hover-solid':  ('#EEF5F7', '#1F3A43'),
 # borders
 '--dsw-alias-border-l1': ('rgba(8,70,88,0.06)', 'rgba(214,240,245,0.06)'),
 '--dsw-alias-border-l2': ('rgba(8,70,88,0.12)', 'rgba(214,240,245,0.12)'),
 '--dsw-alias-border-l3': ('rgba(8,70,88,0.16)', 'rgba(214,240,245,0.16)'),
 '--dsw-alias-border-l4': ('rgba(8,70,88,0.22)', 'rgba(214,240,245,0.22)'),
 '--dsw-alias-border-l2-darkmode-thin': ('rgba(8,70,88,0.10)', 'rgba(214,240,245,0.06)'),
 # state
 '--dsw-alias-state-success-primary':   ('#0F7D4D', '#3DD68C'),
 '--dsw-alias-state-success-secondary': ('#3FBF86', '#2FB877'),
 '--dsw-alias-state-success-tertiary':  ('#DDF6E9', '#123A2A'),
 '--dsw-alias-state-warn-primary':      ('#B87100', '#F5B84A'),
 '--dsw-alias-state-warn-secondary':    ('#E8A317', '#D9962B'),
 '--dsw-alias-state-warn-tertiary':     ('#FDF1D6', '#3A2C10'),
 '--dsw-alias-state-warn-label':        ('#8A5300', '#F5B84A'),
 '--dsw-alias-state-error-primary':     ('#C62D3A', '#FF7A85'),
 '--dsw-alias-state-error-secondary':   ('#E5666F', '#FF7A85'),
 '--dsw-alias-state-idle-primary':      ('#6E8790', '#4D6770'),
 # chrome
 '--dsw-alias-toast-bg':      ('#1F3640', '#2D434B'),
 '--dsw-alias-toast-label':   ('#FFFFFF', '#FFFFFF'),
 '--dsw-alias-tooltip-bg':    ('#1B3039', '#2D434B'),
 '--dsw-alias-switch-thumb':  ('#FFFFFF', '#9DB3BA'),
 '--dsw-alias-scrollbar-bg-l1':    ('#CFE0E5', '#3C535B'),
 '--dsw-alias-scrollbar-bg-l2':    ('#CFE0E5', '#4D6770'),
 '--dsw-alias-scrollbar-hover-l1': ('#B7CDD4', '#4D6770'),
 '--dsw-alias-scrollbar-hover-l2': ('#B7CDD4', '#66808A'),
 # markdown / code surfaces
 '--dsw-alias-markdown-code-block':           ('#F1F7F9', '#0C171B'),
 '--dsw-alias-markdown-code-block-banner':    ('#EBF3F5', '#14242A'),
 '--dsw-alias-markdown-code-segment-selected':   ('#FFFFFF', '#223840'),
 '--dsw-alias-markdown-code-segment-unselected': ('#EEF5F7', '#0C171B'),
 '--dsw-alias-markdown-inline-code':          ('#E8F1F4', '#223840'),
 '--dsw-alias-markdown-citation':             ('#E3EEF1', '#223840'),
 '--dsw-alias-markdown-placeholder':          ('#F1F7F9', '#14242A'),
 '--dsw-alias-markdown-tag':                  ('#EEF5F7', '#14242A'),
 # diff (code-diff only; file-diff-* kept upstream semantics)
 '--dsw-alias-code-diff-added':   ('rgba(19,145,92,0.09)', 'rgba(61,214,140,0.13)'),
 '--dsw-alias-code-diff-deleted': ('rgba(198,45,58,0.08)', 'rgba(255,122,133,0.13)'),
}

# translucent menu material (two layers, see web-styling.md)
MENU = {
 '--dsw-menu-surface-fill':            ('rgba(246,251,252,0.62)', 'rgba(45,67,75,0.50)'),
 '--dsw-alias-menu-group-header-fill': ('rgba(246,251,252,0.94)', 'rgba(26,46,53,0.94)'),
}
MENU_DARWIN = ('rgba(246,251,252,0.94)', 'rgba(30,48,55,0.94)')

# shiki syntax tokens (light on :root, dark on body[data-ds-dark-theme])
SHIKI = {
 '--shiki-token-constant':          ('#0A6AA1', '#6CC6F2'),
 '--shiki-token-string':            ('#16784B', '#7EE0A8'),
 '--shiki-token-comment':           ('#556D76', '#8FA9B0'),
 '--shiki-token-keyword':           ('#B0307A', '#F3A6CF'),
 '--shiki-token-parameter':         ('#A65A0A', '#F2B26B'),
 '--shiki-token-function':          ('#5B4BC2', '#B7ACFF'),
 '--shiki-token-string-expression': ('#116B42', '#9BE8BC'),
 '--shiki-token-punctuation':       ('#3D555D', '#B7CCD2'),
 '--shiki-token-link':              ('#0A6AA1', '#6CC6F2'),
}

# static ramps (fallback tint; semantic layer above is authoritative)
DEEPSEEK_RAMP = {  # "tide" ramp replaces the DeepSeek blue ramp
 '50':'#EAF7F8','100':'#D5EFF2','200':'#B5E4E8','300':'#86D3DA','400':'#4FD1DC',
 '450':'#2FB3C2','500':'#0B7A8C','600':'#0A6070','700-delete':'#0A4F5C','800':'#123A42','900':'#0E2A30',
}
BLUISH_RAMP = {  # teal-tinted neutral ramp replaces neutral-bluish
 '00':'#FFFFFF','50':'#F7FBFC','60':'#F4F9FA','75':'#EEF5F7','100':'#E7F0F3','150':'#E1ECEF',
 '200':'#D5E3E7','300':'#BFD1D6','400':'#9DB3BA','500':'#7F989F','600':'#66808A','700':'#4D6770',
 '750':'#3C535B','800':'#2D434B','850':'#223840','875':'#1A2D34','900':'#14252B','950':'#0E1B20','1000':'#08141A',
}

# --- new, zhen-only extension tokens (NOT present upstream; flagged in memo) ---
ZHEN = {
 '--dsw-alias-zhen-tide-from':       ('#BFEFF3', '#0F4F5C'),
 '--dsw-alias-zhen-tide-to':         ('#DCEBFF', '#14304F'),
 '--dsw-alias-zhen-foam':            ('rgba(255,255,255,0.72)', 'rgba(214,240,245,0.10)'),
 '--dsw-alias-zhen-glow':            ('rgba(79,209,220,0.28)', 'rgba(79,209,220,0.20)'),
 '--dsw-alias-zhen-secondary':       ('#5B4BC2', '#B7ACFF'),
 '--dsw-alias-zhen-secondary-tertiary': ('#ECE9FB', '#2A2650'),
 '--dsw-alias-zhen-port-text':       ('#0A6AA1', '#7DD3FC'),
 '--dsw-alias-zhen-port-image':      ('#8A5300', '#FCD34D'),
 '--dsw-alias-zhen-port-video':      ('#B0307A', '#FDA4AF'),
 '--dsw-alias-zhen-port-audio':      ('#5B4BC2', '#C4B5FD'),
}
