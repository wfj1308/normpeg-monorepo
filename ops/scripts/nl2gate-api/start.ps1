param(
    [string]$ProjectId = "GXX_2024_XXX",
    [string]$BaseUrl = "http://127.0.0.1:8081"
)

$ErrorActionPreference = "Stop"

Push-Location $PSScriptRoot
try {
    $composeFile = Join-Path $PSScriptRoot "..\\..\\docker\\nl2gate-api\\docker-compose.edge.yml"
    $envFile = Join-Path $PSScriptRoot "..\\..\\docker\\nl2gate-api\\.env"
    if (Test-Path $envFile) {
        docker compose --env-file $envFile -f $composeFile up -d --build
    }
    else {
        docker compose -f $composeFile up -d --build
    }
    if ($LASTEXITCODE -ne 0) {
        throw "docker compose up failed"
    }

    $readyUrl = "$BaseUrl/ops/ready?project_id=$ProjectId"
    $smokeUrl = "$BaseUrl/ops/smoke?project_id=$ProjectId"
    $deliverablesUrl = "$BaseUrl/ops/deliverables?project_id=$ProjectId"

    $ready = $null
    $readyOk = $false
    for ($i = 0; $i -lt 30; $i++) {
        try {
            $ready = Invoke-RestMethod -Method Get -Uri $readyUrl -TimeoutSec 10
            if ($null -ne $ready) {
                $readyOk = $true
                break
            }
        }
        catch {
            Start-Sleep -Seconds 1
        }
    }
    if (-not $readyOk) {
        throw "Service did not become ready in time: $readyUrl"
    }

    $smoke = Invoke-RestMethod -Method Get -Uri $smokeUrl -TimeoutSec 15
    $deliverables = Invoke-RestMethod -Method Get -Uri $deliverablesUrl -TimeoutSec 15

    $subsetReady = if ($null -ne $ready.subset_ready) { $ready.subset_ready } else { $ready.day1_2_ready }
    Write-Host "ops/ready -> status=$($ready.status), subset_ready=$subsetReady"
    Write-Host "ops/smoke -> status=$($smoke.status)"
    Write-Host "ops/deliverables -> status=$($deliverables.status)"

    if ($smoke.status -ne "pass" -or $deliverables.status -ne "pass") {
        throw "Smoke check failed. Please inspect /ops/smoke and /ops/deliverables."
    }

    Write-Host "Edge deployment is up and smoke checks passed."
}
finally {
    Pop-Location
}
