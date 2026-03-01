# create-skill

Expert skill for creating [pi](https://github.com/mariozechner/pi) skills following the [Agent Skills spec](https://agentskills.io).

## What It Does

Guides the agent through a structured workflow for creating new skills:

1. Read the Agent Skills specification
2. Clarify intent and scope with the user
3. Choose structure (instruction-only vs. scripts vs. assets)
4. Write SKILL.md with proper frontmatter, instructions, and references
5. Validate against the spec using `skills-ref`

## Usage

```
I need a skill for managing Docker containers — use the create-skill skill to build it.
```

The skill handles naming rules, description best practices, frontmatter validation, directory structure, and script guidelines.

## Full Reference

See the [SKILL.md](./skills/create-skill/SKILL.md) for the complete creation workflow, spec quick reference, and validation instructions.

## License

MIT
