// Own off-desktop window; never attaches to or controls an editor window.
#define WIN32_LEAN_AND_MEAN
#define NOMINMAX
#include <windows.h>
#include <filesystem>
#include <fstream>
#include <vector>
#include <array>
#include <string>
#include <chrono>
#include "nlohmann/json.hpp"
using Json=nlohmann::json;
int wmain(int argc,wchar_t** argv){
 if(argc!=4)return 2;const std::filesystem::path folder=std::filesystem::absolute(argv[1]),input=std::filesystem::absolute(argv[2]),out=std::filesystem::absolute(argv[3]);std::filesystem::create_directories(out);
 WNDCLASSW wc{};wc.lpfnWndProc=DefWindowProcW;wc.hInstance=GetModuleHandleW(nullptr);wc.lpszClassName=L"BranchForgeOffDesktopSequenceVerify";RegisterClassW(&wc);HWND window=CreateWindowExW(0,wc.lpszClassName,L"BranchForge background transport verification",WS_OVERLAPPEDWINDOW,-28000,-28000,640,480,nullptr,nullptr,wc.hInstance,nullptr);
 HMODULE dll=LoadLibraryExW((folder/L"BranchForgeViewport.dll").c_str(),nullptr,LOAD_LIBRARY_SEARCH_DLL_LOAD_DIR|LOAD_LIBRARY_SEARCH_DEFAULT_DIRS);if(!window||!dll)return 3;
 auto create=reinterpret_cast<void*(__cdecl*)(HWND,const wchar_t*,const wchar_t*)>(GetProcAddress(dll,"BFViewportCreate"));auto destroy=reinterpret_cast<void(__cdecl*)(void*)>(GetProcAddress(dll,"BFViewportDestroy"));auto submit=reinterpret_cast<int(__cdecl*)(void*,const void*,unsigned)>(GetProcAddress(dll,"BFViewportSubmit"));auto resize=reinterpret_cast<void(__cdecl*)(void*,int,int)>(GetProcAddress(dll,"BFViewportResize"));auto pause=reinterpret_cast<void(__cdecl*)(void*,int)>(GetProcAddress(dll,"BFViewportPause"));auto status=reinterpret_cast<unsigned(__cdecl*)(void*,char*,unsigned)>(GetProcAddress(dll,"BFViewportStatus"));auto capture=reinterpret_cast<void(__cdecl*)(void*,const wchar_t*)>(GetProcAddress(dll,"BFViewportCapture"));
 if(!create||!destroy||!submit||!resize||!pause||!status||!capture)return 4;void* view=create(window,folder.c_str(),out.c_str());if(!view)return 5;bool success=true;Json report=Json::array();
 try{std::ifstream commands(input);const auto config=Json::parse(commands);const auto& steps=config.is_array()?config:config.at("steps");const auto output=config.is_array()?std::array<int,2>{640,480}:config.value("output",std::array<int,2>{640,480});resize(view,output[0],output[1]);pause(view,0);UINT64 packets=0;for(const auto& step:steps){std::ifstream file(input.parent_path()/step.at("packet").get<std::string>(),std::ios::binary);std::vector<uint8_t> bytes((std::istreambuf_iterator<char>(file)),{});if(bytes.empty()||!submit(view,bytes.data(),unsigned(bytes.size())))throw std::runtime_error("Sequence packet rejected");packets++;
  const auto started=std::chrono::steady_clock::now();bool requested=false,complete=false;UINT64 captures=0;Json state;char text[16384]{};
  while(std::chrono::steady_clock::now()-started<std::chrono::seconds(45)){MSG message;while(PeekMessageW(&message,nullptr,0,0,PM_REMOVE)){TranslateMessage(&message);DispatchMessageW(&message);}status(view,text,sizeof(text));state=Json::parse(text);if(state.contains("error"))throw std::runtime_error(state.at("error").get<std::string>());
   if(state.value("received_packets",UINT64(0))>=packets&&step.value("stageOnly",false)){complete=true;break;}
   if(!requested&&state.value("received_packets",UINT64(0))>=packets&&state.value("revision",UINT64(0))==step.at("revision").get<UINT64>()&&state.value("graph_revision",UINT64(0))==step.at("graph").get<UINT64>()&&state.value("requires_full_scene",false)==step.value("requires",false)&&state.value("frames",UINT64(0))>0){if(!step.contains("capture")){complete=true;break;}captures=state.value("captures",UINT64(0));capture(view,(out/(step.at("capture").get<std::string>()+".png")).c_str());requested=true;}
   if(requested&&state.value("captures",UINT64(0))>captures){complete=true;break;}Sleep(10);
  }report.push_back({{"step",step},{"status",state}});if(!complete)throw std::runtime_error("Sequence state or capture timed out");
 }}catch(const std::exception& error){success=false;report.push_back({{"failure",error.what()}});}
 destroy(view);FreeLibrary(dll);DestroyWindow(window);std::ofstream result(out/L"sequence.json");result<<report.dump(2);return success?0:1;
}
