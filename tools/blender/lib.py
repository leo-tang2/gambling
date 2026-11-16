"""Shared helpers for modelling Bar Gambling assets in Blender.

Every asset is built from low-poly boxes and cylinders whose faces are UV-mapped into
one tiny painted atlas (<= 64 px), sampled with Closest filtering. Run the asset scripts
from Blender (or the Blender MCP) with:  exec(open(r"...\\tools\\blender\\<asset>.py").read())
"""
import bpy, bmesh, math, os, random
from mathutils import Vector, Matrix

PROJECT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))) \
    if '__file__' in globals() else None

# The game palette (keep in sync with src/shared/render/palette.js)
PAL = {
    'black': '#050407', 'ink': '#0b090d', 'shadow': '#141017', 'dusk': '#1d171c',
    'woodDark': '#2a1d17', 'wood': '#3d2a1e', 'woodLight': '#573b26', 'leather': '#7a5232',
    'amberDark': '#a8692e', 'amber': '#d4923f', 'gold': '#f2c062', 'lampGlow': '#ffe6a0',
    'feltDark': '#0f1f17', 'felt': '#173226', 'feltLight': '#23483a', 'sage': '#346052',
    'bloodDark': '#2b0b0f', 'blood': '#4a1218', 'red': '#74202a', 'redLight': '#a3333a',
    'skinDark': '#6e4e3e', 'skin': '#a07658', 'skinLight': '#c9a084',
    'ash': '#3a3740', 'smoke': '#625d66', 'bone': '#9a949a', 'paper': '#d8d0c4', 'cream': '#f4ecdc',
    'navy': '#1f2c4a', 'blue': '#3a5288',
    'ashDark': '#2a2830', 'duskLight': '#262027', 'woodMid': '#33241b', 'feltMid': '#1c3d30',
    'bloodMid': '#3a0e14', 'redMid': '#8c2a32', 'skinMid': '#865f4a', 'amberMid': '#bd7d37',
    'goldLight': '#f8d78a', 'smokeLight': '#7f7a82', 'boneLight': '#b8b1b2', 'navyLight': '#2c3c62',
    'white': '#fff8ea',
}

def rgba(c):
    if isinstance(c, str):
        h = PAL.get(c, c).lstrip('#')
        return (int(h[0:2], 16) / 255, int(h[2:4], 16) / 255, int(h[4:6], 16) / 255, 1.0)
    return c


def clean_scene():
    if bpy.context.object and bpy.context.object.mode != 'OBJECT':
        bpy.ops.object.mode_set(mode='OBJECT')
    for o in list(bpy.data.objects):
        bpy.data.objects.remove(o, do_unlink=True)
    for coll in (bpy.data.meshes, bpy.data.materials, bpy.data.images, bpy.data.lights, bpy.data.cameras):
        for b in list(coll):
            if b.users == 0:
                coll.remove(b)


