#pragma once

#include "PCGSettings.h"
#include "PCGContext.h"
#include "Nodes/PVRenderSettings.h"
#include "DataTypes/PVData.h"
#include "PVBranchForgePreviewSettings.generated.h"

class UMaterialInterface;

/** Shows wood and complete branches; optional sidecar restores software-resolved geometry. */
UCLASS(BlueprintType, ClassGroup=(Procedural))
class UPVBranchForgePreviewSettings : public UPCGSettings, public IPVRenderSettings
{
	GENERATED_BODY()

public:
	UPROPERTY(EditAnywhere, Category="软件装配", meta=(DisplayName="读取软件实际装配结果"))
	bool bUseResolvedAssembly = true;

	UPROPERTY(EditAnywhere, Category="软件装配", meta=(DisplayName="树皮材质"))
	TObjectPtr<UMaterialInterface> AssemblyBarkMaterial;

	UPROPERTY(EditAnywhere, Category="软件装配", meta=(DisplayName="枝内叶片与花果材质"))
	TObjectPtr<UMaterialInterface> AssemblyFoliageMaterial;

	/** Pinned material bindings for imported trunk chunks; old slots retain their meaning. */
	UPROPERTY(EditAnywhere, Category="软件装配", meta=(DisplayName="导入树干材质表"))
	TMap<FString, TObjectPtr<UMaterialInterface>> AssemblyMaterialOverrides;

	/** Original six bindings; changing a source in the skeleton node uses its replacement mesh. */
	UPROPERTY(EditAnywhere, AdvancedDisplay, Category="软件装配")
	TArray<TSoftObjectPtr<UObject>> AuthoredSourceMeshes;

	/** Derived, verified parts. Source slots remain the user's complete branches. */
	UPROPERTY(EditAnywhere, Category="软件装配", meta=(DisplayName="复用已验证的 Nanite 装配部件"))
	bool bUseSharedAssembly = true;
	UPROPERTY(VisibleAnywhere, AdvancedDisplay, Category="软件装配")
	TArray<TSoftObjectPtr<UObject>> SharedPartMeshes;
	/** 0 = resolved geometry, 1 = shared foliage cluster, 2 = shared complete branch. */
	UPROPERTY(VisibleAnywhere, AdvancedDisplay, Category="软件装配")
	TArray<int32> SharedPartModes;
	UPROPERTY(VisibleAnywhere, AdvancedDisplay, Category="软件装配")
	FString SharedBinaryHash;
#if WITH_EDITOR
	virtual FName GetDefaultNodeName() const override { return TEXT("BranchForgePreview"); }
	virtual FText GetDefaultNodeTitle() const override { return FText::FromString(TEXT("BranchForge 整树预览")); }
	virtual FText GetNodeTooltipText() const override { return FText::FromString(TEXT("预览枝干与完整枝。存在软件装配附件时读取实际几何，保留实例粗细和枝内叶果；替换源槽的枝类改用新网格。树形变化请在软件重新导出。")); }
	virtual EPCGSettingsType GetType() const override { return EPCGSettingsType::Spatial; }
	virtual TArray<EPVRenderType> GetDefaultRenderType() const override { return { EPVRenderType::Mesh, EPVRenderType::Foliage }; }
	virtual TArray<EPVRenderType> GetSupportedRenderTypes() const override { return GetDefaultRenderType(); }
	virtual TArray<EPVRenderType> GetCurrentRenderTypes() const override { return CurrentRenderTypes.IsEmpty() ? GetDefaultRenderType() : CurrentRenderTypes; }
	virtual TMap<UObject*, FTransform> GetViewportObjects() const override { return {}; }
	virtual void SetCurrentRenderType(TArray<EPVRenderType> InRenderTypes) override { CurrentRenderTypes = MoveTemp(InRenderTypes); }
	virtual const FPVDebugSettings& GetDebugVisualizationSettings() const override { return DebugVisualization; }
	virtual ELevelViewportType GetPreferredViewportType() const override { return ELevelViewportType::LVT_None; }
	virtual bool IsDebug() const override { return false; }
	virtual bool IsCollectionRenderingEnabled() const override { return true; }
	virtual bool IsVisualizationCollectionsRenderingEnabled() const override { return false; }
#endif

protected:
	virtual TArray<FPCGPinProperties> InputPinProperties() const override;
	virtual TArray<FPCGPinProperties> OutputPinProperties() const override;
	virtual FPCGElementPtr CreateElement() const override;

private:
	UPROPERTY()
	TArray<EPVRenderType> CurrentRenderTypes;
	FPVDebugSettings DebugVisualization;
};

class FPVBranchForgePreviewElement : public IPCGElement
{
protected:
	virtual bool CanExecuteOnlyOnMainThread(FPCGContext* Context) const override { return true; }
	virtual bool ExecuteInternal(FPCGContext* Context) const override;
};
