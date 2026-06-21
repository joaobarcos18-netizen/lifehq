# Ships a new LifeHQ release: bumps the patch version, builds, publishes to
# GitHub Releases, and pushes the version bump. Run with:  npm.cmd run ship
#
# Requires: `gh auth login` done once. Building the installer needs permission to
# create symlinks — turn ON Windows Developer Mode (Settings > Privacy & security >
# For developers) OR run this from an elevated (Administrator) terminal.

$ErrorActionPreference = 'Stop'
Set-Location (Split-Path -Parent $PSScriptRoot)

Write-Host "Bumping version..." -ForegroundColor Cyan
& npm.cmd version patch --no-git-tag-version | Out-Null
$version = node -p "require('./package.json').version"
Write-Host "New version: v$version" -ForegroundColor Green

Write-Host "Publishing to GitHub Releases..." -ForegroundColor Cyan
$env:GH_TOKEN = (gh auth token).Trim()
$env:CSC_IDENTITY_AUTO_DISCOVERY = 'false'
& npm.cmd run release

Write-Host "Pushing version bump..." -ForegroundColor Cyan
git commit -am "release v$version"
git push origin main

Write-Host "`nShipped v$version. Installed apps will offer the update on next launch." -ForegroundColor Green
