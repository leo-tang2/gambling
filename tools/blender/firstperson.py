# Revolver and the player's first-person hands.
# Both share the same origin: the grip point. Forward (barrel / fingers) is -Y in Blender,
# which becomes +Z in the game, so Object3D.lookAt() aims them.
exec(open(PROJECT_DIR + r"\tools\blender\_head.py").read())

a = lib.Atlas('firstperson', 64, 32, bg='ash', seed=71)
for key, rect in {
    'metal': (0, 0, 16, 8), 'metalDark': (16, 0, 16, 8), 'bore': (32, 0, 8, 8), 'grip': (40, 0, 16, 8),
    'brass': (56, 0, 8, 8), 'skin': (0, 8, 16, 8), 'skinDark': (16, 8, 16, 8), 'nail': (32, 8, 8, 8),
    'cuff': (40, 8, 16, 8), 'sleeve': (0, 16, 32, 16), 'button': (56, 8, 8, 8),
}.items():
    a.region(key, *rect)
a.fill('metal', 'smoke'); a.noise('metal', ['bone', 'ash'], 0.25)
a.fill('metalDark', 'ashDark'); a.noise('metalDark', ['ash'], 0.3)
a.fill('bore', 'black')
a.fill('grip', 'leather'); a.hlines('grip', 'wood', every=2); a.noise('grip', ['woodLight'], 0.15)
a.fill('brass', 'amberMid')
a.fill('skin', 'skin'); a.noise('skin', ['skinMid'], 0.2)
a.fill('skinDark', 'skinMid'); a.noise('skinDark', ['skinDark'], 0.25)
a.fill('nail', 'skinLight')
a.fill('cuff', 'paper'); a.noise('cuff', ['bone'], 0.15)
a.fill('sleeve', 'ashDark'); a.vlines('sleeve', 'dusk', every=4); a.noise('sleeve', ['ash'], 0.08)
a.fill('button', 'bone')
m = a.material('FirstPerson')
B = lambda *args, **kw: lib.box(*args, atlas=a, mat=m, **kw)

# ---- revolver (about 0.3 m long) ----
g = []
g.append(lib.lathe('barrel', [(0.011, 0.0), (0.011, 0.17)], 8, loc=(0, -0.03, 0.055), rot=(math.radians(90), 0, 0),
                   atlas=a, bands='metal', cap_top='bore', mat=m))
g.append(B('rib', (0.008, 0.16, 0.008), (0, -0.115, 0.069), faces={'default': 'metalDark'}))
g.append(B('sight', (0.004, 0.01, 0.01), (0, -0.19, 0.072), faces={'default': 'metalDark'}))
g.append(lib.lathe('drum', [(0.024, 0.0), (0.024, 0.045)], 6, loc=(0, 0.005, 0.048), rot=(math.radians(90), 0, 0),
                   atlas=a, bands='metal', cap_top='metalDark', cap_bottom='metalDark', mat=m))
g.append(B('frame', (0.022, 0.07, 0.04), (0, 0.025, 0.042), faces={'default': 'metalDark'}))
g.append(B('hammer', (0.01, 0.022, 0.02), (0, 0.06, 0.07), rot=(math.radians(-25), 0, 0), faces={'default': 'metalDark'}))
g.append(B('grip', (0.026, 0.038, 0.11), (0, 0.045, -0.02), rot=(math.radians(-18), 0, 0), faces={'default': 'grip', '+z': 'metalDark'}, taper=(1.0, 1.15)))
g.append(B('guard', (0.008, 0.04, 0.006), (0, 0.0, 0.006), faces={'default': 'metalDark'}))
g.append(B('guardFront', (0.008, 0.006, 0.03), (0, -0.018, 0.02), faces={'default': 'metalDark'}))
g.append(B('trigger', (0.004, 0.006, 0.02), (0, 0.006, 0.02), rot=(math.radians(15), 0, 0), faces={'default': 'brass'}))
gun = lib.join(g, 'Revolver')
lib.flat_shade(gun)
gun.location = (0.4, 0, 0)  # move aside for previews; geometry origin stays at the grip

# ---- gripping hand (wraps the revolver grip) ----
h = []
h.append(B('palm', (0.03, 0.06, 0.085), (0.0, 0.055, -0.02), rot=(math.radians(-18), 0, 0), faces={'default': 'skin', '-x': 'skinDark'}))
for i in range(3):
    z = -0.005 - i * 0.024
    h.append(B('finger', (0.06, 0.02, 0.02), (-0.003, 0.025 - i * 0.008, z), rot=(0, 0, math.radians(8)), faces={'default': 'skin', '-y': 'skinDark'}))
h.append(B('index', (0.016, 0.045, 0.016), (-0.015, -0.005, 0.02), rot=(math.radians(-10), 0, 0), faces={'default': 'skin', '-y': 'nail'}))
h.append(B('thumb', (0.016, 0.05, 0.018), (0.02, 0.01, 0.04), rot=(math.radians(-20), 0, math.radians(-15)), faces={'default': 'skin', '-y': 'nail'}))
h.append(B('cuff', (0.06, 0.04, 0.07), (0.0, 0.11, -0.04), rot=(math.radians(-18), 0, 0), faces={'default': 'cuff'}))
h.append(B('sleeve', (0.08, 0.32, 0.09), (0.0, 0.28, -0.08), rot=(math.radians(-14), 0, 0), faces={'default': 'sleeve'}, taper=(1.08, 1.0)))
grip = lib.join(h, 'HandGrip')
lib.flat_shade(grip)
grip.location = (0.4, 0, 0)

# ---- flat hand for tipping a card corner (fingertips at the origin) ----
p = []
p.append(B('palm', (0.08, 0.09, 0.025), (0.0, 0.085, 0.015), faces={'default': 'skin', '-z': 'skinDark'}))
for i in range(4):
    x = -0.03 + i * 0.02
    ln = 0.07 if i in (1, 2) else 0.06
    p.append(B('finger', (0.017, ln, 0.016), (x, 0.04 - ln / 2 + 0.005, 0.012 - i * 0.0), rot=(math.radians(-8), 0, 0),
               faces={'default': 'skin', '-y': 'nail', '-z': 'skinDark'}))
p.append(B('thumb', (0.018, 0.06, 0.018), (0.05, 0.06, 0.0), rot=(math.radians(10), 0, math.radians(35)), faces={'default': 'skin', '-y': 'nail'}))
p.append(B('cuff', (0.09, 0.04, 0.05), (0.0, 0.145, 0.02), faces={'default': 'cuff'}))
p.append(B('sleeve', (0.1, 0.3, 0.07), (0.0, 0.31, 0.03), rot=(math.radians(4), 0, 0), faces={'default': 'sleeve'}, taper=(1.05, 1.0)))
peek = lib.join(p, 'HandPeek')
lib.flat_shade(peek)
peek.location = (0.8, 0, 0)
print('fp', len(gun.data.polygons), len(grip.data.polygons), len(peek.data.polygons))
