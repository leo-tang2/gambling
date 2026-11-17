# Seated mafia characters. Run with WHO = 'boss' | 'enforcer' | 'shark'.
# Body faces -Y (exports facing +Z). Origin on the floor under the seat. The head is a
# separate child object named "Head" whose origin is the neck pivot, so the game can turn it.
exec(open(PROJECT_DIR + r"\tools\blender\_head.py").read())
from mathutils import Vector

FACES = {
    'boss': [
        'hhhhhhhhhhhhhhhh', 'hssssssssssssssh', 'hssssssssssssssh', 'sbbbbbssssbbbbbs',
        'ssssssssssssssss', 'sswppsssssswppss', 'ssddsssllsssddss', 'sssssssllsssssss',
        'ssssssdlldssssss', 'dsssMMMMMMMMsssd', 'dssMMMMMMMMMMssd', 'dsssssmmmmscccci',
        'ddssssssssssssdd', 'dddssssssssssddd', 'ddddddssssdddddd', 'kkkkkkkkkkkkkkkk'],
    'enforcer': [
        'ssssssssssssssss', 'ssssssssssssssss', 'sssssllllllsssss', 'ssssssssssssssss',
        'sbbbbbbssbbbbbbs', 'ssrsssssssssssss', 'sswrpssssssswpss', 'ssdrdsssssssddss',
        'sssrsssddsssssss', 'ssssssddddssssss', 'ssdsdsssssdsdsss', 'sdsdsmmmmmmsdsds',
        'ssdsdsdsdsdsdsss', 'dssssssssssssssd', 'ddssssssssssssdd', 'kkkkkkkkkkkkkkkk'],
    'shark': [
        'hhhhhhhhhhhhhhhh', 'hhhhhhhHhhhhhhhh', 'hhhsssssssssshhh', 'hssssssssssssssh',
        'ssbbbssssssbbbss', 'sggggggssggggggs', 'sgGgggsggsgGgggs', 'ssggggssssggggss',
        'sssssssllsssssss', 'ssssssdlldssssss', 'ssssMMMMMMMMssss', 'ssssssmmmmmmtttt',
        'dssssssssssssssd', 'ddssssssssssssdd', 'dddssssssssssddd', 'kkkkkkkkkkkkkkkk'],
}

SPECS = {
    'boss': dict(skin='skin', skinDark='skinDark', skinLight='skinLight', hair='smoke', brow='ash',
                 mus='bone', suit='navy', stripe='blue', shirt='cream', tie='red', collar='cream',
                 width=0.52, depth=0.32, taper=0.86, height=0.5, head=(0.2, 0.21, 0.24), hat=True,
                 sleeve='navy', forearm=None, pants='navy'),
    'enforcer': dict(skin='skinDark', skinDark='woodLight', skinLight='skin', hair='skinDark', brow='black',
                     mus='black', suit='ink', stripe='shadow', shirt='ash', tie='ash', collar='ash',
                     width=0.56, depth=0.3, taper=1.12, height=0.52, head=(0.18, 0.2, 0.22), hat=False,
                     sleeve='ink', forearm=None, pants='shadow'),
    'shark': dict(skin='skinLight', skinDark='skin', skinLight='cream', hair='black', brow='black',
                  mus='black', suit='red', stripe='blood', shirt='cream', tie='black', collar='cream',
                  width=0.42, depth=0.24, taper=1.05, height=0.5, head=(0.17, 0.19, 0.23), hat=False,
                  sleeve='cream', forearm='skinLight', pants='ink'),
}
S = SPECS[WHO]

a = lib.Atlas('char_' + WHO, 64, 64, bg=S['suit'], seed={'boss': 1, 'enforcer': 2, 'shark': 3}[WHO])
for key, rect in {
    'face': (0, 0, 16, 16), 'headSide': (16, 0, 16, 16), 'headTop': (32, 0, 8, 8), 'neck': (40, 0, 8, 8),
    'hand': (48, 0, 8, 8), 'shoe': (56, 0, 8, 8), 'chest': (0, 16, 16, 16), 'suit': (16, 16, 16, 16),
    'sleeve': (32, 16, 8, 16), 'forearm': (40, 16, 8, 16), 'pants': (48, 16, 8, 8), 'hat': (32, 8, 16, 8),
    'hatBand': (48, 8, 16, 4), 'chain': (56, 16, 8, 8), 'cigar': (48, 12, 8, 4), 'ember': (56, 12, 4, 4),
    'glass': (60, 12, 4, 4), 'pick': (56, 24, 8, 8),
}.items():
    a.region(key, *rect)

