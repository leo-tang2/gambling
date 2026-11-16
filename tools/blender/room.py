# The back room: plank floor, striped wallpaper over wood wainscot, a door with light
# leaking under it, a shelf of bottles, crates and a framed picture. 5 x 5 m, 2.9 m high.
exec(open(PROJECT_DIR + r"\tools\blender\_head.py").read())
R = 2.5   # half size
H = 2.9

floor = lib.Atlas('room_floor', 32, 32, bg='woodDark', seed=41)
floor.region('all', 0, 0, 32, 32)
floor.hlines('all', 'black', every=8, offset=7)
for row in range(4):
    off = (row * 13) % 32
    for y in range(row * 8, row * 8 + 7):
        floor.set(off, y, 'black')
floor.noise('all', ['wood'], 0.15)
floor.noise('all', ['shadow'], 0.08)
floorMat = floor.material('Floor')

wall = lib.Atlas('room_wall', 32, 32, bg='bloodDark', seed=42)
wall.region('all', 0, 0, 32, 32)
wall.vlines('all', 'blood', every=8, offset=2)
wall.vlines('all', 'blood', every=8, offset=3)
wall.vlines('all', 'woodDark', every=8, offset=6, broken=0.2)
wall.noise('all', ['dusk', 'shadow'], 0.12)
wallMat = wall.material('Wallpaper')

wain = lib.Atlas('room_wainscot', 32, 32, bg='wood', seed=43)
wain.region('all', 0, 0, 32, 32)
wain.vlines('all', 'woodDark', every=16, offset=0)
wain.hlines('all', 'woodLight', every=32, offset=1)
wain.hlines('all', 'woodDark', every=32, offset=0)
wain.noise('all', ['woodDark'], 0.1)
wainMat = wain.material('Wainscot')

ceil = lib.Atlas('room_ceiling', 16, 16, bg='shadow', seed=44)
ceil.region('all', 0, 0, 16, 16)
ceil.noise('all', ['black', 'dusk'], 0.2)
ceilMat = ceil.material('Ceiling')

p = lib.Atlas('room_props', 64, 64, bg='black', seed=45)
p.region('door', 0, 0, 16, 32)
p.region('frame', 16, 0, 8, 8)
p.region('wood', 24, 0, 8, 8)
p.region('crate', 32, 0, 16, 16)
p.region('picture', 48, 0, 16, 16)
p.region('glassG', 16, 8, 4, 8)
p.region('glassB', 20, 8, 4, 8)
p.region('label', 24, 8, 8, 8)
p.region('light', 16, 16, 8, 4)
p.region('dark', 24, 16, 8, 8)
p.region('metal', 16, 20, 8, 4)
p.region('shelf', 32, 16, 32, 8)
p.fill('door', 'wood')
p.vlines('door', 'woodDark', every=5, broken=0.1)
p.art('door', [
    '................', '.##############.', '.#............#.', '.#............#.', '.#............#.',
    '.#............#.', '.#............#.', '.#............#.', '.##############.', '................',
    '................', '.##############.', '.#............#.', '.#............#.', '.#............#.',
    '.#.........oo.#.', '.#.........oo.#.', '.#............#.', '.#............#.', '.#............#.',
    '.#............#.', '.#............#.', '.#............#.', '.##############.',
], {'#': 'woodDark', 'o': 'amberDark'})
p.fill('frame', 'amberDark')
p.fill('wood', 'woodLight')
p.hlines('wood', 'wood', every=2)
p.fill('crate', 'woodLight')
p.art('crate', [
    '################', '#..............#', '#.#..........#.#', '#..#........#..#', '#...#......#...#',
    '#....#....#....#', '#.....#..#.....#', '#......##......#', '#......##......#', '#.....#..#.....#',
    '#....#....#....#', '#...#......#...#', '#..#........#..#', '#.#..........#.#', '#..............#',
    '################'], {'#': 'wood'})
p.fill('picture', 'shadow')
p.art('picture', [
    'GGGGGGGGGGGGGGGG', 'G..............G', 'G.....sss......G', 'G....sssss.....G', 'G....sssss.....G',
    'G.....sss......G', 'G....nnnnn.....G', 'G...nnnnnnn....G', 'G...nnnnnnn....G', 'G...nnnnnnn....G',
    'G..............G', 'G.....aaaa.....G', 'G..............G', 'G..............G', 'G..............G',
    'GGGGGGGGGGGGGGGG'], {'G': 'amberDark', 's': 'skin', 'n': 'navy', 'a': 'paper'})
p.fill('glassG', 'feltLight'); p.set(17, 9, 'sage')
p.fill('glassB', 'woodLight'); p.set(21, 9, 'amber')
p.fill('label', 'paper'); p.hlines('label', 'red', every=3)
p.fill('light', 'lampGlow')
p.fill('dark', 'black')
p.fill('metal', 'smoke')
p.fill('shelf', 'woodLight')
p.hlines('shelf', 'wood', every=3, broken=0.3)
propMat = p.material('Props')
lightMat = p.material('DoorLight', emissive='lampGlow', emissive_strength=3.0)

parts = []
# floor & ceiling
parts.append(lib.box('floor', (2 * R, 2 * R, 0.05), (0, 0, -0.025), atlas=floor,
                     faces={'default': ('all', 1, 1), '+z': ('all', 10, 10)}, mat=floorMat))
