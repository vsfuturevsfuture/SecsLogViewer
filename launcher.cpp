/* SecsLogViewer - single exe launcher (HTML embedded, nothing else shipped)
 *
 * Build (from a VS "Developer Command Prompt"):
 *     cl /nologo /O2 /MT launcher.cpp /link user32.lib shell32.lib /OUT:SecsLogViewer.exe
 *
 * The page comes from secs_log_html.h, generated with:
 *     xxd -i -n secs_log_html index.html > secs_log_html.h
 * (see make_header.bat if you do not want to type the git-bash command)
 *
 * At run time the bytes are written to %TEMP%\secs_log_viewer.html
 * (fallback: next to the exe) and opened with the default browser.
 */
#include <windows.h>
#include "secs_log_html.h"

#define TEMP_HTML_NAME "secs_log_viewer.html"
#define APP_TITLE      "SecsLogViewer"

/* Try %TEMP% first, then the folder the exe lives in. */
static BOOL build_output_path(char *out, DWORD cch) {
    char dir[MAX_PATH];
    DWORD n = GetTempPathA(MAX_PATH, dir);
    if (n == 0 || n >= MAX_PATH) dir[0] = '\0';

    if (dir[0] != '\0') {
        lstrcpynA(out, dir, cch);
        if (out[lstrlenA(out) - 1] != '\\') lstrcatA(out, "\\");
    } else {
        DWORD m = GetModuleFileNameA(NULL, out, cch);
        if (m == 0 || m >= cch) return FALSE;
        char *slash = out + lstrlenA(out);
        while (slash > out && slash[-1] != '\\' && slash[-1] != '/') slash--;
        *slash = '\0';
    }
    if (lstrlenA(out) + lstrlenA(TEMP_HTML_NAME) + 1 >= (int)cch) return FALSE;
    lstrcatA(out, TEMP_HTML_NAME);
    return TRUE;
}

int WINAPI WinMain(HINSTANCE hInst, HINSTANCE, LPSTR, int) {
    char path[MAX_PATH];
    if (!build_output_path(path, MAX_PATH)) {
        MessageBoxA(NULL, "Cannot build the output path.", APP_TITLE, MB_ICONHAND);
        return 1;
    }

    HANDLE hFile = CreateFileA(path, GENERIC_WRITE, FILE_SHARE_READ | FILE_SHARE_WRITE, NULL,
        CREATE_ALWAYS, FILE_ATTRIBUTE_NORMAL, NULL);
    if (hFile == INVALID_HANDLE_VALUE) {
        char msg[MAX_PATH + 64];
        wsprintfA(msg, "Failed to create the html file.\r\n\r\n%s", path);
        MessageBoxA(NULL, msg, APP_TITLE, MB_ICONHAND);
        return 1;
    }

    DWORD written = 0;
    BOOL ok = WriteFile(hFile, secs_log_html, secs_log_html_len, &written, NULL);
    CloseHandle(hFile);
    if (!ok || written != secs_log_html_len) {
        MessageBoxA(NULL, "Failed to write the embedded html.", APP_TITLE, MB_ICONHAND);
        return 1;
    }

#ifdef SECSLOG_SELFTEST
    return 0;   /* self-test build: write the file only, do not open a browser */
#else
    HINSTANCE rc = ShellExecuteA(NULL, "open", path, NULL, NULL, SW_SHOW);
    if ((INT_PTR)rc <= 32) {
        char msg[MAX_PATH + 96];
        wsprintfA(msg, "Failed to open the default browser (code %d).\r\n\r\nYou can open it manually:\r\n%s",
            (int)(INT_PTR)rc, path);
        MessageBoxA(NULL, msg, APP_TITLE, MB_ICONHAND);
        return 1;
    }
    return 0;
#endif
}
