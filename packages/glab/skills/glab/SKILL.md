---
name: glab
description: Interact with GitLab from the command line using the glab CLI. Use for merge requests, issues, CI/CD pipelines and jobs, variables, schedules, tokens, releases, repository management, stacked diffs, and GitLab API calls. Requires glab to be installed and authenticated.
compatibility: "Requires glab CLI installed (brew install glab) and authenticated (glab auth login)"
metadata:
  author: josorio7122
  version: "2.0"
---

# GitLab CLI (glab)

Work with GitLab repositories, merge requests, issues, CI/CD, and more from the command line.

## Prerequisites

Verify glab is installed and authenticated:

```bash
glab --version
glab auth status
```

If not authenticated:

```bash
# Interactive login (browser-based OAuth — recommended)
glab auth login

# Or with a personal access token
glab auth login --token <token>

# For self-hosted GitLab instances
glab auth login --hostname gitlab.example.com
```

## Quick Reference

### Merge Requests

| Task | Command |
|------|---------|
| Create MR from current branch | `glab mr create --fill` |
| Create MR with title and description | `glab mr create --title "feat: add X" --description "Details"` |
| Create MR targeting specific branch | `glab mr create --fill --target-branch develop` |
| Create draft MR | `glab mr create --fill --draft` |
| Create MR with labels | `glab mr create --fill --label "bug,priority::high"` |
| Create MR with assignee | `glab mr create --fill --assignee @username` |
| Create MR with reviewer | `glab mr create --fill --reviewer @username` |
| List open MRs | `glab mr list` |
| List my MRs | `glab mr list --author=@me` |
| List MRs for review | `glab mr list --reviewer=@me` |
| View MR details | `glab mr view <id>` |
| View MR diff | `glab mr diff <id>` |
| View MR in browser | `glab mr view <id> --web` |
| Checkout MR locally | `glab mr checkout <id>` |
| Approve MR | `glab mr approve <id>` |
| Revoke MR approval | `glab mr revoke <id>` |
| Merge MR | `glab mr merge <id>` |
| Merge MR with squash | `glab mr merge <id> --squash` |
| Merge when pipeline succeeds | `glab mr merge <id> --when-pipeline-succeeds` |
| Rebase MR | `glab mr rebase <id>` |
| Add note/comment to MR | `glab mr note <id> -m "comment text"` |
| Update MR | `glab mr update <id> --title "new title"` |
| Close MR | `glab mr close <id>` |
| Reopen MR | `glab mr reopen <id>` |
| List MR approvers | `glab mr approvers <id>` |
| List related issues | `glab mr issues <id>` |
| Subscribe to MR | `glab mr subscribe <id>` |
| Unsubscribe from MR | `glab mr unsubscribe <id>` |
| Add MR to todo list | `glab mr todo <id>` |
| Delete MR | `glab mr delete <id>` |

### Issues

| Task | Command |
|------|---------|
| Create issue | `glab issue create --title "Bug: X" --description "Details"` |
| Create issue with labels | `glab issue create --title "X" --label "bug,urgent"` |
| Create confidential issue | `glab issue create --title "X" --confidential` |
| List open issues | `glab issue list` |
| List my issues | `glab issue list --assignee=@me` |
| List issues by label | `glab issue list --label "bug"` |
| View issue | `glab issue view <id>` |
| View issue in browser | `glab issue view <id> --web` |
| Add comment to issue | `glab issue note <id> -m "comment text"` |
| Close issue | `glab issue close <id>` |
| Reopen issue | `glab issue reopen <id>` |
| Update issue | `glab issue update <id> --title "new title"` |
| Subscribe to issue | `glab issue subscribe <id>` |
| Unsubscribe from issue | `glab issue unsubscribe <id>` |
| View issue board | `glab issue board view` |
| Delete issue | `glab issue delete <id>` |

### CI/CD Pipelines

| Task | Command |
|------|---------|
| View current pipeline (interactive TUI) | `glab ci view` |
| View pipeline status | `glab ci status` |
| List recent pipelines | `glab ci list` |
| Get pipeline JSON | `glab ci get` |
| Run a new pipeline | `glab ci run` |
| Run pipeline on branch | `glab ci run --branch <branch>` |
| Run with variables | `glab ci run --variables "KEY1:val1,KEY2:val2"` |
| Run pipeline trigger | `glab ci run-trig --token <token>` |
| Cancel running pipeline | `glab ci cancel` |
| Delete pipeline | `glab ci delete <id>` |
| Retry a job | `glab ci retry <job-id>` |
| Trigger a manual job | `glab ci trigger <job-id>` |
| Trace job log in real time | `glab ci trace <job-id>` |
| Download job artifacts | `glab job artifact <job-id>` |
| Lint CI config | `glab ci lint` |
| Lint specific file | `glab ci lint .gitlab-ci.yml` |
| View CI config | `glab ci config` |

