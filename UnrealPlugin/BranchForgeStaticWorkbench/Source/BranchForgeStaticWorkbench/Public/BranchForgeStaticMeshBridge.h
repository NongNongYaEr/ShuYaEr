#pragma once

#include "CoreMinimal.h"
#include "Kismet/BlueprintFunctionLibrary.h"
#include "BranchForgeStaticMeshBridge.generated.h"

class UStaticMesh;

UCLASS()
class BRANCHFORGESTATICWORKBENCH_API UBranchForgeStaticMeshBridge : public UBlueprintFunctionLibrary
{
    GENERATED_BODY()
public:
    /** Replace this managed assembly in place, including native reference caches. */
    UFUNCTION(BlueprintCallable, Category="BranchForge|Static Vegetation")
    static bool ReplaceAssembly(UStaticMesh* Target, UStaticMesh* Source);
};
