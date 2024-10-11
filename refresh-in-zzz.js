const koffi = require("koffi");

// Load the windows libraries
const psapi = koffi.load("psapi.dll");
const user32 = koffi.load("user32.dll");
const kernel32 = koffi.load("kernel32.dll");

// Koffi types
const DWORD = koffi.alias('DWORD', 'uint32_t');
const HANDLE = koffi.pointer('HANDLE', koffi.opaque());
const HWND = koffi.alias('HWND', HANDLE);
const LPSTR = koffi.alias("LPSTR", "char *");
const LPDWORD = koffi.alias("LPDWORD", koffi.pointer('uint32_t'));

// Koffi structs
const MOUSEINPUT = koffi.struct("MOUSEINPUT", {
    dx: "long",
    dy: "long",
    mouseData: "uint32_t",
    dwFlags: "uint32_t",
    time: "uint32_t",
    dwExtraInfo: "uintptr_t",
});

const KEYBDINPUT = koffi.struct("KEYBDINPUT", {
    wVk: "uint16_t",
    wScan: "uint16_t",
    dwFlags: "uint32_t",
    time: "uint32_t",
    dwExtraInfo: "uintptr_t",
});

const HARDWAREINPUT = koffi.struct("HARDWAREINPUT", {
    uMsg: "uint32_t",
    wParamL: "uint16_t",
    wParamH: "uint16_t",
});

const INPUT = koffi.struct("INPUT", {
    type: "uint32_t",
    u: koffi.union({
    mi: MOUSEINPUT,
    ki: KEYBDINPUT,
    hi: HARDWAREINPUT,
    }),
});

// Constants
const INPUT_KEYBOARD = 1;
const KEYEVENTF_KEYDOWN = 0x0000;
const KEYEVENTF_KEYUP = 0x0002;
const KEYEVENTF_SCANCODE = 0x0008;

// Windows functions
// https://learn.microsoft.com/en-us/windows/win32/api/psapi/nf-psapi-enumprocesses
const EnumProcesses = psapi.func('bool __stdcall EnumProcesses(_Out_ DWORD *lpidProcess, DWORD cb, _Out_ LPDWORD lpcbNeeded)');
// https://learn.microsoft.com/es-es/windows/win32/api/psapi/nf-psapi-getprocessimagefilenamea?redirectedfrom=MSDN
const GetProcessImageFileNameA = psapi.func('DWORD __stdcall GetProcessImageFileNameA(HANDLE hProcess, _Out_ LPSTR lpBaseName, DWORD nSize)');

// https://learn.microsoft.com/en-us/windows/win32/api/processthreadsapi/nf-processthreadsapi-openprocess
const OpenProcess = kernel32.func('HANDLE __stdcall OpenProcess(DWORD dwDesiredAccess, bool bInheritHandle, DWORD dwProcessId)');
// https://learn.microsoft.com/en-us/windows/win32/api/handleapi/nf-handleapi-closehandle
const CloseHandle = kernel32.func('bool __stdcall CloseHandle(HANDLE hObject)');
// https://learn.microsoft.com/en-us/windows/win32/api/errhandlingapi/nf-errhandlingapi-getlasterror
const GetLastError = kernel32.func('DWORD __stdcall GetLastError()');

// https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-getparent
const GetParent = user32.func('HWND __stdcall GetParent(HWND hWnd)');
// https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-gettopwindow
const GetTopWindow = user32.func('HWND __stdcall GetTopWindow(HWND hWnd)');
// https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-iswindowvisible
const IsWindowVisible = user32.func('bool __stdcall IsWindowVisible(HWND hWnd)');
// https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-getnextwindow
const GetNextWindow = user32.func('HWND __stdcall GetWindow(HWND hWnd, uint wCmd)');
// https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-setforegroundwindow
const SetForegroundWindow = user32.func("bool __stdcall SetForegroundWindow(HWND hWnd)");
// https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-sendinput
const SendInput = user32.func('unsigned int __stdcall SendInput(unsigned int cInputs, INPUT *pInputs, int cbSize)');
// https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-findwindowexw
const FindWindowExW = user32.func("__stdcall", "FindWindowExW", "HWND", ["HWND", "HWND", "char16_t *", "char16_t *"]);
// https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-getwindowthreadprocessid
const GetWindowThreadProcessId = user32.func('DWORD __stdcall GetWindowThreadProcessId(HWND hWnd, _Out_ DWORD *lpdwProcessId)');

