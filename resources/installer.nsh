; Included by electron-builder's NSIS template (`nsis.include` in package.json).

; Replaces the template's check on the old version's uninstaller, which on any
; non-zero exit shows "Failed to uninstall old application files: 2" and quits
; — a MessageBox with no /SD, so it appears even under `/S`, and the in-app
; update (`windowsInstallerArgs`) ended on it with the old version still
; installed. The 2 is the old uninstaller's `Abort` when one of its files is
; still held for the five attempts it gets; it has already put every file back
; by then. Installing over that copy is what the extraction is built for — it
; retries a busy file and then overwrites regardless — so a failed uninstall is
; logged and the install goes on.
!macro customUnInstallCheck
  ${if} $R0 != 0
    DetailPrint `Old version's uninstaller exited with $R0; installing over it.`
  ${endif}
  ClearErrors
!macroend

; The same for a per-machine install's second pass over the per-user key.
!macro customUnInstallCheckCurrentUser
  !insertmacro customUnInstallCheck
!macroend