ceiling = lib.box('ceiling', (2 * R, 2 * R, 0.05), (0, 0, H + 0.025), atlas=ceil,
                  faces={'default': ('all', 1, 1), '-z': ('all', 6, 6)}, mat=ceilMat)
# walls: thin boxes, inner face tiled
walls = []
specs = [((0, R + 0.05, H / 2), (2 * R, 0.1, H), '-y'), ((0, -R - 0.05, H / 2), (2 * R, 0.1, H), '+y'),
         ((R + 0.05, 0, H / 2), (0.1, 2 * R, H), '-x'), ((-R - 0.05, 0, H / 2), (0.1, 2 * R, H), '+x')]
for loc, size, inner in specs:
    walls.append(lib.box('wall', size, loc, atlas=wall, faces={'default': ('all', 1, 1), inner: ('all', 8, 4.5)}, mat=wallMat))
    # wainscot: 1 m high panel sitting 2 cm off the wall
    wl = list(loc); ws = list(size)
    ws[2] = 1.0
    wl[2] = 0.5
    axis = 0 if inner in ('-x', '+x') else 1
    wl[axis] += -0.03 if inner[0] == '-' else 0.03
    walls.append(lib.box('wain', tuple(ws), tuple(wl), atlas=wain,
                         faces={'default': ('all', 1, 0.2), inner: ('all', 8, 1)}, mat=wainMat))
    # chair rail on top of the wainscot
    rl = list(wl); rs = list(ws)
    rs[2] = 0.04
    rl[2] = 1.01
    rl[axis] += -0.015 if inner[0] == '-' else 0.015
    rs[axis] += 0.03
    walls.append(lib.box('rail', tuple(rs), tuple(rl), atlas=p, faces={'default': 'wood'}, mat=propMat))

# door on the right (+x) wall, light leaking under it
door_z = -1.0
parts.append(lib.box('door', (0.06, 0.9, 2.05), (R - 0.04, door_z, 1.025), atlas=p,
                     faces={'default': 'frame', '-x': 'door'}, mat=propMat))
parts.append(lib.box('doorframe', (0.08, 1.04, 0.08), (R - 0.03, door_z, 2.09), atlas=p, faces={'default': 'wood'}, mat=propMat))
for s in (-1, 1):
    parts.append(lib.box('doorframe', (0.08, 0.07, 2.1), (R - 0.03, door_z + s * 0.485, 1.05), atlas=p, faces={'default': 'wood'}, mat=propMat))
doorlight = lib.box('DoorLight', (0.02, 0.86, 0.012), (R - 0.075, door_z, 0.006), atlas=p, faces={'default': 'light'}, mat=lightMat)
doorspill = lib.box('DoorSpill', (0.18, 0.8, 0.004), (R - 0.17, door_z, 0.002), atlas=p, faces={'default': 'light'}, mat=lightMat, taper=(0.5, 0.9))

# shelf with bottles behind the far seat (+y in Blender = far side in game, -z)
sy = R - 0.16
for z in (1.25, 1.65):
    parts.append(lib.box('shelf', (1.6, 0.26, 0.04), (-0.4, sy, z), atlas=p, faces={'default': 'shelf'}, mat=propMat))
for i in range(9):
    x = -1.1 + i * 0.17 + (0.03 if i % 2 else 0)
    z = 1.27 if i < 5 else 1.67
    if i >= 5:
        x -= 0.7
    tall = 0.26 if i % 3 else 0.2
    glass = 'glassG' if i % 2 else 'glassB'
    parts.append(lib.lathe('bottle', [(0.0, 0), (0.035, 0), (0.035, tall * 0.65), (0.012, tall * 0.8), (0.012, tall), (0.0, tall)],
                           6, loc=(x, sy, z + 0.02), atlas=p, bands=[glass, glass, glass, glass, 'dark'], mat=propMat))
    if i % 2 == 0:
        parts.append(lib.box('label', (0.05, 0.002, 0.05), (x, sy - 0.036, z + 0.02 + tall * 0.3), atlas=p, faces={'default': 'label'}, mat=propMat))
# shelf brackets
for x in (-1.1, 0.3):
    for z in (1.25, 1.65):
        parts.append(lib.box('bracket', (0.03, 0.2, 0.12), (x, sy + 0.02, z - 0.08), atlas=p, faces={'default': 'metal'}, mat=propMat, taper=(1, 0.1)))

# crates stacked in the far-left corner
for (x, y, z, rz) in ((-1.95, 1.9, 0.25, 0.1), (-1.9, 1.35, 0.25, -0.15), (-1.92, 1.75, 0.75, 0.3)):
    parts.append(lib.box('crate', (0.5, 0.5, 0.5), (x, y, z), (0, 0, rz), atlas=p, faces={'default': 'crate'}, mat=propMat))

# framed picture on the left (-x) wall
parts.append(lib.box('picture', (0.03, 0.5, 0.5), (-R + 0.02, 0.6, 1.7), atlas=p, faces={'default': 'frame', '+x': 'picture'}, mat=propMat))

room = lib.join(parts + walls + [ceiling], 'Room')
lib.flat_shade(room)
glow = lib.join([doorlight, doorspill], 'DoorGlow')
print('room faces', len(room.data.polygons))
