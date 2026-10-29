// Invoke the installed PVE editor's exporter; do not implement a second mesh baker.
#include "Editor.h"
#include "BranchForgeExportRouting.h"
#include "Containers/Ticker.h"
#include "Framework/Application/SlateApplication.h"
#include "Framework/Commands/InputBindingManager.h"
#include "Framework/Commands/UICommandList.h"
#include "HAL/IConsoleManager.h"
#include "HAL/FileManager.h"
#include "Misc/FileHelper.h"
#include "Misc/Paths.h"
#include "ProceduralVegetation.h"
#include "PCGNode.h"
#include "Subsystems/AssetEditorSubsystem.h"
#include "Toolkits/AssetEditorToolkit.h"
#include "Widgets/Input/SButton.h"
#include "Widgets/SWindow.h"
#include "UObject/UnrealType.h"
#include "Params/PVExportParams.h"

namespace BranchForgeNativeExport
{
static bool bBusy = false;

static void WriteStatus(const FString& Asset, const TCHAR* Status, bool Confirmed = false)
{
    const FString Directory = FPaths::ProjectSavedDir() / TEXT("PVEWorkflow/Exports");
    IFileManager::Get().MakeDirectory(*Directory, true);
    const FString Json = FString::Printf(TEXT("{\"asset\":\"%s\",\"status\":\"%s\",\"confirmed\":%s}"),
        *Asset.ReplaceCharWithEscapedChar(), Status, Confirmed ? TEXT("true") : TEXT("false"));
    FFileHelper::SaveStringToFile(Json, *(Directory / TEXT("native_export_status.json")), FFileHelper::EEncodingOptions::ForceUTF8WithoutBOM);
}

static TSharedPtr<SButton> FindExportButton(const TSharedRef<SWidget>& Widget)
{
    // Only the primary button inside the exact native PVE export dialog.
    if (Widget->GetType() == TEXT("SPrimaryButton"))
        return StaticCastSharedRef<SButton>(Widget);
    FChildren* Children = Widget->GetChildren();
    for (int32 Index = 0; Children && Index < Children->Num(); ++Index)
        if (auto Found = FindExportButton(Children->GetChildAt(Index))) return Found;
    return nullptr;
}

static void Run(const TArray<FString>& Args, bool bSkeletal)
{
    if (bBusy || Args.Num() != 1 || !GEditor || !FSlateApplication::IsInitialized())
    {
        UE_LOG(LogTemp, Error, TEXT("BranchForge native export requires one PVE asset path and an idle editor."));
        return;
    }
    UProceduralVegetation* Asset = LoadObject<UProceduralVegetation>(nullptr, *Args[0]);
    if (!Asset || !Asset->GetGraph()) return;
    if (RouteImportedTrunkExport(Asset)) return;
    UPCGGraph* Graph = Asset->GetGraph()->GetGraph();
    int32 ExportCount = 0;
    for (UPCGNode* Node : Graph->GetNodes())
    {
        UObject* Settings = Node->GetSettings();
        if (Settings->GetClass()->GetFName() != TEXT("PVExportSettings")) continue;
        ++ExportCount;
        FStructProperty* Property = FindFProperty<FStructProperty>(Settings->GetClass(), TEXT("ExportSettings"));
        const FPVExportParams* Params = Property ? Property->ContainerPtrToValuePtr<FPVExportParams>(Settings) : nullptr;
        FString Error;
        if (!Params || Params->ExportMeshType != (bSkeletal ? EPVExportMeshType::SkeletalMesh : EPVExportMeshType::StaticMesh) ||
            (!bSkeletal && Params->ReplacePolicy != EPVAssetReplacePolicy::Append) || !Params->Validate(Error))
        {
            UE_LOG(LogTemp, Error, TEXT("BranchForge native export has incompatible mesh type or replacement settings: %s"), *Error);
            return;
        }
    }
    if (ExportCount != 1 || FSlateApplication::Get().GetActiveModalWindow())
    {
        UE_LOG(LogTemp, Error, TEXT("BranchForge automatic export requires exactly one export node and no existing modal dialog."));
        return;
    }
    auto* Editor = GEditor->GetEditorSubsystem<UAssetEditorSubsystem>()->FindEditorForAsset(Asset, true);
    auto Command = FInputBindingManager::Get().FindCommandInContext(TEXT("PVPCGEditor"), TEXT("Export"));
    if (!Editor || !Command.IsValid())
    {
        UE_LOG(LogTemp, Error, TEXT("Open the PVE asset and wait for generation before automatic export."));
        return;
    }
    auto* Toolkit = static_cast<FAssetEditorToolkit*>(Editor);
    auto Commands = Toolkit->GetToolkitCommands();
    if (!Commands->CanExecuteAction(Command.ToSharedRef())) return;
    bBusy = true;
    const FString AssetPath = Asset->GetPathName();
    WriteStatus(AssetPath, TEXT("queued"));
    // Dispatch outside the HTTP/console call; the native exporter uses a modal loop.
    FTSTicker::GetCoreTicker().AddTicker(FTickerDelegate::CreateLambda([Commands, Command, AssetPath](float)
    {
        struct FDialogState { double Start = FPlatformTime::Seconds(); bool Clicked = false; FDelegateHandle Handle; };
        auto State = MakeShared<FDialogState>();
        State->Handle = FSlateApplication::Get().OnPreTick().AddLambda([State](float)
        {
            auto Window = FSlateApplication::Get().GetActiveModalWindow();
            if (!Window || StaticCastSharedPtr<SWidget>(Window)->GetType() != TEXT("SPVExportSelectionDialog")) return;
            auto Button = FindExportButton(Window.ToSharedRef());
            if (Button && Button->IsEnabled())
            {
                FSlateApplication::Get().OnPreTick().Remove(State->Handle);
                State->Clicked = true;
                Button->SimulateClick();
            }
            else if (FPlatformTime::Seconds() - State->Start > 20.0)
            {
                FSlateApplication::Get().OnPreTick().Remove(State->Handle);
                Window->RequestDestroyWindow();
                UE_LOG(LogTemp, Error, TEXT("BranchForge PVE export dialog has no enabled export button; generation may be incomplete."));
            }
        });
        UE_LOG(LogTemp, Display, TEXT("BRANCHFORGE_NATIVE_EXPORT_START"));
        WriteStatus(AssetPath, TEXT("running"));
        Commands->ExecuteAction(Command.ToSharedRef());
        FSlateApplication::Get().OnPreTick().Remove(State->Handle);
        bBusy = false;
        WriteStatus(AssetPath, TEXT("returned"), State->Clicked);
        UE_LOG(LogTemp, Display, TEXT("BRANCHFORGE_NATIVE_EXPORT_RETURN confirmed=%d (verify resulting asset separately)"), State->Clicked);
        return false;
    }));
}

static FAutoConsoleCommand Command(TEXT("BranchForge.ExportStaticMesh"),
    TEXT("Export one open, generated PVE asset through its native exporter. Requires StaticMesh and Append; never confirms overwrite dialogs."),
    FConsoleCommandWithArgsDelegate::CreateLambda([](const TArray<FString>& Args) { Run(Args, false); }));

static FAutoConsoleCommand SkeletalCommand(TEXT("BranchForge.ExportSkeletalMesh"),
    TEXT("Export one open, generated PVE asset as a skeletal mesh through its native exporter. Existing-asset overwrite dialogs remain interactive."),
    FConsoleCommandWithArgsDelegate::CreateLambda([](const TArray<FString>& Args) { Run(Args, true); }));
}
