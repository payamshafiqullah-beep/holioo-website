# Holioo Development Workflow

This guide describes the development process, testing stages, and code review workflow for the Holioo web application.

## Git Workflow: Stacked Feature Branches

Holioo uses a **stacked branch strategy** where features develop on separate branches that can be merged to `main` independently or in sequence.

### Branch Naming and Creation

```bash
# Create a feature branch from main
git fetch origin main
git checkout -B <feature-name> origin/main

# Branch naming convention: <descriptive-name>
# Examples: desk-layout, live-capture, cross-device-sync
```

### Committing Changes

Commit messages follow a clear, descriptive format:

```bash
git add <files>
git commit -m "Brief description of the change

Longer explanation if needed, describing WHY the change was made,
not just WHAT changed. Keep it concise."
```

Each commit represents a logical unit of work. Small, focused commits make:
- Code review easier
- Merging faster with fewer conflicts
- Debugging simpler with `git bisect`
- History more readable

## Testing Stages

### Stage 1: Local Development (Before Staging)

Before committing, verify your changes don't break existing functionality:

```bash
# Run the smoke test to validate all files and features are present
node pwa/smoke-test.mjs
```

The smoke test checks:
- ✓ All 22-23 page files are included
- ✓ All critical UI components are present
- ✓ All feature strings are included
- ✓ Service worker offline cache is complete
- ✓ No old code patterns remain
- ✓ No sensitive secrets in frontend code

**Do not commit if smoke test fails.**

### Stage 2: Pre-Merge Validation

Before opening a pull request:

1. **Push to your feature branch:**
   ```bash
   git push -u origin <feature-name>
   ```

2. **Verify conflicts with main:**
   ```bash
   git fetch origin main
   git merge origin/main --no-commit --no-ff
   # Review conflicts, then abort if needed
   git merge --abort
   ```

3. **Run smoke test again** after merging main (if there were changes):
   ```bash
   node pwa/smoke-test.mjs
   ```

### Stage 3: Pull Request Review

Once a PR is created, automated checks run:
- Service worker cache version validation
- HTML script dependency completeness
- Feature file presence checks
- PWA manifest validation

Review checklist:
- [ ] Code follows project patterns
- [ ] Smoke test passes
- [ ] No conflicts with main
- [ ] Commit messages are clear
- [ ] Changes are focused to the feature

## Multi-File Conflict Resolution

Features often affect multiple interdependent files. Key files in conflict:

### `pwa/index.html`

Contains versioned script tags. When merging features:

```html
<!-- Each feature branch has its own version string -->
<script src="./features/desk-shell.js?v=20261003-desk-layout-v1" defer></script>
<script src="./pages/LiveCapturePage.js?v=20261003-live-capture-v1" defer></script>
```

**Merge strategy:** Combine script tags from both branches, preserving each feature's version.

### `pwa/sw.js`

Service worker CORE array lists all files to cache offline:

```javascript
const CORE = [
  "./",
  "./index.html",
  // ... all app files must be listed
  "./features/desk-shell.js?v=20261003-desk-layout-v1",
  "./pages/SessionDeskPage.js?v=20261003-desk-layout-v1"
];
```

**Merge strategy:** Ensure all files from both branches are in the CORE array.

### `pwa/smoke-test.mjs`

Feature file lists must include additions from all branches:

```javascript
const pageFiles = [
  // ... all page files from both branches
];
const featureFiles = [
  // ... all feature files from both branches
];
```

**Merge strategy:** Combine arrays from both branches.

## Version String Management

Cache-busting version strings follow this format:

```
?v=YYYYMMDD-<feature-name>-v<number>
```

- `YYYYMMDD`: Date of the version
- `feature-name`: What this release includes (e.g., `desk-layout`, `live-capture`)
- `v<number>`: Version increment

**When to update versions:**
1. When releasing a new feature to production
2. When merging major features to main
3. When fixing critical issues

Service worker uses these versions to:
- Invalidate old cached files
- Force browser to download new versions
- Ensure users always have the latest code

## Resolving Merge Conflicts

### Automated Conflict Resolution

When merging feature branches to main or vice versa:

