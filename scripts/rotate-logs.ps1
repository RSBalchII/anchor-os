# Log Rotation Script for Anchor OS
# Truncates log files to last 10,000 lines when they exceed that size

param(
    [string]$LogDirectory = ".\logs",
    [int]$MaxLines = 10000
)

function Rotate-Log {
    param(
        [string]$FilePath,
        [int]$MaxLines
    )
    
    if (Test-Path $FilePath) {
        $lines = Get-Content $FilePath
        $lineCount = $lines.Length
        
        if ($lineCount -gt $MaxLines) {
            $truncatedLines = $lines | Select-Object -Last $MaxLines
            $truncatedLines | Out-File -FilePath $FilePath -Encoding UTF8
            Write-Host "Rotated $($FilePath): $($lineCount) lines -> $($truncatedLines.Length) lines"
        }
    }
}

# Create logs directory if it doesn't exist
if (!(Test-Path $LogDirectory)) {
    New-Item -ItemType Directory -Path $LogDirectory -Force
    Write-Host "Created log directory: $LogDirectory"
}

# Define log files to monitor
$logFiles = @(
    "$LogDirectory\anchor_engine.log",
    "$LogDirectory\inference_server.log", 
    "$LogDirectory\anchor_ui.log",
    "$LogDirectory\nanobot_node.log"
)

# Rotate each log file
foreach ($logFile in $logFiles) {
    Rotate-Log -FilePath $logFile -MaxLines $MaxLines
}

Write-Host "Log rotation completed."