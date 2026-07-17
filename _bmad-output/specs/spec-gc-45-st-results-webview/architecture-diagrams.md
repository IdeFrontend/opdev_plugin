# Architecture Diagrams

## Data and trust flow

```mermaid
flowchart LR
    A[ST execution plan<br/>mode + input + output] --> B[TTK commands]
    B --> C[Completed artifacts<br/>absolute paths stay private]
    C --> D[Strict result CSV parser]
    D --> E[Aggregate report DTO<br/>relative labels + artifact IDs]
    E --> F[ST Results Panel]
    F --> G[Vue summary and table]
    G -->|openResultFile + artifactId| F
    F -->|allow-list lookup and revalidation| H[VS Code text editor]

    D -->|malformed or unknown evidence| I[INVALID report state]
    B -->|nonzero exit or cancellation| J[Existing ST error and partial-artifact path]
```
The extension-host boundary owns filesystem authority, parsing, outcome calculation, and artifact-ID resolution. The webview owns presentation and local filtering only.

## Overall outcome

```mermaid
flowchart TD
    A[All produced artifacts considered] --> B{Any invalid file, row,<br/>required field, or status?}
    B -->|Yes| C[INVALID]
    B -->|No| D{Any precision_status = FAIL?}
    D -->|Yes| E[FAILED]
    D -->|No| F{At least one testcase<br/>and all are PASS?}
    F -->|Yes| G[PASSED]
    F -->|No| C
```
