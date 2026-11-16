# Chips (five denominations), a playing card and the dealer button.
# Chips are ~1.4x real size so stacks read at the game's low resolution.
exec(open(PROJECT_DIR + r"\tools\blender\_head.py").read())

CHIP_R = 0.027
CHIP_H = 0.0048
DENOMS = [  # value, base, spot, inner
    (1, 'cream', 'blue', 'paper'),
    (5, 'red', 'cream', 'redLight'),
    (25, 'sage', 'cream', 'feltLight'),
    (100, 'ink', 'cream', 'ash'),
    (500, 'amber', 'blood', 'gold'),
]
a = lib.Atlas('chips', 64, 64, bg='black', seed=51)
objs = []
for i, (val, base, spot, inner) in enumerate(DENOMS):
    tx, ty = (i % 4) * 16, (i // 4) * 16
    top = a.region(f'top{val}', tx, ty, 16, 16)
    side = a.region(f'side{val}', 0, 32 + i * 4, 32, 4)
    for y in range(16):
        for x in range(16):
            d = math.hypot(x - 7.5, y - 7.5)
            ang = math.atan2(y - 7.5, x - 7.5)
            c = base
            if d > 5.5 and int((ang + math.pi) / (2 * math.pi) * 8 + 0.5) % 2 == 0:
                c = spot  # edge spots
            if d < 4.2:
                c = inner
            if d < 4.2 and abs(d - 3.6) < 0.5:
                c = base
            a.set(tx + x, ty + y, c)
    a.fill(side, base)
    for x in range(0, 32, 8):
        for k in range(3):
            a.set(x + k, 32 + i * 4 + 1, spot)
            a.set(x + k, 32 + i * 4 + 2, spot)
mat = a.material('Chips')
for i, (val, *_rest) in enumerate(DENOMS):
    o = lib.lathe(f'Chip_{val}', [(CHIP_R, 0.0), (CHIP_R, CHIP_H)], 12, loc=(i * 0.08, 0, 0), atlas=a,
                  bands=f'side{val}', cap_top=f'top{val}', cap_bottom=f'top{val}', mat=mat)
    lib.flat_shade(o)
    objs.append(o)

# dealer button
b = lib.Atlas('dealer_button', 16, 16, bg='cream', seed=52)
b.region('top', 0, 0, 16, 16)
b.region('side', 0, 0, 16, 2)
b.art('top', [
    '................', '.....bbbbbb.....', '...bb......bb...', '..b..........b..', '.b...DDDD.....b.',
    '.b...D...D....b.', 'b....D....D....b', 'b....D....D....b', 'b....D....D....b', 'b....D....D....b',
    '.b...D...D....b.', '.b...DDDD.....b.', '..b..........b..', '...bb......bb...', '.....bbbbbb.....',
    '................'], {'b': 'bone', 'D': 'ink'})
bm = b.material('DealerButton')
btn = lib.lathe('DealerButton', [(0.036, 0.0), (0.036, 0.009)], 12, loc=(0.5, 0, 0), atlas=b, bands='side',
                cap_top='top', cap_bottom='top', mat=bm)
lib.flat_shade(btn)
objs.append(btn)

# card: thin box, face on +Z with its own material so the game can swap the face texture
CW, CL, CT = 0.075, 0.105, 0.0012
front = lib.Atlas('card_front', 32, 44, bg='cream', seed=53)
front.region('all', 0, 0, 32, 44)
front.region('edge', 0, 0, 2, 2)
front.vlines('all', 'paper', every=31)
frontMat = front.material('CardFront', roughness=0.7)
back = lib.Atlas('card_back', 32, 44, bg='red', seed=54)
back.region('all', 0, 0, 32, 44)
back.region('edge', 0, 0, 2, 2)
for y in range(44):
    for x in range(32):
        if x in (1, 30) or y in (1, 42):
            back.set(x, y, 'cream')
        elif 3 <= x <= 28 and 3 <= y <= 40:
            if (x + y) % 4 == 0 or (x - y) % 4 == 0:
                back.set(x, y, 'blood')
        if x == 0 or x == 31 or y == 0 or y == 43:
            back.set(x, y, 'cream')
# small diamond in the middle
for y in range(44):
    for x in range(32):
        if abs(x - 15.5) + abs(y - 21.5) < 5:
            back.set(x, y, 'gold' if abs(x - 15.5) + abs(y - 21.5) < 3 else 'bloodDark')
backMat = back.material('CardBack', roughness=0.7)
card = lib.box('Card', (CW, CL, CT), (0.7, 0, CT / 2), atlas=front,
               faces={'+z': 'all', 'default': 'edge'}, mat=frontMat)
card.data.materials.append(backMat)
# give the bottom face the back material and map it to the whole back texture
me = card.data
for p in me.polygons:
    if p.normal.z < -0.5:
        p.material_index = 1
        uvl = me.uv_layers.active.data
        # (-z face winding is mirrored, so flip u for a non-mirrored back)
        corners = [(1, 0), (0, 0), (0, 1), (1, 1)]
        for li, c in zip(p.loop_indices, corners):
            uvl[li].uv = c
objs.append(card)
print([o.name for o in objs])
