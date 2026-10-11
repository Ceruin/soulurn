# Renders a game model (.glb from deadlock.wiki) to a square transparent sprite for the page.
# Usage: blender --background --python tools/render-sprite.py -- <model.glb> <out.png> [key=value ...]
#   view=front|side     camera looks along +Y (front) or -X (side); default front
#   mesh=<text>         keep only meshes whose name contains this text
#   material=<name>     keep only the faces that use this material
#   size=<pixels>       sprite edge length; default 256
import math
import sys

import bmesh
import bpy
from mathutils import Vector

MARGIN = 1.06

arguments = sys.argv[sys.argv.index("--") + 1:]
source_path, output_path = arguments[:2]
options = dict(argument.split("=", 1) for argument in arguments[2:])
view = options.get("view", "front")
sprite_size = int(options.get("size", 256))

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=source_path)
scene = bpy.context.scene

# Some files carry an unshaded helper sphere far larger than the model; those have no material.
meshes = []
for obj in scene.objects:
    if obj.type != "MESH":
        continue
    if not obj.material_slots or ("mesh" in options and options["mesh"] not in obj.name):
        obj.hide_render = True
        continue
    meshes.append(obj)

if "material" in options:
    for obj in meshes:
        wanted = [index for index, slot in enumerate(obj.material_slots) if slot.material.name == options["material"]]
        mesh = bmesh.new()
        mesh.from_mesh(obj.data)
        bmesh.ops.delete(mesh, geom=[face for face in mesh.faces if face.material_index not in wanted], context="FACES")
        mesh.to_mesh(obj.data)
        mesh.free()
    meshes = [obj for obj in meshes if obj.data.polygons]

points = [obj.matrix_world @ vertex.co for obj in meshes for vertex in obj.data.vertices]
low = Vector([min(point[axis] for point in points) for axis in range(3)])
high = Vector([max(point[axis] for point in points) for axis in range(3)])
center = (low + high) / 2
extent = high - low
across = extent.x if view == "front" else extent.y
distance = max(extent) * 4

camera_data = bpy.data.cameras.new("camera")
camera_data.type = "ORTHO"
camera_data.ortho_scale = max(across, extent.z) * MARGIN
camera_data.clip_end = distance * 3
camera = bpy.data.objects.new("camera", camera_data)
scene.collection.objects.link(camera)
if view == "front":
    camera.location = center + Vector((0, -distance, 0))
    camera.rotation_euler = (math.pi / 2, 0, 0)
else:
    camera.location = center + Vector((distance, 0, 0))
    camera.rotation_euler = (math.pi / 2, 0, math.pi / 2)
scene.camera = camera

# The key light rides with the camera (upper left of the view); two weaker suns fill the far sides.
for name, energy, tilt, turn in (("key", 4.0, 55, -35), ("fill", 1.5, 110, 140), ("rim", 1.5, 60, 200)):
    light = bpy.data.objects.new(name, bpy.data.lights.new(name, "SUN"))
    light.data.energy = energy
    light.rotation_euler = (math.radians(tilt), 0, math.radians(turn) + camera.rotation_euler[2])
    scene.collection.objects.link(light)

world = bpy.data.worlds.new("world")
world.use_nodes = True
world.node_tree.nodes["Background"].inputs[0].default_value = (0.3, 0.32, 0.32, 1)
scene.world = world

engines = [item.identifier for item in bpy.types.RenderSettings.bl_rna.properties["engine"].enum_items]
scene.render.engine = "BLENDER_EEVEE_NEXT" if "BLENDER_EEVEE_NEXT" in engines else "BLENDER_EEVEE"
scene.render.film_transparent = True
scene.render.resolution_x = sprite_size
scene.render.resolution_y = sprite_size
scene.render.image_settings.file_format = "PNG"
scene.render.image_settings.color_mode = "RGBA"
scene.render.filepath = output_path
bpy.ops.render.render(write_still=True)

triangles = sum(len(polygon.vertices) - 2 for obj in meshes for polygon in obj.data.polygons)
print("SPRITE_RENDER %s tris=%d extent=(%.2f, %.2f, %.2f)" % (output_path.split("\\")[-1], triangles, extent.x, extent.y, extent.z))
