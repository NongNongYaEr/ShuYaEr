#pragma once

#include "PCGSettings.h"
#include "PCGContext.h"
#include "Nodes/PVRenderSettings.h"
#include "DataTypes/PVData.h"
#include "PVBranchForgeReferenceMeshSettings.generated.h"

class UStaticMesh;

/** Displays the exact BranchGenerator whole-tree mesh beside the editable PVE skeleton. */
UCLASS(BlueprintType, ClassGroup=(Procedural))
class UPVBranchForgeReferenceMeshSettings : public UPCGSettings, public IPVRenderSettings
{
	GENERATED_BODY()

public:
	UPROPERTY(EditAnywhere, Category="BranchForge")
	TSoftObjectPtr<UStaticMesh> SourceMesh;

#if WITH_EDITOR
	virtual FName GetDefaultNodeName() const override { return TEXT("BranchForgeReferenceMesh"); }
	virtual FText GetDefaultNodeTitle() const override { return FText::FromString(TEXT("BranchForge 软件整树对照")); }
	virtual FText GetNodeTooltipText() const override { return FText::FromString(TEXT("显示软件实际生成的整树网格，用于检查 PVE 重建的视觉差异。")); }
	virtual EPCGSettingsType GetType() const override { return EPCGSettingsType::Spatial; }
	virtual TArray<EPVRenderType> GetDefaultRenderType() const override { return { EPVRenderType::Mesh }; }
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
	virtual TArray<FPCGPinProperties> InputPinProperties() const override { return {}; }
	virtual TArray<FPCGPinProperties> OutputPinProperties() const override;
	virtual FPCGElementPtr CreateElement() const override;

private:
	UPROPERTY()
	TArray<EPVRenderType> CurrentRenderTypes;
	FPVDebugSettings DebugVisualization;
};

class FPVBranchForgeReferenceMeshElement : public IPCGElement
{
protected:
	virtual bool CanExecuteOnlyOnMainThread(FPCGContext* Context) const override { return true; }
	virtual bool ExecuteInternal(FPCGContext* Context) const override;
};
