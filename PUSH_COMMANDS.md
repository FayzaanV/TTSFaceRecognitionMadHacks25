# Git Commands to Push to GitHub

## Step 1: Navigate to the repository folder
```powershell
cd github_repo
```

## Step 2: Check what files have changed
```powershell
git status
```

## Step 3: Add all changes (modified and new files)
```powershell
git add .
```

Or add specific files:
```powershell
git add app.js index.html style.css main.py requirements.txt
```

## Step 4: Commit your changes
```powershell
git commit -m "Add Python backend with Fish Audio integration, improve keyboard and nose tracking"
```

Or use a more detailed message:
```powershell
git commit -m "Add Python backend with Fish Audio integration

- Added main.py with FastAPI backend
- Integrated Fish Audio SDK for TTS
- Added emotion-based voice parameters
- Improved keyboard size and sensitivity
- Updated dwell time to 1.0 second
- Moved text display below keyboard
- Added number row to keyboard"
```

## Step 5: Push to GitHub
```powershell
git push origin main
```

If you get an error about the branch name, try:
```powershell
git push origin master
```

Or if you need to set upstream:
```powershell
git push -u origin main
```

## Your Current Remote
Your repository is already connected to:
`https://github.com/FayzaanV/TTSFaceRecognitionMadHacks25`

## Quick One-Liner (if you're already in the github_repo folder)
```powershell
git add . ; git commit -m "Add Python backend with Fish Audio integration" ; git push origin main
```

## Troubleshooting

### If you get "nothing to commit"
- Make sure you're in the `github_repo` folder
- Check `git status` to see what files are tracked

### If you get authentication errors
- Make sure you're logged into GitHub
- You may need to use a Personal Access Token instead of password
- Or set up SSH keys

### If you want to push to a different repository
```powershell
# Remove old remote
git remote remove origin

# Add new remote
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git

# Push
git push -u origin main
```

