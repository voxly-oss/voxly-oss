$ErrorActionPreference = "Stop"

$taskName = "Voxly-ClaudeLog-Every5Hours"
$scriptPath = Join-Path (Split-Path -Parent $MyInvocation.MyCommand.Path) "run_claude_log_append.ps1"

if (-not (Test-Path $scriptPath)) {
    throw "Script not found: $scriptPath"
}

$action = "powershell -NoProfile -ExecutionPolicy Bypass -File `"$scriptPath`""

# Run every 5 hours.
$result = schtasks /Create /TN $taskName /TR $action /SC HOURLY /MO 5 /F

Write-Host "Scheduled task created/updated:"
Write-Host $result
Write-Host "Task name: $taskName"
Write-Host "To remove: schtasks /Delete /TN `"$taskName`" /F"

