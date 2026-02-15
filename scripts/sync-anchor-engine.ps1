$ErrorActionPreference = "Stop"

# Paths
$SourcePath = "C:\Users\rsbiiw\Projects\anchor-os\packages\anchor-engine"
$DestPath = "C:\Users\rsbiiw\Projects\anchor-engine-sync"
$AnchorOsPath = "C:\Users\rsbiiw\Projects\anchor-os"

# 1. Anchor OS: Commit and Push
Write-Host "----------------------------------------------------------------"
Write-Host "Syncing Anchor OS..."
Set-Location $AnchorOsPath

# Check for changes
$gitStatus = git status --porcelain
if ($gitStatus) {
    Write-Host "Changes detected in anchor-os. Committing..."
    git add .
    git commit -m "chore: sync anchor-engine $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
    
    Write-Host "Pushing anchor-os..."
    git push
} else {
    Write-Host "No changes to commit in anchor-os."
}

# 2. Copy Files to Anchor Engine Sync
Write-Host "----------------------------------------------------------------"
Write-Host "Copying files from '$SourcePath' to '$DestPath'..."

# Create destination if it doesn't exist (it should, but good practice)
if (-not (Test-Path $DestPath)) {
    New-Item -ItemType Directory -Force -Path $DestPath
}

# Copy items, excluding node_modules and .git and other potential artifacts
# Using Robocopy for better exclusion handling if possible, but Copy-Item is simpler for now.
# Exclusions: node_modules, .git, dist, coverage, .DS_Store
$ExcludeList = @("node_modules", ".git", "dist", "coverage", ".DS_Store", "build", ".turbo")

Get-ChildItem -Path $SourcePath -Exclude $ExcludeList | ForEach-Object {
    $targetPath = Join-Path $DestPath $_.Name
    if (Test-Path $targetPath) {
        Remove-Item -Path $targetPath -Recurse -Force
    }
    Copy-Item -Path $_.FullName -Destination $DestPath -Recurse -Force
}

Write-Host "File copy complete."

# 3. Anchor Engine Sync: Commit and Push
Write-Host "----------------------------------------------------------------"
Write-Host "Syncing Anchor Engine Sync..."
Set-Location $DestPath

# Check if git initialized
if (-not (Test-Path ".git")) {
    Write-Host "Initializing git repository in anchor-engine-sync..."
    git init
    # Note: User needs to add remote manually if they have one
    Write-Host "WARNING: No remote configured. You will need to add a remote to push."
    Write-Host "Example: git remote add origin <url>"
}

# Check for changes
$gitStatusSync = git status --porcelain
if ($gitStatusSync) {
    Write-Host "Changes detected in anchor-engine-sync. Committing..."
    git add .
    git commit -m "feat: sync from anchor-os $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
    
    # Check if remote exists before pushing
    $remotes = git remote
    if ($remotes) {
        Write-Host "Pushing anchor-engine-sync..."
        git push
    } else {
        Write-Host "No remote configured. Skipping push."
    }
} else {
    Write-Host "No changes to commit in anchor-engine-sync."
}

Write-Host "----------------------------------------------------------------"
Write-Host "Synchronization Complete!"
