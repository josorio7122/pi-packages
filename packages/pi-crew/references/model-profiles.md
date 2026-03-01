# Model Profiles

## Profiles

| Profile  | Use when                                                 | Cost |
| -------- | -------------------------------------------------------- | ---- |
| quality  | Critical features, production code, complex architecture | $$$  |
| balanced | General development (default)                            | $$   |
| budget   | Exploration, prototyping, documentation                  | $    |

## Profile → Model Mapping

### quality

| Agent      | Model             | Tier     |
| ---------- | ----------------- | -------- |
| scout      | claude-sonnet-4-5 | budget   |
| researcher | claude-sonnet-4-5 | budget   |
| architect  | claude-opus-4     | quality  |
| executor   | claude-sonnet-4-5 | balanced |
| reviewer   | claude-sonnet-4-5 | balanced |
| debugger   | claude-opus-4     | quality  |

### balanced (default)

| Agent      | Model             | Tier     |
| ---------- | ----------------- | -------- |
| scout      | claude-haiku-4-5  | budget   |
| researcher | claude-haiku-4-5  | budget   |
| architect  | claude-sonnet-4-5 | quality  |
| executor   | claude-sonnet-4-5 | balanced |
| reviewer   | claude-sonnet-4-5 | balanced |
| debugger   | claude-sonnet-4-5 | quality  |

### budget

| Agent      | Model             | Tier     |
| ---------- | ----------------- | -------- |
| scout      | claude-haiku-4-5  | budget   |
| researcher | claude-haiku-4-5  | budget   |
| architect  | claude-sonnet-4-5 | quality  |
| executor   | claude-haiku-4-5  | balanced |
| reviewer   | claude-haiku-4-5  | balanced |
| debugger   | claude-sonnet-4-5 | quality  |

## Per-Agent Overrides

Set in `.crew/config.json`:

```json
{
  "profile": "balanced",
  "overrides": {
    "executor": "claude-opus-4"
  }
}
```

Override takes precedence over profile mapping.

## Switching Profiles

```
/crew:profile quality    # Switch to quality profile
/crew:profile budget     # Switch to budget profile
/crew:override executor claude-opus-4  # Override single agent
```
