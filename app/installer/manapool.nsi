; ManaPool installer (NSIS). Build with: makensis installer/manapool.nsi
; Installs for the current user only (no administrator rights needed).
Unicode true
SetCompressor /SOLID lzma

!define APPNAME "ManaPool"
!define VERSION "0.3.6"
!define PUBLISHER "Gustavo Acevedo"
!define UNINSTKEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\ManaPool"

Name "${APPNAME}"
OutFile "..\release\ManaPool-Setup-${VERSION}.exe"
InstallDir "$LOCALAPPDATA\Programs\${APPNAME}"
InstallDirRegKey HKCU "${UNINSTKEY}" "InstallLocation"
RequestExecutionLevel user
BrandingText "${APPNAME} ${VERSION}"

VIProductVersion "${VERSION}.0"
VIAddVersionKey "ProductName" "${APPNAME}"
VIAddVersionKey "CompanyName" "${PUBLISHER}"
VIAddVersionKey "FileDescription" "${APPNAME} installer"
VIAddVersionKey "FileVersion" "${VERSION}"
VIAddVersionKey "ProductVersion" "${VERSION}"
VIAddVersionKey "LegalCopyright" "${PUBLISHER}"

!include "MUI2.nsh"
!define MUI_ICON "..\build\icon.ico"
!define MUI_UNICON "..\build\icon.ico"
!define MUI_ABORTWARNING
!define MUI_WELCOMEPAGE_TITLE "Install ${APPNAME}"
!define MUI_WELCOMEPAGE_TEXT "This will install ${APPNAME} ${VERSION}, the digital version of the ManaPool card game, on your computer.$\r$\n$\r$\nClick Next to continue."
!define MUI_FINISHPAGE_RUN "$INSTDIR\ManaPool.exe"
!define MUI_FINISHPAGE_RUN_TEXT "Play ${APPNAME} now"

!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "English"

Section "Install"
  SetOutPath "$INSTDIR"
  ; Remove files from an earlier version first.
  RMDir /r "$INSTDIR\resources"
  RMDir /r "$INSTDIR\locales"
  File /r "..\release\win-unpacked\*.*"
  File "..\build\icon.ico"

  CreateShortCut "$SMPROGRAMS\${APPNAME}.lnk" "$INSTDIR\ManaPool.exe" "" "$INSTDIR\icon.ico" 0
  CreateShortCut "$DESKTOP\${APPNAME}.lnk" "$INSTDIR\ManaPool.exe" "" "$INSTDIR\icon.ico" 0

  WriteUninstaller "$INSTDIR\Uninstall.exe"
  WriteRegStr HKCU "${UNINSTKEY}" "DisplayName" "${APPNAME}"
  WriteRegStr HKCU "${UNINSTKEY}" "DisplayVersion" "${VERSION}"
  WriteRegStr HKCU "${UNINSTKEY}" "Publisher" "${PUBLISHER}"
  WriteRegStr HKCU "${UNINSTKEY}" "DisplayIcon" "$INSTDIR\icon.ico"
  WriteRegStr HKCU "${UNINSTKEY}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "${UNINSTKEY}" "UninstallString" '"$INSTDIR\Uninstall.exe"'
  WriteRegDWORD HKCU "${UNINSTKEY}" "NoModify" 1
  WriteRegDWORD HKCU "${UNINSTKEY}" "NoRepair" 1
SectionEnd

Section "Uninstall"
  Delete "$SMPROGRAMS\${APPNAME}.lnk"
  Delete "$DESKTOP\${APPNAME}.lnk"
  RMDir /r "$INSTDIR"
  DeleteRegKey HKCU "${UNINSTKEY}"
  ; Saved decks and settings (in %APPDATA%\ManaPool) are kept.
SectionEnd
