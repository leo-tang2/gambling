# Wooden bar chair. Faces -Y (exports facing +Z), seat top at 0.47 m.
exec(open(PROJECT_DIR + r"\tools\blender\_head.py").read())

a = lib.Atlas('chair', 32, 32, bg='woodLight', seed=21)
a.region('plank', 0, 0, 32, 8)
a.region('end', 0, 8, 8, 8)
a.region('leg', 8, 8, 24, 8)
a.region('cushion', 0, 16, 16, 16)
a.region('dark', 16, 16, 16, 16)
a.hlines('plank', 'leather', every=3, broken=0.5)
a.noise('plank', ['wood'], 0.12)
a.fill('end', 'wood')
a.fill('leg', 'wood')
a.vlines('leg', 'woodDark', every=5, broken=0.3)
a.fill('cushion', 'blood')
a.noise('cushion', ['bloodDark', 'red'], 0.25)
a.fill('dark', 'woodDark')
m = a.material('ChairWood')

parts = []
F = {'default': 'plank', '+z': 'plank', '-z': 'dark'}
parts.append(lib.box('seat', (0.44, 0.42, 0.04), (0, 0, 0.45), atlas=a, faces={'default': 'end', '+z': 'plank', '-z': 'dark'}, mat=m))
parts.append(lib.box('cushion', (0.38, 0.36, 0.03), (0, -0.01, 0.485), atlas=a, faces={'default': 'cushion'}, mat=m, taper=(0.95, 0.95)))
for sx in (-1, 1):
    for sy in (-1, 1):
        parts.append(lib.box('leg', (0.04, 0.04, 0.43), (sx * 0.18, sy * 0.17, 0.215), atlas=a,
                             faces={'default': 'leg'}, mat=m, taper=(1.15, 1.15)))
    # back posts
    parts.append(lib.box('post', (0.04, 0.04, 0.5), (sx * 0.18, 0.19, 0.7), rot=(math.radians(-6), 0, 0),
                         atlas=a, faces={'default': 'leg'}, mat=m))
# stretchers between legs
parts.append(lib.box('str', (0.34, 0.025, 0.025), (0, -0.17, 0.14), atlas=a, faces={'default': 'leg'}, mat=m))
parts.append(lib.box('str', (0.34, 0.025, 0.025), (0, 0.17, 0.14), atlas=a, faces={'default': 'leg'}, mat=m))
# back slats
parts.append(lib.box('rest', (0.40, 0.035, 0.1), (0, 0.205, 0.9), rot=(math.radians(-6), 0, 0), atlas=a, faces={'default': 'end', '-y': 'plank', '+y': 'plank'}, mat=m))
parts.append(lib.box('slat', (0.36, 0.025, 0.05), (0, 0.195, 0.72), rot=(math.radians(-6), 0, 0), atlas=a, faces={'default': 'plank'}, mat=m))
chair = lib.join(parts, 'Chair')
lib.flat_shade(chair)
print('chair faces', len(chair.data.polygons))
