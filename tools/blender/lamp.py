# Hanging lamp: green enamel shade, brass cap, cord and a separate emissive bulb.
# Origin = where the shade meets the cord. The cord runs up 1 m (scaled in game).
exec(open(PROJECT_DIR + r"\tools\blender\_head.py").read())

a = lib.Atlas('lamp', 32, 32, bg='sage', seed=31)
a.region('shadeOut', 0, 0, 32, 8)
a.region('shadeIn', 0, 8, 32, 8)
a.region('brass', 0, 16, 16, 8)
a.region('cord', 16, 16, 16, 8)
a.region('bulb', 0, 24, 8, 8)
a.fill('shadeOut', 'sage')
a.noise('shadeOut', ['feltLight'], 0.25)
a.hlines('shadeOut', 'feltDark', every=8, offset=7)
a.fill('shadeIn', 'paper')
a.noise('shadeIn', ['bone'], 0.2)
a.fill('brass', 'amberDark')
a.noise('brass', ['gold', 'woodLight'], 0.3)
a.fill('cord', 'black')
a.fill('bulb', 'lampGlow')
m = a.material('LampBody')

outer = lib.lathe('ShadeOut', [(0.24, -0.17), (0.2, -0.12), (0.12, -0.04), (0.05, 0.0)], 12,
                  atlas=a, bands='shadeOut', mat=m)
inner = lib.lathe('ShadeIn', [(0.05, -0.005), (0.115, -0.045), (0.195, -0.125), (0.235, -0.17)], 12,
                  atlas=a, bands='shadeIn', mat=m)
cap = lib.lathe('Cap', [(0.055, -0.01), (0.055, 0.02), (0.03, 0.045), (0.012, 0.05)], 8,
                atlas=a, bands='brass', mat=m)
socket = lib.lathe('Socket', [(0.025, -0.08), (0.025, -0.01)], 8, atlas=a, bands='brass', cap_bottom='brass', mat=m)
cord = lib.lathe('CordMesh', [(0.007, 0.05), (0.007, 1.05)], 4, atlas=a, bands='cord', mat=m)
body = lib.join([outer, inner, cap, socket, cord], 'LampBody')
lib.flat_shade(body)

bm = a.material('Bulb', emissive='lampGlow', emissive_strength=4.0)
bulb = lib.lathe('Bulb', [(0.0, -0.17), (0.03, -0.155), (0.042, -0.125), (0.035, -0.095), (0.02, -0.08)], 8,
                 atlas=a, bands='bulb', mat=bm)
lib.flat_shade(bulb)
print('lamp', len(body.data.polygons), len(bulb.data.polygons))
