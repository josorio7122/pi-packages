---
name: gh
description: Interact with GitHub from the command line using the gh CLI. Use for pull requests, issues, releases, Actions workflows/runs, repository management, and GitHub API calls. Requires gh to be installed and authenticated.
compatibility: "Requires gh CLI installed (brew install gh) and authenticated (gh auth login)"
metadata:
  author: josorio7122
  version: "1.0"
---

# GitHub CLI (gh)

Work with GitHub repositories, pull requests, issues, releases, and Actions from the command line.

## Prerequisites

Verify gh is installed and authenticated:

```bash
gh --version
gh auth status
```

If not authenticated:

```bash
# Interactive login (browser-based OAuth — recommended)
gh auth login

# Or with a personal access token
gh auth login --with-token <<< "<token>"

# For GitHub Enterprise
gh auth login --hostname github.example.com
```

## Quick Reference

### Pull Requests

| Task                                | Command                                                    |
| ----------------------------------- | ---------------------------------------------------------- |
| Create PR from current branch       | `gh pr create --fill`                                      |
| Create PR with title and body       | `gh pr create --title "feat: add X" --body "Details"`      |
| Create PR targeting specific branch | `gh pr create --base develop --fill`                       |
| Create draft PR                     | `gh pr create --fill --draft`                              |
| Create PR with labels               | `gh pr create --fill --label "bug" --label "priority"`     |
| Create PR with assignee             | `gh pr create --fill --assignee @me`                       |
| Create PR with reviewer             | `gh pr create --fill --reviewer username`                  |
| List open PRs                       | `gh pr list`                                               |
| List my PRs                         | `gh pr list --author @me`                                  |
| List PRs needing review             | `gh pr list --search "review-requested:@me"`               |
| View PR details                     | `gh pr view <number>`                                      |
| View PR diff                        | `gh pr diff <number>`                                      |
| View PR in browser                  | `gh pr view <number> --web`                                |
| View PR as JSON                     | `gh pr view <number> --json title,body,state,reviews`      |
| Checkout PR locally                 | `gh pr checkout <number>`                                  |
| Review PR (approve)                 | `gh pr review <number> --approve`                          |
| Review PR (request changes)         | `gh pr review <number> --request-changes --body "Details"` |
| Review PR (comment)                 | `gh pr review <number> --comment --body "Looks good"`      |
| Merge PR                            | `gh pr merge <number>`                                     |
| Merge PR with squash                | `gh pr merge <number> --squash`                            |
| Merge PR with rebase                | `gh pr merge <number> --rebase`                            |
| Merge and delete branch             | `gh pr merge <number> --squash --delete-branch`            |
| Mark PR as ready                    | `gh pr ready <number>`                                     |
| Update PR branch                    | `gh pr update-branch <number>`                             |
| Add comment to PR                   | `gh pr comment <number> --body "comment text"`             |
| Edit PR                             | `gh pr edit <number> --title "new title"`                  |
| Close PR                            | `gh pr close <number>`                                     |
| Reopen PR                           | `gh pr reopen <number>`                                    |
| View PR checks                      | `gh pr checks <number>`                                    |
| Wait for checks to pass             | `gh pr checks <number> --watch`                            |
| Lock PR conversation                | `gh pr lock <number>`                                      |

### Issues

| Task                       | Command                                                      |
| -------------------------- | ------------------------------------------------------------ |
| Create issue               | `gh issue create --title "Bug: X" --body "Details"`          |
| Create issue with labels   | `gh issue create --title "X" --label "bug" --label "urgent"` |
| Create issue with assignee | `gh issue create --title "X" --assignee @me`                 |
| List open issues           | `gh issue list`                                              |
| List my issues             | `gh issue list --assignee @me`                               |
| List issues by label       | `gh issue list --label "bug"`                                |
| List closed issues         | `gh issue list --state closed`                               |
| View issue                 | `gh issue view <number>`                                     |
| View issue as JSON         | `gh issue view <number> --json title,body,labels,assignees`  |
| View issue in browser      | `gh issue view <number> --web`                               |
| Add comment to issue       | `gh issue comment <number> --body "comment text"`            |
| Close issue                | `gh issue close <number>`                                    |
| Close with reason          | `gh issue close <number> --reason "not planned"`             |
| Reopen issue               | `gh issue reopen <number>`                                   |
| Edit issue                 | `gh issue edit <number> --title "new title"`                 |
| Pin issue                  | `gh issue pin <number>`                                      |
| Transfer issue             | `gh issue transfer <number> owner/other-repo`                |
| Delete issue               | `gh issue delete <number>`                                   |
| Create branch from issue   | `gh issue develop <number>`                                  |

