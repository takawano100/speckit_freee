$ErrorActionPreference = 'Stop'

$projectDirectory = Split-Path -Parent $MyInvocation.MyCommand.Path
$localUrl = 'http://127.0.0.1:4173/'
$serverReady = $false

try {
    $response = Invoke-WebRequest -UseBasicParsing -Uri $localUrl -TimeoutSec 2
    $serverReady = $response.StatusCode -eq 200
} catch {
    $serverReady = $false
}

if (-not $serverReady) {
    $pythonPath = (Get-Command python -ErrorAction Stop).Source
    Start-Process -FilePath $pythonPath `
        -ArgumentList @('-m', 'http.server', '4173', '--bind', '127.0.0.1') `
        -WorkingDirectory $projectDirectory `
        -WindowStyle Hidden

    for ($attempt = 0; $attempt -lt 20; $attempt += 1) {
        Start-Sleep -Milliseconds 250
        try {
            $response = Invoke-WebRequest -UseBasicParsing -Uri $localUrl -TimeoutSec 1
            if ($response.StatusCode -eq 200) {
                $serverReady = $true
                break
            }
        } catch {
            $serverReady = $false
        }
    }
}

if (-not $serverReady) {
    Add-Type -AssemblyName PresentationFramework
    [System.Windows.MessageBox]::Show('ローカル画面を起動できませんでした。Pythonが利用できるか確認してください。', 'freee 差分要求ワークベンチ') | Out-Null
    exit 1
}

Start-Process $localUrl
