"""Independently inspect embedded final GLB maps from an owned native report."""
import hashlib,io,json,sys
from pathlib import Path
from PIL import Image
import numpy as np
report_path=Path(sys.argv[1]).resolve();r=json.loads(report_path.read_text(encoding='utf-8-sig'))
assert r['passed'];cases=r.get('models') or [r];records=[]
for case in cases:
 folder=Path(case['output']['folder']);size=case['output'].get('resolution',2048);assert size in [1024,2048,4096];glb=next(folder.glob('*Material.glb'));b=glb.read_bytes();n=int.from_bytes(b[12:16],'little');j=json.loads(b[20:20+n]);start=28+n
 manifest=json.loads((folder/'material_manifest.json').read_text(encoding='utf-8-sig'));decoded={};images=[]
 for im in j['images']:
  v=j['bufferViews'][im['bufferView']];blob=b[start+v.get('byteOffset',0):start+v.get('byteOffset',0)+v['byteLength']];a=np.asarray(Image.open(io.BytesIO(blob)).convert('RGB'));assert a.shape==(size,size,3)
  decoded[im['name']]=a;sha=hashlib.sha256(blob).hexdigest();images.append({'name':im['name'],'sha256':sha,'width':size,'height':size,'levels':[len(np.unique(a[:,:,k])) for k in range(3)]})
  key={'baseColor':'baseColor','normal':'normal','orm':'metallicRoughness','emissive':'emissive'}[im['name']];assert manifest['maps'][key]['sha256']==sha
 assert len(decoded) in [3,4];normal=decoded['normal'];orm=decoded['orm'];mask=np.max(decoded['baseColor'],axis=2)>0;assert mask.sum()>100 and normal[mask,2].min()>=126 and orm[:,:,2].max()==0
 assert np.ptp(normal[mask,0])>1 or np.ptp(normal[mask,1])>1
 m=j['materials'][0];assert m['pbrMetallicRoughness']['metallicRoughnessTexture']['index']==2 and m['normalTexture']['index']==1
 if 'emissive' in decoded:assert np.max(decoded['emissive'])>0 and m['emissiveTexture']['index']==3 and m['extensions']['KHR_materials_emissive_strength']['emissiveStrength']==case['emissionStrength']
 primitive=j['meshes'][0]['primitives'][0];triangles=j['accessors'][primitive['indices']]['count']//3
 if 'triangles' in case:assert triangles==case['triangles']
 records.append({'name':case.get('name','emission'),'triangles':triangles,'glbSHA256':hashlib.sha256(b).hexdigest(),'images':images,'visibleTexels':int(mask.sum()),'metadataAndEmbeddedImagesMatch':True,'normalGLBlueMin':int(normal[mask,2].min()),'metallicMax':int(orm[:,:,2].max())})
out={'passed':True,'report':str(report_path),'backend':r['backend'],'samplerIsolation':r.get('samplerIsolation',False),'workerCompressionValidated':bool(r.get('emissionStrength')),'models':records,'visualRenderInUEVerified':False}
target=report_path.with_name('embedded-map-audit.json');target.write_text(json.dumps(out,ensure_ascii=False,indent=2),encoding='utf-8');print(json.dumps({'passed':True,'models':len(records),'report':str(target)}))
