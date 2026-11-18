# Everything for your bar between nights, exported together as bar.glb:
#   Bartender, PatronA, PatronB, PatronC, Bookie  standing people (faces -Y -> +Z in game). Each has a
#       "Head" child (origin at the neck) and a posable right arm: UpperArmR (shoulder) > ForeArmR
#       (elbow) > empty HandTipR, like the seated characters.
#   HorseTrack, Horse_1..Horse_4, Crown          the mechanical horse-race table (lanes run along +X)
#   Gallery, Duck, Can                            the shooting gallery booth (targets behind it, +Y)
#   Pint, BeerTap                                 small bar props
exec(open(PROJECT_DIR + r"\tools\blender\_head.py").read())
from mathutils import Vector


def pivot_at(obj, p):
    bpy.context.scene.cursor.location = p
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.origin_set(type='ORIGIN_CURSOR')
    bpy.context.scene.cursor.location = (0, 0, 0)


def attach(child, parent):
    child.parent = parent
    child.matrix_parent_inverse = parent.matrix_world.inverted()


def place(obj, loc):
    """Move a finished object (built at the origin) out of the way so previews don't overlap."""
    obj.location = loc


# ====================================================================================
# People
# ====================================================================================

PEOPLE = {
    'Bartender': dict(skin='skin', skinDark='skinMid', hair='woodDark', mus='woodDark', shirt='cream',
                      vest='ink', tie='redLight', pants='ink', coat=None, apron='paper', sleeves='rolled',
                      hat=None, hairRows=3, seed=21),
    'PatronA': dict(skin='skinLight', skinDark='skin', hair='ash', mus=None, shirt='paper', vest=None,
                    tie='red', pants='ashDark', coat='navyLight', apron=None, sleeves='coat',
                    hat='ink', hatBand='red', hairRows=2, seed=22),
    'PatronB': dict(skin='skinMid', skinDark='skinDark', hair='black', mus='black', shirt='bone', vest=None,
                    tie='ink', pants='woodMid', coat='leather', apron=None, sleeves='coat',
                    hat='woodDark', hatBand='woodLight', hairRows=2, seed=23),
    'PatronC': dict(skin='skin', skinDark='skinMid', hair='woodLight', mus=None, shirt='cream', vest=None,
                    tie='gold', pants='ink', coat='redMid', apron=None, sleeves='coat',
                    hat=None, hairRows=4, seed=24),
    'Bookie': dict(skin='skinLight', skinDark='skin', hair='smoke', mus='smoke', shirt='paper', vest='feltMid',
                   tie='amber', pants='ashDark', coat=None, apron=None, sleeves='garter',
                   hat='visor', hairRows=2, seed=25),
}


DARKER = {'navyLight': 'navy', 'leather': 'woodLight', 'redMid': 'red', 'ink': 'black', 'feltMid': 'felt',
          'cream': 'paper', 'paper': 'bone', 'bone': 'boneLight'}


def face_art(a, S):
    """16x16 face painted from a few rules, so every person gets the same pixel style."""
    x0, y0, _, _ = a.regions['face']
    for j in range(16):
        for i in range(16):
            c = S['skin']
            if j < S['hairRows']:
                c = S['hair']
            elif j == S['hairRows'] and i in (0, 15):
                c = S['hair']
            if j >= 13 and (i < 2 or i > 13):
                c = S['skinDark']
            a.set(x0 + i, y0 + j, c)
    eye = 6
    for cx in (3, 10):
        a.set(x0 + cx - 1, y0 + eye - 1, S['hair'])
        a.set(x0 + cx, y0 + eye - 1, S['hair'])
        a.set(x0 + cx + 1, y0 + eye - 1, S['hair'])
        a.set(x0 + cx, y0 + eye, 'paper')
        a.set(x0 + cx + 1, y0 + eye, 'black')
    for j in (7, 8, 9):
        a.set(x0 + 7, y0 + j, S['skinDark'])
    a.set(x0 + 8, y0 + 9, S['skinDark'])
    if S['mus']:
        for i in range(4, 12):
            a.set(x0 + i, y0 + 10, S['mus'])
    for i in range(5, 11):
        a.set(x0 + i, y0 + 11, 'bloodDark')
    for i in range(3, 13):
        a.set(x0 + i, y0 + 15, S['skinDark'])


