!macro customInit
  Var /GLOBAL PortalPreviousVersion
  ReadRegStr $PortalPreviousVersion SHCTX "${UNINSTALL_REGISTRY_KEY}" "DisplayVersion"
  ReadRegStr $0 HKCU "Environment" "PORTAL_CONSOLE_HOME"
  ${If} ${FileExists} "$0\portal-console.cmd"
  ${AndIf} ${FileExists} "$0\uninstall.ps1"
    MessageBox MB_ICONSTOP "A simple-installer installation was found at $0. Update it with the simple-installer ZIP to keep the same installation method."
    Abort
  ${EndIf}
  ${If} ${FileExists} "$LOCALAPPDATA\Programs\Portal Console\portal-console.cmd"
  ${AndIf} ${FileExists} "$LOCALAPPDATA\Programs\Portal Console\uninstall.ps1"
    MessageBox MB_ICONSTOP "A legacy simple-installer installation was found. Update it with the simple-installer ZIP, including versions from release-0929."
    Abort
  ${EndIf}
!macroend

!macro customInstall
  ReadEnvStr $R8 "ELECTRON_RUN_AS_NODE"
  System::Call 'kernel32::SetEnvironmentVariable(t "ELECTRON_RUN_AS_NODE", t "1")'
  nsExec::ExecToLog '"$INSTDIR\portal-console.exe" "$INSTDIR\resources\app.asar\src\install-record-cli.js" "$INSTDIR" windows-nsis "$APPDATA\portal-console\logs\install.log" "$PortalPreviousVersion"'
  Pop $0
  System::Call 'kernel32::SetEnvironmentVariable(t "ELECTRON_RUN_AS_NODE", t "$R8")'
  ${If} $0 != 0
    MessageBox MB_ICONSTOP "Application files were installed, but recording the installation method failed. See the installation details."
    SetErrorLevel 1
  ${EndIf}
!macroend
