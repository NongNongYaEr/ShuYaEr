#pragma once
#include "CoreMinimal.h"
struct FManagedArrayCollection;
class FJsonObject;
class USkeletalMesh;
// Uses public UE asset builders on the actual generated PVE collection. No
// editor window, Slate export dialog, desktop input or private engine symbols.
bool ExportBranchForgeTrunkAssets(const FManagedArrayCollection& Collection,const FString& Manifest,const FString& Folder,TSharedRef<FJsonObject> Report,FString& Error);

bool AuditBranchForgeTrunkAssets(const FString& Folder,TSharedRef<FJsonObject> Report,FString& Error,bool bDetailed=true,const FString& StaticPath=FString(),const FString& SkeletalPath=FString());

bool ProbeBranchForgeTrunkWind(const FString& MeshPath,const FString& Directory,TSharedRef<FJsonObject> Report,FString& Error);

// Always checks pinned tree skin, including trees without foliage entries.
bool ValidateBranchForgeTrunkBinding(USkeletalMesh* Mesh,TSharedRef<FJsonObject> Report,FString& Error);
bool ReplaceBranchForgeTrunkMesh(const FString& SourcePath,const FString& TargetPath,TSharedRef<FJsonObject> Report,FString& Error);
