"""Commandlet-only import/reload in the owned TreeMaterialProbe project.
This verifies UE assets and channel settings, not a rendered beauty image.
"""
import json,sys,traceback
from pathlib import Path
import unreal
c=json.loads(Path(sys.argv[1]).read_text(encoding='utf-8-sig'))
project=Path(unreal.Paths.get_project_file_path()).resolve()
assert project==Path(c['project']).resolve() and project.name=='TreeMaterialProbe.uproject'
out={'passed':False,'engine':unreal.SystemLibrary.get_engine_version(),'mode':c['mode'],'visual_render_verified':False,'models':[]}
try:
 for case in c['cases']:
  folder='/Game/TreeMaterialProof/'+case['id']
  if c['mode']=='import':
   if unreal.EditorAssetLibrary.does_directory_exist(folder):unreal.EditorAssetLibrary.delete_directory(folder)
   task=unreal.AssetImportTask();task.filename=case['file'];task.destination_path=folder;task.automated=True;task.save=True;task.replace_existing=False;task.async_=False
   unreal.AssetToolsHelpers.get_asset_tools().import_asset_tasks([task])
  assets=[unreal.EditorAssetLibrary.load_asset(p) for p in unreal.EditorAssetLibrary.list_assets(folder,recursive=True,include_folder=False)]
  meshes=[a for a in assets if isinstance(a,unreal.StaticMesh)];textures=[a for a in assets if isinstance(a,unreal.Texture2D)]
  assert len(meshes)==1,(case['id'],[a.get_path_name() for a in assets if a])
  mesh=meshes[0];triangles=mesh.get_num_triangles(0);nanite=mesh.get_num_nanite_triangles();assert max(triangles,nanite)==case['triangles'],(triangles,nanite,case['triangles'])
  mats=[s.get_editor_property('material_interface') for s in mesh.get_editor_property('static_materials')];assert mats and all(mats)
  detail={'id':case['id'],'mesh':mesh.get_path_name(),'renderFallbackTriangles':triangles,'naniteTriangles':nanite,'sourceTriangles':case['triangles'],'textures':[],'materials':[]}
  for t in textures:
   detail['textures'].append({'path':t.get_path_name(),'srgb':t.get_editor_property('srgb'),'compression':str(t.get_editor_property('compression_settings')),'flipGreen':t.get_editor_property('flip_green_channel')})
  assert len(textures)>=case['maps'],detail
  for mat in mats:
   data={'path':mat.get_path_name(),'class':mat.get_class().get_name(),'textures':{},'scalars':{},'vectors':{}}
   assert isinstance(mat,unreal.MaterialInstanceConstant),data
   lib=unreal.MaterialEditingLibrary
   for n in lib.get_texture_parameter_names(mat):
    t=lib.get_material_instance_texture_parameter_value(mat,n)
    if t:data['textures'][str(n)]={'path':t.get_path_name(),'srgb':t.get_editor_property('srgb')}
   for n in lib.get_scalar_parameter_names(mat):data['scalars'][str(n)]=lib.get_material_instance_scalar_parameter_value(mat,n)
   for n in lib.get_vector_parameter_names(mat):
    v=lib.get_material_instance_vector_parameter_value(mat,n);data['vectors'][str(n)]=[v.r,v.g,v.b,v.a]
   normal=[v for k,v in data['textures'].items() if 'normal' in k.lower()];assert normal and all(not v['srgb'] for v in normal),data
   base=[v for k,v in data['textures'].items() if 'basecolor' in k.lower().replace('_','')];assert base and all(v['srgb'] for v in base),data
   if case.get('emission'):
    em=[v for k,v in data['textures'].items() if 'emiss' in k.lower()];assert em and all(v['srgb'] for v in em),data
    strengths=[v for k,v in data['scalars'].items() if 'emiss' in k.lower()]+[v[i] for k,v in data['vectors'].items() if 'emiss' in k.lower() for i in range(3)]
    assert any(abs(v-case['emission'])<.001 for v in strengths),data
   detail['materials'].append(data)
  out['models'].append(detail)
 unreal.EditorAssetLibrary.save_directory('/Game/TreeMaterialProof',only_if_is_dirty=False,recursive=True)
 out['passed']=True
except Exception:out['error']=traceback.format_exc();unreal.log_error(out['error'])
Path(c['report']).write_text(json.dumps(out,ensure_ascii=False,indent=2),encoding='utf-8')
if not out['passed']:raise RuntimeError(out['error'])
