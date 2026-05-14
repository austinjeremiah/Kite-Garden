#!/usr/bin/env pwsh
<#
.SYNOPSIS
  Generate baseline transaction data for a registered AttractorGuard agent.
  
.DESCRIPTION
  This script simulates gate calls to establish behavioral metrics and baseline data.
  After running, the agent dashboard should display:
  - Non-zero SAMPEN value
  - Baseline mean and std dev
  - Transaction history graph
  
.PARAMETER AgentId
  The bytes32 agent ID (from registration response or /api/agents/{agentId})
  
.PARAMETER BackendUrl
  Backend URL (default: http://localhost:4000)
  
.PARAMETER GateCalls
  Number of gate calls to simulate (default: 10)
  
.PARAMETER WaitSeconds
  Time to wait between calls for Goldsky indexing (default: 3)
  
.EXAMPLE
  PS> .\generate-baseline.ps1 -AgentId "0x536f6c646965722d626f7900000000000000000000000000000000000000"
  
.EXAMPLE
  PS> .\generate-baseline.ps1 -AgentId "0x..." -GateCalls 20 -WaitSeconds 2
#>

param(
  [Parameter(Mandatory=$true)]
  [string]$AgentId,
  
  [string]$BackendUrl = "http://localhost:4000",
  [int]$GateCalls = 10,
  [int]$WaitSeconds = 3
)

Write-Host "
╔════════════════════════════════════════════════════════════════╗
║  AttractorGuard Baseline Data Generator                        ║
╚════════════════════════════════════════════════════════════════╝
" -ForegroundColor Cyan

Write-Host "Configuration:" -ForegroundColor Yellow
Write-Host "  Backend URL:  $BackendUrl"
Write-Host "  Agent ID:     $AgentId"
Write-Host "  Gate Calls:   $GateCalls"
Write-Host "  Wait Between: $WaitSeconds sec"
Write-Host ""

# Verify backend is running
Write-Host "Checking backend connectivity..." -ForegroundColor Gray
try {
  $health = curl -s "$BackendUrl/health" | ConvertFrom-Json
  if ($health.ok) {
    Write-Host "✓ Backend reachable" -ForegroundColor Green
  } else {
    Write-Host "✗ Backend health check failed" -ForegroundColor Red
    exit 1
  }
} catch {
  Write-Host "✗ Backend not reachable at $BackendUrl" -ForegroundColor Red
  exit 1
}

# Verify agent exists
Write-Host "Verifying agent exists..." -ForegroundColor Gray
try {
  $agent = curl -s "$BackendUrl/api/agents/$AgentId" | ConvertFrom-Json
  if ($agent.agentId) {
    Write-Host "✓ Agent found: $($agent.name)" -ForegroundColor Green
    Write-Host "  Status: $($agent.status) | Mode: $($agent.mode)" -ForegroundColor Gray
    Write-Host "  Current baseline: $($agent.baselineMean)" -ForegroundColor Gray
  } else {
    Write-Host "✗ Agent not found" -ForegroundColor Red
    exit 1
  }
} catch {
  Write-Host "✗ Failed to fetch agent details" -ForegroundColor Red
  exit 1
}

Write-Host ""
Write-Host "Generating $GateCalls baseline transactions..." -ForegroundColor Yellow
Write-Host ""

$metrics = @()
$successCount = 0

for ($i = 1; $i -le $GateCalls; $i++) {
  $amount = Get-Random -Minimum 1 -Maximum 6
  $destination = "0x0000000000000000000000000000000000000001"
  
  Write-Host "Gate call $i/$GateCalls (amount: $amount USDC)..." -ForegroundColor Gray -NoNewline
  
  try {
    $response = curl -s -X POST "$BackendUrl/api/gate" `
      -H "Content-Type: application/json" `
      -d "{
        `"agentId`": `"$AgentId`",
        `"amount`": $amount,
        `"destination`": `"$destination`"
      }" | ConvertFrom-Json
    
    if ($response.metric -ne $null) {
      $metric = [math]::Round($response.metric, 3)
      $verdict = $response.verdict
      $metrics += $metric
      $successCount++
      
      Write-Host " ✓ metric=$metric verdict=$verdict" -ForegroundColor Green
    } else {
      Write-Host " ⚠ metric=0 (Goldsky indexing, may take 20-30 sec)" -ForegroundColor Yellow
    }
  } catch {
    Write-Host " ✗ FAILED" -ForegroundColor Red
    Write-Host "  Error: $_" -ForegroundColor Red
  }
  
  if ($i -lt $GateCalls) {
    Start-Sleep -Seconds $WaitSeconds
  }
}

Write-Host ""
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
Write-Host "Results:" -ForegroundColor Yellow
Write-Host "  Successful calls: $successCount / $GateCalls" -ForegroundColor Green
if ($metrics.Count -gt 0) {
  $mean = ($metrics | Measure-Object -Average).Average
  $min = ($metrics | Measure-Object -Minimum).Minimum
  $max = ($metrics | Measure-Object -Maximum).Maximum
  Write-Host "  Metrics collected: $($metrics.Count)" -ForegroundColor Green
  Write-Host "  Mean: $([math]::Round($mean, 3))" -ForegroundColor Cyan
  Write-Host "  Min:  $min | Max: $max" -ForegroundColor Cyan
}

Write-Host ""
Write-Host "Next Steps:" -ForegroundColor Yellow
Write-Host "  1. Wait 30-60 seconds for Goldsky indexing"
Write-Host "  2. Refresh dashboard to see baseline and graph"
Write-Host "  3. Expected to see:"
Write-Host "     - SAMPEN: non-zero value" -ForegroundColor Gray
Write-Host "     - baseline: mean of collected metrics" -ForegroundColor Gray
Write-Host "     - Graph showing transaction history" -ForegroundColor Gray

Write-Host ""
Write-Host "Dashboard URL:" -ForegroundColor Cyan
Write-Host "  http://localhost:3000/agents/$AgentId"
Write-Host ""

# Check final status
Write-Host "Checking final agent status..." -ForegroundColor Gray
Start-Sleep -Seconds 2

try {
  $finalAgent = curl -s "$BackendUrl/api/agents/$AgentId" | ConvertFrom-Json
  Write-Host "  Baseline: $($finalAgent.baselineMean)" -ForegroundColor Cyan
  Write-Host "  StdDev:   $($finalAgent.baselineStdDev)" -ForegroundColor Cyan
  Write-Host "  Tx Count: $($finalAgent.transactionCount)" -ForegroundColor Cyan
  Write-Host "  Mode:     $($finalAgent.mode)" -ForegroundColor Cyan
} catch {
  Write-Host "  (Could not fetch final status, check dashboard)" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Done! ✓" -ForegroundColor Green
