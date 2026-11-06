// HTTP bad ports >=1024, from https://fetch.spec.whatwg.org/#port-blocking (2026-10-31).
const blocked=new Set([1719,1720,1723,2049,3659,4045,4190,5060,5061,6000,6566,6665,6666,6667,6668,6669,6679,6697,10080]);
export const safeBrowserPort=port=>Number.isInteger(port)&&port>=1024&&port<=65535&&!blocked.has(port);
export function listenDesktop(server,{port=0,onAddress=()=>{}}={}){
  if(port!==0&&!safeBrowserPort(port))throw Error('该端口不可用于本地材质工作台。');let retries=0;
  function bind(){server.listen(port,'127.0.0.1',()=>{const actual=server.address().port;if(safeBrowserPort(actual)){onAddress('http://127.0.0.1:'+actual);return;}server.close(()=>{if(++retries>40)throw Error('无法分配浏览器可用的本机端口。');bind();});});}bind();
}
