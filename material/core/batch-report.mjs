import fs from 'node:fs';import path from 'node:path';import {randomUUID} from 'node:crypto';
export function writeBatchReport(report,{root}){
  if(report?.kind!=='tree-material-batch-report'||report.version!==1||!['complete','completed_with_errors','cancelled'].includes(report.state)||!Array.isArray(report.items)||report.items.length<1||report.items.length>32||JSON.stringify(report).length>512000)throw Error('批量报告无效。');
  const boundary=path.resolve(root,'exports')+path.sep;for(const job of report.items){if(!['complete','failed','cancelled','skipped'].includes(job.state)||typeof job.item?.name!=='string'||job.item.name.length>180)throw Error('批量结果结构无效。');if(job.result?.folder&&!path.resolve(job.result.folder).startsWith(boundary))throw Error('批量结果目录不属于本软件。');}
  const id=randomUUID(),stage=path.join(root,'.runtime/batch-reports',id),folder=path.join(root,'exports/batch-reports',id);fs.mkdirSync(stage,{recursive:true});fs.mkdirSync(path.dirname(folder),{recursive:true});fs.writeFileSync(path.join(stage,'batch_report.json'),JSON.stringify(report,null,2),{flag:'wx'});fs.renameSync(stage,folder);return{folder,url:'/exports/batch-reports/'+id+'/batch_report.json'};
}
