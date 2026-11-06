"""Run only with blender --background --factory-startup --python ... -- config.
Own output directory only. Import/PBR checks and optional CPU Cycles stills;
reload mode verifies independently saved .blend files in a second process.
"""
import bpy,json,sys,traceback,re
from pathlib import Path
from mathutils import Vector
c=json.loads(Path(sys.argv[sys.argv.index('--')+1]).read_text(encoding='utf-8-sig'))
report_key=c.get('reportKey',c['mode']);assert re.fullmatch('[a-z0-9-]{1,40}',report_key)
root=Path(c['root']).resolve();assert root.name=='material-blender-test' and root.parent.name=='.runtime';root.mkdir(exist_ok=True)
result={'passed':False,'version':bpy.app.version_string,'mode':c['mode'],'models':[],'visualRendered':bool(c.get('render'))}
def check_case(case):
 meshes=[o for o in bpy.context.scene.objects if o.type=='MESH'];assert meshes
 faces=sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in meshes);assert faces==case['triangles'],(faces,case['triangles'])
 materials={m for o in meshes for m in o.data.materials if m};assert materials
 info={'id':case['id'],'triangles':faces,'materials':[],'blend':str(root/(case['id']+'.blend'))}
 for mat in materials:
  assert mat.use_nodes;nodes=mat.node_tree.nodes;shader=next(n for n in nodes if n.type=='BSDF_PRINCIPLED');textures=[n for n in nodes if n.type=='TEX_IMAGE' and n.image]
  assert len({n.image for n in textures})>=case['maps'];assert shader.inputs['Normal'].is_linked
  images=[{'name':n.image.name,'width':n.image.size[0],'height':n.image.size[1],'colorSpace':n.image.colorspace_settings.name,'packed':bool(n.image.packed_file)} for n in textures]
  assert all(i['width']==case.get('resolution',2048) and i['height']==case.get('resolution',2048) for i in images)
  assert any(i['colorSpace']=='sRGB' for i in images) and any(i['colorSpace'] in ['Non-Color','Non-Colour'] for i in images)
  if case.get('emission'):
   strength=shader.inputs.get('Emission Strength');color=shader.inputs.get('Emission Color') or shader.inputs.get('Emission')
   assert strength and color and color.is_linked and abs(strength.default_value-case['emission'])<.001
  info['materials'].append({'name':mat.name,'images':images,'normalLinked':True,'roughnessLinked':shader.inputs['Roughness'].is_linked,'emissionStrength':shader.inputs.get('Emission Strength').default_value})
 assert all(o.data.uv_layers.active for o in meshes)
 return info,meshes
try:
 for case in c['cases']:
  target=root/(case['id']+'.blend')
  if c['mode']=='reload':bpy.ops.wm.open_mainfile(filepath=str(target))
  else:
   bpy.ops.wm.read_factory_settings(use_empty=True);bpy.ops.import_scene.gltf(filepath=case['file'])
   for image in bpy.data.images:
    if image.type=='IMAGE' and image.has_data:image.pack()
  info,meshes=check_case(case)
  if c['mode']=='import':
   scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=16;scene.render.resolution_x=640;scene.render.resolution_y=768;scene.render.resolution_percentage=100;scene.render.image_settings.file_format='PNG';scene.render.film_transparent=True
   world=bpy.data.worlds.new('ProofNeutralWorld');world.use_nodes=True;world.node_tree.nodes['Background'].inputs['Color'].default_value=(.18,.18,.18,1);world.node_tree.nodes['Background'].inputs['Strength'].default_value=.5;scene.world=world
   sun=bpy.data.lights.new('ProofSun','SUN');sun.energy=2;sun.angle=.15;light=bpy.data.objects.new('ProofSun',sun);scene.collection.objects.link(light);light.rotation_euler=(.5,-.3,-.4)
   cam=bpy.data.objects.new('ProofCamera',bpy.data.cameras.new('ProofCamera'));scene.collection.objects.link(cam);scene.camera=cam;cam.data.type='ORTHO'
   corners=[o.matrix_world@Vector(v) for o in meshes for v in o.bound_box];lo=Vector(tuple(min(v[k] for v in corners) for k in range(3)));hi=Vector(tuple(max(v[k] for v in corners) for k in range(3)));center=(lo+hi)*.5
   assert abs((hi-lo).z-10)<.01,(lo[:],hi[:])
   for label,focus,scale in [('whole',center,13),('near',Vector((center.x,center.y,lo.z+2)),5)]:
    cam.location=focus+Vector((9,-16,5));cam.rotation_euler=(focus-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.ortho_scale=scale
    if c.get('render'):scene.render.filepath=str(root/(case['id']+'-'+label+'.png'));bpy.ops.render.render(write_still=True)
   bpy.ops.wm.save_as_mainfile(filepath=str(target))
  result['models'].append(info)
 result['passed']=True
except Exception:result['error']=traceback.format_exc()
(root/(report_key+'-report.json')).write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
if not result['passed']:raise RuntimeError(result['error'])
