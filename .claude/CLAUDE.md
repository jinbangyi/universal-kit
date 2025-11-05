# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a **production-ready TypeScript monorepo** for API usage observation and monitoring libraries. The project provides comprehensive tools for measuring and tracking external API usage with advanced logging capabilities and OpenTelemetry integration.

## Technology Stack

- **Package Manager**: pnpm v8.15.0
- **Monorepo Tool**: Turbo for build orchestration
- **Language**: TypeScript (ES2022 target, Node.js >= 20.0.0)
- **Testing**: Jest with ts-jest transformer
- **Linting**: ESLint with TypeScript ESLint plugin
- **Logger**: Winston with custom structured logging
- **Observability**: OpenTelemetry (OTel) protocol support
- **HTTP Client**: Axios-based wrapper with metrics

## Core Functionality (✅ Implemented)

The repository provides:

- **@universal-kit/logger**: Winston-based structured logging with metadata (v0.1.0)
- **@universal-kit/http-client**: HTTP client wrapper with automatic API usage measurement (v0.1.0)
- **@universal-kit/otel**: Full OpenTelemetry protocol support (v0.1.0)

## Development Commands

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm build

# Run linting
pnpm lint

# Run tests
pnpm test

# Run example
pnpm example
```

## Package Structure

```
packages/
├── logger/         # Winston-based logger with structured logging, request ID tracking
├── http-client/    # Axios wrapper with automatic metrics and retry logic
└── otel/           # Full OpenTelemetry SDK with logs, metrics, traces
```

## Key Features

- **API Usage Measurement**: Automatic tracking of HTTP calls with timing and metadata
- **Structured Logging**: Winston-based logging with request correlation and metadata
- **OpenTelemetry Integration**: Complete observability protocol support for enterprise use
- **Request ID Tracking**: Correlated logging across operations
- **Advanced Logging**: Log querying, streaming, child loggers, dynamic log levels

## Architecture

The project follows a monorepo structure with clear separation of concerns:

- **Logger package** handles structured logging with Winston
- **HTTP client** wraps Axios with automatic metrics collection
- **OTel package** enables enterprise observability integration

## Current Status

**Phase**: ✅ Production-ready - all features fully implemented and tested
**Version**: v0.1.0 (all packages)
**Test Coverage**: Comprehensive test suites (9 test files)
**Documentation**: Complete with working examples in `/examples/basic-usage/`

## Important Notes

- The `docs/developer` directory is excluded from git (see .gitignore)
- Check `docs/general/overview/` for high-level project understanding
- Example application demonstrates all features with practical use cases
- All packages are published with CommonJS modules and TypeScript declarations
- Built-in request ID generation and correlation for distributed tracing
