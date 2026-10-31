param([string]$OutputDirectory = '')
$ErrorActionPreference = 'Stop'
$taskResumeRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$taskSources = @(
  'Releases/EN/Yuriy_Kobylyatskiy_Senior_Unity_Developer_EN.docx',
  'Releases/EN/Yuriy_Kobylyatskiy_Unity_Developer_EN.docx',
  'Releases/RU/Yuriy_Kobylyatskiy_Senior_Unity_Developer_RU.docx'
)
$taskWord = $null
try {
  $taskWord = New-Object -ComObject Word.Application
  $taskWord.Visible = $false
  $taskWord.DisplayAlerts = 0
  $taskWord.AutomationSecurity = 3
  foreach ($taskRelative in $taskSources) {
    $taskInput = Join-Path $taskResumeRoot $taskRelative
    $taskOutput = [System.IO.Path]::ChangeExtension($taskInput, '.pdf')
    if ($OutputDirectory) {
      $taskOutput = Join-Path ([System.IO.Path]::GetFullPath($OutputDirectory)) ([System.IO.Path]::GetFileName($taskOutput))
      [System.IO.Directory]::CreateDirectory([System.IO.Path]::GetDirectoryName($taskOutput)) | Out-Null
    }
    $taskDocument = $null
    try {
      # Read-only, no recent-files entry, no DOCX re-save or style normalization.
      $taskDocument = $taskWord.Documents.Open($taskInput, $false, $true, $false)
      $taskDocument.ExportAsFixedFormat($taskOutput, 17, $false)
      Write-Output ([System.IO.Path]::GetFileName($taskOutput))
    } finally {
      if ($null -ne $taskDocument) {
        $taskDocument.Close(0)
        [System.Runtime.InteropServices.Marshal]::FinalReleaseComObject($taskDocument) | Out-Null
      }
    }
  }
} finally {
  if ($null -ne $taskWord) {
    if ($taskWord.Documents.Count -eq 0) { $taskWord.Quit(0) }
    [System.Runtime.InteropServices.Marshal]::FinalReleaseComObject($taskWord) | Out-Null
  }
}
