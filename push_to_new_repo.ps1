# Script to push code to a new GitHub repository
# Run this after creating a new repository on GitHub

Write-Host "=== Setting up new GitHub repository ===" -ForegroundColor Cyan
Write-Host ""

# Step 1: Add all files
Write-Host "Step 1: Adding all files to git..." -ForegroundColor Yellow
git add .

# Step 2: Commit changes
Write-Host ""
Write-Host "Step 2: Committing changes..." -ForegroundColor Yellow
$commitMessage = Read-Host "Enter commit message (or press Enter for default)"
if ([string]::IsNullOrWhiteSpace($commitMessage)) {
    $commitMessage = "Add Python backend with Fish Audio integration"
}
git commit -m $commitMessage

# Step 3: Get new repository URL
Write-Host ""
Write-Host "Step 3: Setting up new remote repository..." -ForegroundColor Yellow
Write-Host "Please create a new repository on GitHub first:" -ForegroundColor Green
Write-Host "  1. Go to https://github.com/new" -ForegroundColor Green
Write-Host "  2. Create a new repository (don't initialize with README)" -ForegroundColor Green
Write-Host "  3. Copy the repository URL" -ForegroundColor Green
Write-Host ""
$newRepoUrl = Read-Host "Enter your new GitHub repository URL (e.g., https://github.com/username/repo-name.git)"

if ([string]::IsNullOrWhiteSpace($newRepoUrl)) {
    Write-Host "Error: Repository URL is required!" -ForegroundColor Red
    exit 1
}

# Step 4: Remove old remote and add new one
Write-Host ""
Write-Host "Step 4: Updating remote repository..." -ForegroundColor Yellow
git remote remove origin
git remote add origin $newRepoUrl

# Step 5: Push to new repository
Write-Host ""
Write-Host "Step 5: Pushing to new repository..." -ForegroundColor Yellow
$branch = git branch --show-current
Write-Host "Pushing branch: $branch" -ForegroundColor Cyan
git push -u origin $branch

Write-Host ""
Write-Host "=== Done! ===" -ForegroundColor Green
Write-Host "Your code has been pushed to: $newRepoUrl" -ForegroundColor Green

