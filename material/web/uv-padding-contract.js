// This checks the recorded packing budget, not the true minimum spacing of an arbitrary UV layout.
export function assertRecordedPadding(packing,{resolution,padding}){
  if(!packing||!['xatlas','conservative-outline-mask','guarded-xatlas','tree-strips'].includes(packing.method))return;
  if(!Number.isFinite(packing.resolution)||packing.resolution<=0||!Number.isFinite(packing.padding)||packing.padding<0)throw Error('UV方案的间距记录无效，请重新生成UV候选。');
  if(!Number.isFinite(resolution)||resolution<=0||!Number.isFinite(padding)||padding<0)throw Error('输出分辨率/扩边无效。');
  if(padding/resolution>packing.padding/packing.resolution+1e-12)throw Error('输出扩边超过当前UV方案的预留比例；请降低扩边，或按当前尺寸/间距重新重排并采用候选。');
}
