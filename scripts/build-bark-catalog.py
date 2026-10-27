"""Prepare independent, versioned bark assets; never write into the library."""
from pathlib import Path
import hashlib
import json
import subprocess
import importlib.util
import sys
from PIL import Image

ROOT=Path(__file__).resolve().parents[1]
QA=ROOT/'.runtime/trunk-preset-expansion/bark'
ENTRIES=[
 ('CAM_PHOTO','LIBRARY_CAMPHOR_V1','素材库 · 香樟纵裂','001_香樟_Camphora_officinarum/01_surface_tile_v2.png',.91,.6,.9,1.2,1,1,.4),
 ('PINE_PHOTO','LIBRARY_BLACKPINE_V1','素材库 · 黑松鳞皮','027_黑松_Pinus_thunbergii/01_surface_tile.png',.95,.8,1,1.4,1,1,.5),
 ('BIRCH_PHOTO','LIBRARY_BIRCH_V1','素材库 · 白桦浅皮','050_白桦_Betula_platyphylla/01_surface_tile.png',.84,.35,1,1.25,.45,1,.25),
 ('PLANE_PHOTO','LIBRARY_PLANE_V1','素材库 · 悬铃木斑驳','008_二球悬铃木_Platanus_x_hispanica/01_surface_tile.png',.87,.35,1.2,1.5,.7,2,.3),
]

def main():
 QA.mkdir(parents=True,exist_ok=True)
 sys.dont_write_bytecode=True
 spec=importlib.util.spec_from_file_location('default_bark_builder',ROOT/'scripts/build-default-bark.py')
 builder=importlib.util.module_from_spec(spec);spec.loader.exec_module(builder)
 records=[]
 for key,style,name,relative,rough,normal,u,v,depth,smoothing,variation in ENTRIES:
  source=ROOT/'植物图片素材库'/relative
  image=builder.blend_edges(Image.open(source).convert('RGBA').resize((512,512),Image.Resampling.LANCZOS))
  image.save(QA/(key+'.color.png'));(QA/(key+'.color.rgba')).write_bytes(image.tobytes())
  records.append({'key':key,'style':style,'name':name,'size':512,'source':str(source.relative_to(ROOT)).replace('\\','/'),'source_sha256':hashlib.sha256(source.read_bytes()).hexdigest(),'generation':{'depth':depth,'smoothing':smoothing,'variation':variation},'preset':{'id':'builtin-library-'+style.removeprefix('LIBRARY_').lower().replace('_','-'),'name':name,'style':style,'color':'#ffffff','roughness':rough,'normal_strength':normal,'scale_u_m':u,'scale_v_m':v}})
 (QA/'inputs.json').write_text(json.dumps(records,ensure_ascii=False),encoding='utf-8')
 subprocess.run([str(ROOT/'runtime/node.exe'),str(ROOT/'scripts/build-bark-catalog.mjs')],cwd=ROOT,check=True)
 for record in records:
  for slot in ['normal','roughness']:
   Image.frombytes('RGBA',(512,512),(QA/(record['key']+'.'+slot+'.rgba')).read_bytes()).save(QA/(record['key']+'.'+slot+'.png'))

if __name__=='__main__':
 main()
