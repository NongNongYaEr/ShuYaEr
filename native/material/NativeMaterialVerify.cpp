// Persistent offscreen developer runner. No HWND, desktop window or screen access.
#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <filesystem>
#include <vector>
#include <string>
#include <iostream>
#include <chrono>
#include <fcntl.h>
#include <io.h>
int wmain(int argc,wchar_t** argv){if(argc!=2)return 2;_setmode(_fileno(stdin),_O_BINARY);_setmode(_fileno(stdout),_O_BINARY);const auto folder=std::filesystem::absolute(argv[1]);auto dll=LoadLibraryExW((folder/L"TreeMaterialDX12.dll").c_str(),nullptr,LOAD_LIBRARY_SEARCH_DLL_LOAD_DIR|LOAD_LIBRARY_SEARCH_DEFAULT_DIRS);if(!dll)return 3;
 auto create=(void*(__cdecl*)(HWND,const wchar_t*))GetProcAddress(dll,"TMLDX12Create");auto destroy=(void(__cdecl*)(void*))GetProcAddress(dll,"TMLDX12Destroy");auto submit=(int(__cdecl*)(void*,const void*,unsigned,void*,size_t))GetProcAddress(dll,"TMLDX12Submit");auto status=(unsigned(__cdecl*)(void*,char*,unsigned))GetProcAddress(dll,"TMLDX12Status");if(!create||!destroy||!submit||!status)return 4;void* device=create(nullptr,folder.c_str());if(!device)return 5;std::vector<uint8_t> output(4096*4096*4);char info[16384]{};auto send=[&](unsigned size){status(device,info,sizeof(info));const uint32_t n=uint32_t(strlen(info));std::cout.write((const char*)&n,4);std::cout.write(info,n);std::cout.write((const char*)&size,4);if(size)std::cout.write((const char*)output.data(),size);std::cout.flush();};
 auto deadline=std::chrono::steady_clock::now()+std::chrono::seconds(60);for(;;){status(device,info,sizeof(info));if(strstr(info,"\"ready\":true")||strstr(info,"\"error\""))break;if(std::chrono::steady_clock::now()>deadline){destroy(device);return 6;}Sleep(10);}send(0);uint32_t length=0;
 while(std::cin.read((char*)&length,4)){if(!length)break;if(length>128*1024*1024){destroy(device);return 7;}std::vector<uint8_t> bytes(length);if(!std::cin.read((char*)bytes.data(),length))break;status(device,info,sizeof(info));std::string previous(info);if(!submit(device,bytes.data(),length,output.data(),output.size())){destroy(device);return 8;}deadline=std::chrono::steady_clock::now()+std::chrono::seconds(45);for(;;){status(device,info,sizeof(info));if(previous!=info&&strstr(info,"\"completed\""))break;if(std::chrono::steady_clock::now()>deadline){destroy(device);return 9;}Sleep(2);}unsigned size=0;const char* at=strstr(info,"\"outputBytes\":");if(at)size=unsigned(strtoul(at+14,nullptr,10));if(size>output.size()){destroy(device);return 10;}send(size);}
 destroy(device);FreeLibrary(dll);return 0;}
