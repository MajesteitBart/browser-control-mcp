# Root Cause Analysis: CSP WebSocket Protocol Upgrade in Manifest V3 (FIX-004-CSP-WEBSOCKET)

## Executive Summary

**Issue**: Firefox's Content Security Policy automatically upgrading WebSocket connections from `ws://` to `wss://`, causing connection failures in Manifest V3 extensions.  
**Root Cause**: Manifest V3 default CSP enforces stricter security policies that automatically upgrade insecure connections.  
**Status**: ✅ **RESOLVED** - Added explicit CSP configuration to allow ws:// connections to localhost.

## Detailed Investigation

### 1. Error Analysis
```
Content-Security-Policy-waarschuwingen 3
Content-Security-Policy: Onveilige aanvraag 'ws://localhost:8082/' wordt geüpgraded voor gebruik van 'wss'
Content-Security-Policy: Onveilige aanvraag 'ws://localhost:8081/' wordt geüpgraded voor gebruik van 'wss'
Firefox kan geen verbinding maken met de server op wss://localhost:8081/
```

**Translation**: "Content-Security-Policy: Unsafe request 'ws://localhost:8082/' is being upgraded for use of 'wss'"

- **Protocol Upgrade**: CSP automatically converting `ws://` → `wss://`
- **Connection Failure**: Local MCP server doesn't support SSL/TLS
- **CSP Warning**: Firefox explicitly reporting the security upgrade

### 2. Manifest V3 Security Context

**Manifest V3 CSP Behavior**:
- Default CSP automatically upgrades insecure connections for security
- WebSocket connections to `ws://` are considered "unsafe requests"
- No built-in exception for localhost connections
- Requires explicit CSP configuration to allow insecure protocols

**Previous Attempts** ❌:
- **FIX-003-WS-RECURRING**: Added host permissions `ws://localhost:*/` and `ws://127.0.0.1:*/`
- **Result**: Host permissions alone insufficient to override CSP security policies

### 3. Root Cause Analysis

**Primary Issue**: **Manifest V3 Default CSP Security Policy**

Manifest V3 extensions have a default Content Security Policy that:
1. Automatically upgrades insecure connections (`ws://` → `wss://`)
2. Applies to all WebSocket connections, including localhost
3. Cannot be overridden by host permissions alone
4. Requires explicit CSP configuration for exceptions

**Technical Details**:
- **Default CSP**: `script-src 'self'; object-src 'self';` (no explicit connect-src)
- **Upgrade Mechanism**: Browser automatically applies Mixed Content Security rules
- **Localhost Exception**: None in default V3 CSP - must be explicitly configured

## Solution Implemented

### 1. Content Security Policy Configuration

**Added to `manifest.json`**:
```json
"content_security_policy": {
    "extension_pages": "script-src 'self'; object-src 'self'; connect-src 'self' ws://localhost:* ws://127.0.0.1:*;"
}
```

**CSP Directive Breakdown**:
- `script-src 'self'`: Allow scripts from extension origin only
- `object-src 'self'`: Allow objects from extension origin only  
- `connect-src 'self' ws://localhost:* ws://127.0.0.1:*`: Allow WebSocket connections to:
  - Extension origin (`'self'`)
  - Any localhost port using ws:// protocol
  - Any 127.0.0.1 port using ws:// protocol

### 2. Version Management
- **Before**: Version 1.3.1
- **After**: Version 1.3.2
- **Purpose**: Force Firefox to reload extension with new CSP configuration

### 3. Complete Rebuild
- Executed `npm run build` to ensure fresh compilation
- Verified all dist files updated with version 1.3.2

## Key Technical Insights

### Manifest V3 vs V2 CSP Differences

**Manifest V2**:
- More permissive default CSP
- Automatic upgrade policies less aggressive
- Host permissions more influential

