#pragma once

#include "PCGSettings.h"
#include "PCGContext.h"
#include "PVBranchForgeBindingSettings.generated.h"

struct FManagedArrayCollection;

/** Match native PVE bone intervals before exposing mesh data to the exporter. */
bool BindBranchForgeFoliage(FManagedArrayCollection& Collection, FString& Error, int32* OutJunctionAdjustments = nullptr);

UCLASS(ClassGroup=(Procedural))
class UPVBranchForgeBindingSettings : public UPCGSettings
{
	GENERATED_BODY()
public:
#if WITH_EDITOR
	virtual FName GetDefaultNodeName() const override { return TEXT("BranchForgeBinding"); }
	virtual FText GetDefaultNodeTitle() const override { return FText::FromString(TEXT("BranchForge 骨骼挂接校验")); }
	virtual FText GetNodeTooltipText() const override { return FText::FromString(TEXT("在骨骼精简之后校验枝叶挂接；绑定无效时阻止导出。")); }
	virtual EPCGSettingsType GetType() const override { return EPCGSettingsType::Spatial; }
#endif
protected:
	virtual TArray<FPCGPinProperties> InputPinProperties() const override;
	virtual TArray<FPCGPinProperties> OutputPinProperties() const override;
	virtual FPCGElementPtr CreateElement() const override;
};

class FPVBranchForgeBindingElement : public IPCGElement
{
protected:
	virtual bool ExecuteInternal(FPCGContext* Context) const override;
};
