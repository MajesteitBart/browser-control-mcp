# Task Context: Add Screenshot Functionality to Browser Control MCP

## Request Overview
**Task ID**: SCREENSHOT-001  
**Date**: 2025-01-26  
**Requestor**: User  
**Priority**: High  

## User Requirements
As a user of the Browser Control MCP, I want to enable my AI tools to use Firefox to browse the web and take screenshots of active tabs. This way, I can test my web applications as if it was user testing.

## Current Architecture Analysis
The Browser Control MCP currently consists of:
- **MCP Server** (Node.js/TypeScript): Provides tools for browser control via WebSocket communication
- **Firefox Extension** (WebExtension): Handles browser API calls and communicates with MCP server
- **Common Package** (TypeScript): Shared message types and interfaces

### Existing Tools
1. `open-browser-tab` - Opens new tabs
2. `close-browser-tabs` - Closes specified tabs  
3. `get-list-of-open-tabs` - Retrieves open tabs
4. `get-tab-web-content` - Gets webpage content
5. `get-recent-browser-history` - Retrieves browser history
6. `reorder-browser-tabs` - Changes tab order
7. `find-highlight-in-browser-tab` - Finds and highlights text

### Communication Flow
```
MCP Client → MCP Server → WebSocket → Firefox Extension → Browser APIs
```

## Screenshot Functionality Requirements

### Functional Requirements
1. **Screenshot Capture**: Capture visible content of specified browser tab
2. **Image Format**: Support PNG format for high quality screenshots
3. **Data Transfer**: Return screenshot as Base64-encoded string via MCP tool
4. **Tab Validation**: Verify tab exists and is accessible before capture
5. **Error Handling**: Graceful handling of permission errors, invalid tabs, etc.
6. **Security**: Respect user privacy and browser security model

### Non-Functional Requirements
1. **Performance**: Screenshot capture should complete within 5 seconds
2. **Quality**: High-quality screenshots suitable for visual testing
3. **Compatibility**: Work with Firefox WebExtensions API
4. **Security**: Use minimal required permissions (activeTab)
5. **Reliability**: Robust error handling and recovery

## Technical Implementation Plan

### Phase 1: Core Message Types (TASK-002)
**Files to Modify:**
- `common/server-messages.ts` - Add screenshot request message
- `common/extension-messages.ts` - Add screenshot response message  
- `common/index.ts` - Export new types

**New Message Types:**
```typescript
// Server Message
interface TakeScreenshotServerMessage extends ServerMessageBase {
  cmd: "take-screenshot";
  tabId: number;
  format?: "png" | "jpeg";
  quality?: number; // 0-100 for JPEG
}

// Extension Response
interface ScreenshotExtensionMessage extends ExtensionMessageBase {
  resource: "screenshot";
  tabId: number;
  imageData: string; // Base64 encoded
  format: string;
  timestamp: number;
}
```

### Phase 2: MCP Server Implementation (TASK-003)
**Files to Modify:**
- `mcp-server/server.ts` - Add new tool definition
- `mcp-server/browser-api.ts` - Add screenshot method

**New Tool Specification:**
```typescript
mcpServer.tool(
  "take-screenshot",
  "Take a screenshot of the specified browser tab",
  { 
    tabId: z.number(),
    format: z.enum(["png", "jpeg"]).optional().default("png"),
    quality: z.number().min(1).max(100).optional().default(90)
  },
  async ({ tabId, format, quality }) => {
    // Implementation
  }
);
```

### Phase 3: Firefox Extension Implementation (TASK-004)
**Files to Modify:**
- `firefox-extension/message-handler.ts` - Add screenshot handler
- `firefox-extension/manifest.json` - Add activeTab permission

**Screenshot Implementation:**
- Use `browser.tabs.captureTab()` API
- Handle tab activation if needed
- Encode image data as Base64
- Return via WebSocket to MCP server

### Phase 4: Configuration and Options (TASK-006)
**Files to Modify:**
- `firefox-extension/extension-config.ts` - Add screenshot settings
- `firefox-extension/options.html` - Add UI controls
- `firefox-extension/options.ts` - Handle screenshot preferences

**Configuration Options:**
- Default screenshot format (PNG/JPEG)
- Default quality setting
- Enable/disable screenshot functionality
- Maximum screenshot dimensions

### Phase 5: Testing and Documentation (TASK-008, TASK-009)
**Files to Create/Modify:**
- `firefox-extension/__tests__/screenshot.test.ts` - Unit tests
- `docs/README.md` - Updated documentation
- `docs/API.md` - Screenshot tool documentation

## Security Considerations
1. **Permissions**: Use `activeTab` permission instead of broad tab access
2. **Validation**: Verify tab accessibility before screenshot
3. **Privacy**: No automatic screenshots without explicit tool calls
4. **Data Handling**: Secure Base64 encoding and transmission

## Error Scenarios and Handling
1. **Invalid Tab ID**: Return error message with available tab IDs
2. **Permission Denied**: Guide user to activate tab first
3. **Tab Not Loaded**: Wait for tab to finish loading or timeout
4. **Screenshot Failure**: Retry mechanism with fallback options
5. **Large Image Data**: Implement size limits and compression

## Testing Strategy
1. **Unit Tests**: Mock browser APIs and test message handling
2. **Integration Tests**: End-to-end screenshot capture flow
3. **Manual Testing**: Real browser testing with various websites
4. **Performance Testing**: Screenshot capture timing and memory usage
5. **Security Testing**: Permission validation and error handling

## Success Criteria
1. ✅ New `take-screenshot` MCP tool available
2. ✅ Screenshots captured as Base64 PNG/JPEG data
3. ✅ Proper error handling for all failure scenarios
4. ✅ Updated documentation and examples
5. ✅ Comprehensive test coverage
6. ✅ No breaking changes to existing functionality

## Dependencies and Constraints
- **Firefox Version**: Requires Firefox with WebExtensions support
- **Permissions**: User must approve activeTab permission
- **Tab State**: Tab must be loaded and accessible
- **Memory**: Large screenshots may impact performance
- **Network**: Base64 encoding increases data size by ~33%

## Rollback Plan
If implementation fails:
1. Revert message type changes
2. Remove screenshot tool from server
3. Restore original manifest permissions
4. Update documentation to remove screenshot references
5. Maintain backward compatibility with existing tools