### CI/CD Variables

| Task | Command |
|------|---------|
| List project variables | `glab variable list` |
| Get a variable | `glab variable get <key>` |
| Set a variable | `glab variable set <key> <value>` |
| Update a variable | `glab variable update <key> <value>` |
| Delete a variable | `glab variable delete <key>` |
| Export variables | `glab variable export` |

### CI/CD Schedules

| Task | Command |
|------|---------|
| List schedules | `glab schedule list` |
| Create a schedule | `glab schedule create` |
| Run a schedule | `glab schedule run <id>` |
| Update a schedule | `glab schedule update <id>` |
| Delete a schedule | `glab schedule delete <id>` |

### Repository

| Task | Command |
|------|---------|
| View project info | `glab repo view` |
| View in browser | `glab repo view --web` |
| Clone a project | `glab repo clone <owner/repo>` |
| Clone all group repos | `glab repo clone -g <group>` |
| Fork a project | `glab repo fork <owner/repo>` |
| Create a new project | `glab repo create <name>` |
| Search projects | `glab repo search --search "query"` |
| List your projects | `glab repo list` |
| List contributors | `glab repo contributors` |
| List project members | `glab repo members list` |
| Update project settings | `glab repo update <project> --description "New desc"` |
| Update default branch | `glab repo update <project> --defaultBranch main` |
| Transfer project | `glab repo transfer <repo> --target-namespace <namespace>` |
| Configure mirroring | `glab repo mirror` |
| Publish to CI/CD catalog | `glab repo publish catalog` |
| Archive repo | `glab repo archive` |
| Delete repo | `glab repo delete <owner/repo>` |

### Releases

| Task | Command |
|------|---------|
| Create release | `glab release create <tag> --notes "Release notes"` |
| Create release from file | `glab release create <tag> --notes-file CHANGELOG.md` |
| List releases | `glab release list` |
| View release | `glab release view <tag>` |
| Download release assets | `glab release download <tag>` |
| Upload assets to release | `glab release upload <tag> ./path/to/file` |
| Delete release | `glab release delete <tag>` |

### Tokens

| Task | Command |
|------|---------|
| List tokens | `glab token list` |
| Create a token | `glab token create` |
| Revoke a token | `glab token revoke <id>` |
| Rotate a token | `glab token rotate <id>` |

### Stacked Diffs (Experimental)

| Task | Command |
|------|---------|
| Create a new stack | `glab stack create <name>` |
| Save current changes to stack | `glab stack save` |
| Amend current stack entry | `glab stack amend` |
| Sync stack with remote | `glab stack sync` |
| List stack entries | `glab stack list` |
| Move to next entry | `glab stack next` |
| Move to previous entry | `glab stack prev` |
| Move to first/last entry | `glab stack first` / `glab stack last` |
| Switch to a stack entry | `glab stack switch <name>` |
| Reorder stack entries | `glab stack reorder` |

### Labels, Milestones, and Snippets

| Task | Command |
|------|---------|
| List labels | `glab label list` |
| Create label | `glab label create <name> --color "#hex"` |
| List milestones | `glab milestone list` |
| Create snippet | `glab snippet create <file> --title "name"` |
| List snippets | `glab snippet list` |

### SSH and Deploy Keys

| Task | Command |
|------|---------|
| List SSH keys | `glab ssh-key list` |
| Add SSH key | `glab ssh-key add <key-file>` |
| List deploy keys | `glab deploy-key list` |
| Add deploy key | `glab deploy-key add <key-file>` |

### Secure Files

| Task | Command |
|------|---------|
| List secure files | `glab securefile list` |
| Get secure file info | `glab securefile get <id>` |
| Upload secure file | `glab securefile create <file>` |
| Download secure file | `glab securefile download <id>` |
| Remove secure file | `glab securefile remove <id>` |

### Changelog

```bash
# Generate a changelog
glab changelog generate
```

### GitLab Duo AI

```bash
# Ask GitLab Duo a question about Git
glab duo ask "How do I rebase my branch?"
```

### API (Raw Requests)

For anything not covered by built-in commands. Supports placeholder values (`:fullpath`, `:namespace`, `:repo`, `:branch`, `:id`, `:user`, `:username`, `:group`) auto-resolved from the current git directory.

