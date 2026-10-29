"""Offline workbench contract regressions; never imports unreal or writes UE assets."""
import hashlib
import json
import os
import shutil
import struct
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'UEWorkbench/Python'))
from branchforge_pve_contract import read_contract, ContractError


class ContractTests(unittest.TestCase):
    def setUp(self):
        source = os.environ.get('TREE_DUCK_TRUNK_PACKAGE')
        if not source:
            self.skipTest('Set TREE_DUCK_TRUNK_PACKAGE to a real exported V3 package')
        self.temp = tempfile.TemporaryDirectory(prefix='tree-duck-contract-')
        self.addCleanup(self.temp.cleanup)
        self.folder = Path(self.temp.name) / 'package'
        shutil.copytree(source, self.folder)
        self.path = self.folder / 'whole.pve-skeleton.json'

    def json(self, name):
        return json.loads((self.folder / name).read_text(encoding='utf-8-sig'))

    def write(self, name, value):
        (self.folder / name).write_text(json.dumps(value), encoding='utf-8')

    def test_real_trunk_includes_every_dependency_without_requiring_crown(self):
        c = read_contract(self.path)
        self.assertTrue(c['imported_trunk'])
        self.assertEqual(len(c['dependency_files']), len(self.json('validation.json')['files']) + 1)
        self.assertIn('whole.trunk-skin.bin', [p.name for p in c['dependency_files']])
        self.assertGreater(c['resolved_summary']['triangles'], 0)

    def test_unknown_capability_is_rejected_before_ue(self):
        data = self.json(self.path.name); data['required_capabilities'].append('unknown_v9')
        self.write(self.path.name, data)
        with self.assertRaisesRegex(ContractError, '能力声明'):
            read_contract(self.path)

    def test_missing_image_is_not_treated_as_an_empty_leaf_atlas(self):
        payload = self.json('whole.resolved.json')
        item = next(iter(payload['imported_trunk_materials']['materials'][0]['maps'].values()))
        (self.folder / item['file']).unlink()
        with self.assertRaisesRegex(ContractError, '缺失'):
            read_contract(self.path)

    def test_changed_actual_geometry_fails_hash_validation(self):
        payload = self.json('whole.resolved.json')
        file = self.folder / payload['binary']
        content = bytearray(file.read_bytes()); content[-1] ^= 1; file.write_bytes(content)
        with self.assertRaisesRegex(ContractError, '二进制校验'):
            read_contract(self.path)

    def test_dependency_paths_cannot_escape_package(self):
        check = self.json('validation.json'); check['files']['../outside.bin'] = {'bytes': 0, 'sha256': ''}
        self.write('validation.json', check)
        with self.assertRaisesRegex(ContractError, '包内文件名'):
            read_contract(self.path)

    def test_valid_hashes_do_not_allow_out_of_range_skin_nodes(self):
        payload = self.json('whole.resolved.json'); skin = payload['imported_trunk_skin']
        content = bytearray((self.folder / skin['file']).read_bytes())
        struct.pack_into('<I', content, 8, len(skin['nodes']) + 5)
        (self.folder / skin['file']).write_bytes(content)
        skin['sha256'] = hashlib.sha256(content).hexdigest(); skin['sha1'] = hashlib.sha1(content).hexdigest()
        self.write('whole.resolved.json', payload)
        check = self.json('validation.json')
        for name in [skin['file'], 'whole.resolved.json']:
            data = (self.folder / name).read_bytes()
            check['files'][name] = {'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()}
        self.write('validation.json', check)
        with self.assertRaisesRegex(ContractError, '权重值'):
            read_contract(self.path)

    def test_original_v2_contract_remains_accepted(self):
        folder = Path(self.temp.name) / 'legacy'; folder.mkdir()
        data = self.json(self.path.name)
        data.update(version=2, foliage_sources=[{'id': 'LEGACY'}], foliage=[{
            'id': 'UNIT_OLD', 'source_index': 0, 'branch_id': data['branches'][0]['id'],
            'scale_m': 1, 'position_m': [0, 0, 0], 'up': [0, 1, 0], 'face': [0, 0, 1]}],
            complete_unit_assembly={'source_mesh_count': 1, 'unit_count': 1, 'leaf_instances': 0, 'organ_instances': 0})
        for key in ['resolved_assembly', 'required_capabilities', 'imported_trunks']:
            data.pop(key, None)
        path = folder / 'old.pve-skeleton.json'; path.write_text(json.dumps(data), encoding='utf-8')
        c = read_contract(path)
        self.assertEqual(c['source_ids'], ['LEGACY'])
        self.assertEqual(c['instance_count'], 1)


if __name__ == '__main__':
    unittest.main()
