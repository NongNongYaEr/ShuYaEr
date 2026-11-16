import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createSceneOverlayEditor} from '../material/web/scene-overlay-ui.js';
import {MAX_SCENE_PATH_POINTS,sceneOverlayDefaults} from '../material/web/scene-overlay-rules.js';

const sourceId='a'.repeat(64);
const anchor=(u,v)=>({face:0,bary:[1-u-v,u,v]});
const event=key=>({key});
function fixture(style){
 const document={id:'tree',resources:{source:sourceId},actualHeightMeters:1};
 const effect={id:'effect',maskRef:'mask'};
 const scene={version:1,style,role:'main',instance:'scene',params:sceneOverlayDefaults(style),points:[],source:null};
 const rule={type:'scene-overlay',scene};
 document.surface={effects:[effect],masks:[{id:effect.maskRef,items:[rule]}]};
 const source={pos:Float32Array.of(0,0,0,1,0,0,0,1,0),indices:Uint32Array.of(0,1,2),height:1,min:[0,0,0]};
 const renderer={tool:'orbit',lastPointer:{clientX:0},canvas:{focus(){}},setDecalPointOverlay(){},pick:()=>anchor(.2,.4)};
 const errors=[],commits=[];
 const editor=createSceneOverlayEditor({active:()=>true,busy:()=>false,document:()=>document,source:()=>source,renderer:()=>renderer,
  selected:()=>scene,locked:()=>!!effect.locked,changed(){},prepare:path=>{renderer.tool=path?'mask':'orbit';},
  notify:message=>errors.push(message),update:(instance,change)=>{assert.equal(instance,scene.instance);change(scene);commits.push(structuredClone(scene));},
 });
 return {editor,document,scene,renderer,commits,errors,effect};
}

test('路径按住再松开只提交一个源表面编辑，Esc 可取消重绘',()=>{
 const {editor,scene,commits,renderer}=fixture('strap');
 assert(editor.start('scene'));
 assert.equal(renderer.tool,'mask');
 assert(editor.paintStart());
 for(let i=0;i<320;i++)editor.paint(i%2?anchor(.8,.1):anchor(.1,.8));
 assert.equal(commits.length,0);
 assert(editor.paintEnd());
 assert.equal(commits.length,1);
 assert(scene.points.length>1&&scene.points.length<=MAX_SCENE_PATH_POINTS);
 assert.equal(scene.source,sourceId);
 assert.equal(renderer.tool,'orbit');
 const prior=structuredClone(scene.points);
 assert(editor.start('scene'));
 editor.paintStart();
 editor.paint(anchor(.3,.1));
 assert(editor.key(event('Escape'),true));
 assert.deepEqual(scene.points,prior);
 assert.equal(commits.length,1);
});

test('两点工具在第二个命中才提交，换源未保存的点位会取消',()=>{
 const {editor,scene,document,commits,errors}=fixture('tool-teeth');
 assert(editor.start('scene'));
 const start=anchor(.1,.3);
 assert(editor.pick(start));
 assert(editor.pick(start));
 assert.equal(errors.length,1);
 assert.equal(commits.length,0);
 assert(editor.pick(anchor(.4,.4)));
 assert.equal(commits.length,1);
 assert.equal(scene.points.length,2);
 assert(editor.start('scene'));
 editor.pick(start);
 document.resources.source='b'.repeat(64);
 editor.refresh();
 assert.equal(editor.pick(anchor(.4,.4)),false);
 assert.equal(commits.length,1);
});

test('编号 G 移动、R 旋转、S 等比缩放，定位和参数可分别撤销',()=>{
 const {editor,scene,commits,effect}=fixture('spray');
 assert(editor.start('scene'));
 editor.pick(anchor(.1,.2));
 assert(editor.key(event('g'),true));
 editor.pick(anchor(.3,.35));
 assert.deepEqual(scene.points,[anchor(.3,.35)]);
 assert(editor.key(event('r'),true));
 editor.pointerMotion({clientX:80,buttons:0});
 assert.equal(commits.length,2);
 assert(editor.key(event('Enter'),true));
 assert.equal(scene.params.rotation,36);
 const {width,height}=scene.params;
 assert(editor.key(event('s'),true));
 editor.pointerMotion({clientX:60,buttons:0});
 assert(editor.key(event('Enter'),true));
 assert(scene.params.width>width);
 assert(Math.abs(scene.params.width/scene.params.height-width/height)<1e-12);
 assert.equal(commits.length,4);
 effect.locked=true;
 assert.equal(editor.key(event('g'),true),false);
});
