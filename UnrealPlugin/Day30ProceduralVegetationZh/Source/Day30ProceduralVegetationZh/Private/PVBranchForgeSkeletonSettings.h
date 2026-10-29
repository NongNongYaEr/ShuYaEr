#pragma once

#include "PCGSettings.h"
#include "PCGContext.h"
#include "Commandlets/Commandlet.h"
#include "Nodes/PVRenderSettings.h"
#include "DataTypes/PVData.h"
#include "PVBranchForgeSkeletonSettings.generated.h"

/** Reads the versioned BranchForge skeleton sidecar and produces native PVE growth data. */
UCLASS(BlueprintType, ClassGroup=(Procedural))
class UPVBranchForgeSkeletonSettings : public UPCGSettings, public IPVRenderSettings
{
	GENERATED_BODY()

public:
#if WITH_EDITOR
	virtual FName GetDefaultNodeName() const override { return TEXT("BranchForgeSkeleton"); }
	virtual FText GetDefaultNodeTitle() const override { return FText::FromString(TEXT("BranchForge 骨架")); }
	virtual FText GetNodeTooltipText() const override { return FText::FromString(TEXT("读取 BranchGenerator 导出的 PVE 骨架 JSON。")); }
	virtual EPCGSettingsType GetType() const override { return EPCGSettingsType::Spatial; }
	virtual TArray<EPVRenderType> GetDefaultRenderType() const override { return { EPVRenderType::PointData }; }
	virtual TArray<EPVRenderType> GetSupportedRenderTypes() const override { return { EPVRenderType::PointData }; }
	virtual TArray<EPVRenderType> GetCurrentRenderTypes() const override { return CurrentRenderTypes.IsEmpty() ? GetDefaultRenderType() : CurrentRenderTypes; }
	virtual TMap<UObject*, FTransform> GetViewportObjects() const override { return {}; }
	virtual void SetCurrentRenderType(TArray<EPVRenderType> InRenderTypes) override { CurrentRenderTypes = MoveTemp(InRenderTypes); }
	virtual const FPVDebugSettings& GetDebugVisualizationSettings() const override { return DebugVisualization; }
	virtual ELevelViewportType GetPreferredViewportType() const override { return ELevelViewportType::LVT_None; }
	virtual bool IsDebug() const override { return false; }
	virtual bool IsCollectionRenderingEnabled() const override { return true; }
	virtual bool IsVisualizationCollectionsRenderingEnabled() const override { return false; }
#endif

	UPROPERTY(EditAnywhere, Category="骨架")
	FFilePath SkeletonFile;

	/** Source-index order must match foliage_sources in a version 2 BranchForge JSON. */
	UPROPERTY(EditAnywhere, Category="完整枝", meta=(DisplayName="完整枝网格（按 JSON 枝类顺序）"))
	TArray<TSoftObjectPtr<UObject>> LeafMeshes;

private:
	UPROPERTY()
	TArray<EPVRenderType> CurrentRenderTypes;
	FPVDebugSettings DebugVisualization;

protected:
	virtual TArray<FPCGPinProperties> InputPinProperties() const override { return {}; }
	virtual TArray<FPCGPinProperties> OutputPinProperties() const override;
	virtual FPCGElementPtr CreateElement() const override;
};

class FPVBranchForgeSkeletonElement : public IPCGElement
{
protected:
	virtual bool ExecuteInternal(FPCGContext* Context) const override;
};

/** Headless smoke test for the same JSON-to-growth-data conversion used by the node. */
UCLASS()
class UPVEBranchForgeValidationCommandlet : public UCommandlet
{
	GENERATED_BODY()
public:
	UPVEBranchForgeValidationCommandlet();
	virtual int32 Main(const FString& Params) override;
};
