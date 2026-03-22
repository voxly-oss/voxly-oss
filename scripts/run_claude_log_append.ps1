$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Split-Path -Parent $scriptDir
$pythonScript = Join-Path $scriptDir "append_claude_log.py"

function Resolve-Python {
    $pythonCmd = Get-Command python -ErrorAction SilentlyContinue
    if ($pythonCmd) { return $pythonCmd.Path }

    $pyCmd = Get-Command py -ErrorAction SilentlyContinue
    if ($pyCmd) { return "$($pyCmd.Path) -3" }

    throw "Python not found. Install Python and ensure 'python' or 'py' is in PATH."
}

$py = Resolve-Python
if ($py -like "* -3") {
    $parts = $py.Split(" ")
    & $parts[0] $parts[1] $pythonScript --repo-root $repoRoot
} else {
    & $py $pythonScript --repo-root $repoRoot
}

