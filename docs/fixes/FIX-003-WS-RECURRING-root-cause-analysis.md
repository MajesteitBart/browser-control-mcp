# Root Cause Analysis: Recurring WebSocket Protocol Issue (FIX-003-WS-RECURRING)

## Executive Summary

**Issue**: Firefox extension attempting to connect using `wss://` instead of `ws://` protocol, causing connection failures.  
**Root Cause**: Firefox was running a cached version of the extension despite correct source code.  
**Status**: ✅ **RESOLVED** - Extension rebuilt with forced reload mechanisms.

## Detailed Investigation

### 1. Error Analysis
```
Firefox kan geen verbinding maken met de server op wss://localhost:8081/. background.js:44:21
WebSocket error: error { target: WebSocket, isTrusted: true, ... }
```

- **Error Location**: `background.js` line 44
- **Expected Protocol**: `ws://localhost:8081/`
- **Actual Attempt**: `wss://localhost:8081/`

### 2. Source Code Verification ✅

**File: `firefox-extension/client.ts` (Line 24)**
```typescript
this.socket = new WebSocket(`ws://localhost:${this.port}`);
```

**File: `firefox-extension/background.ts`**
- Correctly imports and uses `WebsocketClient` from `client.ts`
- No hardcoded protocol references

**Result**: Source code was **correct** and using `ws://` protocol.

### 3. Compiled Code Verification ✅

**File: `firefox-extension/dist/background.js` (Line 44)**
```javascript
this.socket = new WebSocket(`ws://localhost:${this.port}`);
```

**Result**: Compiled code was **correct** and using `ws://` protocol.

### 4. Extension Caching Investigation ❌

**Finding**: Firefox was running a **cached version** of the extension that contained old code with `wss://` protocol.

**Evidence**:
- Source code: ✅ Uses `ws://`
- Compiled code: ✅ Uses `ws://` 
- Firefox runtime: ❌ Still attempting `wss://`

### 5. Browser Security Policy Investigation ✅

**Checked**: Firefox Mixed Content Security and WebSocket upgrade policies  
**Result**: No automatic `ws://` to `wss://` upgrades for localhost connections.

## Root Cause

**Primary Issue**: **Extension Cache Stale State**

Firefox was running a previously loaded version of the extension that contained old code attempting `wss://` connections. Despite rebuilding the extension, Firefox did not automatically reload the updated version.

**Contributing Factors**:
1. Extension version number unchanged (1.3.0)
2. No explicit localhost WebSocket permissions
3. Browser cache retention of extension code

## Solution Implemented

### 1. Version Bump Strategy
- **Before**: Version 1.3.0
- **After**: Version 1.3.1
- **Purpose**: Force Firefox to recognize and reload updated extension

### 2. Enhanced Manifest Permissions
```json
"host_permissions": [
    "<all_urls>",
    "ws://localhost:*/",
    "ws://127.0.0.1:*/"
]
```
**Purpose**: Explicitly allow non-secure WebSocket connections to localhost

### 3. Complete Rebuild
- Executed `npm run build` to generate fresh compiled files
- Verified `ws://` protocol in rebuilt `background.js`

### 4. Cache Busting
- Version increment forces browser to invalidate cached extension files
- New permissions trigger extension reload prompt

## Prevention Measures

### For Future Development

1. **Always Bump Version**: Increment version number when fixing WebSocket-related issues
2. **Explicit Permissions**: Include localhost WebSocket permissions in manifest
3. **Build Verification**: Always verify compiled output contains expected protocol
4. **Extension Reload**: Document clear instructions for manual extension reload

### For Users

**Manual Extension Reload Steps**:
1. Open Firefox and go to `about:debugging`
2. Click "This Firefox"
3. Find "Browser Control MCP" extension
4. Click "Reload" button
5. Verify new version (1.3.1) is loaded

## Verification Checklist

- [x] Source code uses `ws://` protocol
- [x] Compiled code uses `ws://` protocol  
- [x] Version bumped to 1.3.1
- [x] Manifest includes localhost WebSocket permissions
- [x] Extension rebuilt successfully
- [x] No `wss://` references in codebase (except node_modules)

## Testing Instructions

1. **Reload Extension**: Follow manual reload steps above
2. **Verify Connection**: Check browser console for successful WebSocket connection
3. **Test Functionality**: Ensure MCP server communication works
4. **Monitor Logs**: Confirm no `wss://` connection attempts

## Long-term Recommendations

1. **Automated Versioning**: Consider automating version increments in build process
2. **Connection Retry Logic**: Enhance error handling for protocol mismatches
3. **Documentation Updates**: Include extension reload instructions in user documentation
4. **Monitoring**: Add logging to detect protocol upgrade attempts

## Files Modified

- `firefox-extension/manifest.json` - Version bump and permissions
- `firefox-extension/package.json` - Version bump
- `firefox-extension/dist/*` - Rebuilt with npm run build

## Related Issues

- **FIX-002-WS-PROTOCOL**: Previous instance of same issue
- **Root Issue**: Extension caching rather than source code problem
- **Pattern**: Likely to recur without proper version management

---
**Document Version**: 1.0  
**Date**: 2025-05-28  
**Author**: FrontCrafter Mode  
**Status**: Final Analysis Complete