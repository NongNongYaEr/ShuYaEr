#pragma once

#include "Commandlets/Commandlet.h"
#include "PVEWorkflowCommandlet.generated.h"

UCLASS()
class UPVEWorkflowCommandlet : public UCommandlet
{
	GENERATED_BODY()

public:
	UPVEWorkflowCommandlet();
	virtual int32 Main(const FString& Params) override;
};
