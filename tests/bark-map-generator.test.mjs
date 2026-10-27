import test from 'node:test';
import assert from 'node:assert/strict';
import {unzlibSync} from 'fflate';
import {generateBarkCompanionMaps} from '../web/bark-map-generator.js';
import {normalizeBarkMaterial,normalizeBarkPreset,barkBytesToBase64,generateBarkTextureMaps,createBarkSurfaceMaterial,barkTextureFiles} from '../web/bark-materials.js';

function image(width=128,height=64,fn=(x,y)=>128+70*Math.sin(x/width*Math.PI*12)+25*Math.sin(y/height*Math.PI*6)){
 const data=new Uint8Array(width*height*4);for(let y=0;y<height;y++)for(let x=0;x<width;x++){const at=(y*width+x)*4,value=Math.max(0,Math.min(255,Math.round(fn(x,y))));data[at]=data[at+1]=data[at+2]=value;data[at+3]=255;}return{width,height,data};
}
const pngPixels=bytes=>{const b=Buffer.from(bytes),width=b.readUInt32BE(16),height=b.readUInt32BE(20),idat=[];for(let p=8;p<b.length;){const n=b.readUInt32BE(p);if(b.toString('ascii',p+4,p+8)==='IDAT')idat.push(b.subarray(p+8,p+8+n));p+=n+12;}const rows=unzlibSync(Buffer.concat(idat)),pixels=new Uint8Array(width*height*4);for(let y=0;y<height;y++){assert.equal(rows[y*(width*4+1)],0);pixels.set(rows.subarray(y*(width*4+1)+1,(y+1)*(width*4+1)),y*width*4);}return pixels;};

test('flat and transparent colours produce neutral normals without invented noise or damage to source pixels',()=>{
 for(const color of [image(32,24,()=>145),image(1,1,()=>0)]){
  const copy=color.data.slice(),maps=generateBarkCompanionMaps(color);
  for(let i=0;i<color.data.length;i+=4){assert.deepEqual([...maps.normal.data.slice(i,i+4)],[128,128,255,255]);assert.deepEqual([...maps.roughness.data.slice(i,i+4)],[224,224,224,255]);}assert.deepEqual(color.data,copy);
 }
 const transparent=image();for(let i=3;i<transparent.data.length;i+=4)transparent.data[i]=0;
 const maps=generateBarkCompanionMaps(transparent);for(let i=0;i<maps.normal.data.length;i+=4)assert.deepEqual([...maps.normal.data.slice(i,i+4)],[128,128,255,255]);
 assert.throws(()=>generateBarkCompanionMaps({width:2048,height:1,data:new Uint8Array(8192)}),/像素无效/);
});

test('real colour detail makes normalized OpenGL tangent normals and aligned roughness; inversion changes only relief polarity',()=>{
 const color=image(),maps=generateBarkCompanionMaps(color),inverse=generateBarkCompanionMaps(color,{invert:true});
 assert.deepEqual(maps,generateBarkCompanionMaps(color));assert.ok(new Set(maps.normal.data).size>40);assert.ok(new Set(maps.roughness.data).size>12);
 for(let i=0;i<color.data.length;i+=4){const n=maps.normal.data.subarray(i,i+3),length=Math.hypot(...n.map(v=>v));const x=n[0]/255*2-1,y=n[1]/255*2-1,z=n[2]/255*2-1;assert.ok(Math.abs(Math.hypot(x,y,z)-1)<.012);assert.ok(z>0&&length>0);assert.ok(Math.abs(n[0]+inverse.normal.data[i]-255)<=1);assert.ok(Math.abs(n[1]+inverse.normal.data[i+1]-255)<=1);assert.equal(n[2],inverse.normal.data[i+2]);assert.equal(maps.roughness.data[i],maps.roughness.data[i+1]);assert.equal(maps.roughness.data[i],maps.roughness.data[i+2]);}
 // Brightening along +U / +V tilts the outward normal against that slope.
 assert.ok(maps.normal.data[0]<128);assert.ok(maps.normal.data[1]<128);
});

test('depth, smoothing and roughness variation control the estimated detail without changing dimensions',()=>{
 const color=image(256,96,(x,y)=>128+55*Math.sin(x*Math.PI/2)+30*Math.cos(y*Math.PI/2)),raw=generateBarkCompanionMaps(color,{smoothing:0}),smooth=generateBarkCompanionMaps(color,{smoothing:5}),flat=generateBarkCompanionMaps(color,{depth:0,variation:0});
 const energy=map=>{let sum=0;for(let i=0;i<map.data.length;i+=4)sum+=Math.abs(map.data[i]-128)+Math.abs(map.data[i+1]-128);return sum;};assert.ok(energy(smooth.normal)<energy(raw.normal)*.25);
 for(const m of Object.values(raw)){assert.equal(m.width,256);assert.equal(m.height,96);}
 for(let i=0;i<flat.normal.data.length;i+=4){assert.deepEqual([...flat.normal.data.slice(i,i+4)],[128,128,255,255]);assert.equal(flat.roughness.data[i],224);}
});

