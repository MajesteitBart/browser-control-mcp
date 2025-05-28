# Task Context: Fix Recurring WebSocket Protocol Issue (FIX-003-WS-RECURRING)

## Task Overview
- **Task ID**: FIX-003-WS-RECURRING (Directus ID: 18)
- **Priority**: High
- **Type**: Bug Fix / Investigation
- **Component**: Firefox Extension WebSocket Connection

## Problem Description
The Firefox extension is attempting to connect using `wss://` (secure WebSocket) instead of `ws://` (non-secure WebSocket), causing connection failures. This issue was previously fixed in FIX-002-WS-PROTOCOL but has recurred.

## Error Details
From the provided error logs:
```
Firefox kan geen verbinding maken met de server op wss://localhost:8081/. background.js:44:21
WebSocket error: 
error { target: WebSocket, isTrusted: true, srcElement: WebSocket, currentTarget: WebSocket, eventPhase: 2, bubbles: false, cancelable: false, returnValue: true, defaultPrevented: false, composed: false, … }
```

Key observations:
- Extension trying to connect to `wss://localhost:8081/` and `wss://localhost:8082/`
- Connection failures with WebSocket error events
- Continuous reconnection attempts
- Error happens in `background.js` (lines 43-44, 52)

## Previous Fix (FIX-002-WS-PROTOCOL)
- Confirmed `firefox-extension/client.ts` uses `ws://localhost:${this.port}`
- Extension was rebuilt
- Issue was resolved by ensuring the extension was rebuilt and reloaded

## Investigation Areas
1. **Protocol Enforcement**: Is Firefox enforcing HTTPS upgrade for localhost connections?
2. **Build Artifacts**: Is the built extension (`background.js`) actually using the correct protocol from source?
3. **Multiple Protocol References**: Are there other places in the code setting WebSocket protocol?
4. **Browser Security Policies**: Has Firefox updated security policies that auto-upgrade ws:// to wss://?
5. **Extension Loading**: Is the correct version of the extension being loaded?

## Technical Context
- **Extension Type**: Firefox Extension (Manifest V3)
- **Communication**: WebSocket connection to local MCP server
- **Ports**: Attempting connection on ports 8081 and 8082
- **File References**: 
  - `background.js` (compiled output)
  - `firefox-extension/client.ts` (source)

## Acceptance Criteria
1. Firefox extension successfully connects to MCP server using `ws://` protocol
2. No WebSocket connection errors in browser console
3. Connection remains stable without forced protocol upgrades
4. Solution is documented and prevents future recurrence

## Dependencies
- Access to Firefox extension source code
- Understanding of Firefox WebSocket security policies
- Knowledge of TypeScript to JavaScript compilation process