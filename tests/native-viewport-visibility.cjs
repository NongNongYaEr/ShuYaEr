const assert=require('assert/strict');
// Inspect WebView2's alpha channel, not only the separately rendered DX12 model.
module.exports=async function assertViewportVisible(page,{dialog='#modelSculptDialog',host='[data-host]'}={}){
 await page.mouse.move(5,5);await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
 const png=await page.screenshot({omitBackground:true});
 const result=await page.evaluate(async({data,dialog,host})=>{
  const image=new Image();image.src='data:image/png;base64,'+data;await image.decode();const c=document.createElement('canvas');c.width=image.width;c.height=image.height;const context=c.getContext('2d');context.drawImage(image,0,0);
  const panel=document.querySelector(dialog),viewport=panel.querySelector(host),b=viewport.getBoundingClientRect(),scale=image.width/innerWidth,samples=[],chain=[];
  for(const x of [.25,.5,.75])for(const y of [.35,.5,.65])samples.push([...context.getImageData(Math.floor((b.x+b.width*x)*scale),Math.floor((b.y+b.height*y)*scale),1,1).data]);
  for(let e=viewport;e;e=e.parentElement)chain.push({tag:e.tagName,id:e.id,class:e.className,background:getComputedStyle(e).backgroundColor});
  return {samples,chain,rect:{x:b.x,y:b.y,width:b.width,height:b.height,scale},backdrop:getComputedStyle(panel,'::backdrop').backgroundColor};
 },{data:png.toString('base64'),dialog,host});
 assert(result.samples.every(p=>p[3]<16),'Opaque WebView2 pixels cover the native model: '+JSON.stringify(result));
 assert(result.backdrop==='rgba(0, 0, 0, 0)'||result.backdrop==='transparent','The dialog backdrop covers the native model');
 return {png,result};
};
