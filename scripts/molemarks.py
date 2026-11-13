# Builds the "Mole Marks" pixel symbol fonts (src/ui/fonts/molemarks*.woff2): arrows, notes, stars, ticks ...
# that Tiny5 / Jersey 15 lack. Needs fonttools + brotli. Usage: python3 scripts/molemarks.py
from fontTools.fontBuilder import FontBuilder
from fontTools.pens.ttGlyphPen import TTGlyphPen
G = {  # char: (bottom row y in px, rows top..bottom)
 '→': (0, ['..#..', '...#.', '#####', '...#.', '..#..']),
 '←': (0, ['..#..', '.#...', '#####', '.#...', '..#..']),
 '↑': (0, ['..#..', '.###.', '#.#.#', '..#..', '..#..']),
 '↓': (0, ['..#..', '..#..', '#.#.#', '.###.', '..#..']),
 '↔': (1, ['.#...#.', '#######', '.#...#.']),
 '⇄': (0, ['...#.', '#####', '.....', '.#...', '#####'][::1]),
 '♪': (0, ['.##.', '.#.#', '.#..', '##..', '##..']),
 '♫': (0, ['.####', '.#..#', '.#..#', '##.##', '##.##']),
 '▼': (1, ['#####', '.###.', '..#..']),
 '▲': (1, ['..#..', '.###.', '#####']),
 '▾': (1, ['###', '.#.']),
 '▸': (1, ['#.', '##', '#.']),
 '▶': (0, ['#...', '##..', '###.', '##..', '#...']),
 '◀': (0, ['...#', '..##', '.###', '..##', '...#']),
 '♥': (0, ['##.##', '#####', '#####', '.###.', '..#..']),
 '★': (0, ['..#..', '#####', '.###.', '.#.#.', '#...#']),
 '☆': (0, ['..#..', '##.##', '#...#', '.#.#.', '#...#']),
 '✓': (0, ['....#', '...#.', '#.#..', '.#...']),
 '✗': (0, ['#...#', '.#.#.', '..#..', '.#.#.', '#...#']),
 '≥': (0, ['##..', '..##', '##..', '....', '####']),
 '≤': (0, ['..##', '##..', '..##', '....', '####']),
 '≈': (0, ['.#.#', '#.#.', '....', '.#.#', '#.#.']),
 '✦': (0, ['..#..', '.###.', '#####', '.###.', '..#..']),
 '□': (0, ['####', '#..#', '#..#', '####']),
 '∞': (1, ['.##.##.', '#..#..#', '.##.##.']),
 '⌂': (0, ['..#..', '.#.#.', '#...#', '#...#', '#####']),
 '⟳': (0, ['.###.', '#...#', '#..##', '#....', '.###.'][::-1][::-1]),
 '±': (0, ['..#..', '#####', '..#..', '.....', '#####']),
 '²': (2, ['##.', '..#', '.#.', '###']),
 '³': (2, ['##.', '.##', '..#', '##.']),
 '•': (1, ['##', '##']),
}
def build(name, upem, unit, scale, asc, desc, out):
    order = ['.notdef', 'space'] + ['u%04X' % ord(c) for c in G]
    fb = FontBuilder(upem, isTTF=True)
    fb.setupGlyphOrder(order)
    fb.setupCharacterMap({32: 'space', **{ord(c): 'u%04X' % ord(c) for c in G}})
    glyphs, metrics = {}, {}
    p = TTGlyphPen(None); glyphs['.notdef'] = p.glyph(); metrics['.notdef'] = (unit * 4, 0)
    p = TTGlyphPen(None); glyphs['space'] = p.glyph(); metrics['space'] = (unit * 4, 0)
    U = unit * scale
    for c, (by, rows) in G.items():
        p = TTGlyphPen(None); h = len(rows); w = max(len(r) for r in rows)
        for i, r in enumerate(rows):
            y0 = (by + h - 1 - i) * U; x = 0
            while x < len(r):
                if r[x] == '#':
                    x1 = x
                    while x1 < len(r) and r[x1] == '#': x1 += 1
                    p.moveTo((x * U, y0)); p.lineTo((x * U, y0 + U)); p.lineTo((x1 * U, y0 + U)); p.lineTo((x1 * U, y0)); p.closePath()
                    x = x1
                else: x += 1
        n = 'u%04X' % ord(c); glyphs[n] = p.glyph(); metrics[n] = ((w + 1) * U, 0)
    fb.setupGlyf(glyphs); fb.setupHorizontalMetrics(metrics)
    fb.setupHorizontalHeader(ascent=asc, descent=-desc)
    fb.setupNameTable({'familyName': name, 'styleName': 'Regular'})
    fb.setupOS2(sTypoAscender=asc, sTypoDescender=-desc, usWinAscent=asc, usWinDescent=desc)
    fb.setupPost()
    fb.font.flavor = 'woff2'; fb.save(out)
import os
D = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'src', 'ui', 'fonts') + '/'
build('Mole Marks', 1024, 128, 1, 896, 256, D + 'molemarks.woff2')        # Tiny5 grid: 1 px = 128 units
build('Mole Marks 15', 1350, 50, 3, 1050, 300, D + 'molemarks15.woff2')  # Jersey 15 grid, each mark pixel = 3 font px
print('ok')