### Repository

| Task                    | Command                                                 |
| ----------------------- | ------------------------------------------------------- |
| View repo info          | `gh repo view`                                          |
| View repo in browser    | `gh repo view --web`                                    |
| View repo as JSON       | `gh repo view --json name,description,defaultBranchRef` |
| Clone a repo            | `gh repo clone owner/repo`                              |
| Fork a repo             | `gh repo fork owner/repo`                               |
| Fork and clone          | `gh repo fork owner/repo --clone`                       |
| Create a new repo       | `gh repo create my-repo --public`                       |
| Create private repo     | `gh repo create my-repo --private`                      |
| Create from template    | `gh repo create my-repo --template owner/template`      |
| List your repos         | `gh repo list`                                          |
| List org repos          | `gh repo list <org>`                                    |
| Edit repo settings      | `gh repo edit --description "New description"`          |
| Rename repo             | `gh repo rename new-name`                               |
| Set default repo        | `gh repo set-default owner/repo`                        |
| Sync fork with upstream | `gh repo sync`                                          |
| Archive repo            | `gh repo archive`                                       |
| Delete repo             | `gh repo delete owner/repo --yes`                       |
| Add deploy key          | `gh repo deploy-key add key.pub --title "CI key"`       |
| List deploy keys        | `gh repo deploy-key list`                               |

### Releases

| Task                     | Command                                                  |
| ------------------------ | -------------------------------------------------------- |
| Create release           | `gh release create v1.0.0 --notes "Release notes"`       |
| Create release from file | `gh release create v1.0.0 --notes-file CHANGELOG.md`     |
| Create draft release     | `gh release create v1.0.0 --draft --notes "WIP"`         |
| Create prerelease        | `gh release create v1.0.0-rc1 --prerelease --notes "RC"` |
| Generate release notes   | `gh release create v1.0.0 --generate-notes`              |
| Upload assets to release | `gh release upload v1.0.0 ./dist/*.tar.gz`               |
| List releases            | `gh release list`                                        |
| View release             | `gh release view v1.0.0`                                 |
| Download release assets  | `gh release download v1.0.0`                             |
| Edit release             | `gh release edit v1.0.0 --notes "Updated notes"`         |
| Delete release           | `gh release delete v1.0.0 --yes`                         |

### Actions — Workflows

| Task                    | Command                                   |
| ----------------------- | ----------------------------------------- |
| List workflows          | `gh workflow list`                        |
| View workflow           | `gh workflow view <id-or-name>`           |
| Run workflow (dispatch) | `gh workflow run <workflow> --ref main`   |
| Run with inputs         | `gh workflow run <workflow> -f key=value` |
| Enable workflow         | `gh workflow enable <id-or-name>`         |
| Disable workflow        | `gh workflow disable <id-or-name>`        |

### Actions — Runs

| Task                   | Command                                              |
| ---------------------- | ---------------------------------------------------- |
| List recent runs       | `gh run list`                                        |
| List runs for workflow | `gh run list --workflow <name>`                      |
| View run details       | `gh run view <run-id>`                               |
| View run as JSON       | `gh run view <run-id> --json status,conclusion,jobs` |
| View run logs          | `gh run view <run-id> --log`                         |
| Watch run in real time | `gh run watch <run-id>`                              |
| Rerun failed jobs      | `gh run rerun <run-id> --failed`                     |
| Rerun entire run       | `gh run rerun <run-id>`                              |
| Cancel a run           | `gh run cancel <run-id>`                             |
| Download run artifacts | `gh run download <run-id>`                           |
| Delete a run           | `gh run delete <run-id>`                             |

### Actions — Cache

| Task              | Command                       |
| ----------------- | ----------------------------- |
| List caches       | `gh cache list`               |
| Delete a cache    | `gh cache delete <id-or-key>` |
| Delete all caches | `gh cache delete --all`       |

### Search

| Task                | Command                                                 |
| ------------------- | ------------------------------------------------------- |
| Search repos        | `gh search repos "query"`                               |
| Search issues       | `gh search issues "query"`                              |
| Search PRs          | `gh search prs "query"`                                 |
| Search code         | `gh search code "query"`                                |
| Search commits      | `gh search commits "query"`                             |
| Search with filters | `gh search issues "bug" --repo owner/repo --state open` |