cmap = {'s': S['skin'], 'd': S['skinDark'], 'l': S['skinLight'], 'h': S['hair'], 'H': 'smoke',
        'b': S['brow'], 'w': 'paper', 'p': 'black', 'M': S['mus'], 'm': 'bloodDark', 'r': 'red',
        'g': 'black', 'G': 'smoke', 'c': 'woodLight', 'i': 'amber', 't': 'bone', 'k': S['collar']}
a.art('face', FACES[WHO], cmap)
a.fill('headSide', S['skin'])
if WHO in ('boss', 'shark'):
    a.art('headSide', ['hhhhhhhhhhhhhhhh'] * 4 + ['hhhhhhhhhhhhssss'] * 3 + ['hhhhhhhhhhhsssss'] * 2 +
          ['hhhhhhhhhhssssss'] * 2, {'h': S['hair'], 's': S['skin']})
else:
    a.noise('headSide', [S['skinDark']], 0.08)
    a.art('headSide', ['................'] * 8 + ['.......dd.......', '......dssd......', '.......dd.......'],
          {'d': S['skinDark'], 's': S['skin']})
a.fill('headTop', S['hair'] if WHO != 'enforcer' else S['skin'])
if WHO == 'enforcer':
    a.set(34, 2, S['skinLight']); a.set(35, 2, S['skinLight'])
a.fill('neck', S['skinDark'])
a.fill('hand', S['skin'])
a.art('hand', ['........', '........', 'dddddddd', '........', '........', '........', 'd.d.d.d.', '........'],
      {'d': S['skinDark']})
if WHO == 'boss':
    a.set(51, 5, 'gold'); a.set(52, 5, 'gold')
a.fill('shoe', 'black')
a.fill('suit', S['suit'])
a.vlines('suit', S['stripe'], every=3, broken=0.15 if WHO == 'boss' else 0.85)
a.noise('suit', [S['stripe']], 0.05)
a.fill('sleeve', S['sleeve'])
a.fill('forearm', S['forearm'] or S['sleeve'])
if WHO == 'boss':
    a.vlines('sleeve', S['stripe'], every=3, broken=0.15)
    a.vlines('forearm', S['stripe'], every=3, broken=0.15)
elif WHO == 'enforcer':
    a.noise('sleeve', ['shadow', 'ash'], 0.15)
    a.noise('forearm', ['shadow', 'ash'], 0.15)
else:
    a.noise('sleeve', ['paper'], 0.25)
    a.noise('forearm', [S['skin']], 0.1)
a.fill('pants', S['pants'])
a.fill('hat', 'shadow'); a.noise('hat', ['ink', 'dusk'], 0.3)
a.fill('hatBand', 'blood')
a.fill('chain', 'gold'); a.noise('chain', ['amberDark'], 0.4)
a.fill('cigar', 'woodLight'); a.hlines('cigar', 'wood', every=2)
a.fill('ember', 'amber'); a.set(57, 13, 'lampGlow')
a.fill('glass', 'black'); a.set(61, 13, 'smoke')
a.fill('pick', 'bone')

# chest (front of torso), painted procedurally per character
a.fill('chest', S['suit'])
for r in range(16):
    for c in range(16):
        x, y = c, 16 + r
        dist = abs(c - 7.5)
        if WHO == 'boss':
            if c % 3 == 0:
                a.set(x, y, S['stripe'])
            v = 6 - r * 0.55
            if dist < v:
                a.set(x, y, S['shirt'])
            if dist < 1.0 and r < 13:
                a.set(x, y, S['tie'])
            if v - 1 <= dist < v + 0.2 and r < 11:
                a.set(x, y, 'ink')
            if r in (12, 14) and 7 <= c <= 8:
                a.set(x, y, 'bone')
            if r == 4 and c in (12, 13):
                a.set(x, y, 'gold')
        elif WHO == 'enforcer':
            a.set(x, y, 'ink')
            if dist < 3.2:
                a.set(x, y, S['shirt'] if c % 2 else 'shadow')  # ribbed turtleneck
            if (r == 3 and dist < 3.5) or (r == 4 and 2.5 < dist < 4.5):
                a.set(x, y, 'gold')
            if 3.2 <= dist < 4.2:
                a.set(x, y, 'smoke')
        else:
            v = 4.5 - r * 0.45
            if dist < max(v, 0):
                a.set(x, y, S['shirt'])
            if dist < 0.6 and r < 9:
                a.set(x, y, 'black')
            if r in (6, 9, 12) and 7 <= c <= 8 and dist >= max(v, 0):
                a.set(x, y, 'gold')
mat = a.material('Char_' + WHO)

