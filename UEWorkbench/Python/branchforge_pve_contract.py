"""Validation for BranchForge complete-unit skeletons; no Unreal dependency."""

import json
import hashlib
import math
from pathlib import Path


class ContractError(ValueError):
    pass


def read_contract(path):
    path = Path(path).resolve()
    data = json.loads(path.read_text(encoding="utf-8-sig"))
    if data.get("format") == "BranchForgePVESkeleton" and data.get("version") == 3:
        from branchforge_pve_trunk_contract import read_trunk_contract
        return read_trunk_contract(path, data)
    if data.get("format") != "BranchForgePVESkeleton" or data.get("version") != 2:
        raise ContractError("需要 BranchForgePVESkeleton V2 JSON")
    coords = data.get("coordinate_system") or {}
    if coords.get("up") != "Z" or coords.get("unit") != "meter":
        raise ContractError("仅支持 Z 向上、米制的骨架")
    branches = data.get("branches")
    sources = data.get("foliage_sources")
    instances = data.get("foliage")
    assembly = data.get("complete_unit_assembly")
    if not isinstance(branches, list) or not branches:
        raise ContractError("骨架枝条为空")
    if not isinstance(sources, list) or not sources:
        raise ContractError("完整枝源为空")
    if not isinstance(instances, list) or not instances:
        raise ContractError("完整枝实例为空")
    if not isinstance(assembly, dict) or assembly.get("leaf_instances") != 0 or assembly.get("organ_instances") != 0:
        raise ContractError("JSON 仍包含独立叶片或花果；请导出完整样本枝装配")
    ids = []
    for entry in sources:
        identifier = entry.get("id") if isinstance(entry, dict) else None
        if not isinstance(identifier, str) or not identifier.strip() or identifier in ids:
            raise ContractError("完整枝源 ID 缺失或重复")
        ids.append(identifier)
    if assembly.get("source_mesh_count") != len(ids) or assembly.get("unit_count") != len(instances):
        raise ContractError("装配清单与枝源/实例数量不符")
    branch_ids = {entry.get("id") for entry in branches if isinstance(entry, dict)}
    if len(branch_ids) != len(branches) or None in branch_ids:
        raise ContractError("承重枝 ID 缺失或重复")
    seen = set()
    counts = {identifier: 0 for identifier in ids}
    for item in instances:
        if not isinstance(item, dict) or item.get("id") in seen or not isinstance(item.get("id"), str):
            raise ContractError("完整枝实例 ID 缺失或重复")
        seen.add(item["id"])
        index = item.get("source_index")
        if isinstance(index, bool) or not isinstance(index, int) or not 0 <= index < len(ids):
            raise ContractError(f"{item['id']} 的 source_index 无效")
        if item.get("branch_id") not in branch_ids:
            raise ContractError(f"{item['id']} 的母枝不存在")
        if not isinstance(item.get("scale_m"), (int, float)) or not math.isfinite(item["scale_m"]) or item["scale_m"] <= 0:
            raise ContractError(f"{item['id']} 的缩放无效")
        for key in ("position_m", "up", "face"):
            vector = item.get(key)
            if not isinstance(vector, list) or len(vector) != 3 or any(
                not isinstance(value, (int, float)) or not math.isfinite(value) for value in vector
            ):
                raise ContractError(f"{item['id']} 的 {key} 无效")
        counts[ids[index]] += 1
    manifest_path = path.parent / "complete_units.manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8-sig")) if manifest_path.exists() else None
    if manifest:
        if manifest.get("format") != "BranchForgeCompleteUnitSet":
            raise ContractError("完整枝清单格式无效")
        manifest_ids = [entry.get("id") for entry in manifest.get("units", [])]
        if set(manifest_ids) != set(ids) or len(manifest_ids) != len(ids):
            raise ContractError("完整枝清单与骨架枝类 ID 不一致")
        for entry in manifest["units"]:
            if entry.get("instance_count") != counts[entry["id"]]:
                raise ContractError(f"{entry['id']} 的安装数量与清单不符")
    resolved_files = []
    resolved_summary = None
    resolved = data.get("resolved_assembly")
    if resolved:
        for field in ("manifest", "binary"):
            name = resolved.get(field)
            if not isinstance(name, str) or Path(name).name != name or not (path.parent / name).is_file():
                raise ContractError(f"软件装配数据 {field} 缺失；请选择完整导出文件夹中的 JSON")
            resolved_files.append(path.parent / name)
        payload = json.loads(resolved_files[0].read_text(encoding="utf-8"))
        if payload.get("format") != "BranchForgeResolvedAssembly" or payload.get("version") != 1:
            raise ContractError("软件装配数据版本不支持")
        if payload.get("branches") != branches or payload.get("sources") != sources or payload.get("instances") != instances:
            raise ContractError("软件装配数据与当前 JSON 的树形/枝类/实例不一致；请重新导出")
        if payload.get("binary") != resolved["binary"] or payload.get("source_sha256") != resolved.get("source_sha256"):
            raise ContractError("软件装配数据来源不一致")
        digest = hashlib.sha256()
        with resolved_files[1].open("rb") as stream:
            for block in iter(lambda: stream.read(1024 * 1024), b""):
                digest.update(block)
        if resolved_files[1].stat().st_size != payload.get("binary_bytes") or digest.hexdigest().upper() != payload.get("binary_sha256"):
            raise ContractError("软件装配数据长度或校验值错误")
        resolved_summary = dict(payload.get("summary", {}))
        resolved_summary["binary_bytes"] = payload["binary_bytes"]
    return {"path": path, "data": data, "source_ids": ids, "counts": counts,
            "branch_count": len(branches), "instance_count": len(instances), "manifest": manifest,
            "resolved_files": resolved_files, "resolved_summary": resolved_summary}