class Atlas:
    """A tiny texture painted pixel by pixel. Regions are (x, y, w, h) in pixels, top-left origin."""

    def __init__(self, name, w=64, h=64, bg='black', seed=1):
        self.name, self.w, self.h = name, w, h
        self.px = [[rgba(bg) for _ in range(w)] for _ in range(h)]
        self.regions = {}
        self.rng = random.Random(seed)

    def region(self, key, x, y, w, h):
        self.regions[key] = (x, y, w, h)
        return key

    def set(self, x, y, c):
        if 0 <= x < self.w and 0 <= y < self.h:
            self.px[y][x] = rgba(c)

    def fill(self, key, c):
        x, y, w, h = self.regions[key]
        for j in range(h):
            for i in range(w):
                self.set(x + i, y + j, c)

    def noise(self, key, colors, density=0.3):
        """Sprinkle random pixels from `colors` over a region."""
        x, y, w, h = self.regions[key]
        for j in range(h):
            for i in range(w):
                if self.rng.random() < density:
                    self.set(x + i, y + j, self.rng.choice(colors))

    def hlines(self, key, c, every=4, offset=0, broken=0.0):
        x, y, w, h = self.regions[key]
        for j in range(offset, h, every):
            for i in range(w):
                if self.rng.random() >= broken:
                    self.set(x + i, y + j, c)

    def vlines(self, key, c, every=4, offset=0, broken=0.0):
        x, y, w, h = self.regions[key]
        for i in range(offset, w, every):
            for j in range(h):
                if self.rng.random() >= broken:
                    self.set(x + i, y + j, c)

    def art(self, key, rows, cmap):
        """Paint ASCII art into a region; '.' or ' ' leaves pixels unchanged."""
        x, y, w, h = self.regions[key]
        for j, row in enumerate(rows[:h]):
            for i, ch in enumerate(row[:w]):
                if ch in cmap:
                    self.set(x + i, y + j, cmap[ch])

    def uv(self, key, inset=0.02):
        """Region rect in UV space (u0, v0, u1, v1), slightly inset to avoid bleeding."""
        x, y, w, h = self.regions[key]
        u0 = (x + inset) / self.w
        u1 = (x + w - inset) / self.w
        v1 = 1 - (y + inset) / self.h
        v0 = 1 - (y + h - inset) / self.h
        return (u0, v0, u1, v1)

    def build_image(self):
        img = bpy.data.images.get(self.name)
        if img:
            bpy.data.images.remove(img)
        img = bpy.data.images.new(self.name, self.w, self.h, alpha=True)
        flat = []
        for row in reversed(self.px):  # Blender stores rows bottom-up
            for c in row:
                flat.extend(c)
        img.pixels.foreach_set(flat)
        img.pack()
        return img

    def material(self, name=None, emissive=None, emissive_strength=0.0, roughness=0.95):
        img = getattr(self, '_img', None) or self.build_image()
        self._img = img
        mat = bpy.data.materials.new(name or (self.name + '_mat'))
        mat.use_nodes = True
        nt = mat.node_tree
        bsdf = nt.nodes.get('Principled BSDF')
        tex = nt.nodes.new('ShaderNodeTexImage')
        tex.image = img
        tex.interpolation = 'Closest'
        nt.links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])
        bsdf.inputs['Roughness'].default_value = roughness
        bsdf.inputs['Metallic'].default_value = 0.0
        if 'Specular IOR Level' in bsdf.inputs:
            bsdf.inputs['Specular IOR Level'].default_value = 0.2
        if emissive:
            bsdf.inputs['Emission Color'].default_value = rgba(emissive)
            bsdf.inputs['Emission Strength'].default_value = emissive_strength
        return mat


def _link(obj):
    bpy.context.scene.collection.objects.link(obj)
    return obj


def _map_quad(uv_layer, face, rect):
    """Map a quad's loops onto rect, following the face's own orientation."""
    u0, v0, u1, v1 = rect
    corners = [(u0, v0), (u1, v0), (u1, v1), (u0, v1)]
    for loop, c in zip(face.loops, corners):
        loop[uv_layer].uv = c


def box(name, size, loc=(0, 0, 0), rot=(0, 0, 0), atlas=None, faces=None, mat=None,
        taper=(1.0, 1.0), parent=None):
    """Axis box (x, y, z sizes). `faces` maps '+x','-x','+y','-y','+z','-z','default' to atlas regions.
    `taper` scales the top face (x, y) to make wedges/trapezoids."""
    sx, sy, sz = (s / 2 for s in size)
    bm = bmesh.new()
    tx, ty = taper
    v = [
        bm.verts.new((-sx, -sy, -sz)), bm.verts.new((sx, -sy, -sz)),
        bm.verts.new((sx, sy, -sz)), bm.verts.new((-sx, sy, -sz)),
        bm.verts.new((-sx * tx, -sy * ty, sz)), bm.verts.new((sx * tx, -sy * ty, sz)),
        bm.verts.new((sx * tx, sy * ty, sz)), bm.verts.new((-sx * tx, sy * ty, sz)),
    ]
    # each face listed so its loops go bottom-left, bottom-right, top-right, top-left as seen from outside
    spec = {
        '-y': (v[0], v[1], v[5], v[4]),
        '+x': (v[1], v[2], v[6], v[5]),
        '+y': (v[2], v[3], v[7], v[6]),
        '-x': (v[3], v[0], v[4], v[7]),
        '+z': (v[4], v[5], v[6], v[7]),
        '-z': (v[3], v[2], v[1], v[0]),
    }
    uvl = bm.loops.layers.uv.new('UVMap')
    faces = faces or {}
    for key, verts in spec.items():
        f = bm.faces.new(verts)
        reg = faces.get(key, faces.get('default'))
        if atlas and reg:
            if isinstance(reg, tuple):  # (region, repeat_u, repeat_v) for tiling full textures
                r, ru, rv = reg
                u0, v0, u1, v1 = atlas.uv(r, inset=0)
                _map_quad(uvl, f, (u0, v0, u0 + (u1 - u0) * ru, v0 + (v1 - v0) * rv))
            else:
                _map_quad(uvl, f, atlas.uv(reg))
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    obj = _link(bpy.data.objects.new(name, me))
    if mat:
        me.materials.append(mat)
    obj.location = loc
    obj.rotation_euler = rot
    if parent:
        obj.parent = parent
    return obj


