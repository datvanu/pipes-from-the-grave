# Pipe Engine Feature

## Feature Description
Core engine that executes data pipes with typed nodes and connections. Pure implementation with property-based tests.

## EARS Requirements

### Episode
As a data pipeline executor, I want to run pipes with multiple connected nodes so that data transforms correctly from source to output.

### Action
The engine processes a pipe definition by evaluating nodes in topological order, passing data through connections.

### Result
Pipes execute end-to-end with correct transformations. Errors are caught and reported with node-specific context.

## Acceptance Criteria
1. Nodes execute in valid topological order based on connections
2. Data flows from source nodes (Fetch) through intermediate nodes (Filter, Sort, etc.) to output nodes
3. Each node type produces expected output format (RSS XML or JSON)
4. Circular connections are detected and rejected before execution
5. Missing required node parameters throw typed errors
6. All node types have property-based tests with fast-check

## Node Types
- **FetchRSS**: URL → RSS feed data
- **FetchJSON**: URL → JSON data
- **Filter**: Data → Filtered data (predicate)
- **Sort**: Data → Sorted data (compare function)
- **Merge**: [Data, ...Data] → Merged data
- **Truncate**: Data → Truncated data (count limit)
- **Regex**: Data → Data with regex replacement
- **Rename**: Data → Data with key rename
- **OutputRSS**: Data → RSS XML string
- **OutputJSON**: Data → JSON string

## Test Coverage
- Topological sort with multiple valid and invalid graphs
- All node transformations with arbitrary inputs
- Error cases: circular dependencies, invalid connections, missing params