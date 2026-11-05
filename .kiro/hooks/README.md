# Kiro Hooks for Pipes from the Grave

This directory contains automation hooks that trigger actions during development.

## Intended Hooks

### 1. Node File Creation → Test Stub
**Trigger:** `PostFileCreate`
**Matcher:** `.*nodes/.*\.ts$`
**Action:** Create a corresponding test stub in `tests/nodes/`

When you create a new node file (e.g., `my-node.ts`), this hook will automatically create a test file (e.g., `my-node.test.ts`) with basic test structure.

```json
{
  "version": "v1",
  "hooks": [{
    "name": "Create test stub for new node",
    "trigger": "PostFileCreate",
    "matcher": ".*nodes/.*\\.ts$",
    "action": {
      "type": "command",
      "command": "node .scripts/create-test-stub.js"
    }
  }]
}
```

### 2. Engine Save → Run Tests
**Trigger:** `PostFileSave`
**Matcher:** `.*engine/src/.*\\.ts$`
**Action:** Run engine tests

When you save any engine source file, this hook runs the engine tests to catch regressions early.

```json
{
  "version": "v1",
  "hooks": [{
    "name": "Run engine tests on save",
    "trigger": "PostFileSave",
    "matcher": ".*engine/src/.*\\.ts$",
    "action": {
      "type": "command",
      "command": "npm test -w @pipes/engine"
    }
  }]
}
```

### 3. Server Save → Lint & Type Check
**Trigger:** `PostFileSave`
**Matcher:** `.*server/src/.*\\.ts$`
**Action:** Run TypeScript compiler check

```json
{
  "version": "v1",
  "hooks": [{
    "name": "Type check server on save",
    "trigger": "PostFileSave",
    "matcher": ".*server/src/.*\\.ts$",
    "action": {
      "type": "command",
      "command": "npm run build -w @pipes/server"
    }
  }]
}
```

## Hook File Format

```json
{
  "version": "v1",
  "hooks": [{
    "name": "<human-readable-name>",
    "trigger": "<EventName>",
    "matcher": "<optional-regex>",
    "action": {
      "type": "command",
      "command": "<shell-command>"
    }
  }]
}
```

### Triggers
- `PreToolUse` - Before a tool executes
- `PostToolUse` - After a tool executes
- `PostFileCreate` - After a file is created
- `PostFileSave` - After a file is saved
- `PostFileDelete` - After a file is deleted
- `UserPromptSubmit` - After a user sends a message
- `SessionStart` - When a session begins

### Matcher
Optional regex to filter which events trigger the hook. Applied against:
- Tool name for PreToolUse/PostToolUse
- File path for file events

## Examples

See existing hook files in this directory for working examples.