def cylinder(name, r_bottom, r_top, depth, segments=12, loc=(0, 0, 0), rot=(0, 0, 0), atlas=None,
             side=None, top=None, bottom=None, mat=None, caps=True, side_repeat=1, parent=None):
    """Z-aligned cylinder/cone. Side UVs wrap around the `side` region; caps map into their region."""
    bm = bmesh.new()
    uvl = bm.loops.layers.uv.new('UVMap')
    h = depth / 2
    ring_b = [bm.verts.new((math.cos(a) * r_bottom, math.sin(a) * r_bottom, -h))
              for a in [2 * math.pi * i / segments for i in range(segments)]]
    ring_t = [bm.verts.new((math.cos(a) * r_top, math.sin(a) * r_top, h))
              for a in [2 * math.pi * i / segments for i in range(segments)]]
    if atlas and side:
        u0, v0, u1, v1 = atlas.uv(side)
    for i in range(segments):
        j = (i + 1) % segments
        f = bm.faces.new((ring_b[i], ring_b[j], ring_t[j], ring_t[i]))
        if atlas and side:
            a = (i * side_repeat / segments) % 1.0
            b = a + side_repeat / segments
            if b > 1.0 + 1e-6:
                a, b = 0.0, side_repeat / segments
            ua, ub = u0 + (u1 - u0) * a, u0 + (u1 - u0) * min(b, 1.0)
            for loop, c in zip(f.loops, [(ua, v0), (ub, v0), (ub, v1), (ua, v1)]):
                loop[uvl].uv = c
    if caps:
        for ring, reg, flip in ((ring_t, top, False), (ring_b, bottom or top, True)):
            if (ring is ring_t and r_top <= 0) or (ring is ring_b and r_bottom <= 0):
                continue
            verts = list(reversed(ring)) if flip else ring
            f = bm.faces.new(verts)
            if atlas and reg:
                cu0, cv0, cu1, cv1 = atlas.uv(reg)
                cx, cy = (cu0 + cu1) / 2, (cv0 + cv1) / 2
                rx, ry = (cu1 - cu0) / 2, (cv1 - cv0) / 2
                for loop in f.loops:
                    co = loop.vert.co
                    rr = max(r_top if not flip else r_bottom, 1e-6)
                    loop[uvl].uv = (cx + co.x / rr * rx, cy + co.y / rr * ry)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-6)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    obj = _link(bpy.data.objects.new(name, me))
    if mat:
        me.materials.append(mat)
    obj.location = loc
    obj.rotation_euler = rot
    if parent:
        obj.parent = parent
    return obj


def join(objs, name):
    """Join meshes into one object (keeps materials)."""
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    o = bpy.context.view_layer.objects.active
    o.name = name
    o.data.name = name
    # put the origin at the world origin so exported nodes carry no stray offset
    bpy.context.scene.cursor.location = (0, 0, 0)
    bpy.ops.object.origin_set(type='ORIGIN_CURSOR')
    # the joined object inherits the first part's rotation; bake it into the mesh
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    return o


def apply_transforms(objs):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)


def flat_shade(obj):
    for p in obj.data.polygons:
        p.use_smooth = False