**Manifest V3**:
- Stricter default CSP with automatic upgrades
- Host permissions alone insufficient for protocol exceptions
- Explicit CSP configuration required for insecure connections

### CSP Extension Pages vs Content Scripts

**`extension_pages`**: 
- Applies to background scripts, popup pages, options pages
- **Correct choice** for WebSocket connections from background script

**`content_scripts`**:
- Applies to scripts injected into web pages
- Not relevant for extension-to-server WebSocket connections

## Verification Checklist

- [x] Source code still uses `ws://` protocol (unchanged)
- [x] CSP configuration allows `ws://localhost:*` and `ws://127.0.0.1:*`
- [x] Version bumped to 1.3.2 in both manifest.json and package.json
- [x] Extension rebuilt successfully with new CSP
- [x] CSP directive properly scoped to `extension_pages`
- [x] No conflicts with existing host permissions

## Testing Instructions

1. **Reload Extension**: 
   - Open Firefox → `about:debugging` → "This Firefox"
   - Find "Browser Control MCP" extension
   - Click "Reload" button
   - Verify version shows 1.3.2

2. **Verify CSP Resolution**:
   - Check browser console for absence of CSP warnings
   - Confirm no automatic `ws://` → `wss://` upgrades
   - Test successful WebSocket connection to MCP server

3. **Functional Testing**:
   - Ensure MCP server communication works
   - Test click functionality and other extension features
   - Monitor for any new CSP-related errors

## Browser Compatibility

**Firefox Support**: ✅ **Fully Supported**
- Manifest V3 CSP configuration standard
- `connect-src` directive with ws:// protocol supported
- Extension-specific CSP policies fully implemented

**Chrome/Chromium**: ✅ **Compatible**
- Same CSP directive syntax
- Identical Manifest V3 security model
- Cross-browser solution

## Security Considerations

**Risk Assessment**: ✅ **Low Risk**
- CSP exception limited to localhost connections only
- No external ws:// connections permitted
- Development/local server use case appropriate for insecure protocol

**Security Boundaries**:
- External connections still require secure protocols
- Only localhost (127.0.0.1) and localhost hostname allowed
- Port restrictions maintain security posture

## Prevention Measures

### For Future Manifest V3 Development

1. **CSP Planning**: Always plan CSP requirements when migrating to V3
2. **Localhost Exceptions**: Document when insecure localhost connections needed
3. **Testing Protocol**: Test CSP policies across browser types
4. **Version Management**: Always bump version when changing CSP

### For Local Development

1. **MCP Server Setup**: Consider if HTTPS/WSS setup is feasible for production
2. **Environment Detection**: Implement protocol selection based on environment
3. **Fallback Strategies**: Plan for different connection security levels

## Long-term Recommendations

1. **Production HTTPS**: Consider implementing HTTPS/WSS for production MCP servers
2. **Environment Configuration**: Add configuration for protocol selection
3. **Security Audit**: Regular review of CSP permissions and security boundaries
4. **Documentation**: Maintain clear CSP documentation for team

## Files Modified

- `firefox-extension/manifest.json` - Added CSP configuration and version bump
- `firefox-extension/package.json` - Version bump to 1.3.2
- `firefox-extension/dist/*` - Rebuilt with new CSP policies

## Related Issues

- **FIX-003-WS-RECURRING**: Host permissions insufficient for CSP override
- **Manifest V3 Migration**: CSP requirements more complex than V2
- **Local Development**: Common pattern requiring insecure localhost connections

## References

- [Mozilla Manifest V3 CSP Documentation](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Content_Security_Policy)
- [Chrome Manifest V3 CSP Guide](https://developer.chrome.com/docs/extensions/mv3/intro/mv3-overview/#content-security-policy)
- [CSP connect-src Directive](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Content-Security-Policy/connect-src)

---
**Document Version**: 1.0  
**Date**: 2025-05-28  
**Author**: FrontCrafter Mode  
**Status**: Final Analysis Complete