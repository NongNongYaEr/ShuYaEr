#pragma once
#include "CoreMinimal.h"
struct FMeshDescription;
class UMaterialInterface;
// UE 5.8 Nanite skeletal input does not carry vertex colors. Preserve the
// original UV0 and replace the color expression in new export-only materials.
bool BakeBranchForgeNaniteColors(FMeshDescription& Mesh,TArray<UMaterialInterface*>& Materials,const TArray<FName>& Slots,const FString& Folder,TArray<UObject*>& Assets,FString& Error);
