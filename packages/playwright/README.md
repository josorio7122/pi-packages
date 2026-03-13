# @josorio/playwright

Pi skill for browser automation with Playwright.

## Overview

General-purpose browser automation skill for the pi coding agent. Auto-detects running dev servers, writes clean test scripts to `/tmp`, and executes them via a universal runner.

## Features

- Auto-detects running dev servers on common ports
- Visible browser by default (`headless: false`) for easy debugging
- Universal executor supports file paths, inline code, and stdin
- Custom HTTP header injection via environment variables
- Helper utilities: safe click/type, screenshots, cookie banners, table extraction

## Setup

```bash
cd skills/playwright
node run.js  # Playwright installs automatically on first run
```

Or install browsers manually:

```bash
npx playwright install chromium
```

## Usage

See [skills/playwright/SKILL.md](skills/playwright/SKILL.md) for the full skill documentation and usage patterns.

See [skills/playwright/API_REFERENCE.md](skills/playwright/API_REFERENCE.md) for the complete Playwright API reference.
