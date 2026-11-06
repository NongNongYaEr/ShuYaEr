export const EXPORT_VIEW_MODES=['overview','model','maps'];
export function exportViewMode(value){return EXPORT_VIEW_MODES.includes(value)?value:'overview';}
export function exportReadiness({project,model,surface={},busy=false,aoReady=false}={}){
 const invalid=!!model&&(!!model.diagnostic?.zeroUvFaces||!!model.diagnostic?.outOfRangeFaces||model.diagnostic?.overlap>.001);
 return{canExport:!!project&&!!model&&!busy&&!invalid&&!surface.error,invalidUV:invalid,model:!model?'请先准备模型':(model.indices.length/3).toLocaleString()+' 三角面',uv:invalid?'存在无效或重叠 UV':model?'UV 可用 · 导出时核验间距':'尚未就绪',material:surface.error?'材质分布需处理':surface.pending?'正在更新材质':'材质已就绪',ao:aoReady?'几何 AO 已就绪':'首次导出自动计算',microdetail:project?.microdetail?.enabled===true};
}
export function finalGLBRequest(options){return options?.finalGLB===true;}
