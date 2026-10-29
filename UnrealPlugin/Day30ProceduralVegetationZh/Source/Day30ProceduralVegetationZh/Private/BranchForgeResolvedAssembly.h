#pragma once

#include "CoreMinimal.h"

struct FManagedArrayCollection;
class UPVBranchForgePreviewSettings;

bool BuildBranchForgeResolvedAssembly(const FManagedArrayCollection& Input,
	const UPVBranchForgePreviewSettings& Settings, FManagedArrayCollection& Output, FString& Error);
