export async function runBatchQueue(items,{process,isCancelled=()=>false,onChange=()=>{}}){
  if(!Array.isArray(items)||!items.length||items.length>32)throw Error('批量队列需要1–32个模型。');
  const report={kind:'tree-material-batch-report',version:1,id:crypto.randomUUID(),state:'running',startedAt:new Date().toISOString(),items:items.map(item=>({item:structuredClone(item),state:'pending'}))};
  const emit=()=>onChange(structuredClone(report));emit();
  for(let i=0;i<report.items.length;i++){if(isCancelled())break;const job=report.items[i],start=Date.now();job.state='running';emit();try{job.result=await process(structuredClone(job.item),i);if(!job.result?.committed)throw Error('本模型尚未提交完整输出。');job.state='complete';}catch(e){job.error=String(e.message||e).slice(0,5000);job.state=e.name==='AbortError'||isCancelled()?'cancelled':'failed';}job.seconds=(Date.now()-start)/1000;emit();if(job.state==='cancelled'||isCancelled())break;}
  for(const job of report.items)if(job.state==='pending')job.state='skipped';report.state=report.items.some(j=>j.state==='cancelled'||j.state==='skipped')?'cancelled':report.items.some(j=>j.state==='failed')?'completed_with_errors':'complete';report.completedAt=new Date().toISOString();report.counts={complete:0,failed:0,cancelled:0,skipped:0};for(const j of report.items)report.counts[j.state]++;emit();return report;
}
