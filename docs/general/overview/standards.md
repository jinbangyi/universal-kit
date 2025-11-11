# Standards

include all the standards of this repo, for example coding standards, design standards, doc standards

## Coding & Design Standards (Concise)

> change content if generated content by AI not match the requirement

General Rules: 

- do not use dynamic import, all the import should usage like: 
  - `import { xx } from 'xx';`
  - `import xx from 'xx';`
  - `import xx;`
- If a function or interface or var is not used by external, should not add `export`

- always use pnpm as package management tool
- All the temp content should write into `<codebase>/debug/`
- All the IMPLEMENTATION SUMMARY should write into `<codebase>/docs/AI/summaries/`

- do not add `index.ts` file to index exporters
- do not add unused variables, functions and classes

## Doc Standards & Maintenance

feature docs should include at least:
- PRD (should be simple and concise), include:
  - Objectives
  - Simple implementation logic
  - Feature list overview
  - User stories / Use cases
  - Rules and constraints
  - Tests list overview
- Design Document
- Implementation Guide
- Testing Plan