def chest_art(a, S):
    x0, y0, _, _ = a.regions['chest']
    outer = S['coat'] or S['vest'] or S['shirt']
    for j in range(16):
        for i in range(16):
            c = outer
            open_w = 3 if S['coat'] else 2
            if abs(i - 7.5) < open_w + (j * 0.15 if S['coat'] else 0) and j < 12:
                c = S['shirt']
            a.set(x0 + i, y0 + j, c)
    # tie / bow tie
    if S['vest'] and not S['coat'] and S['sleeves'] == 'rolled':
        for i in range(6, 10):
            a.set(x0 + i, y0 + 1, S['tie'])
            a.set(x0 + i, y0 + 2, S['tie'])
        a.set(x0 + 7, y0 + 1, 'bloodDark')
    else:
        for j in range(1, 10):
            a.set(x0 + 7, y0 + j, S['tie'])
            a.set(x0 + 8, y0 + j, S['tie'])
    for j in (5, 9, 13):
        if S['vest'] or S['coat']:
            a.set(x0 + 5, y0 + j, 'gold' if S['vest'] else 'ink')
    if S['coat']:  # lapels and pocket square
        for j in range(0, 8):
            a.set(x0 + 4 - j // 3, y0 + j, 'black')
            a.set(x0 + 11 + j // 3, y0 + j, 'black')
        a.set(x0 + 12, y0 + 6, 'paper')
        a.set(x0 + 13, y0 + 6, 'paper')
    for i in range(16):
        a.set(x0 + i, y0 + 15, 'black')  # belt


def person(name, S):
    a = lib.Atlas('ppl_' + name, 64, 64, bg=S['shirt'], seed=S['seed'])
    for key, rect in {
        'face': (0, 0, 16, 16), 'headSide': (16, 0, 16, 16), 'headTop': (32, 0, 8, 8), 'skin': (40, 0, 8, 8),
        'shoe': (48, 0, 8, 8), 'hair': (56, 0, 8, 8), 'chest': (0, 16, 16, 16), 'torso': (16, 16, 16, 16),
        'sleeve': (32, 16, 8, 16), 'forearm': (40, 16, 8, 16), 'pants': (48, 16, 8, 16), 'apron': (56, 16, 8, 16),
        'hat': (0, 32, 16, 8), 'hatBand': (16, 32, 16, 4), 'visor': (32, 32, 8, 8),
    }.items():
        a.region(key, *rect)
    face_art(a, S)
    a.fill('headSide', S['skin'])
    for j in range(S['hairRows'] + 2):
        for i in range(16):
            a.set(16 + i, j, S['hair'])
    for j in range(S['hairRows'] + 2, 10):
        for i in range(9, 16):
            a.set(16 + i, j, S['hair'])
    a.set(16 + 6, 7, S['skinDark']); a.set(16 + 6, 8, S['skinDark'])  # ear
    a.fill('headTop', S['hair']); a.noise('headTop', ['black'], 0.15)
    a.fill('skin', S['skin']); a.noise('skin', [S['skinDark']], 0.15)
    a.fill('shoe', 'black'); a.hlines('shoe', 'ash', every=8, offset=1)
    a.fill('hair', S['hair'])
    chest_art(a, S)
    a.fill('torso', S['coat'] or S['vest'] or S['shirt'])
    a.noise('torso', [DARKER.get(S['coat'] or S['vest'] or S['shirt'], 'black')], 0.12)
    a.hlines('torso', 'black', every=16, offset=15)
    sleeve = S['coat'] or S['shirt']
    a.fill('sleeve', sleeve); a.noise('sleeve', [DARKER.get(sleeve, 'black')], 0.1)
    if S['sleeves'] == 'garter':
        a.hlines('sleeve', 'redLight', every=16, offset=5)
    if S['sleeves'] == 'rolled':
        a.fill('forearm', S['skin']); a.noise('forearm', [S['skinDark']], 0.15)
        a.hlines('forearm', S['shirt'], every=16, offset=0); a.hlines('forearm', S['shirt'], every=16, offset=1)
    else:
        a.fill('forearm', sleeve); a.hlines('forearm', S['shirt'] if S['coat'] else 'paper', every=16, offset=14)
    a.fill('pants', S['pants']); a.vlines('pants', 'black', every=8, offset=3)
    a.fill('apron', S['apron'] or S['pants']); a.noise('apron', ['bone'], 0.12)
    if S['hat'] and S['hat'] != 'visor':
        a.fill('hat', S['hat']); a.noise('hat', ['black'], 0.1)
        a.fill('hatBand', S['hatBand'])
    a.fill('visor', 'feltLight'); a.hlines('visor', 'sage', every=2)
    mat = a.material('Mat_' + name)
    B = lambda n, size, loc, faces, **kw: lib.box(n, size, loc, atlas=a, mat=mat, faces=faces, **kw)

    def limb(n, p0, p1, w, t, region, ext0=0.0, ext1=0.0):
        v0, v1 = Vector(p0), Vector(p1)
        d = (v1 - v0).normalized()
        v0, v1 = v0 - d * ext0, v1 + d * ext1
        rot = d.to_track_quat('Z', 'Y').to_euler()
        return lib.box(n, (w, t, (v1 - v0).length), tuple((v0 + v1) / 2), rot=tuple(rot), atlas=a,
                       faces={'default': region}, mat=mat)

    parts = []
    for s in (-1, 1):
        parts.append(B('shoe', (0.12, 0.26, 0.08), (s * 0.1, -0.04, 0.04), {'default': 'shoe'}))
        parts.append(B('leg', (0.14, 0.16, 0.82), (s * 0.1, 0, 0.49), {'default': 'pants'}, taper=(1.05, 1.0)))
    parts.append(B('hips', (0.38, 0.22, 0.16), (0, 0, 0.92), {'default': 'pants', '-y': 'pants'}))
    parts.append(B('torso', (0.42, 0.24, 0.56), (0, 0, 1.17), {'default': 'torso', '-y': 'chest'}, taper=(1.12, 1.05)))
    parts.append(B('collar', (0.18, 0.16, 0.06), (0, 0.0, 1.47), {'default': 'skin'}))
    if S['apron']:
        parts.append(B('apron', (0.4, 0.02, 0.62), (0, -0.13, 0.66), {'default': 'apron'}, taper=(1.05, 1.0)))
        parts.append(B('apronTie', (0.44, 0.25, 0.04), (0, 0, 0.96), {'default': 'apron'}))
    if S['coat']:
        parts.append(B('coatTail', (0.44, 0.25, 0.3), (0, 0.0, 0.8), {'default': 'torso', '-y': 'torso'}, taper=(0.98, 0.98)))
    # left arm: hangs at the side, hand a little forward
    sh_z = 1.4
    lsh, lel, lwr = (0.25, 0, sh_z), (0.27, -0.02, 1.1), (0.26, -0.1, 0.86)
    parts.append(limb('upperL', lsh, lel, 0.11, 0.12, 'sleeve', ext0=0.05))
    parts.append(limb('foreL', lel, lwr, 0.1, 0.1, 'forearm', ext0=0.03))
    parts.append(B('handL', (0.08, 0.09, 0.1), (0.26, -0.12, 0.8), {'default': 'skin'}))
    body = lib.join(parts, name)
    lib.flat_shade(body)

    # right arm: shoulder > elbow > wrist, forearm out in front a little (rests on a bar)
    rsh, rel, rwr, rtip = (-0.25, 0, sh_z), (-0.27, 0.0, 1.1), (-0.25, -0.24, 1.02), (-0.24, -0.34, 1.0)
    up = lib.join([limb('upperR', rsh, rel, 0.11, 0.12, 'sleeve', ext0=0.05),
                   B('elbowR', (0.11, 0.11, 0.11), rel, {'default': 'sleeve'})], 'UpperArmR')
    lib.flat_shade(up)
    pivot_at(up, rsh)
    fo = lib.join([limb('foreR', rel, rwr, 0.1, 0.095, 'forearm', ext0=0.02),
                   limb('handR', rwr, rtip, 0.085, 0.05, 'skin')], 'ForeArmR')
    lib.flat_shade(fo)
    pivot_at(fo, rel)
    attach(up, body)
    attach(fo, up)
    tip = bpy.data.objects.new('HandTipR', None)
    bpy.context.scene.collection.objects.link(tip)
    tip.location = rtip
    attach(tip, fo)

    # head
    pivot = (0, 0, 1.5)
    hw, hd, hh = 0.19, 0.21, 0.23
    hz = pivot[2] + hh / 2 + 0.01
    front = -hd / 2
    hp = [lib.box('head', (hw, hd, hh), (0, 0, hz), atlas=a, mat=mat,
                  faces={'default': 'headSide', '-y': 'face', '+z': 'headTop', '-z': 'skin'}, taper=(0.95, 0.95))]
    hp.append(lib.box('nose', (0.03, 0.04, 0.05), (0, front - 0.012, hz - 0.01), atlas=a, mat=mat,
                      faces={'default': 'skin'}, taper=(0.8, 0.4)))
    for s in (-1, 1):
        hp.append(lib.box('ear', (0.02, 0.04, 0.06), (s * (hw / 2 + 0.006), 0.01, hz), atlas=a, mat=mat,
                          faces={'default': 'skin'}))
    hp.append(lib.box('neck', (0.09, 0.09, 0.08), (0, 0.0, pivot[2] + 0.02), atlas=a, mat=mat, faces={'default': 'skin'}))
    top = pivot[2] + hh + 0.01
    if S['hat'] == 'visor':
        hp.append(lib.box('visor', (0.2, 0.12, 0.012), (0, front - 0.05, top - 0.03), rot=(math.radians(-14), 0, 0),
                          atlas=a, mat=mat, faces={'default': 'visor'}))
        hp.append(lib.box('band', (hw + 0.012, hd + 0.012, 0.03), (0, 0, top - 0.035), atlas=a, mat=mat,
                          faces={'default': 'visor'}))
    elif S['hat']:
        hp.append(lib.lathe('brim', [(0.0, 0), (0.19, 0.0), (0.19, 0.014), (0.0, 0.014)], 10,
                            loc=(0, 0.0, top - 0.01), atlas=a, bands='hat', mat=mat))
        hp.append(lib.lathe('crown', [(0.11, 0.0), (0.11, 0.03), (0.105, 0.1), (0.07, 0.125), (0.0, 0.115)], 8,
                            loc=(0, 0.0, top), atlas=a, bands=['hatBand', 'hat', 'hat', 'hat'], mat=mat))
    else:
        hp.append(lib.box('hairTop', (hw + 0.012, hd + 0.014, 0.04), (0, 0.006, top - 0.005), atlas=a, mat=mat,
                          faces={'default': 'hair'}, taper=(0.9, 0.92)))
    head = lib.join(hp, 'Head')
    lib.flat_shade(head)
    pivot_at(head, pivot)
    attach(head, body)
    return body


# ====================================================================================
# The horse race table
# ====================================================================================

TRACK_L, TRACK_W, TRACK_H = 2.0, 1.1, 0.86
LANE_W = 0.2
SILKS = ['redLight', 'blue', 'sage', 'amber']

t = lib.Atlas('horsetrack', 64, 64, bg='woodDark', seed=31)
for key, rect in {
    'top': (0, 0, 32, 16), 'lane': (32, 0, 16, 8), 'slot': (48, 0, 8, 8), 'rail': (56, 0, 8, 8),
    'skirt': (0, 16, 32, 16), 'leg': (32, 8, 8, 8), 'check': (40, 8, 8, 8), 'gate': (48, 8, 8, 8),
    'brass': (56, 8, 8, 8), 'sign': (0, 32, 32, 8), 'woodEdge': (32, 16, 16, 8),
}.items():
    t.region(key, *rect)
t.fill('top', 'wood'); t.noise('top', ['woodMid', 'woodLight'], 0.25)
t.fill('lane', 'feltMid'); t.noise('lane', ['felt', 'feltLight'], 0.25)
t.fill('slot', 'black')
t.fill('rail', 'amberMid'); t.hlines('rail', 'gold', every=4)
t.fill('skirt', 'red')
t.vlines('skirt', 'redMid', every=4)
t.hlines('skirt', 'gold', every=16, offset=1)
t.hlines('skirt', 'gold', every=16, offset=14)
t.fill('leg', 'woodDark'); t.vlines('leg', 'black', every=4)
for j in range(8):
    for i in range(8):
        t.set(40 + i, 8 + j, 'cream' if (i // 2 + j // 2) % 2 else 'black')
t.fill('gate', 'bone'); t.vlines('gate', 'ash', every=2)
t.fill('brass', 'gold'); t.noise('brass', ['amber'], 0.3)
t.fill('sign', 'ink')
t.fill('woodEdge', 'woodLight'); t.hlines('woodEdge', 'wood', every=3)
tmat = t.material('HorseTrack')
TB = lambda n, size, loc, faces, **kw: lib.box(n, size, loc, atlas=t, mat=tmat, faces=faces, **kw)
tp = []
tp.append(TB('top', (TRACK_L, TRACK_W, 0.05), (0, 0, TRACK_H - 0.025), {'default': 'woodEdge', '+z': 'top'}))
tp.append(TB('skirt', (TRACK_L - 0.06, TRACK_W - 0.06, 0.16), (0, 0, TRACK_H - 0.13), {'default': 'skirt'}))
for sx in (-1, 1):
    for sy in (-1, 1):
        tp.append(TB('leg', (0.07, 0.07, TRACK_H - 0.2), (sx * (TRACK_L / 2 - 0.1), sy * (TRACK_W / 2 - 0.1), (TRACK_H - 0.2) / 2),
                     {'default': 'leg'}, taper=(1.2, 1.2)))
        tp.append(TB('foot', (0.1, 0.1, 0.03), (sx * (TRACK_L / 2 - 0.1), sy * (TRACK_W / 2 - 0.1), 0.015), {'default': 'brass'}))
for k in range(4):
    y = (k - 1.5) * LANE_W
    tp.append(TB('lane', (TRACK_L - 0.14, LANE_W - 0.03, 0.012), (0, y, TRACK_H + 0.006), {'default': 'lane'}))
    tp.append(TB('slot', (TRACK_L - 0.3, 0.012, 0.002), (0, y, TRACK_H + 0.013), {'default': 'slot'}))
for k in range(5):
    y = (k - 2) * LANE_W
    tp.append(TB('rail', (TRACK_L - 0.12, 0.015, 0.035), (0, y, TRACK_H + 0.018), {'default': 'rail'}))
tp.append(TB('finish', (0.06, TRACK_W - 0.16, 0.014), (TRACK_L / 2 - 0.16, 0, TRACK_H + 0.008), {'default': 'check'}))
for s in (-1, 1):
    tp.append(TB('post', (0.025, 0.025, 0.32), (TRACK_L / 2 - 0.16, s * (TRACK_W / 2 - 0.06), TRACK_H + 0.16), {'default': 'brass'}))
tp.append(TB('banner', (0.02, TRACK_W - 0.1, 0.07), (TRACK_L / 2 - 0.16, 0, TRACK_H + 0.3), {'default': 'check'}))
tp.append(TB('gate', (0.04, TRACK_W - 0.16, 0.07), (-TRACK_L / 2 + 0.16, 0, TRACK_H + 0.035), {'default': 'gate'}))
tp.append(TB('crank', (0.18, 0.04, 0.04), (-TRACK_L / 2 - 0.05, -TRACK_W / 2 + 0.2, TRACK_H - 0.1), {'default': 'brass'}))
tp.append(TB('knob', (0.04, 0.04, 0.09), (-TRACK_L / 2 - 0.13, -TRACK_W / 2 + 0.2, TRACK_H - 0.06), {'default': 'leg'}))
track = lib.join(tp, 'HorseTrack')
lib.flat_shade(track)


def horse(k):
    h = lib.Atlas(f'horse{k}', 32, 32, bg='smoke', seed=40 + k)
    for key, rect in {'metal': (0, 0, 8, 8), 'dark': (8, 0, 8, 8), 'shine': (16, 0, 8, 8), 'silk': (24, 0, 8, 8),
                      'num': (0, 8, 8, 8), 'mane': (8, 8, 8, 8), 'skin': (16, 8, 8, 8), 'cap': (24, 8, 8, 8),
                      'peg': (0, 16, 8, 8)}.items():
        h.region(key, *rect)
    h.fill('metal', 'smokeLight'); h.noise('metal', ['bone', 'smoke'], 0.35)
    h.fill('dark', 'ash'); h.noise('dark', ['smoke'], 0.25)
    h.fill('shine', 'boneLight'); h.noise('shine', ['white'], 0.25)
    h.fill('silk', SILKS[k]); h.vlines('silk', 'cream', every=4)
    h.fill('num', SILKS[k])
    digits = {1: ['..#..', '.##..', '..#..', '..#..', '.###.'], 2: ['.##..', '...#.', '..#..', '.#...', '.###.'],
              3: ['.##..', '...#.', '..#..', '...#.', '.##..'], 4: ['.#.#.', '.#.#.', '.###.', '...#.', '...#.']}
    for j, row in enumerate(digits[k + 1]):
        for i, ch in enumerate(row):
            if ch == '#':
                h.set(1 + i, 9 + j, 'cream')
    h.fill('mane', 'ashDark')
    h.fill('skin', 'skin')
    h.fill('cap', SILKS[k])
    h.fill('peg', 'bone')
    m = h.material(f'Horse{k + 1}')
    HB = lambda n, size, loc, faces, **kw: lib.box(n, size, loc, atlas=h, mat=m, faces=faces, **kw)
    p = []
    # body runs along +X (the race direction), standing on a peg in the lane slot
    p.append(HB('body', (0.15, 0.06, 0.065), (0, 0, 0.14), {'default': 'metal', '+z': 'shine', '-z': 'dark'}, taper=(1.0, 0.9)))
    p.append(HB('neck', (0.05, 0.045, 0.09), (0.075, 0, 0.185), {'default': 'metal', '-x': 'mane'}, rot=(0, math.radians(35), 0)))
    p.append(HB('head', (0.075, 0.035, 0.035), (0.115, 0, 0.225), {'default': 'metal', '+z': 'shine'}, rot=(0, math.radians(20), 0)))
    for s in (-1, 1):
        p.append(HB('ear', (0.012, 0.01, 0.02), (0.09, s * 0.01, 0.25), {'default': 'dark'}))
    # galloping legs: front pair reaching forward, back pair kicking back
    for s in (-1, 1):
        p.append(HB('fleg', (0.018, 0.018, 0.09), (0.07 + s * 0.008, s * 0.02, 0.085), {'default': 'metal', '-z': 'dark'},
                    rot=(0, math.radians(-40 + s * 10), 0)))
        p.append(HB('bleg', (0.018, 0.018, 0.09), (-0.065 + s * 0.008, s * 0.02, 0.085), {'default': 'metal', '-z': 'dark'},
                    rot=(0, math.radians(35 + s * 10), 0)))
    p.append(HB('tail', (0.06, 0.015, 0.02), (-0.1, 0, 0.16), {'default': 'mane'}, rot=(0, math.radians(-25), 0)))
    # jockey in silks, with a number cloth on the horse
    p.append(HB('cloth', (0.06, 0.066, 0.03), (-0.01, 0, 0.165), {'default': 'silk', '+y': 'num', '-y': 'num'}))
    p.append(HB('jockey', (0.04, 0.035, 0.055), (0.0, 0, 0.21), {'default': 'silk'}, rot=(0, math.radians(30), 0)))
    p.append(HB('jhead', (0.025, 0.025, 0.025), (0.025, 0, 0.245), {'default': 'skin', '+z': 'cap'}))
    p.append(HB('cap', (0.03, 0.028, 0.012), (0.027, 0, 0.26), {'default': 'cap'}))
    p.append(HB('peg', (0.012, 0.012, 0.11), (0, 0, 0.055), {'default': 'peg'}))
    p.append(HB('base', (0.05, 0.03, 0.012), (0, 0, 0.006), {'default': 'dark'}))
    o = lib.join(p, f'Horse_{k + 1}')
    lib.flat_shade(o)
    return o


horses = [horse(k) for k in range(4)]

c = lib.Atlas('crown', 16, 16, bg='gold', seed=50)
c.region('gold', 0, 0, 8, 8); c.region('jewel', 8, 0, 8, 8); c.region('band', 0, 8, 16, 8)
c.fill('gold', 'gold'); c.noise('gold', ['goldLight', 'amber'], 0.3)
c.fill('jewel', 'redLight')
c.fill('band', 'amber'); c.hlines('band', 'goldLight', every=4)
cm = c.material('Crown', emissive='gold', emissive_strength=0.4)
cp = [lib.lathe('ring', [(0.032, 0.0), (0.032, 0.022)], 10, atlas=c, bands='band', mat=cm)]
for i in range(5):
    ang = 2 * math.pi * i / 5
    cp.append(lib.box('point', (0.014, 0.008, 0.03), (math.cos(ang) * 0.03, math.sin(ang) * 0.03, 0.032),
                      rot=(0, 0, ang + math.pi / 2), atlas=c, mat=cm, faces={'default': 'gold'}, taper=(0.2, 1.0)))
    cp.append(lib.box('jewel', (0.008, 0.008, 0.008), (math.cos(ang) * 0.034, math.sin(ang) * 0.034, 0.012),
                      atlas=c, mat=cm, faces={'default': 'jewel'}))
crown = lib.join(cp, 'Crown')
lib.flat_shade(crown)

# ====================================================================================
# The shooting gallery
# ====================================================================================
# The booth's counter is at y = 0 (you stand at -y); the targets ride rails behind it.
GW, GD = 2.6, 1.9
g = lib.Atlas('gallery', 64, 64, bg='red', seed=61)
for key, rect in {
    'back': (0, 0, 32, 32), 'awning': (32, 0, 16, 16), 'post': (48, 0, 8, 16), 'counter': (0, 32, 32, 16),
    'counterTop': (32, 16, 16, 8), 'rail': (48, 16, 8, 8), 'side': (32, 24, 16, 8), 'sign': (0, 48, 32, 8),
    'bulb': (56, 16, 8, 8), 'shelf': (32, 32, 16, 8), 'floor': (48, 24, 16, 8),
}.items():
    g.region(key, *rect)
g.fill('back', 'navy')
for j in range(32):
    for i in range(32):
        if (i + j) % 16 == 0 or (i - j) % 16 == 0:
            g.set(i, j, 'navyLight')
for (sx, sy) in ((5, 6), (20, 4), (12, 17), (26, 20), (6, 26)):
    for dx, dy in ((0, 0), (1, 0), (-1, 0), (0, 1), (0, -1)):
        g.set(sx + dx, sy + dy, 'gold')
for j in range(16):
    for i in range(16):
        g.set(32 + i, j, 'cream' if (i // 4) % 2 else 'redLight')
for j in range(12, 16):
    for i in range(16):
        if (i + 2) % 4 < 2 and j > 12:
            g.set(32 + i, j, 'black')
g.fill('post', 'cream'); g.vlines('post', 'redLight', every=4)
g.fill('counter', 'redMid')
g.vlines('counter', 'red', every=8)
g.hlines('counter', 'gold', every=16, offset=1)
for i in range(4, 32, 8):
    for j in range(5, 12):
        g.set(i + (j % 2), 32 + j, 'gold')
g.fill('counterTop', 'woodLight'); g.noise('counterTop', ['wood'], 0.3)
g.fill('rail', 'bone'); g.hlines('rail', 'ash', every=3)
g.fill('side', 'redMid'); g.vlines('side', 'red', every=3)
g.fill('sign', 'ink')
g.fill('bulb', 'lampGlow')
g.fill('shelf', 'woodDark'); g.hlines('shelf', 'wood', every=2)
g.fill('floor', 'ashDark'); g.noise('floor', ['ash'], 0.2)
gm = g.material('Gallery')
gbm = g.material('GalleryBulbs', emissive='lampGlow', emissive_strength=2.0)
GB = lambda n, size, loc, faces, mat=gm, **kw: lib.box(n, size, loc, atlas=g, mat=mat, faces=faces, **kw)
gp = []
gp.append(GB('counter', (GW, 0.36, 1.0), (0, -0.18, 0.5), {'default': 'counter', '+z': 'counterTop'}))
gp.append(GB('counterLip', (GW + 0.06, 0.42, 0.04), (0, -0.18, 1.02), {'default': 'counterTop'}))
gp.append(GB('floor', (GW, GD, 0.02), (0, GD / 2, 0.01), {'default': 'floor'}))
gp.append(GB('back', (GW, 0.06, 2.3), (0, GD, 1.15), {'default': 'side', '-y': 'back'}))
for s in (-1, 1):
    gp.append(GB('side', (0.06, GD, 2.3), (s * GW / 2, GD / 2, 1.15), {'default': 'side'}))
    gp.append(GB('post', (0.1, 0.1, 2.4), (s * (GW / 2 + 0.02), -0.02, 1.2), {'default': 'post'}))
gp.append(GB('awning', (GW + 0.3, 0.5, 0.06), (0, -0.12, 2.35), {'default': 'awning'}, rot=(math.radians(-18), 0, 0)))
gp.append(GB('valance', (GW + 0.3, 0.02, 0.18), (0, -0.37, 2.2), {'default': 'awning'}))
gp.append(GB('roof', (GW, GD, 0.04), (0, GD / 2, 2.3), {'default': 'side'}))
# target rails: back row high, front row low, and a shelf for cans
for y, z in ((1.55, 1.42), (1.15, 1.12)):
    gp.append(GB('rail', (GW - 0.1, 0.03, 0.03), (0, y, z), {'default': 'rail'}))
    gp.append(GB('railSkirt', (GW - 0.1, 0.04, 0.22), (0, y + 0.03, z - 0.13), {'default': 'shelf'}))
gp.append(GB('shelf', (GW - 0.3, 0.25, 0.04), (0, 1.75, 1.75), {'default': 'shelf'}))
gallery = lib.join(gp, 'Gallery')
lib.flat_shade(gallery)
bulbs = []
for i in range(9):
    x = -GW / 2 + 0.15 + i * (GW - 0.3) / 8
    bulbs.append(GB('bulb', (0.05, 0.05, 0.05), (x, -0.36, 2.08), {'default': 'bulb'}, mat=gbm))
bulb_row = lib.join(bulbs, 'GalleryBulbs')
lib.flat_shade(bulb_row)
attach(bulb_row, gallery)

d = lib.Atlas('duck', 32, 16, bg=(0, 0, 0, 0), seed=62)  # transparent: the game cuts the duck out with alphaTest
d.region('front', 0, 0, 16, 16); d.region('edge', 16, 0, 8, 8); d.region('back', 24, 0, 8, 8); d.region('stand', 16, 8, 8, 8)
d.art('front', [
    '................', '......YYY.......', '.....YYYYY......', '.....YKYYYOO.....', '.....YYYYYOO.....',
    '......YYY.......', '.YYYYYYYYYYYY...', 'YYYYYYYYYYYYYY..', 'YYYYYYRRRRYYYYY.', 'YYYYYRRYYRRYYYY.',
    'YYYYYYRRRRYYYYY.', '.YYYYYYYYYYYYY..', '..YYYYYYYYYYY...', '....YYYYYYY.....', '......BBB.......',
    '......BBB.......'], {'Y': 'gold', 'K': 'black', 'O': 'amberMid', 'R': 'redLight', 'B': 'ash'})
d.fill('stand', 'ash')  # the plate's thin edges stay transparent too
dm = d.material('Duck')
dp = [lib.box('plate', (0.17, 0.012, 0.17), (0, 0, 0.1), atlas=d, mat=dm, faces={'default': 'edge', '-y': 'front', '+y': 'front'}),
      lib.box('stem', (0.02, 0.02, 0.06), (0, 0.005, 0.0), atlas=d, mat=dm, faces={'default': 'stand'})]
duck = lib.join(dp, 'Duck')
lib.flat_shade(duck)

cn = lib.Atlas('can', 16, 16, bg='redLight', seed=63)
cn.region('side', 0, 0, 16, 12); cn.region('top', 0, 12, 4, 4)
cn.fill('side', 'redLight'); cn.hlines('side', 'cream', every=12, offset=4); cn.hlines('side', 'cream', every=12, offset=5)
cn.hlines('side', 'bone', every=12, offset=0); cn.hlines('side', 'bone', every=12, offset=11)
cn.fill('top', 'bone')
cnm = cn.material('Can')
can = lib.lathe('Can', [(0.035, 0.0), (0.035, 0.11)], 10, atlas=cn, bands='side', cap_top='top', cap_bottom='top', mat=cnm)
lib.flat_shade(can)

# ====================================================================================
# Small props
# ====================================================================================
pa = lib.Atlas('pint', 16, 16, bg='amber', seed=70)
pa.region('beer', 0, 0, 8, 8); pa.region('foam', 8, 0, 8, 8); pa.region('tap', 0, 8, 8, 8); pa.region('handle', 8, 8, 8, 8)
pa.fill('beer', 'amber'); pa.noise('beer', ['amberMid', 'gold'], 0.3)
pa.fill('foam', 'cream'); pa.noise('foam', ['paper'], 0.3)
pa.fill('tap', 'gold'); pa.noise('tap', ['amber'], 0.3)
pa.fill('handle', 'ink'); pa.hlines('handle', 'redLight', every=4)
pm = pa.material('Pint')
pint = lib.join([lib.lathe('glass', [(0.03, 0.0), (0.036, 0.12)], 8, atlas=pa, bands='beer', cap_bottom='beer', mat=pm),
                 lib.lathe('head', [(0.037, 0.12), (0.037, 0.14)], 8, atlas=pa, bands='foam', cap_top='foam', mat=pm)], 'Pint')
lib.flat_shade(pint)
tap = lib.join([lib.box('base', (0.5, 0.08, 0.06), (0, 0, 0.03), atlas=pa, mat=pm, faces={'default': 'tap'}),
                lib.box('tower', (0.06, 0.06, 0.32), (0, 0, 0.2), atlas=pa, mat=pm, faces={'default': 'tap'}),
                lib.box('bar', (0.42, 0.06, 0.06), (0, 0, 0.36), atlas=pa, mat=pm, faces={'default': 'tap'})] +
               [lib.box('spout', (0.025, 0.05, 0.06), (x, -0.04, 0.31), atlas=pa, mat=pm, faces={'default': 'tap'}) for x in (-0.14, 0, 0.14)] +
               [lib.box('handle', (0.03, 0.03, 0.16), (x, 0.0, 0.47), atlas=pa, mat=pm, faces={'default': 'handle'}) for x in (-0.14, 0, 0.14)],
               'BeerTap')
lib.flat_shade(tap)

people = [person(n, S) for n, S in PEOPLE.items()]

# lay everything out for the preview render (the game places things itself)
for i, o in enumerate(people):
    place(o, (-3.0 + i * 0.75, 0, 0))
place(track, (0, 2.0, 0))
for k, o in enumerate(horses):
    place(o, (-0.6 + k * 0.4, 2.0 + (k - 1.5) * LANE_W, TRACK_H + 0.006))
place(crown, (0.6, 1.0, 1.2))
place(gallery, (3.4, 0.5, 0))
place(duck, (3.2, 2.05, 1.32))
place(can, (3.6, 2.25, 1.77))
place(pint, (1.4, 0, 1.0))
place(tap, (1.8, 0, 1.0))
BAR_OBJECTS = people + [track] + horses + [crown, gallery, duck, can, pint, tap]
print('built', [o.name for o in BAR_OBJECTS])
