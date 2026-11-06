export const SURFACE_MATERIAL_BRUSHES=Object.freeze([
 {id:'lichen-grain',name:'颗粒地衣',recipeId:'O04-3',type:'lichen',color:'#a3ad75',radius:.09,hardness:.65},
 {id:'algae-film',name:'薄藻染色',recipeId:'O04-5',type:'algae',color:'#4b623d',radius:.15,hardness:.3},
 {id:'dust-powder',name:'干尘粉刷',recipeId:'O08-1',type:'dust',color:'#aa9a7d',radius:.12,hardness:.3},
 {id:'mud-crust',name:'根部泥壳',recipeId:'O08-2',type:'dirt',color:'#665038',radius:.1,hardness:.65},
 {id:'whitewash',name:'树干白漆',recipeId:'O09-1',type:'paint',color:'#e4e2d6',radius:.12,hardness:.8},
 {id:'wet-surface',name:'湿润画笔',recipeId:'O02-2',type:'wet',color:'#504b3c',radius:.15,hardness:.25},
 {id:'silver-wear',name:'银灰风化',recipeId:'O05-1',type:'bleach',color:'#b8b6aa',radius:.12,hardness:.35},
 {id:'thin-snow',name:'薄雪表层',recipeId:'O10-3',type:'dust',color:'#e8edef',radius:.09,hardness:.6},
 {id:'old-cork',name:'老皮修补',recipeId:'O01-4',type:'cork',color:'#574a38',radius:.09,hardness:.7},
 {id:'dark-corruption',name:'腐化斑块',recipeId:'O10-5',type:'cork',color:'#372739',radius:.12,hardness:.55}
].map(p=>Object.freeze(p)));
export function surfaceMaterialBrush(id){const p=SURFACE_MATERIAL_BRUSHES.find(p=>p.id===id);if(!p)throw Error('表面材质笔刷不存在。');return p;}
export function validateManualMaterialBrush(raw,type){if(raw==null)return null;if(raw.version!==1||surfaceMaterialBrush(raw.presetId).type!==type)throw Error('材质笔刷图层记录无效。');return{version:1,presetId:raw.presetId};}
