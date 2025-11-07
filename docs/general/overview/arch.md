# Arch

## Technology Stack

- **Package Manager**: pnpm
- **Monorepo Tool**: Turbo
- **Language**: TypeScript (Node.js > 20)
- **Linting**: ESLint
- **Test Framework**: jest
- **Protocol**: OpenTelemetry (OTel) support
- **Base Logger**: Winston

## Directory Structure

```
xneuro-core/
├── docs/
│   ├── developer/                     # docs for developer, easy for edit and read
│   ├── AI/                            # AI generated docs, summaries. AI generated docs are too comprehensive to read, so should only used for reference only.
│   └── general/                       # general docs for other user
│       └── overview/                  # overview of this repo, coding agent should always load content in this dir to take a overview of this repo
│           ├── prd.md                 # describe what this repo can do
│           ├── arch.md                # arch for this repo
│           ├── coding-rules.md        # user create coding rules for this repo
│           └── coding-standards.md    # AI generate coding standards summary of this repo
```
