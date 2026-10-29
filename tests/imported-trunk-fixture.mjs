import * as T from '../web/vendor/three.module.min.js';
import {GLTFExporter} from '../web/vendor/GLTFExporter.js';
export async function importedTrunkFixture(){
 if(!globalThis.FileReader)globalThis.FileReader=class{async readAsArrayBuffer(blob){this.result=await blob.arrayBuffer();this.onloadend?.();}async readAsDataURL(blob){this.result='data:'+blob.type+';base64,'+Buffer.from(await blob.arrayBuffer()).toString('base64');this.onloadend?.();}};
 const root=new T.Group(),outer=new T.Group();outer.position.set(.2,.3,-.1);outer.rotation.set(.12,.24,-.18);root.add(outer);
 const bark=new T.MeshStandardMaterial({color:0x916244,roughness:.84}),moss=new T.MeshStandardMaterial({color:0x456b33,roughness:.65});bark.name='原树皮';moss.name='苔藓';
 const trunk=new T.Mesh(new T.CylinderGeometry(.32,.65,5,18,5,false),bark);trunk.position.y=2.5;trunk.name='雕刻主干';outer.add(trunk);
 const fork=new T.Mesh(new T.CylinderGeometry(.1,.3,2.6,12,4,false),bark);fork.position.set(.7,4,0);fork.rotation.z=-.64;fork.scale.x=-1;fork.name='镜像分叉';outer.add(fork);
 const hole=new T.Mesh(new T.TorusGeometry(.65,.2,10,24),moss);hole.position.set(0,1.5,-.42);hole.name='树洞边缘';outer.add(hole);
 const result=await new GLTFExporter().parseAsync(root,{binary:true});root.traverse(o=>o.geometry?.dispose());bark.dispose();moss.dispose();return new Uint8Array(result);
}
export function unpackFixture(bytes){const b=Buffer.from(bytes);return {json:JSON.parse(b.toString('utf8',20,20+b.readUInt32LE(12)).trim()),bin:b.subarray(28+b.readUInt32LE(12))};}
export function repackFixture({json,bin}){const text=Buffer.from(JSON.stringify(json)),jsonBytes=Buffer.alloc(Math.ceil(text.length/4)*4,32),data=Buffer.alloc(Math.ceil(bin.length/4)*4);text.copy(jsonBytes);Buffer.from(bin).copy(data);const header=Buffer.alloc(20);header.writeUInt32LE(0x46546c67,0);header.writeUInt32LE(2,4);header.writeUInt32LE(28+jsonBytes.length+data.length,8);header.writeUInt32LE(jsonBytes.length,12);header.writeUInt32LE(0x4e4f534a,16);const bh=Buffer.alloc(8);bh.writeUInt32LE(data.length,0);bh.writeUInt32LE(0x004e4942,4);return Buffer.concat([header,jsonBytes,bh,data]);}
