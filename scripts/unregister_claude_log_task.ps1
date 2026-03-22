$ErrorActionPreference = "Stop"

$taskName = "Voxly-ClaudeLog-Every5Hours"
$result = schtasks /Delete /TN $taskName /F

Write-Host "Scheduled task removed:"
Write-Host $result

