// Off-desktop ABI/visual acceptance runner; never activates or controls windows.
#define WIN32_LEAN_AND_MEAN
#define NOMINMAX
#include <windows.h>
#include <filesystem>
#include <fstream>
#include <vector>
#include <string>
#include <chrono>
int wmain(int argc,wchar_t** argv){
 if(argc!=4)return 2;const std::filesystem::path folder=std::filesystem::absolute(argv[1]),packetPath=std::filesystem::absolute(argv[2]),out=std::filesystem::absolute(argv[3]);std::filesystem::create_directories(out);
 WNDCLASSW wc{};wc.lpfnWndProc=DefWindowProcW;wc.hInstance=GetModuleHandleW(nullptr);wc.lpszClassName=L"BranchForgeOffDesktopVerify";RegisterClassW(&wc);HWND window=CreateWindowExW(0,wc.lpszClassName,L"BranchForge background renderer verification",WS_OVERLAPPEDWINDOW,-28000,-28000,640,480,nullptr,nullptr,wc.hInstance,nullptr);
 HMODULE dll=LoadLibraryExW((folder/L"BranchForgeViewport.dll").c_str(),nullptr,LOAD_LIBRARY_SEARCH_DLL_LOAD_DIR|LOAD_LIBRARY_SEARCH_DEFAULT_DIRS);if(!window||!dll)return 3;
 auto create=reinterpret_cast<void*(__cdecl*)(HWND,const wchar_t*,const wchar_t*)>(GetProcAddress(dll,"BFViewportCreate"));auto destroy=reinterpret_cast<void(__cdecl*)(void*)>(GetProcAddress(dll,"BFViewportDestroy"));auto submit=reinterpret_cast<int(__cdecl*)(void*,const void*,unsigned)>(GetProcAddress(dll,"BFViewportSubmit"));auto resize=reinterpret_cast<void(__cdecl*)(void*,int,int)>(GetProcAddress(dll,"BFViewportResize"));auto pause=reinterpret_cast<void(__cdecl*)(void*,int)>(GetProcAddress(dll,"BFViewportPause"));auto status=reinterpret_cast<unsigned(__cdecl*)(void*,char*,unsigned)>(GetProcAddress(dll,"BFViewportStatus"));auto capture=reinterpret_cast<void(__cdecl*)(void*,const wchar_t*)>(GetProcAddress(dll,"BFViewportCapture"));
 if(!create||!destroy||!submit||!resize||!pause||!status||!capture)return 4;void* view=create(window,folder.c_str(),out.c_str());if(!view)return 5;resize(view,640,480);pause(view,0);
 std::ifstream input(packetPath,std::ios::binary);std::vector<uint8_t> bytes((std::istreambuf_iterator<char>(input)),{});if(!submit(view,bytes.data(),unsigned(bytes.size()))){destroy(view);return 6;}
 const auto started=std::chrono::steady_clock::now();bool requested=false,success=false;char report[16384]{};
 while(std::chrono::steady_clock::now()-started<std::chrono::seconds(45)){
  MSG message;while(PeekMessageW(&message,nullptr,0,0,PM_REMOVE)){TranslateMessage(&message);DispatchMessageW(&message);}status(view,report,sizeof(report));std::string text(report);if(text.find("\"error\"")!=std::string::npos)break;
  if(!requested&&text.find("\"frames\":0,")==std::string::npos&&text.find("\"frames\"")!=std::string::npos){capture(view,(out/L"frame.png").c_str());requested=true;}
  if(text.find("\"capture_complete\":true")!=std::string::npos){success=true;break;}Sleep(20);
 }
 std::ofstream result(out/L"status.json",std::ios::binary);result<<report;result.close();destroy(view);FreeLibrary(dll);DestroyWindow(window);return success?0:1;
}