### API (Raw Requests)

For anything not covered by built-in commands:

```bash
# GET request
gh api repos/owner/repo

# POST request
gh api repos/owner/repo/issues -f title="Bug" -f body="Details"

# With pagination
gh api repos/owner/repo/issues --paginate

# Using jq for filtering
gh api repos/owner/repo/pulls --jq '.[].title'

# GraphQL query
gh api graphql -f query='{ viewer { login } }'

# PATCH request
gh api repos/owner/repo/issues/1 -X PATCH -f state="closed"

# With JSON template output
gh api repos/owner/repo --template '{{.full_name}}: {{.stargazers_count}} stars'
```

### Configuration

```bash
# Set default editor
gh config set editor vim

# Set default git protocol
gh config set git_protocol ssh

# Set default browser
gh config set browser "firefox"

# Set prompt disabled
gh config set prompt disabled

# View current config
gh config list

# Clear CLI cache
gh config clear-cache
```

## Common Workflows

### Create PR from feature branch (typical flow)

```bash
# Push branch and create PR in one step
git push -u origin HEAD
gh pr create --fill
```

### Ship a feature (with the ship skill)

```bash
# Squash commits, push, open PR
git rebase -i main
git push --force-with-lease origin HEAD
gh pr create --fill --base main
```

### Check CI before merging

```bash
# View checks for current PR
gh pr checks

# Watch checks until they complete
gh pr checks --watch

# If a run failed, check logs
gh run view <run-id> --log

# Rerun failed jobs
gh run rerun <run-id> --failed
```

### Review a PR

```bash
# Checkout the PR locally
gh pr checkout <number>

# View the diff
gh pr diff <number>

# Approve and merge
gh pr review <number> --approve
gh pr merge <number> --squash --delete-branch
```

### Create a release

```bash
# Tag and release with auto-generated notes
gh release create v1.0.0 --generate-notes

# Upload build artifacts
gh release upload v1.0.0 ./dist/*.tar.gz
```

## Cross-Repository Operations

Use `--repo` or `-R` to target a different repository:

```bash
gh pr list -R owner/other-repo
gh issue view 42 -R owner/other-repo
gh run list -R owner/other-repo
```

## Environment Variables

| Variable              | Purpose                                                     |
| --------------------- | ----------------------------------------------------------- |
| `GITHUB_TOKEN`        | Authentication token (alternative to `gh auth login`)       |
| `GH_TOKEN`            | Authentication token (takes precedence over `GITHUB_TOKEN`) |
| `GH_HOST`             | Default GitHub hostname (for Enterprise)                    |
| `GH_ENTERPRISE_TOKEN` | Token for GitHub Enterprise instance                        |
| `GH_REPO`             | Default repository in `owner/repo` format                   |
| `GH_EDITOR`           | Editor for gh commands (overrides `gh config set editor`)   |
| `NO_COLOR`            | Disable color output                                        |
| `GH_PAGER`            | Pager for command output (default: system pager)            |
| `GH_BROWSER`          | Browser to use for `--web` commands                         |

## JSON Output

Most commands support `--json` for structured output:

```bash
# List PR fields as JSON
gh pr view 123 --json title,body,state,labels,reviews

# Combine with --jq for filtering
gh pr list --json number,title,author --jq '.[] | "\(.number) \(.title) by \(.author.login)"'

# Combine with --template for Go templates
gh pr list --json number,title --template '{{range .}}#{{.number}} {{.title}}{{"\n"}}{{end}}'
```

Discover available JSON fields:

```bash
gh pr view --json 2>&1 | head -5   # Shows available fields
gh issue list --json 2>&1 | head -5
```

## Tips

- **`--fill`** auto-populates PR title/body from commit messages — always use it
- **`--web`** opens any resource in the browser — useful for complex reviews
- **`--json`** + **`--jq`** is the best way to extract data for scripting
- **`gh api`** is your escape hatch for anything not covered by commands
- **`gh run watch`** live-streams a workflow run — great for monitoring deploys
- **`gh pr checks --watch`** blocks until all checks pass or fail
- Most commands infer the current repo from git remotes — no need to specify `--repo` in most cases
- Use `gh pr create --fill --draft` to push work-in-progress for CI feedback
