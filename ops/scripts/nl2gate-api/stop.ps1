$ErrorActionPreference = "Stop"

Push-Location $PSScriptRoot
try {
    $composeFile = Join-Path $PSScriptRoot "..\\..\\docker\\nl2gate-api\\docker-compose.edge.yml"
    $envFile = Join-Path $PSScriptRoot "..\\..\\docker\\nl2gate-api\\.env"
    if (Test-Path $envFile) {
        docker compose --env-file $envFile -f $composeFile down
    }
    else {
        docker compose -f $composeFile down
    }
}
finally {
    Pop-Location
}