def describe_contract(contract):
    """Human-readable package check, shared by the workbench and saved receipts."""
    lines = [f"承重枝 {contract['branch_count']} · 完整枝实例 {contract['instance_count']} · "
             f"样本枝类 {len(contract['source_ids'])}"]
    if contract.get("imported_trunk"):
        lines += ["导入雕刻 / AI 树干 · 保留原始网格、PBR 贴图和绑定权重", "可不包含单元枝或叶片图集。"]
    summary = contract.get("resolved_summary")
    if summary:
        lines += ["模式：软件实际装配（配套清单、二进制及 SHA256 校验通过）",
                  f"叶 {summary.get('leaves', '?')} · 花果 {summary.get('organs', '?')} · "
                  f"三角面 {summary.get('triangles', '?'):,}" if isinstance(summary.get('triangles'), int)
                  else "几何统计不可用",
                  f"装配数据 {summary['binary_bytes'] / 1024 ** 2:.1f} MiB",
                  "更新时会一起复制配套文件；请保留完整导出文件夹。"]
    else:
        lines += ["模式：固定样本枝实例（无软件实际装配附件）",
                  "可用于手动替换树枝；不保证还原软件逐实例粗细和叶果变化。"]
    return "\n".join(lines)


def binding_for_name(source_id, mesh_names):
    """Return one exact/prefix match, or fail instead of guessing an ambiguous mesh."""
    needle = source_id.casefold()
    matches = [name for name in mesh_names if name.casefold() == needle or name.casefold().startswith(needle + "_")]
    if len(matches) != 1:
        raise ContractError(f"{source_id}: 需要唯一的同名枝网格，当前匹配 {len(matches)} 个：{matches}")
    return matches[0]


def preserve_bindings_by_id(old_ids, old_meshes, new_ids):
    """Keep user-selected meshes on JSON refresh even if source indices move."""
    if len(old_ids) != len(old_meshes) or len(set(old_ids)) != len(old_ids):
        raise ContractError("原 PVE 枝类顺序与网格槽不一致，无法安全保留绑定")
    by_id = dict(zip(old_ids, old_meshes))
    return [by_id.get(identifier) for identifier in new_ids]