W, D, H = S['width'], S['depth'], S['height']
seat_z = 0.5
parts = []
add = parts.append

# pelvis & legs (mostly under the table)
add(lib.box('pelvis', (W * 0.85, D, 0.16), (0, 0.0, seat_z + 0.08), atlas=a, faces={'default': 'pants'}, mat=mat))
for s in (-1, 1):
    add(lib.box('thigh', (W * 0.33, 0.46, 0.15), (s * W * 0.22, -0.2, seat_z + 0.07), atlas=a, faces={'default': 'pants'}, mat=mat))
    add(lib.box('shin', (W * 0.27, 0.13, 0.48), (s * W * 0.22, -0.4, 0.25), atlas=a, faces={'default': 'pants'}, mat=mat))
    add(lib.box('shoe', (W * 0.27, 0.24, 0.08), (s * W * 0.22, -0.45, 0.04), atlas=a, faces={'default': 'shoe'}, mat=mat))
# torso: tapered, leaning slightly toward the table
torso_z = seat_z + 0.16 + H / 2
lean = math.radians(9)
add(lib.box('torso', (W, D, H), (0, 0.02, torso_z), rot=(lean, 0, 0), atlas=a,
            faces={'default': 'suit', '-y': 'chest'}, mat=mat, taper=(S['taper'], 0.92)))
shoulder_z = seat_z + 0.16 + H
sh_y = 0.02 - math.sin(lean) * H / 2
add(lib.box('shoulders', (W * S['taper'] + 0.06, D * 0.85, 0.09), (0, sh_y, shoulder_z - 0.04), rot=(lean, 0, 0),
            atlas=a, faces={'default': 'suit'}, mat=mat, taper=(0.9, 0.9)))
add(lib.box('neckbox', (0.1, 0.1, 0.09), (0, sh_y - 0.01, shoulder_z + 0.03), atlas=a, faces={'default': 'neck'}, mat=mat))
# arms: a joint chain so nothing floats. shoulder -> elbow (just off the table edge) ->
# wrist on the padded rail -> hand on the felt. Each piece is a box stretched between two
# joints (plus a little overlap), with a cube at the elbow to close the bend.
# In the game the opponents sit SEAT_DIST from the table's centre (layout.js SEAT_RADIUS
# + 0.06, plus BackRoom.js SIT_BACK); the table's rail runs from radius 0.70 to 0.80 with
# its top at ~0.786 m, so from the seat the rail starts EDGE metres in front.
SEAT_DIST = 1.12 + 0.06 + 0.14
EDGE = SEAT_DIST - 0.80
RAIL_TOP = 0.786


def limb(name, p0, p1, w, t, region, ext0=0.0, ext1=0.0):
    """Box from joint p0 to joint p1 (pushed ext0/ext1 past each end): w wide, t thick
    (thickness points up where it can)."""
    v0, v1 = Vector(p0), Vector(p1)
    d = (v1 - v0).normalized()
    v0, v1 = v0 - d * ext0, v1 + d * ext1
    rot = d.to_track_quat('Z', 'Y').to_euler()
    return lib.box(name, (w, t, (v1 - v0).length), tuple((v0 + v1) / 2), rot=tuple(rot), atlas=a,
                   faces={'default': region}, mat=mat)


arm_x = W * S['taper'] / 2 + 0.03
right_upper, right_fore = [], []  # the character's right arm (facing -Y, that's -X) can move
joints = {}
for s in (-1, 1):
    shoulder = (s * arm_x, sh_y + 0.01, shoulder_z - 0.06)
    elbow = (s * (arm_x + 0.03), -(EDGE - 0.16), RAIL_TOP + 0.075)
    wrist = (s * (arm_x - 0.07), -(EDGE + 0.06), RAIL_TOP + 0.03)
    tip = (s * (arm_x - 0.11), -(EDGE + 0.16), RAIL_TOP - 0.005)
    up, fo = (right_upper, right_fore) if s == -1 else (parts, parts)
    up.append(limb('upper', shoulder, elbow, 0.1, 0.11, 'sleeve', ext0=0.04))
    up.append(lib.box('elbow', (0.105, 0.105, 0.105), elbow, atlas=a, faces={'default': 'sleeve'}, mat=mat))
    fo.append(limb('fore', elbow, wrist, 0.09, 0.085, 'forearm', ext1=0.015))
    fo.append(limb('hand', wrist, tip, 0.085, 0.045, 'hand'))
    if s == -1:
        joints = dict(shoulder=shoulder, elbow=elbow, tip=tip)
body = lib.join(parts, 'Body')
lib.flat_shade(body)


