# Orchid Heights - Automate GitHub Repository Creation & Upload
# This script securely prompts you for your GitHub credentials and uploads the codebase.

$ErrorActionPreference = "Stop"

Write-Host "=============================================" -ForegroundColor Cyan
Write-Host "   Orchid Heights GitHub Repository Creator" -ForegroundColor Cyan
Write-Host "=============================================" -ForegroundColor Cyan
Write-Host ""

# 1. Gather credentials securely
$username = Read-Host -Prompt "Enter your GitHub username"
if ([string]::IsNullOrWhiteSpace($username)) {
    Write-Error "Username cannot be empty."
    Exit
}

$repoName = Read-Host -Prompt "Enter desired repository name [default: orchid-heights]"
if ([string]::IsNullOrWhiteSpace($repoName)) {
    $repoName = "orchid-heights"
}

Write-Host "Please enter your GitHub Personal Access Token (PAT)." -ForegroundColor Yellow
Write-Host "You can create one at: https://github.com/settings/tokens (classic with 'repo' scope)" -ForegroundColor Gray
$token = Read-Host -AsSecureString -Prompt "Enter GitHub PAT Token"

# Decrypt secure string to plain text for API request
$BSTR = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($token)
$plainToken = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto($BSTR)

# 2. Call GitHub API to create repository
Write-Host "`nCreating remote repository on GitHub: $username/$repoName..." -ForegroundColor Cyan

$headers = @{
    "Authorization" = "token $plainToken"
    "Accept"        = "application/vnd.github.v3+json"
}

$body = @{
    "name"        = $repoName
    "description" = "Orchid Heights gate and resident management web portal."
    "private"     = $false
} | ConvertTo-Json

try {
    $response = Invoke-RestMethod -Uri "https://api.github.com/user/repos" -Method Post -Headers $headers -Body $body -ContentType "application/json"
    $cloneUrl = $response.clone_url
    Write-Host "Success! Remote repository created at: $cloneUrl" -ForegroundColor Green
} catch {
    $errMsg = $_.Exception.Message
    if ($_.Exception.Response) {
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        $respBody = $reader.ReadToEnd()
        $errMsg = "$errMsg - Details: $respBody"
    }
    Write-Error "Failed to create GitHub repository. Error: $errMsg"
    Exit
}

# 3. Setup remote and push
Write-Host "`nAdding remote origin and pushing codebase..." -ForegroundColor Cyan

# Check if remote already exists and remove it to prevent conflicts
$remoteCheck = git remote get-url origin 2>$null
if ($remoteCheck) {
    git remote remove origin
}

# Setup authenticated URL to allow pushing without prompts
$authUrl = "https://$username:$plainToken@github.com/$username/$repoName.git"

try {
    git remote add origin $authUrl
    Write-Host "Pushing code to main branch..."
    git push -u origin main
    
    # Reset remote URL to standard public clone URL to secure token from local git config file
    git remote set-url origin $cloneUrl
    
    Write-Host "`n=============================================" -ForegroundColor Green
    Write-Host " Code successfully pushed to GitHub!" -ForegroundColor Green
    Write-Host " View it at: https://github.com/$username/$repoName" -ForegroundColor Green
    Write-Host "=============================================" -ForegroundColor Green
} catch {
    Write-Error "Git push failed. Ensure git is installed and your PAT has 'repo' scopes. Details: $_"
}