// Utility function
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Get process by the proccess name function
const getProcessByName = function(name) {

    const PROCESS_QUERY_INFORMATION = 0x0400;
    const PROCESS_VM_READ = 0x0010;
    const LENGTH = 1024;
    const BYTE_SIZE = 4;

    const processes = [];

    let processList = Array(LENGTH).fill(null);
    let lpcbNeeded = [null];

    const enumProcessesResult = EnumProcesses(processList, LENGTH * BYTE_SIZE, lpcbNeeded);

    if(enumProcessesResult == 0) {
        console.log("EnumProcesses error: ", GetLastError());
        return processes;
    }

    const numberOfProcesses = lpcbNeeded[0] / BYTE_SIZE;

    for (let i = 0; i < numberOfProcesses; i++) {
        let processPid = processList[i];
        const processHandle = OpenProcess(PROCESS_QUERY_INFORMATION | PROCESS_VM_READ, false, processPid);

        if (processHandle) {
            let processName = ['\0'.repeat(LENGTH + 1)];
            const GetProcessImageFileNameAResult = GetProcessImageFileNameA(processHandle, processName, LENGTH);

            if(GetProcessImageFileNameAResult == 0) {
                console.log("GetProcessImageFileNameA error (pid " + processPid + "): ", GetLastError());
            }

            processes.push({pid: processPid, name: processName[0].split("\\").at(-1)});

            CloseHandle(processHandle);
        }
    }
    
    return processes.filter(e => e.name === name);
}

// Get the window handle by the process pid
const getProcessWindow = function(dwProcessID) {
    const GW_HWNDNEXT = 2;

    let winNextIt = GetTopWindow(0);
    let found = false;

    while (winNextIt) {
        let ptr = [null];
        let theardId = GetWindowThreadProcessId(winNextIt, ptr);
        pid = ptr[0];

        if (theardId != 0) {
            if (pid == dwProcessID && GetParent(winNextIt) == null && IsWindowVisible(winNextIt)) {
                found = true;
                break;
            }
        }
        winNextIt = GetNextWindow(winNextIt, GW_HWNDNEXT);
    }

    return found ? winNextIt : null;
}

// Get the window handle by the title
const getWindowByTitles = function(titles = []) {
    for(let windowTitle of titles) {
        const hwnd = FindWindowExW(0, null, null, windowTitle);

        if(hwnd) {
            return hwnd;
        } else {
            console.log("FindWindowExW error (title " + windowTitle + "): ", GetLastError());
        }
    }
}

// Get the target game window
const getGameWindow = function() {

    // Process name. Should be changed to a configurable option or read
    // from the 3DMigoto config so this can work while managing other games
    const processName = "ZenlessZoneZero.exe";

    // Get the process from the name
    const process = getProcessByName(processName);

    if (process.length > 0) {
        // Get the Zenless Zone Zero Hwnd handle
        const window = getProcessWindow(process[0].pid);

        if(window) {
            return window;
        }
    }

    // Posible window titles, just in case the process way fails.
    const windowTitles = ["ZenlessZoneZero", "绝區零", "絕區零"];

    // If failed to get by process name, try with window name
    const window = getWindowByTitles(windowTitles);

    if(window) {
        return window;
    }

    return null;
}

// Create a kyeboard event for a Direct Input Key
function makeKeyboardEventDik(vk, down) {
    let event = {
        type: INPUT_KEYBOARD,
        u: {
            ki: {
                wVk: 0,
                wScan: vk,
                dwFlags: down ? (KEYEVENTF_KEYDOWN | KEYEVENTF_SCANCODE) : (KEYEVENTF_KEYUP | KEYEVENTF_SCANCODE),
                time: 0,
                dwExtraInfo: 0,
            },
        },
    };

    return event;
}

// Press a key on the keyboard
const pressDirectInputKey = function(keyCode) {
    return SendInput(1, [makeKeyboardEventDik(keyCode, true)], koffi.sizeof(INPUT)) > 0;
}

// Release a key on the keyboard
const releaseDirectInputKey = function(keyCode) {
    return SendInput(1, [makeKeyboardEventDik(keyCode, false)], koffi.sizeof(INPUT)) > 0;
}

// Main refresh function
const refresh = async function () {
    let refreshInZzzSuccess = false;

    // Direct input key code for F10. This key is the default but
    // can be changed in d3dx.ini. Future improvement.
    const DIK_F10 = 0x44;

    // Gets the game window. First tries with the process name,
    // then with the window name if the first fails.
    const window = getGameWindow();

    // If we have a window and can set it to the foreground
    if(window && SetForegroundWindow(window)) {

        // Wait for the window to come into focus
        await sleep(100);

        // Press the F10 Key down
        if(pressDirectInputKey(DIK_F10)) {
            await sleep(75);

            // Release the F10 Key
            if(releaseDirectInputKey(DIK_F10)) {
                refreshInZzzSuccess = true;
            }
        }
    }

    return refreshInZzzSuccess;
};

module.exports = {
    refresh,
}; 