# Browser Control MCP - Project Context

## Project Overview

**Browser Control MCP** is a Model Context Protocol (MCP) server that enables AI assistants and other MCP clients to control browser tabs through a Firefox extension. The project provides a secure WebSocket-based communication channel between MCP clients and the browser extension.

## Directus Project
- **Name**: Browser Control MCP
- **ID**: 2

## Project Type
**Existing Project** - This is a mature, functional project with established architecture and implementation.

## Architecture

### High-Level Architecture
The project follows a **client-server-extension** architecture with three main components:

```
MCP Client ←→ MCP Server ←→ WebSocket ←→ Firefox Extension ←→ Browser Tabs
```

### Technology Stack

#### Backend/Server
- **Runtime**: Node.js with TypeScript
- **MCP Framework**: @modelcontextprotocol/sdk
- **WebSocket**: ws library
- **Build System**: Nx monorepo
- **Package Manager**: npm

#### Frontend/Extension
- **Platform**: Firefox WebExtension API
- **Language**: TypeScript
- **Build Tool**: esbuild
- **Testing**: Jest

#### Shared/Common
- **Language**: TypeScript
- **Purpose**: Shared type definitions and message schemas

## Project Structure

```
browser-control-mcp/
├── mcp-server/          # MCP server implementation
│   ├── server.ts        # Main MCP server with tool definitions
│   ├── browser-api.ts   # WebSocket communication with extension
│   ├── util.ts          # Utility functions
│   └── package.json     # Server dependencies
├── firefox-extension/   # Firefox extension/add-on
│   ├── background.ts    # Extension background script
│   ├── options.ts       # Extension options page
│   ├── options.html     # Options page UI
│   └── package.json     # Extension dependencies
├── common/              # Shared type definitions
│   ├── extension-messages.ts  # Extension message types
│   ├── server-messages.ts     # Server message types
│   └── index.ts         # Exports
└── nx.json              # Nx monorepo configuration
```

## Core Functionality

### MCP Tools Provided
1. **open-browser-tab** - Opens new tabs in the user's browser
2. **close-browser-tabs** - Closes specified tabs by ID
3. **get-browser-tabs** - Retrieves list of open tabs
4. **get-tab-content** - Gets content from specific tabs
5. **navigate-tab** - Navigates existing tabs to new URLs
6. **get-browser-history** - Retrieves browser history

### Security Model
- **Shared Secret Authentication**: Uses a shared secret between MCP server and extension
- **WebSocket Communication**: Secure local WebSocket connection (ports 8081/8082)
- **Request Correlation**: Each request has a unique correlation ID for tracking
- **Timeout Protection**: 1-second timeout for extension responses

## Key Features
- **Multi-client Support**: Supports up to 2 concurrent MCP server instances
- **Error Handling**: Comprehensive error handling and timeout management
- **Type Safety**: Full TypeScript implementation with shared type definitions
- **Testing**: Jest test suite for extension components
- **Monorepo Structure**: Nx-based monorepo for organized development

## Current Version
- **Project Version**: 1.2.0 (root package)
- **MCP Server Version**: 1.3.0
- **Firefox Extension Version**: 1.3.0

## License
MIT License (Copyright 2025 eyalzh)

## Development Status
This is a **production-ready** project with established patterns and working functionality. Any modifications should maintain backward compatibility and follow the existing architectural patterns.