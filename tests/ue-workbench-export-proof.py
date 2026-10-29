"""Run the real background export coordinator in an isolated UEProbe only."""
import json,sys,time,traceback
from pathlib import Path
from types import SimpleNamespace
import unreal
c=json.loads(Path(sys.argv[1]).read_text(encoding='utf-8-sig'))
assert Path(unreal.Paths.get_project_file_path()).resolve()==Path(c['project']).resolve()
assert Path(c['project']).name=='UEProbe.uproject' and c['asset'].startswith('/Game/WorkbenchProof/')
sys.path.insert(0,c['python'])
import branchforge_pve_trunk as tool
callbacks={};dialogs=[]
class HeadlessHost:
    EditorDialog=SimpleNamespace(show_message=lambda *args:dialogs.append(str(args[1])))
    def __getattr__(self,name):return getattr(unreal,name)
    def register_slate_post_tick_callback(self,fn):callbacks[1]=fn;return 1
    def unregister_slate_post_tick_callback(self,key):callbacks.pop(key)
tool.unreal=HeadlessHost()
out={'passed':False,'production_entry':'branchforge_pve_trunk.start_export'}
try:
 receipt=tool.start_export(c['asset'],'/Game/WorkbenchProof/Mixed2/Background')
 end=time.monotonic()+600
 while callbacks and time.monotonic()<end:
  time.sleep(.1)
  for fn in list(callbacks.values()):fn(.1)
 assert not callbacks,'Background task timed out'
 assert receipt['status']=='complete',receipt
 assert receipt['cold_reload'] and receipt['complete_instances']==2 and receipt['dynamic_wind_data']
 assert dialogs and '已生成' in dialogs[-1]
 out.update(passed=True,receipt=receipt,dialog=dialogs[-1])
except Exception:out['error']=traceback.format_exc();unreal.log_error(out['error'])
Path(c['report']).write_text(json.dumps(out,ensure_ascii=False,indent=2),encoding='utf-8')
if not out['passed']:raise RuntimeError(out['error'])
