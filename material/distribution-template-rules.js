export const DISTRIBUTION_TEMPLATES=Object.freeze([
 {id:'D01',name:'均匀与受限覆盖',mode:'uniform',description:'填充当前范围，保留材质自身结构。'},
 {id:'D02',name:'根部与低位渐变',mode:'root',description:'低位渐变与凹处倾向；高度可调。'},
 {id:'D03',name:'沟槽聚集',mode:'groove',description:'近程接触、宽域遮蔽和凹曲率共同组织。'},
 {id:'D04',name:'凸脊风化',mode:'ridge',description:'多尺度曲率分离凸脊，保留干净静区。'},
 {id:'D05',name:'接缝与分叉',mode:'contact',description:'接触与凹曲率交集；属于几何候选。'},
 {id:'D06',name:'朝向与暴露',mode:'orientation',description:'根据用户指定朝向筛选表面。'},
 {id:'D07',name:'自然斑块',mode:'scattered',description:'大斑块、中簇和细破边，随机种子稳定。'},
 {id:'D08',name:'沿面流挂',mode:'flow',description:'沿连通表面向下积聚的静态导流倾向，可更改重力朝向。'},
 {id:'D09',name:'洞口与边缘',mode:'boundary',description:'从实际开放边界向内按面上距离渐变；封闭模型无开放边界。'},
 {id:'D10',name:'端面与露木',mode:'endgrain',params:{angle:35},description:'朝向与局部平整度候选；可配合指定部位精修。'},
 {id:'D11',name:'下层高度影响',mode:'uniform',height:true,description:'依据树皮高度控制附着；在通道混合中调深浅和软化。'},
 {id:'D12',name:'局部数量散布',decal:true,description:'仅表面贴花：按数量、尺寸和选点评分放置。'}
]);
export function validatePublicDistribution(raw){
 if(raw==null)return null;if(raw.version!==1||!DISTRIBUTION_TEMPLATES.some(t=>t.id===raw.id))throw Error('公共分布模板记录无效。');
 if(raw.id==='D11'){const p=raw.previousHeight;if(raw.heightOwned!==true||!p||!['off','cavity','ridge'].includes(p.height)||!['bark','lower','layer'].includes(p.heightSource)||!['heightStrength','heightBalance'].every(k=>Number.isFinite(p[k])&&p[k]>=0&&p[k]<=1)||!Number.isFinite(p.heightSoftness)||p.heightSoftness<.001||p.heightSoftness>.5)throw Error('高度模板恢复记录无效。');return{version:1,id:raw.id,heightOwned:true,previousHeight:Object.fromEntries(['height','heightSource','heightStrength','heightBalance','heightSoftness'].map(k=>[k,p[k]]))};}
 return{version:1,id:raw.id};
}