def pivot_at(obj, p):
    """Move an object's origin to point p without moving its mesh."""
    bpy.context.scene.cursor.location = p
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.origin_set(type='ORIGIN_CURSOR')
    bpy.context.scene.cursor.location = (0, 0, 0)


def attach(child, parent):
    child.parent = parent
    child.matrix_parent_inverse = parent.matrix_world.inverted()


# The right arm as two nodes the game can pose (no rig): UpperArmR turns at the shoulder,
# ForeArmR at the elbow, and the empty HandTipR marks the end of the hand.
upper_r = lib.join(right_upper, 'UpperArmR')
lib.flat_shade(upper_r)
pivot_at(upper_r, joints['shoulder'])
fore_r = lib.join(right_fore, 'ForeArmR')
lib.flat_shade(fore_r)
pivot_at(fore_r, joints['elbow'])
attach(upper_r, body)
attach(fore_r, upper_r)
tip_r = bpy.data.objects.new('HandTipR', None)
bpy.context.scene.collection.objects.link(tip_r)
tip_r.location = joints['tip']
attach(tip_r, fore_r)

# head, built around the neck pivot, then re-originated there
hw, hd, hh = S['head']
pivot = (0, sh_y - 0.015, shoulder_z + 0.07)
hz = pivot[2] + hh / 2 + 0.01
front = pivot[1] - hd / 2
hparts = [lib.box('head', (hw, hd, hh), (0, pivot[1], hz), atlas=a,
                  faces={'default': 'headSide', '-y': 'face', '+z': 'headTop', '-z': 'neck'}, mat=mat, taper=(0.95, 0.95))]
hparts.append(lib.box('nose', (0.03, 0.04, 0.05), (0, front - 0.012, hz - 0.01), atlas=a,
                      faces={'default': 'neck'}, mat=mat, taper=(0.8, 0.4)))
for s in (-1, 1):
    hparts.append(lib.box('ear', (0.02, 0.04, 0.06), (s * (hw / 2 + 0.005), pivot[1] + 0.01, hz), atlas=a,
                          faces={'default': 'neck'}, mat=mat))
if S['hat']:
    top = pivot[2] + hh + 0.005
    hparts.append(lib.lathe('brim', [(0.0, 0), (0.2, 0.0), (0.2, 0.015), (0.0, 0.015)], 10,
                            loc=(0, pivot[1] + 0.005, top), atlas=a, bands='hat', mat=mat))
    hparts.append(lib.lathe('crown', [(0.115, 0.0), (0.115, 0.03), (0.11, 0.1), (0.07, 0.13), (0.0, 0.12)], 8,
                            loc=(0, pivot[1] + 0.005, top + 0.012), atlas=a,
                            bands=['hatBand', 'hat', 'hat', 'hat'], mat=mat))
    hparts.append(lib.box('cigar', (0.13, 0.024, 0.024), (0.08, front - 0.05, hz - 0.08),
                          rot=(0, math.radians(-8), math.radians(-30)), atlas=a,
                          faces={'default': 'cigar', '+x': 'ember'}, mat=mat))
if WHO == 'shark':
    hparts.append(lib.box('slick', (hw + 0.012, hd + 0.01, 0.04), (0, pivot[1] + 0.01, pivot[2] + hh + 0.0), atlas=a,
                          faces={'default': 'headTop'}, mat=mat, taper=(0.9, 0.95)))
    hparts.append(lib.box('glasses', (hw + 0.01, 0.012, 0.04), (0, front - 0.006, hz + 0.025), atlas=a,
                          faces={'default': 'glass'}, mat=mat))
    hparts.append(lib.box('pick', (0.08, 0.006, 0.006), (0.06, front - 0.02, hz - 0.065),
                          rot=(0, 0, math.radians(-25)), atlas=a, faces={'default': 'pick'}, mat=mat))
if WHO == 'enforcer':
    hparts.append(lib.box('brow', (hw, 0.026, 0.022), (0, front - 0.008, hz + 0.054), atlas=a,
                          faces={'default': 'headTop', '-y': 'neck'}, mat=mat))
head = lib.join(hparts, 'Head')
lib.flat_shade(head)
bpy.context.scene.cursor.location = pivot
bpy.ops.object.select_all(action='DESELECT')
head.select_set(True)
bpy.context.view_layer.objects.active = head
bpy.ops.object.origin_set(type='ORIGIN_CURSOR')
bpy.context.scene.cursor.location = (0, 0, 0)
head.parent = body
head.matrix_parent_inverse = body.matrix_world.inverted()
body.name = 'Body'
print(WHO, 'body faces', len(body.data.polygons), 'head faces', len(head.data.polygons))
