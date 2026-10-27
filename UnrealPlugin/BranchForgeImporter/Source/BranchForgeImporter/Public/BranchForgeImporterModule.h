#pragma once

#include "CoreMinimal.h"
#include "HAL/IConsoleManager.h"
#include "Modules/ModuleManager.h"

class FBranchForgeImporterModule final : public IModuleInterface
{
public:
    virtual void StartupModule() override;
    virtual void ShutdownModule() override;

private:
    void RegisterMenus();
    void PromptForImportScript();
    void ImportFromConsole(const TArray<FString>& Arguments);
    bool ExecuteImportScript(const FString& ScriptPath) const;

    TUniquePtr<FAutoConsoleCommand> ImportCommand;
};
