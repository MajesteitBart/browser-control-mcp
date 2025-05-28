# Task Context: Fix CSP WebSocket Protocol Upgrade in Manifest V3 (FIX-004-CSP-WEBSOCKET)

## Task Overview
- **Task ID**: FIX-004-CSP-WEBSOCKET (Directus ID: 19)
- **Priority**: High
- **Type**: Bug Fix / Security Policy Configuration
- **Component**: Firefox Extension Manifest V3 CSP

## Problem Description
Firefox's Content Security Policy (CSP) is automatically upgrading WebSocket connections from `ws://` to `wss://`, causing connection failures. This is a Manifest V3 security feature that's blocking local WebSocket connections.

## Error Details
From the provided error logs:
```
Content-Security-Policy-waarschuwingen 3
Content-Security-Policy: Onveilige aanvraag 'ws://localhost:8082/' wordt geüpgraded voor gebruik van 'wss'
Content-Security-Policy: Onveilige aanvraag 'ws://localhost:8081/' wordt geüpgraded voor gebruik van 'wss'
Firefox kan geen verbinding maken met de server op wss://localhost:8081/
```

Translation: "Content-Security-Policy: Unsafe request 'ws://localhost:8082/' is being upgraded for use of 'wss'"

## Previous Fix Attempts
1. **FIX-002-WS-PROTOCOL**: Confirmed source code uses `ws://`
2. **FIX-003-WS-RECURRING**: Added WebSocket permissions and version bump
   - Added `"ws://localhost:*/"` and `"ws://127.0.0.1:*/"` to permissions
   - These permissions were not sufficient to prevent CSP upgrade

## Technical Context
- **Manifest Version**: V3 (recently upgraded from V2)
- **Security Feature**: Manifest V3 enforces stricter CSP rules
- **Issue**: CSP automatically upgrades insecure WebSocket connections to secure ones
- **Impact**: Local development MCP server cannot use SSL/TLS

## Investigation Required
1. **CSP Configuration Options**:
   - Research if Manifest V3 allows CSP relaxation for localhost
   - Check for `content_security_policy` directives specific to WebSocket
   - Look for extension-specific CSP overrides

2. **Alternative Solutions**:
   - Configure extension to explicitly allow insecure localhost connections
   - Add specific CSP meta tags or headers
   - Consider if `content_security_policy.extension_pages` can help
   - Investigate if `externally_connectable` settings affect WebSocket

3. **Fallback Options**:
   - Revert to Manifest V2 if V3 doesn't support local ws:// connections
   - Implement local HTTPS/WSS server (more complex but V3 compliant)
   - Use different connection method for local communication

## Acceptance Criteria
1. Firefox extension successfully connects to local MCP server via WebSocket
2. No CSP warnings or automatic protocol upgrades
3. Solution maintains security best practices while allowing local development
4. Clear documentation of the CSP configuration required
5. Solution works with Manifest V3 or provides justified reason to revert to V2

## References
- Previous fix documentation: `/docs/fixes/FIX-003-WS-RECURRING-root-cause-analysis.md`
- Current manifest.json with V3 configuration
- Firefox Manifest V3 documentation on CSP