# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a **production-ready TypeScript monorepo** for API usage observation and monitoring libraries. The project provides comprehensive tools for measuring and tracking external API usage with advanced logging capabilities, provider-level monitoring, and OpenTelemetry integration.

## Technology Stack

- **Package Manager**: pnpm v8.15.0 with workspace dependencies
- **Monorepo Tool**: Turbo v2.5.8 for build orchestration and caching
- **Language**: TypeScript v5.3.0 (ES2022 target, Node.js >= 20.0.0)
- **Build Tool**: tsup v8.5.0 for fast TypeScript compilation
- **Testing**: Jest v29.7.0 with ts-jest transformer
- **Linting**: ESLint v9.0.0 with TypeScript ESLint plugin
- **Formatting**: Prettier v3.6.2
- **Logger**: Winston v3.11.0 with custom structured logging
- **Observability**: OpenTelemetry SDK (full logs, metrics, traces)
- **HTTP Client**: Axios v1.13.1 wrapper with provider monitoring
- **Metrics**: prom-client v15.1.3 for Prometheus support

## Core Functionality (✅ Implemented)

The repository provides:

- **@universal-kit/logger** (v0.1.2): Winston-based structured logging with metadata, OpenTelemetry integration, and function tracking decorators
- **@universal-kit/metrics-client** (v0.1.2): HTTP client wrapper with provider monitoring, API key tracking, request tracing, and automatic metrics collection
- **@universal-kit/otel** (v0.1.2): Full OpenTelemetry SDK with auto-instrumentations and multiple exporters

## Development Commands

```bash
# Package management
pnpm install                    # Install all workspace dependencies
pnpm clean:node_modules        # Remove all node_modules recursively

# Build system (Turbo-managed)
pnpm build                      # Build all packages with dependency graph
pnpm dev                       # Watch mode for development
pnpm clean                     # Remove build artifacts

# Code quality
pnpm lint                      # ESLint across all packages
pnpm lint:fix                  # Auto-fix linting issues
pnpm format                    # Format code with Prettier
pnpm format:check              # Check formatting without changes

# Testing
pnpm test                      # Jest test suite with coverage
pnpm test:watch                # Watch mode for tests
pnpm test:coverage             # Generate coverage reports

# Deployment pipeline
pnpm prerelease                # Build + test + lint (quality gate)
pnpm deploy                    # Full deployment pipeline
pnpm publish:packages          # Publish all @universal-kit/* packages
```

## Package Structure

```
packages/
├── logger/                     # Winston-based logger with structured logging and OpenTelemetry
│   ├── src/
│   │   ├── logger.ts          # Main Logger class
│   │   └── decorators.ts      # Function tracking decorator
│   └── dist/                  # Built modules (ESM + CJS + declarations)
├── metrics-client/             # HTTP client wrapper with provider monitoring
│   ├── src/
│   │   ├── http-client/       # Base classes and wrappers
│   │   ├── metrics/           # Provider metrics management
│   │   ├── tracing/           # Request tracing implementation
│   │   └── typing.ts          # Type definitions
│   └── dist/                  # Built modules (ESM + CJS + declarations)
└── otel/                       # Full OpenTelemetry SDK integration
    ├── src/
    │   └── otel-provider.ts   # Main OtelProvider class
    └── dist/                  # Built modules (ESM + CJS + declarations)
```

## Key Features

### Logger Package
- **Winston-based structured logging** with metadata support
- **OpenTelemetry integration** for enterprise observability correlation
- **Function tracking decorator** (`@trackFunction`) for automatic measurement
- **Advanced logging features**: child loggers, log querying, streaming, dynamic levels
- **Request ID tracking** for distributed tracing correlation

### Metrics Client Package
- **Provider-level monitoring**: Track usage per API provider with success rates and analytics
- **Dual HTTP client support**: `AxiosWrapper` (Axios-compatible) and `NodeFetchWrapper`
- **API key tracking**: Monitor usage by API key with automatic hashing for privacy
- **Request tracing**: Comprehensive request lifecycle tracking with error analysis
- **Automatic metrics**: Latency, counters, gauges via OpenTelemetry
- **Retry logic**: Configurable retry mechanisms with exponential backoff
- **Request/response sizing**: Automatic calculation for monitoring

### OpenTelemetry Package
- **Complete OTel SDK**: Full support for logs, metrics, and traces
- **Auto-instrumentation**: Node.js auto-instrumentations for common libraries
- **Multiple exporters**: OTLP, Prometheus, and custom exporters
- **Resource management**: Standard OTel resource configuration
- **Enterprise-ready**: Production-grade configuration with sensible defaults

## Architecture

The project follows a modular monorepo architecture with clear separation of concerns:

- **Logger package**: Winston-based structured logging with OpenTelemetry correlation and function tracking
- **Metrics Client package**: HTTP client wrappers with provider monitoring, API key tracking, and comprehensive metrics
- **OTel package**: Full OpenTelemetry SDK integration for enterprise observability

### Integration Patterns
- **Workspace dependencies**: `@universal-kit/metrics-client` depends on `@universal-kit/logger`
- **Dual module output**: All packages export ESM and CommonJS with TypeScript declarations
- **OpenTelemetry correlation**: All packages integrate seamlessly with shared tracing contexts
- **Provider monitoring**: Metrics client provides detailed analytics per API provider

## Current Status

**Phase**: ✅ Production-ready - all features fully implemented and tested
**Version**: v0.1.2 (all packages)
**Repository**: https://github.com/jinbangyi/universal-kit.git
**License**: MIT (all packages)
**Node.js Support**: >= 20.0.0
**Module Output**: Dual ESM/CommonJS with TypeScript declarations
**Build System**: Turbo + tsup with optimized caching
**Test Coverage**: Comprehensive test suites with Jest
**Documentation**: Complete README.md files with usage examples

## Package Publishing

All packages are published to npm with:
- **Public access**: `@universal-kit/*` packages are publicly available
- **Dual modules**: Both ESM (`./dist/index.js`) and CommonJS (`./dist/index.cjs`)
- **TypeScript support**: Full type declarations (`./dist/index.d.ts`)
- **Version synchronization**: All packages maintain consistent v0.1.2 version

## Important Notes

- **Workspace management**: Uses pnpm workspaces with `workspace:^0.1.2` dependencies
- **Build caching**: Turbo provides intelligent caching for builds and tests
- **Quality gates**: Pre-release checks include build, test, and lint validation
- **Example usage**: Documentation includes production-ready configuration examples
- **OpenTelemetry ready**: All packages designed to work seamlessly with enterprise observability stacks

## Critical Development Guidelines

- **Documentation First**: Always read all files in `docs/general/overview/` before starting any work to understand project structure, coding rules, and requirements
- **Integration Testing Only**: Create integration tests for user workflows, not unit tests for individual functions
- **Three-Step Rule**: All library usage must be achievable in ≤3 steps for users
- **Observability by Default**: All features must include comprehensive metrics, traces, and logs
- **Privacy Protection**: API keys and sensitive data must be automatically hashed/truncated
