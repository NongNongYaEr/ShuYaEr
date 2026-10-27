#include "BranchForgeStaticMeshBridge.h"
#include "Engine/StaticMesh.h"
#include "MeshDescription.h"
#include "Modules/ModuleManager.h"

IMPLEMENT_MODULE(FDefaultModuleImpl, BranchForgeStaticWorkbench)

bool UBranchForgeStaticMeshBridge::ReplaceAssembly(UStaticMesh* Target, UStaticMesh* Source)
{
    const FString ManagedRoot(TEXT("/Game/Day30/Vegetation/StaticUSD/Workbench/"));
    if (!IsInGameThread() || !Target || !Source || Target == Source || !Source->IsNaniteAssembly()
        || !Target->GetPathName().StartsWith(ManagedRoot) || !Source->GetPathName().StartsWith(ManagedRoot))
    {
        return false;
    }

    // Finish any pending builds before replacing data held by the render thread.
    Source->GetBounds();
    Target->GetBounds();
    TArray<FMeshDescription> Descriptions;
    for (int32 Lod = 0; Lod < Source->GetNumSourceModels(); ++Lod)
    {
        const FMeshDescription* Description = Source->GetMeshDescription(Lod);
        if (!Description) { return false; }
        Descriptions.Add(*Description);
    }
    if (Descriptions.IsEmpty()) { return false; }

    Target->Modify();
    Target->PreEditChange(nullptr);
    // Same part count is NOT sufficient to reuse UE 5.8's reference cache.
    Target->ClearCachedNaniteAssemblyReferences();
    Target->SetNaniteSettings(Source->GetNaniteSettings());
    Target->SetStaticMaterials(Source->GetStaticMaterials());
    Target->SetNumSourceModels(Descriptions.Num());
    for (int32 Lod = 0; Lod < Descriptions.Num(); ++Lod)
    {
        Target->GetSourceModel(Lod).BuildSettings = Source->GetSourceModel(Lod).BuildSettings;
        Target->GetSourceModel(Lod).ReductionSettings = Source->GetSourceModel(Lod).ReductionSettings;
        Target->CreateMeshDescription(Lod, MoveTemp(Descriptions[Lod]));
        Target->CommitMeshDescription(Lod);
    }
    Target->SetPositiveBoundsExtension(Source->GetPositiveBoundsExtension());
    Target->SetNegativeBoundsExtension(Source->GetNegativeBoundsExtension());
    Target->NeverStream = Source->NeverStream;
    Target->RecacheNaniteAssemblyReferences();
    Target->PostEditChange();
    // Block until the actual new Nanite data and bounds are ready for validation.
    Target->GetBounds();
    Target->MarkPackageDirty();
    return Target->IsNaniteAssembly();
}
