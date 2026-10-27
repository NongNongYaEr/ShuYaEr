import test from 'node:test';
import assert from 'node:assert/strict';
import { editContext } from '../web/edit-context.js';

test('TREE installed units always describe whole-unit transforms, never internal point or organ edits', () => {
  for (const point of [-1, 0, 2, 4]) for (const tool of ['SELECT', 'PULL', 'COMB', 'BUNDLE_SCALE']) {
    for (const unit of [false, true]) {
      const context = editContext({ mode: 'TREE', sample: true, unit, count: 1, branch: 'ONE.R1', point, points: 5, tool });
      assert.match(context.scope, /只调整单元枝整体/);
      assert.match(context.scope, /内部枝干与叶花果在枝条工作台编辑/);
      assert.match(context.keys, /G 换挂点.*R 旋转.*S 整体缩放.*Shift\+D 复制/);
      assert.match(context.keys, /双击选整支.*编辑源单元枝进入工作台/);
      assert.doesNotMatch(JSON.stringify(context), /局部精修|局部编辑|第 \d+ 个点|Alt\+S|后段粗细|当前笔刷|缩放单元/);
    }
  }
  assert.equal(editContext({ mode: 'TREE', sample: true, count: 3, point: 2, points: 5 }).object, '整树造型 · 3 支单元枝');
  assert.match(editContext({ mode: 'TREE', unit: true, sample: false, count: 1 }).scope, /只调整单元枝整体/);
});

test('BRANCH retains independent real leaf/organ and wood editing guidance', () => {
  const unit = editContext({ mode: 'BRANCH', sample: true, unit: true, count: 1 });
  assert.equal(unit.object, '枝条工作台 · 叶花果单元');
  assert.equal(unit.scope, '只修改所选叶花果');
  assert.match(unit.keys, /Shift\+D 复制.*G 沿枝滑动\/换挂点.*S 缩放单元/);
  const whole = editContext({ mode: 'BRANCH', sample: true, count: 1, branch: 'R1', point: 0, points: 5 });
  assert.match(whole.keys, /Alt\+S 粗细/);
  const middle = editContext({ mode: 'BRANCH', sample: true, count: 1, branch: 'R1', point: 2, points: 5 });
  assert.match(middle.keys, /G 移点.*R 转向后段点.*Alt\+S 后段粗细/);
  assert.match(middle.scope,/点位决定走势.*自动更新/);
});

test('TREE skeleton and VINE routes preserve their own scopes without offering internal unit editing', () => {
  const skeleton = editContext({ mode: 'TREE', count: 1, branch: 'ROOT', point: 2, points: 5 });
  assert.match(skeleton.keys, /G 移点/);
  assert.match(skeleton.scope,/点位决定走势/);
  const brush = editContext({ mode: 'TREE', count: 2, tool: 'COMB' });
  assert.match(brush.scope, /装配单元枝保持自身大小/);
  assert.match(brush.keys, /当前笔刷/);
  const empty = editContext({ mode: 'TREE', sample: true, unit: true, count: 0 });
  assert.match(empty.scope, /先选择承重骨架或单元枝/);
  const vine = editContext({ mode: 'VINE', sample: true, count: 2 });
  assert.match(vine.scope, /藤蔓工具/);
});

test('trunk detail guidance follows actual detail selection and does not advertise section-only shortcuts',()=>{
  const detail=editContext({mode:'TREE',trunkForm:true,branch:'ROOT',trunkFormContext:{part:'DETAIL',tool:'刷区域',summary:'已选 2 / 8 项 · 仅本枝表面；大轮廓与完整单元枝保持'}});
  assert.match(detail.object,/表面细节 · 刷区域 · ROOT/);
  assert.match(detail.scope,/已选 2 \/ 8 项/);
  assert.match(detail.keys,/A 添加.*V 选择.*C 刷区域.*G 沿枝滑动.*R 绕干.*S 调范围/);
  assert.doesNotMatch(detail.keys,/N 放置|C 轮廓|S 粗细/);
  const section=editContext({mode:'TREE',trunkForm:true,branch:'ROOT',trunkFormContext:{part:'SECTION'}});
  assert.match(section.keys,/N 放置/);assert.match(section.scope,/截面与独立板根/);
});

test('legacy trunk preparation describes the requested stage and comparison rather than point editing',()=>{
  for(const [stage,label]of [['CONTOUR','子点精修'],['DETAIL','表面细节']]){
    const context=editContext({mode:'TREE',skeletonEditing:true,trunkForm:true,branch:'ROOT',trunkFormContext:{part:'SECTION',stage,preparing:true}});
    assert.equal(context.object,'枝干编辑 · '+label+'准备 · ROOT');
    assert.match(context.scope,/升级预览.*原工程尚未修改/);
    assert.match(context.keys,/Q 对照原形.*Enter 确认后进入编辑.*Esc.*取消并返回/);
    assert.doesNotMatch(context.keys,/G.*R.*S|Del 删点/);
  }
});

test('direct legacy child entry advertises ready point editing with no upgrade confirmation',()=>{
  const context=editContext({mode:'TREE',skeletonEditing:true,trunkForm:true,branch:'ROOT',trunkFormContext:{part:'SECTION',stage:'CONTOUR',compatibility:true}});
  assert.equal(context.object,'枝干编辑 · 子点精修 · ROOT');
  assert.match(context.scope,/旧版兼容编辑，首次改动保存新版截面/);
  assert.match(context.keys,/框选编辑点.*G \/ R \/ S 操作选区/);
  assert.doesNotMatch(JSON.stringify(context),/准备|确认后进入|Q 对照/);
});

test('root context names actual root selection and shape handles without borrowing circle transforms',()=>{
  const context=editContext({mode:'TREE',skeletonEditing:true,trunkForm:true,branch:'ROOT',trunkFormContext:{part:'SECTION',stage:'CONTOUR',region:'ROOT',rootSelection:['A','B']}});
  assert.equal(context.object,'枝干编辑 · 根部板根 · ROOT');assert.match(context.scope,/已选 2 条板根.*完整单元枝保持/);
  assert.match(context.keys,/拖形状手柄.*Tab 切手柄.*Esc 取消，留在根部/);assert.doesNotMatch(context.keys,/G \/ R \/ S|Del 删点/);
});
test('curve point selection describes point deletion and never presents an empty point scope as a whole-branch selection',()=>{
 const group=editContext({mode:'TREE',branch:'ROOT',count:1,point:3,points:9,pointScope:'POINTS',selectedPoints:2});assert.match(group.scope,/已选 2 个控制点/);assert.match(group.keys,/Ctrl.*加点.*Delete 删选点/);
 const empty=editContext({mode:'TREE',branch:'ROOT',count:1,point:-1,points:9,pointScope:'POINTS',selectedPoints:0});assert.match(empty.scope,/选区为空.*不删整枝/);
 const unit=editContext({mode:'TREE',branch:'UNIT',count:1,sample:true,pointScope:'POINTS',selectedPoints:2});assert.match(unit.scope,/只调整单元枝整体/);
});
