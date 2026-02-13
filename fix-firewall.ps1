# Check for Administrator privileges
if (!([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole] "Administrator")) {
    Write-Warning "You must run this script as Administrator!"
    Write-Warning "Right-click 'PowerShell' and select 'Run as Administrator', then run this script again."
    exit
}

Write-Host "Configuring Windows Firewall for Anchor OS..." -ForegroundColor Cyan

$Rules = @(
    @{ Name = "Anchor Engine (3160)"; Port = 3160 },
    @{ Name = "Anchor UI (5173)"; Port = 5173 },
    @{ Name = "Inference Server (3002)"; Port = 3002 },
    @{ Name = "Nanobot Agent (8080)"; Port = 8080 }
)

foreach ($Rule in $Rules) {
    Write-Host "Processing rule for $($Rule.Name)..." -NoNewline
    
    # Remove existing rules to avoid duplicates
    Remove-NetFirewallRule -DisplayName "$($Rule.Name)" -ErrorAction SilentlyContinue
    
    # Create new rule
    New-NetFirewallRule -DisplayName "$($Rule.Name)" `
        -Direction Inbound `
        -LocalPort $Rule.Port `
        -Protocol TCP `
        -Action Allow `
        -Profile Any `
        -Enabled True `
        -ErrorAction Stop | Out-Null
        
    Write-Host " [OK]" -ForegroundColor Green
}

Write-Host "`nVerifying Rules:" -ForegroundColor Cyan
Get-NetFirewallRule -DisplayName "Anchor*" | Select-Object DisplayName, Enabled, Profile, Direction, Action | Format-Table -AutoSize
Get-NetFirewallRule -DisplayName "Inference*" | Select-Object DisplayName, Enabled, Profile, Direction, Action | Format-Table -AutoSize
Get-NetFirewallRule -DisplayName "Nanobot*" | Select-Object DisplayName, Enabled, Profile, Direction, Action | Format-Table -AutoSize

Write-Host "`nFirewall configuration complete." -ForegroundColor Cyan
Write-Host "You should now be able to access the UI from your local network (e.g. Phone)." -ForegroundColor Yellow
Write-Host "Ensure your phone is on the SAME Wi-Fi network as this PC." -ForegroundColor Yellow
Pause
