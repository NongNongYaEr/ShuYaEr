#include "BranchForgeImporterModule.h"

#include "DesktopPlatformModule.h"
#include "Framework/Application/SlateApplication.h"
#include "IDesktopPlatform.h"
#include "IPythonScriptPlugin.h"
#include "Misc/Paths.h"
#include "ToolMenus.h"

#define LOCTEXT_NAMESPACE "FBranchForgeImporterModule"

DEFINE_LOG_CATEGORY_STATIC(LogBranchForgeImporter, Log, All);

void FBranchForgeImporterModule::StartupModule()
{
    ImportCommand = MakeUnique<FAutoConsoleCommand>(
        TEXT("BranchForge.Import"),
        TEXT("Import a BranchForge package using its .ue-import.py sidecar."),
        FConsoleCommandWithArgsDelegate::CreateRaw(this, &FBranchForgeImporterModule::ImportFromConsole));

    UToolMenus::RegisterStartupCallback(
        FSimpleMulticastDelegate::FDelegate::CreateRaw(this, &FBranchForgeImporterModule::RegisterMenus));
}

void FBranchForgeImporterModule::ShutdownModule()
{
    ImportCommand.Reset();
    if (UToolMenus::IsToolMenuUIEnabled())
    {
        UToolMenus::UnRegisterStartupCallback(this);
        UToolMenus::UnregisterOwner(this);
    }
}

void FBranchForgeImporterModule::RegisterMenus()
{
    FToolMenuOwnerScoped OwnerScoped(this);
    UToolMenu* ToolsMenu = UToolMenus::Get()->ExtendMenu(TEXT("LevelEditor.MainMenu.Tools"));
    FToolMenuSection& Section = ToolsMenu->FindOrAddSection(TEXT("BranchForge"));
    Section.AddMenuEntry(
        TEXT("BranchForgeImportPackage"),
        LOCTEXT("ImportPackageLabel", "Import BranchForge Package..."),
        LOCTEXT("ImportPackageTooltip", "Select a BranchForge .ue-import.py file and import its FBX and LOD files."),
        FSlateIcon(),
        FUIAction(FExecuteAction::CreateRaw(this, &FBranchForgeImporterModule::PromptForImportScript)));
}

void FBranchForgeImporterModule::PromptForImportScript()
{
    IDesktopPlatform* DesktopPlatform = FDesktopPlatformModule::Get();
    if (!DesktopPlatform)
    {
        UE_LOG(LogBranchForgeImporter, Error, TEXT("DesktopPlatform is unavailable."));
        return;
    }

    const void* ParentWindowHandle = nullptr;
    if (FSlateApplication::IsInitialized())
    {
        ParentWindowHandle = FSlateApplication::Get().FindBestParentWindowHandleForDialogs(nullptr);
    }

    TArray<FString> SelectedFiles;
    const bool bSelected = DesktopPlatform->OpenFileDialog(
        ParentWindowHandle,
        TEXT("Import BranchForge Package"),
        FPaths::ProjectDir(),
        TEXT(""),
        TEXT("BranchForge Import Script (*.ue-import.py)|*.ue-import.py|Python Script (*.py)|*.py"),
        EFileDialogFlags::None,
        SelectedFiles);

    if (bSelected && SelectedFiles.Num() > 0)
    {
        ExecuteImportScript(SelectedFiles[0]);
    }
}

void FBranchForgeImporterModule::ImportFromConsole(const TArray<FString>& Arguments)
{
    if (Arguments.IsEmpty())
    {
        UE_LOG(LogBranchForgeImporter, Warning, TEXT("Usage: BranchForge.Import <absolute path to .ue-import.py>"));
        return;
    }
    ExecuteImportScript(FString::Join(Arguments, TEXT(" ")));
}

bool FBranchForgeImporterModule::ExecuteImportScript(const FString& ScriptPath) const
{
    FString AbsolutePath = FPaths::ConvertRelativePathToFull(ScriptPath);
    FPaths::NormalizeFilename(AbsolutePath);
    if (!FPaths::FileExists(AbsolutePath))
    {
        UE_LOG(LogBranchForgeImporter, Error, TEXT("Import script does not exist: %s"), *AbsolutePath);
        return false;
    }

    const FString EscapedPath = AbsolutePath.Replace(TEXT("'"), TEXT("\\'"));
    const FString PythonCommand = FString::Printf(
        TEXT("exec(compile(open(r'%s', encoding='utf-8').read(), r'%s', 'exec'))"),
        *EscapedPath,
        *EscapedPath);
    const bool bExecuted = IPythonScriptPlugin::Get()->ExecPythonCommand(*PythonCommand);
    UE_LOG(LogBranchForgeImporter, Display, TEXT("BranchForge import %s: %s"), bExecuted ? TEXT("started") : TEXT("failed"), *AbsolutePath);
    return bExecuted;
}

IMPLEMENT_MODULE(FBranchForgeImporterModule, BranchForgeImporter)

#undef LOCTEXT_NAMESPACE
