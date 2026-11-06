import {test} from 'node:test';import assert from 'node:assert/strict';
import {readComponentView,applyComponentView} from '../material/web/component-view.js';
const close=(a,b)=>assert(Math.abs(a-b)<1e-9,`${a} != ${b}`);
test('树干Z向上视角转到材质Y向上，观察点和屏幕尺度一致',()=>{
 const renderer={model:{min:[-3,0,-2],height:10}},view={eye:[7,14,12],target:[1,2,5],fov:36};
 assert(applyComponentView(renderer,view));const restored=readComponentView(renderer);
 restored.target.forEach((n,i)=>close(n,view.target[i]));
 const oldDistance=Math.hypot(...view.eye.map((n,i)=>n-view.target[i])),newDistance=Math.hypot(...restored.eye.map((n,i)=>n-restored.target[i]));
 close(oldDistance*Math.tan(18*Math.PI/180),newDistance*Math.tan(20*Math.PI/180));
 restored.eye.forEach((n,i)=>close((n-restored.target[i])/newDistance,(view.eye[i]-view.target[i])/oldDistance));
});
test('重新进入材质保留近景平移、观察角度和正交状态',()=>{
 const renderer={model:{min:[-3,0,-2],height:10},focus:[.4,.2,.6],pan:[.01,-.02,.03],yaw:.7,pitch:.3,radius:.2,orthographic:true};
 const first=readComponentView(renderer),next={model:renderer.model};applyComponentView(next,first);const second=readComponentView(next);
 second.target.forEach((n,i)=>close(n,first.target[i]));second.eye.forEach((n,i)=>close(n,first.eye[i]));assert(second.orthographic);
});
test('无模型不应用视角，错误坐标不进入渲染器',()=>{
 assert.equal(applyComponentView({},{}),false);assert.equal(readComponentView({}),null);
 assert.throws(()=>applyComponentView({model:{}},{eye:[NaN,0,0],target:[0,0,0]}),/无效/);
});