def export_glb(objs, filename):
    path = os.path.join(MODELS_DIR, filename)
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
        for c in o.children_recursive:
            c.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.export_scene.gltf(
        filepath=path, export_format='GLB', use_selection=True, export_apply=True,
        export_yup=True, export_texcoords=True, export_normals=True, export_materials='EXPORT',
        export_image_format='AUTO', export_cameras=False, export_lights=False,
        export_animations=False,
    )
    print('exported', path, os.path.getsize(path), 'bytes')
    return path


def preview_setup():
    """A neutral light rig + EEVEE so the MCP `look` renders show the asset clearly."""
    scn = bpy.context.scene
    for eng in ('BLENDER_EEVEE_NEXT', 'BLENDER_EEVEE'):
        try:
            scn.render.engine = eng
            break
        except Exception:
            pass
    world = scn.world or bpy.data.worlds.new('World')
    scn.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes.get('Background')
    if bg:
        bg.inputs['Color'].default_value = (0.05, 0.05, 0.06, 1)
        bg.inputs['Strength'].default_value = 1.0
    if not bpy.data.objects.get('PreviewSun'):
        ld = bpy.data.lights.new('PreviewSun', 'SUN')
        ld.energy = 3.0
        sun = bpy.data.objects.new('PreviewSun', ld)
        sun.rotation_euler = (math.radians(50), math.radians(10), math.radians(30))
        _link(sun)
    scn.view_settings.view_transform = 'Standard'


MODELS_DIR = None


def set_project(path):
    global MODELS_DIR
    MODELS_DIR = os.path.join(path, 'public', 'models')
    os.makedirs(MODELS_DIR, exist_ok=True)


def lathe(name, profile, segments=12, loc=(0, 0, 0), rot=(0, 0, 0), atlas=None, bands=None,
          cap_top=None, cap_bottom=None, mat=None, parent=None, u_repeat=1):
    """Spin a (radius, z) profile around Z. `bands` gives an atlas region per profile segment
    (or one region for all). Ends with radius > 0 get a flat cap if a cap region is given."""
    bm = bmesh.new()
    uvl = bm.loops.layers.uv.new('UVMap')
    rings = []
    for r, z in profile:
        ring = [bm.verts.new((math.cos(2 * math.pi * i / segments) * r,
                              math.sin(2 * math.pi * i / segments) * r, z)) for i in range(segments)]
        rings.append(ring)
    nb = len(profile) - 1
    if isinstance(bands, str) or bands is None:
        bands = [bands] * nb
    for k in range(nb):
        reg = bands[k]
        for i in range(segments):
            j = (i + 1) % segments
            quad = (rings[k][i], rings[k][j], rings[k + 1][j], rings[k + 1][i])
            if profile[k][0] < 1e-6 and profile[k + 1][0] < 1e-6:
                continue
            try:
                f = bm.faces.new(quad)
            except ValueError:
                continue
            if atlas and reg:
                u0, v0, u1, v1 = atlas.uv(reg)
                a = (i * u_repeat / segments) % 1.0
                b = a + u_repeat / segments
                if b > 1.0 + 1e-6:
                    a, b = 0.0, u_repeat / segments
                ua, ub = u0 + (u1 - u0) * a, u0 + (u1 - u0) * min(b, 1.0)
                for loop, c in zip(f.loops, [(ua, v0), (ub, v0), (ub, v1), (ua, v1)]):
                    loop[uvl].uv = c
    for ring, reg, r, flip in ((rings[-1], cap_top, profile[-1][0], False),
                               (rings[0], cap_bottom, profile[0][0], True)):
        if reg is None or r < 1e-6:
            continue
        f = bm.faces.new(list(reversed(ring)) if flip else ring)
        if atlas:
            cu0, cv0, cu1, cv1 = atlas.uv(reg)
            cx, cy, rx, ry = (cu0 + cu1) / 2, (cv0 + cv1) / 2, (cu1 - cu0) / 2, (cv1 - cv0) / 2
            for loop in f.loops:
                loop[uvl].uv = (cx + loop.vert.co.x / r * rx, cy + loop.vert.co.y / r * ry)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-6)
    bm.normal_update()
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    obj = _link(bpy.data.objects.new(name, me))
    if mat:
        me.materials.append(mat)
    obj.location = loc
    obj.rotation_euler = rot
    if parent:
        obj.parent = parent
    return obj


def boot(project_dir):
    set_project(project_dir)
    clean_scene()
    preview_setup()