test('periodic sampling has no special border stripe and stable slopes across resolutions',()=>{
 const a=generateBarkCompanionMaps(image(128,128),{smoothing:0}),b=generateBarkCompanionMaps(image(256,256),{smoothing:0});
 let error=0;for(let y=0;y<128;y+=4)for(let x=0;x<128;x+=4)for(let c=0;c<3;c++)error+=Math.abs(a.normal.data[(y*128+x)*4+c]-b.normal.data[((y*2)*256+x*2)*4+c]);
 assert.ok(error/(32*32*3)<5);assert.ok(Math.abs(a.normal.data[0]-a.normal.data[(127*128)*4])<12);
});

test('generated maps share texture pixels across carriers while recipe records and UV transforms stay independent',()=>{
 const color=image(256,256),paired=generateBarkCompanionMaps(color),maps=Object.fromEntries(Object.entries({color,...paired}).map(([slot,m])=>[slot,{width:m.width,height:m.height,pixels:barkBytesToBase64(m.data)}])),recipe={style:'IMPORTED',color:'#ffffff',maps};
 const materials=Array.from({length:12},(_,i)=>createBarkSurfaceMaterial(recipe,{branch:{startRadius:.2+i*.1},continuousBark:true}));
 try{for(const slot of ['map','normalMap','roughnessMap']){assert.equal(new Set(materials.map(m=>m[slot].source)).size,1);assert.equal(new Set(materials.map(m=>m[slot])).size,12);}assert.notEqual(materials[0].map.repeat.x,materials.at(-1).map.repeat.x);materials[0].userData.bark_material.maps.normal.name='temporary';assert.equal(materials[1].userData.bark_material.maps.normal.name,'');assert.equal(recipe.maps.normal.name,undefined);}
 finally{for(const material of materials){for(const slot of ['map','normalMap','roughnessMap'])material[slot].dispose();material.dispose();}}
});

test('generated maps survive existing recipe and preset roundtrips, PBR preview and exact three-channel PNG export',()=>{
 const color=image(128,64),paired=generateBarkCompanionMaps(color),maps=Object.fromEntries(Object.entries({color,...paired}).map(([slot,m])=>[slot,{width:m.width,height:m.height,pixels:barkBytesToBase64(m.data),name:'生成 · '+slot}])),recipe=normalizeBarkMaterial({style:'IMPORTED',color:'#ffffff',maps}),saved=normalizeBarkPreset({id:'bark-'+'a'.repeat(32),name:'生成配套',recipe}),reload=normalizeBarkPreset(JSON.parse(JSON.stringify(saved)));
 assert.deepEqual(reload,saved);const decoded=generateBarkTextureMaps(reload.recipe),material=createBarkSurfaceMaterial(reload.recipe),files=barkTextureFiles(reload.recipe);
 try{for(const [slot,expected]of Object.entries({color,...paired})){assert.deepEqual(decoded[slot].data,expected.data);const file=files.find(f=>f.key===slot);assert.equal(file.width,128);assert.equal(file.height,64);assert.deepEqual(pngPixels(file.bytes),expected.data);}assert.deepEqual(material.normalMap.image.data,paired.normal.data);assert.deepEqual(material.roughnessMap.image.data,paired.roughness.data);assert.equal(material.normalMap.colorSpace,'');assert.equal(material.roughnessMap.colorSpace,'');}
 finally{for(const slot of ['map','normalMap','roughnessMap'])material[slot].dispose();material.dispose();}
});

test('material recipe reuse notices scalar and image edits on the same mutable recipe object',()=>{
 const color=image(32,32),map={width:32,height:32,pixels:barkBytesToBase64(color.data),name:'first'},raw={style:'IMPORTED',color:'#ffffff',maps:{color:map}},a=createBarkSurfaceMaterial(raw);raw.normal_strength=2;raw.maps.color.name='second';const b=createBarkSurfaceMaterial(raw);const changed=color.data.slice();changed[0]^=255;raw.maps.color.pixels=barkBytesToBase64(changed);const c=createBarkSurfaceMaterial(raw);
 try{assert.equal(a.normalScale.x,.65);assert.equal(b.normalScale.x,2);assert.equal(a.userData.bark_material.maps.color.name,'first');assert.equal(b.userData.bark_material.maps.color.name,'second');assert.notEqual(a.userData.bark_key,b.userData.bark_key);assert.notEqual(b.userData.bark_key,c.userData.bark_key);assert.deepEqual(c.map.image.data,changed);assert.notEqual(a.map.source,c.map.source);}
 finally{for(const material of [a,b,c]){for(const slot of ['map','normalMap','roughnessMap'])material[slot].dispose();material.dispose();}}
});
