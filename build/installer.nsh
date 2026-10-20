; Oficina virtual: extra steps for the electron-builder NSIS installer.
; On uninstall, take the office's hooks out of Claude Code's settings first:
; they run this app's exe, which is about to be removed.
!macro customUnInstall
  ExecWait '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" --oficina-uninstall-hooks'
!macroend
