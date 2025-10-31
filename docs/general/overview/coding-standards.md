# Coding & Design Standards

This document outlines the coding standards and design patterns established for the Universal Kit project based on development history and best practices.

## 🎯 Project Standards

### Environment Rules
- **Debug Content**: All temporary content should be written into `<codebase>/debug/`
- **Implementation Summaries**: All implementation summaries should be written into `<codebase>/docs/AI/summaries/`

## 🏗️ Architecture Principles

### Monorepo Structure
```
universal-kit/
├── packages/           # Individual packages
├── examples/           # Usage examples and documentation
├── docs/              # Project documentation
└── debug/             # Temporary debugging content
```

### Package Organization
- **Logger Package** (`@universal-kit/logger`): Structured logging
- **Metrics Client** (`@universal-kit/metrics-client`): HTTP client wrappers with monitoring

### Technology Stack
- **Package Manager**: pnpm
- **Monorepo Tool**: Turbo
- **Language**: TypeScript (Node.js > 20)
- **Linting**: ESLint v9 (flat configuration)
- **Observability**: OpenTelemetry only (no Prometheus)

## 📝 Code Style Guidelines

### Import Organization
```typescript
// External dependencies first
import axios from 'axios';
import { Logger } from '@universal-kit/logger';

// Internal dependencies second
import { BaseHttpClient } from './common';
import { ProviderMetricsManager } from '../metrics/api-provider-metrics';
```

## 📋 Code Review Checklist

### Before Committing
- [ ] TypeScript compilation succeeds (`pnpm build`)
- [ ] Linting passes (`pnpm lint`)
- [ ] All public APIs have JSDoc comments
- [ ] Error handling is comprehensive
- [ ] Metrics and tracing are properly implemented
- [ ] Type safety is maintained (no `any` unless justified)

### Design Review
- [ ] Follows established patterns (BaseHttpClient, composition)
- [ ] Configuration is handled consistently
- [ ] Privacy is protected (API key hashing)
- [ ] Observability is comprehensive (metrics + tracing)
- [ ] Dependencies are minimal and appropriate

## 🚀 Development Workflow

### 1. Feature Development
1. Update interfaces in core package first
2. Implement functionality in appropriate package
3. Create comprehensive examples
4. Update documentation
5. Run full test suite
