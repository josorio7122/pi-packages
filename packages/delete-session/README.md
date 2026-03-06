# @josorio/delete-session

Pi extension that adds `/delete` to delete the current session.

## Behavior

- Deletes the current session immediately (no confirmation)
- If other sessions exist for the same working directory, switches to the most recent one
- If no other sessions exist, creates a fresh session first
- The deleted session will no longer appear in `/resume`

## Usage

```
/delete
```
