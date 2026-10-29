"""Background-only import, skin motion and saved .blend reload acceptance."""
import bpy,sys,json,struct,pathlib,math,traceback
from mathutils import Vector
from mathutils.kdtree import KDTree
args=sys.argv[sys.argv.index('--')+1:]
source=pathlib.Path(args[0]);out=pathlib.Path(args[1]);mode=args[2] if len(args)>2 else 'import'
report={'passed':False,'blender':bpy.app.version_string,'mode':mode}
try:
    data=source.read_bytes();length=struct.unpack_from('<I',data,12)[0];gltf=json.loads(data[20:20+length]);binary=20+length+8
    def accessor(i):
        a=gltf['accessors'][i];v=gltf['bufferViews'][a['bufferView']];sizes={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16};formats={5121:'B',5123:'H',5125:'I',5126:'f'}
        fmt='<'+formats[a['componentType']]*sizes[a['type']];stride=v.get('byteStride',struct.calcsize(fmt));start=binary+v.get('byteOffset',0)+a.get('byteOffset',0)
        return [struct.unpack_from(fmt,data,start+n*stride) for n in range(a['count'])]
    if mode=='reload':bpy.ops.wm.open_mainfile(filepath=str(out/'skeletal-verified.blend'))
    else:
        bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
        bpy.ops.import_scene.gltf(filepath=str(source),import_pack_images=True)
    rigs=[o for o in bpy.data.objects if o.type=='ARMATURE'];assert len(rigs)==1
    rig=rigs[0];meshes=[o for o in bpy.data.objects if o.type=='MESH' and any(m.type=='ARMATURE' and m.object==rig for m in o.modifiers)];assert meshes
    bones=rig.data.bones;assert len(bones)==len(gltf['skins'][0]['joints']);assert 'Tree_Root' in bones
    units=[b.name for b in bones if b.name.startswith('Unit_')];assert len(units)==gltf['scenes'][0]['extras']['rigging']['complete_units']
    def vertices():
        result=[];dg=bpy.context.evaluated_depsgraph_get()
        for obj in meshes:
            evaluated=obj.evaluated_get(dg);geo=evaluated.to_mesh();result.extend([evaluated.matrix_world@v.co for v in geo.vertices]);evaluated.to_mesh_clear()
        return result
    # glTF Y-up metres -> Blender Z-up metres; only indexed, rendered vertices count.
    expected=[]
    for m in gltf['meshes']:
        positions=None;seen=set()
        for primitive in m['primitives']:
            if positions is None:positions=accessor(primitive['attributes']['POSITION'])
            for i in accessor(primitive['indices']):seen.add(i[0])
        expected.extend([Vector((positions[i][0],-positions[i][2],positions[i][1])) for i in seen])
    initial=vertices();tree=KDTree(len(expected))
    for i,p in enumerate(expected):tree.insert(p,i)
    tree.balance();worst=max(initial,key=lambda p:tree.find(p)[2]);pose_error=tree.find(worst)[2]
    bounds=lambda vs:[[min(p[k] for p in vs) for k in range(3)],[max(p[k] for p in vs) for k in range(3)]]
    report.update({'actual_bounds':bounds(initial),'expected_bounds':bounds(expected),'worst_vertex':list(worst),'nearest':list(tree.find(worst)[0]),'objects':[{'name':o.name,'matrix':[list(r) for r in o.matrix_world],'vertices':len(o.data.vertices)} for o in meshes]})
    assert pose_error<3e-5, 'bind pose error '+str(pose_error)
    # Also check the other direction so a missing branch cannot pass.
    actual_tree=KDTree(len(initial))
    for i,p in enumerate(initial):actual_tree.insert(p,i)
    actual_tree.balance();missing_error=max(actual_tree.find(p)[2] for p in expected);assert missing_error<3e-5
    weight_error=0;rigid_groups=0
    for obj in meshes:
        assert any(m.type=='ARMATURE' and m.object==rig for m in obj.modifiers)
        groups={g.index:g.name for g in obj.vertex_groups}
        for v in obj.data.vertices:
            weights=[g for g in v.groups if g.weight>1e-7];weight_error=max(weight_error,abs(sum(g.weight for g in weights)-1))
            if any(groups[g.group].startswith('Unit_') for g in weights):
                assert len(weights)==1 and abs(weights[0].weight-1)<1e-6
                rigid_groups+=1
    assert weight_error<2e-6 and rigid_groups>0
    sample_name=units[len(units)//2];sample=rig.pose.bones[sample_name];sample.rotation_mode='XYZ';sample.rotation_euler.x=.35;bpy.context.view_layer.update();moved=vertices();motion=max((a-b).length for a,b in zip(initial,moved));assert motion>.0001
    # Pairwise distances in an entire unit remain rigid under its bone rotation.
    offset=0;ids=[]
    for obj in meshes:
        group=obj.vertex_groups.get(sample_name)
        if group:
            ids.extend(offset+v.index for v in obj.data.vertices if any(g.group==group.index and g.weight>.999999 for g in v.groups))
        offset+=len(obj.data.vertices)
    assert len(ids)>10
    rigid_error=max(abs((initial[ids[0]]-initial[i]).length-(moved[ids[0]]-moved[i]).length) for i in ids[::max(1,len(ids)//50)]);assert rigid_error<2e-5
    sample.rotation_euler=(0,0,0);bpy.context.view_layer.update()
    carrier=next(b for b in rig.pose.bones if b.name.startswith('Guide_') and b.children);carrier.rotation_mode='XYZ';carrier.rotation_euler.z=.2;bpy.context.view_layer.update();bent=vertices();carrier_motion=max((a-b).length for a,b in zip(initial,bent));assert carrier_motion>.001
    carrier.rotation_euler=(0,0,0);bpy.context.view_layer.update();restored=vertices();restore_error=max((a-b).length for a,b in zip(initial,restored));assert restore_error<2e-5
    images=[i for i in bpy.data.images if i.type=='IMAGE' and i.size[0]>0 and i.name not in ('Render Result','Viewer Node')];assert len(images)>1 and all(i.packed_file for i in images)
    mats={s.material for o in meshes for s in o.material_slots if s.material};assert len(mats)>1
    assert not gltf.get('animations')
    if mode!='reload':bpy.ops.wm.save_as_mainfile(filepath=str(out/'skeletal-verified.blend'))
    report.update({'passed':True,'bones':len(bones),'unit_bones':len(units),'vertices':len(initial),'rendered_source_vertices':len(expected),'materials':len(mats),'packed_images':len(images),'bind_pose_error':pose_error,'missing_geometry_error':missing_error,'weight_sum_error':weight_error,'rigid_unit_vertices':rigid_groups,'unit_motion':motion,'unit_rigid_error':rigid_error,'carrier_motion':carrier_motion,'restore_error':restore_error,'no_animation':True})
except Exception as e:report.update({'error':str(e),'traceback':traceback.format_exc()})
finally:
    (out/('blender-'+mode+'-report.json')).write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
    print('BLENDER_SKINNED_GLB '+json.dumps(report,ensure_ascii=False))
    if not report['passed']:sys.exit(1)
