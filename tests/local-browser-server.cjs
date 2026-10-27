// Read-only web/assets server plus isolated in-memory API fixtures. Never starts
// the user's PowerShell service, writes settings, or touches personal libraries.
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
const file=path.join(__dirname,'trunk-workspace-library.browser.cjs'),text=fs.readFileSync(file,'utf8');let source=text.slice(0,text.indexOf('(async()=>{')).replace("'.runtime/trunk-workspace-library-ui'","'.runtime/professional-upgrade/ui-server'");
source+="\nserver.listen("+Number(process.argv[2]||19887)+",'127.0.0.1',()=>console.log('Isolated read-only browser fixture server ready'));process.on('SIGTERM',()=>server.close());";
const mod=new Module(file,module);mod.filename=file;mod.paths=module.paths;mod._compile(source,file);
