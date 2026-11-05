# Ghost Builder Feature

## Feature Description
AI-powered pipe builder that constructs pipes from natural language descriptions. Uses MCP to interact with the engine and generate node configurations.

## EARS Requirements

### Episode
As a user, I want to describe my pipe in one sentence so I can avoid manual node configuration.

### Action
The Ghost parses the description, determines required nodes and parameters, and constructs a valid pipe.

### Result
A functional pipe is created that matches the user's intent.

## Acceptance Criteria
1. Accepts a single-sentence natural language description
2. Identifies source node type (RSS or JSON)
3. Identifies transformations (filter, sort, truncate, etc.)
4. Identifies output type (RSS or JSON)
5. Generates valid node connections
6. Returns errors if description is ambiguous or impossible
7. Ghost provides helpful feedback during construction

## Natural Language Patterns

| Pattern | Nodes Generated |
|---------|-----------------|
| "Fetch RSS from X, filter by category, output JSON" | FetchRSS → Filter → OutputJSON |
| "Get JSON from Y, sort descending, truncate to 5" | FetchJSON → Sort → Truncate → OutputJSON |
| "Merge two RSS feeds, output RSS" | FetchRSS + FetchRSS → Merge → OutputRSS |

## Ghost Voice Requirements
- Short, eerie, helpful messages
- Confirm construction steps
- Explain errors playfully