1. **Fetch main:**
   ```bash
   git fetch origin main
   ```

2. **Attempt merge:**
   ```bash
   git merge origin/main
   ```

3. **If conflicts occur:**
   ```bash
   git status  # See conflicted files
   ```

### Manual Conflict Resolution

For complex conflicts (especially in index.html, sw.js, smoke-test.mjs):

1. **Read the conflicted file sections** using your editor
2. **Identify which changes belong to which feature:**
   - Lines from main (between `<<<<<<<` and `=======`)
   - Lines from feature branch (between `=======` and `>>>>>>>`)
3. **Combine both sets of changes:**
   - Keep version-specific scripts and features
   - Add missing files from both branches
   - Remove conflict markers
4. **Validate with smoke test:**
   ```bash
   node pwa/smoke-test.mjs
   ```
5. **Commit the merge:**
   ```bash
   git add .
   git commit -m "Merge origin/main into <feature-name>"
   git push origin <feature-name>
   ```

## Pull Request Workflow

### Opening a PR

1. Ensure branch is pushed and up-to-date
2. Create PR with clear title and description
3. Reference any issues: "Closes #123"
4. Describe what the feature does and why

### PR Description Template

```markdown
## Description
Brief summary of the feature.

## Changes
- What file changes include
- Key modifications
- New capabilities

## Testing
- Local testing completed
- Smoke test passes
- Conflicts resolved with main

## Related Issues
Closes #123
```

### Merging PRs

**Before merging:**
- [ ] All CI checks pass (GitHub Actions, if configured)
- [ ] Smoke test has been run locally
- [ ] No merge conflicts
- [ ] At least one review approval (if required)

**To merge:**
1. Use GitHub's "Merge pull request" button
2. Verify the merge commit message
3. Delete the feature branch after merging

**After merging:**
1. Pull main to verify merge completed:
   ```bash
   git fetch origin main
   git checkout main
   git pull origin main
   ```
2. Run smoke test on main:
   ```bash
   node pwa/smoke-test.mjs
   ```

## Stacked Branch Merging Order

When multiple features depend on each other or affect the same files:

1. **Plan the merge order** (main → feature A → feature B)
2. **Merge feature A first:**
   ```bash
   # Merge feature A via GitHub
   git fetch origin main
   git checkout main
   git pull origin main
   ```
3. **Rebase feature B onto updated main:**
   ```bash
   git fetch origin main
   git rebase origin/main <feature-B-branch>
   ```
4. **Resolve any new conflicts** from the rebase
5. **Run smoke test** again
6. **Merge feature B**

## Common Issues and Solutions

### "Smoke test fails with 'page files missing'"

**Cause:** Feature files not added to smoke-test.mjs arrays  
**Fix:** Add the new files to `pageFiles`, `uiFiles`, or `featureFiles` arrays

### "Service worker not updating new code"

**Cause:** Version string not changed  
**Fix:** Update version string in index.html, sw.js CORE array, and all script tags

### "Merge conflict in multiple files"

**Cause:** Both branches modified the same files  
**Fix:** Follow manual conflict resolution steps above, validating with smoke test

### "Old code still running in browser"

**Cause:** Browser cached old version  
**Fix:** Hard-refresh (Ctrl+Shift+R or Cmd+Shift+R) or clear browser cache

## Code Review Checklist for Reviewers

- [ ] Feature is self-contained and focused
- [ ] Commit messages are clear and descriptive
- [ ] Smoke test passes
- [ ] No conflicts with main
- [ ] Code follows existing patterns
- [ ] No sensitive data in frontend code
- [ ] Service worker cache updated if needed
- [ ] Version string incremented if releasing
- [ ] All dependencies listed in smoke-test.mjs if new files added

## Deployment to Production

1. **Ensure feature is merged to main**
2. **Update version strings** for production release
3. **Run smoke test** one final time
4. **Deploy main** branch to production servers
5. **Users will pull new version** automatically when they visit the app

The service worker ensures:
- Instant app load from cache
- New version available on next visit
- Smooth transition without interrupting active captures

---

**Last Updated:** 2026-10-03  
For questions or updates to this workflow, contact the development team.
