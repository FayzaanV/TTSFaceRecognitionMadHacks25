# Guide: Push to New GitHub Repository

## Step 1: Create a New Repository on GitHub

1. Go to [https://github.com/new](https://github.com/new)
2. Enter a repository name (e.g., "expressive-aac-board")
3. Choose Public or Private
4. **DO NOT** check "Initialize this repository with a README"
5. Click "Create repository"

## Step 2: Add and Commit Your Changes

Open PowerShell in the `github_repo` folder and run:

```powershell
# Add all files
git add .

# Commit with a message
git commit -m "Add Python backend with Fish Audio integration"
```

## Step 3: Update Remote and Push

```powershell
# Remove the old remote (pointing to the cloned repo)
git remote remove origin

# Add your new repository as the remote
# Replace with your actual repository URL
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git

# Push to the new repository
git push -u origin main
```

## Alternative: Use the Automated Script

1. Run the PowerShell script:
   ```powershell
   .\push_to_new_repo.ps1
   ```

2. Follow the prompts:
   - Enter a commit message (or press Enter for default)
   - Enter your new GitHub repository URL
   - The script will handle the rest

## Files That Will Be Pushed

- ✅ `main.py` - Python backend
- ✅ `requirements.txt` - Dependencies
- ✅ `app.js` - Updated frontend (calls backend)
- ✅ `index.html` - Frontend HTML
- ✅ `style.css` - Styling
- ✅ `config.js` - Configuration
- ✅ `README.md` - Updated documentation
- ✅ `SETUP.md` - Setup guide
- ✅ `TESTING.md` - Testing guide
- ✅ `.gitignore` - Updated ignore rules

## Files That Will NOT Be Pushed (in .gitignore)

- ❌ `dummy_output.wav` - Audio files are ignored
- ❌ `test_backend.py` - Optional test file (you can add it if you want)

## Troubleshooting

### "Repository not found" error
- Make sure you've created the repository on GitHub first
- Check that the URL is correct
- Verify you have push access to the repository

### "Permission denied" error
- Make sure you're authenticated with GitHub (use GitHub CLI or SSH keys)
- Or use HTTPS with a personal access token

### Want to include test_backend.py?
```powershell
git add test_backend.py
git commit -m "Add backend test script"
git push
```

