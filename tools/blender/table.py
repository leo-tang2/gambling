# Round poker table: felt top, padded leather rail, wooden apron and pedestal.
import sys, importlib, math
sys.path.insert(0, PROJECT_DIR + r"\tools\blender")
import lib; importlib.reload(lib)
lib.boot(PROJECT_DIR)

# --- felt atlas (64x64): the whole disc ---
felt = lib.Atlas('table_felt', 64, 64, bg='felt', seed=11)
felt.region('disc', 0, 0, 64, 64)
felt.region('edge', 0, 0, 4, 4)
felt.noise('disc', ['feltDark'], 0.07)
felt.noise('disc', ['feltLight'], 0.02)
# betting line ring and a worn centre
for i in range(360):
    a = math.radians(i)
    for rr in (25.5,):
        felt.set(int(32 + math.cos(a) * rr), int(32 + math.sin(a) * rr), 'sage')
for y in range(64):
    for x in range(64):
        d = math.hypot(x - 31.5, y - 31.5)
        if d > 31:
            felt.set(x, y, 'feltDark')
feltMat = felt.material('Felt')

# --- wood/leather atlas (32x32) ---
wood = lib.Atlas('table_wood', 32, 32, bg='wood', seed=12)
wood.region('rail', 0, 0, 32, 8)
wood.region('railTop', 0, 8, 32, 8)
wood.region('apron', 0, 16, 32, 8)
wood.region('brass', 0, 24, 8, 8)
wood.region('foot', 8, 24, 24, 8)
wood.fill('rail', 'bloodDark')
wood.noise('rail', ['blood'], 0.25)
wood.hlines('rail', 'black', every=8, offset=7)
wood.fill('railTop', 'blood')
wood.noise('railTop', ['red', 'bloodDark'], 0.2)
for x in range(0, 32, 4):
    wood.set(x, 11, 'redLight')  # stitching
wood.fill('apron', 'woodLight')
wood.hlines('apron', 'wood', every=3, broken=0.3)
wood.noise('apron', ['leather'], 0.08)
wood.fill('brass', 'amberDark')
wood.noise('brass', ['gold'], 0.3)
wood.fill('foot', 'woodDark')
wood.hlines('foot', 'wood', every=2, broken=0.4)
woodMat = wood.material('TableWood')

SEG = 20
top_h = 0.76
felt_obj = lib.lathe('Felt', [(0.70, top_h - 0.014), (0.70, top_h - 0.006)], SEG,
                     atlas=felt, bands='edge', cap_top='disc', mat=feltMat)
rail = lib.lathe('Rail', [
    (0.70, top_h - 0.006), (0.705, top_h + 0.012), (0.73, top_h + 0.026), (0.775, top_h + 0.024),
    (0.80, top_h + 0.004), (0.80, top_h - 0.03), (0.70, top_h - 0.03)],
    SEG, atlas=wood, bands=['railTop', 'railTop', 'railTop', 'rail', 'rail', 'apron'], mat=woodMat)
apron = lib.lathe('Apron', [(0.72, top_h - 0.03), (0.74, top_h - 0.1), (0.62, top_h - 0.11), (0.2, top_h - 0.1)],
                  SEG, atlas=wood, bands=['apron', 'foot', 'foot'], mat=woodMat)
ped = lib.lathe('Pedestal', [
    (0.13, top_h - 0.1), (0.10, top_h - 0.18), (0.08, 0.36), (0.11, 0.24), (0.09, 0.16),
    (0.42, 0.06), (0.46, 0.03), (0.46, 0.0)],
    10, atlas=wood, bands=['foot', 'foot', 'apron', 'brass', 'foot', 'foot', 'brass'], mat=woodMat)
for o in (felt_obj, rail, apron, ped):
    lib.flat_shade(o)
table = lib.join([rail, apron, ped, felt_obj], 'Table')
print('table faces', len(table.data.polygons))
