; 安装完成后创建桌面快捷方式，避免用户找不到入口。
; 图标直接使用 exe 内嵌的应用图标，保证和任务栏一致。
!macro NSIS_HOOK_POSTINSTALL
  CreateShortcut "$DESKTOP\FVKJL.lnk" "$INSTDIR\${MAINBINARYNAME}.exe"
!macroend

; 卸载时清理我们创建的桌面快捷方式。
!macro NSIS_HOOK_POSTUNINSTALL
  Delete "$DESKTOP\FVKJL.lnk"
!macroend
