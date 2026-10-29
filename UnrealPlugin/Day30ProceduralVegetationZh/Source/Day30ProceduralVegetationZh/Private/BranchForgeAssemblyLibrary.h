#pragma once
#include "Kismet/BlueprintFunctionLibrary.h"
#include "BranchForgeAssemblyLibrary.generated.h"
class UPVBranchForgePreviewSettings;
class USkeletalMesh;

UCLASS()
class UBranchForgeAssemblyLibrary : public UBlueprintFunctionLibrary
{
	GENERATED_BODY()
public:
	/** Versioned handshake with the workbench; includes cold-load skin verification. */
	UFUNCTION(BlueprintPure, Category="BranchForge")
	static int32 GetTrunkBindingVersion() { return 4; }
	/** Resolve native export node folder, type, name and collision policy before building. */
	UFUNCTION(BlueprintCallable, Category="BranchForge")
	static FString PlanTrunkExport(UObject* SourceAsset,const FString& FolderOverride);
	/** Publish only selected assets and their generated dependencies after cold verification. */
	UFUNCTION(BlueprintCallable, Category="BranchForge")
	static FString PublishTrunkExport(const FString& StagingFolder,const FString& PlanJSON);
	/** One nonmodal editor notification per export. Called only on the game thread. */
	UFUNCTION(BlueprintCallable, Category="BranchForge")
	static void UpdateTrunkExportNotification(const FString& Token,const FString& Message,const FString& Detail,const FString& ResultAsset,bool bFinished,bool bSucceeded);
	/** Validate the native exported mesh, then restore the pinned imported-trunk skin. */
	UFUNCTION(BlueprintCallable, Category="BranchForge")
	static FString FinalizeTrunkBinding(USkeletalMesh* Mesh, const FString& ManifestPath);
	/** Builds only parts verified against every software instance; never overwrites authored meshes. */
	UFUNCTION(BlueprintCallable, Category="BranchForge")
	static FString PrepareSharedParts(UPVBranchForgePreviewSettings* Settings, const FString& ManifestPath, const FString& TargetFolder);
	/** Internal workbench state remapping/rollback. Keep derived fields read-only in Details. */
	UFUNCTION(BlueprintCallable, Category="BranchForge")
	static bool SetPreparedParts(UPVBranchForgePreviewSettings* Settings, const TArray<UObject*>& Meshes, const TArray<int32>& Modes, const FString& BinaryHash);
};
