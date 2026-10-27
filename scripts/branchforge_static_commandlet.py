"""Noninteractive acceptance/automation entry; the editor UI calls the same operations."""
import json, sys, traceback
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from branchforge_static_ue import run_operation, reload_variant, audit, check_library
from branchforge_static_contract import contract
config = json.loads(Path(sys.argv[1]).read_text(encoding='utf-8-sig'))
try:
    if config.get('mode') == 'audit_paths':
        check_library(config['library_record'])
        result = audit(config['paths'], contract(config['package']), config['library_record'])
    else:
        result = reload_variant(config['key']) if config.get('mode') == 'reload' else run_operation(config)
except Exception:
    result = {'passed': False, 'error': traceback.format_exc()}
Path(config['report']).write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf8')
if not result['passed']:
    raise RuntimeError(result.get('error', '检查失败'))
