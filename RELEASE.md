npm test
npm run package:vsix
git add package.json CHANGELOG.md
git commit -m "chore: release v0.0.X"
git push origin main
git tag v0.0.X
git push origin v0.0.X