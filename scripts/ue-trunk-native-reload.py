"""Cold-load saved native PVE exports in a fresh UEProbe commandlet process.

Run with -run=pythonscript -script=".../ue-trunk-native-reload.py config.json".
The config contains report and state file paths inside .runtime/trunk-feasibility.
No preview rendering or wind claim is made by a NullRHI metadata/geometry check.
"""
import importlib.util
import json
import sys
import traceback
from pathlib import Path

import unreal

ROOT = Path(__file__).resolve().parents[1]
RUNTIME = (ROOT / ".runtime/trunk-feasibility").resolve()
PROBE = RUNTIME / "UEProbe"


def runtime_path(value):
    path = Path(value).resolve()
    assert path == RUNTIME or RUNTIME in path.parents, "Output must stay inside the isolated feasibility runtime"
    return path


config = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8-sig"))
report_file = runtime_path(config["report"])
report_file.parent.mkdir(parents=True, exist_ok=True)
result = {"passed": False, "fresh_process_reload": True,
          "engine": unreal.SystemLibrary.get_engine_version(), "samples": [],
          "visual_render_verified": False, "wind_verified": False,
          "scope": "Saved native source geometry, UV/normals, material bindings and complete-model assembly metadata"}
try:
    assert Path(unreal.Paths.get_project_file_path()).resolve().parent == PROBE.resolve()
    state_file = runtime_path(config["state"])
    state = json.loads(state_file.read_text(encoding="utf-8-sig"))
    assert set(state["assets"]) == {"Grooved", "Buttress", "Refined"}
    spec = importlib.util.spec_from_file_location("trunk_cold_native_audit", ROOT / "scripts/ue-trunk-render-audit.py")
    helper = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(helper)
    for name, row in state["assets"].items():
        assert row["graph"].startswith("/Game/TrunkFeasibility/VisualTrial")
        assert row["output_folder"].startswith("/Game/TrunkFeasibility/VisualTrial")
        # _batch suppresses live preview staging, request queues and editor
        # cleanup. Missing preview in the commandlet is explicitly expected.
        audit = helper.run(name, report_file.parent, row, _batch=True)
        audit_file = report_file.parent / (name + "-cold-native-audit.json")
        audit_file.write_text(json.dumps(audit, ensure_ascii=False, indent=2), encoding="utf8")
        result["samples"].append({"name": name, "passed": bool(audit["native_export_verified"]),
                                  "graph": row["graph"], "report": str(audit_file),
                                  "preview_checked": False, "native_exports": audit["native_exports"],
                                  "complete_source_parts": audit["complete_source_parts"]})
    result["passed"] = len(result["samples"]) == 3 and all(sample["passed"] for sample in result["samples"])
except Exception:
    result["error"] = traceback.format_exc()
    unreal.log_error(result["error"])
report_file.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf8")
unreal.log("TRUNK_NATIVE_RELOAD=" + str(result["passed"]) + " report=" + str(report_file))