```bash
# GET request
glab api projects/:fullpath/members

# POST request (adding --field changes default method to POST)
glab api projects/:fullpath/issues --field "title=Bug" --field "description=Details"

# String parameters (no type conversion)
glab api projects/:fullpath/issues --raw-field "title=Bug"

# With pagination
glab api projects/:fullpath/merge_requests --paginate

# Paginate with ndjson output (memory-efficient for large datasets)
glab api issues --paginate --output ndjson

# Filter with jq
glab api issues --paginate --output ndjson | jq 'select(.state == "opened")'

# GraphQL query
glab api graphql -f query='{ currentUser { username } }'

# GraphQL with pagination ($endCursor variable auto-managed)
glab api graphql --paginate -f query='
  query($endCursor: String) {
    project(fullPath: "group/project") {
      issues(first: 10, after: $endCursor) {
        edges { node { title } }
        pageInfo { endCursor hasNextPage }
      }
    }
  }'

# Read body from file
glab api projects/:fullpath/issues --input body.json
```

### Configuration

Settings can be set globally (`-g`) or per-project:

```bash
# Set default editor
glab config set editor vim

# Set default git protocol
glab config set git_protocol ssh

# Set pager
glab config set glab_pager "less -R"

# Set Markdown style (dark, light, notty)
glab config set glamour_style dark

# Enable hyperlinks in issue/MR lists
glab config set display_hyperlinks true

# Set default browser
glab config set browser firefox

# Disable update checks
glab config set check_update false

# Disable telemetry
glab config set telemetry false

# View current config
glab config list

# Edit config file directly
glab config edit

# Set per-host config
glab config set --host gitlab.example.com token <token>
```

## Common Workflows

### Create MR from feature branch (typical flow)

```bash
# Push branch and create MR in one step
git push -u origin HEAD
glab mr create --fill --squash-message-on-merge
```

### Ship a feature (with the ship skill)

```bash
# Squash commits, push, open MR
git rebase -i main
git push --force-with-lease origin HEAD
glab mr create --fill --target-branch main --squash-message-on-merge
```

### Check CI before merging

```bash
# View pipeline for current branch
glab ci status
glab ci view

# If a job failed, check logs
glab ci trace <job-id>

# Retry a failed job
glab ci retry <job-id>
```

### Review an MR

```bash
# Check out the MR locally
glab mr checkout <id>

# View the diff
glab mr diff <id>

# Approve and merge
glab mr approve <id>
glab mr merge <id> --squash
```

## Cross-Repository Operations

Use `--repo` or `-R` to target a different project. Accepts `OWNER/REPO`, `GROUP/NAMESPACE/REPO`, full URL, or Git URL:

```bash
glab mr list -R group/namespace/project
glab issue view 42 -R other-team/their-repo
```

## Environment Variables

| Variable | Purpose |
|----------|---------|
| `GITLAB_TOKEN` | Authentication token (alternative to `glab auth login`) |
| `GITLAB_HOST` or `GL_HOST` | Default GitLab hostname (default: `https://gitlab.com`) |
| `GLAB_CONFIG_DIR` | Custom config directory (default: `~/.config/glab`) |
| `VISUAL` / `EDITOR` | Editor for authoring text (`VISUAL` takes precedence) |
| `BROWSER` | Web browser for opening links |
| `NO_COLOR` | Disable color output |
| `NO_PROMPT` | Disable interactive prompts |
| `DEBUG` | Enable verbose logging including git commands and DNS details |
| `GLAB_DEBUG_HTTP` | Log HTTP request/response transport information |
| `FORCE_HYPERLINKS` | Force hyperlinks in output even when not a TTY |
| `GLAB_CHECK_UPDATE` | Force update check (default: once per day) |
| `GLAB_SEND_TELEMETRY` | Set `false` to disable telemetry |
| `GITLAB_CLIENT_ID` | Custom OAuth client ID |
| `GLAMOUR_STYLE` | Markdown renderer style: `dark`, `light`, `notty` |
| `REMOTE_ALIAS` / `GIT_REMOTE_URL_VAR` | Git remote alias containing GitLab URL |
| `GLAB_ENABLE_CI_AUTOLOGIN` | Set `true` to auto-login in GitLab CI using `CI_JOB_TOKEN` (experimental) |

## Tips

- **`--fill`** auto-populates MR title/description from commit messages — always use it
- **`--web`** opens any resource in the browser — useful for complex reviews
- **`glab ci view`** is interactive — navigate jobs, view logs, retry from the TUI
- **`glab api`** is your escape hatch for anything not covered by commands — supports REST and GraphQL
- **`glab stack`** enables stacked diffs workflow — create small, reviewable changes that build on each other
- **`--output ndjson`** with `--paginate` in `glab api` is memory-efficient for large result sets
- Most commands infer the current project from git remotes — no need to specify `--repo` in most cases
- Aliases: `glab ci` = `glab pipe`/`glab pipeline`, `glab repo` = `glab project`, `glab variable` = `glab var`, `glab schedule` = `glab sched`/`glab skd`
