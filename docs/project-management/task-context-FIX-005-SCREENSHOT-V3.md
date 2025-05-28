# Task Context: Fix Screenshot Functionality for Manifest V3 (FIX-005-SCREENSHOT-V3)

## Task Overview
- **Task ID**: FIX-005-SCREENSHOT-V3 (Directus ID: 20)
- **Priority**: High
- **Type**: Bug Fix / API Migration
- **Component**: Firefox Extension Screenshot Feature

## Problem Description
Screenshot functionality is broken after the Manifest V3 migration. The extension is attempting to use the deprecated `browser.tabs.executeScript` API which no longer exists in Manifest V3.

## Error Details
From the user's report:
```
Full page capture failed, falling back to viewport capture: TypeError: browser.tabs.executeScript is not a function
    getPageDimensions moz-extension://c8807fa6-efe7-41c6-ba89-2075b767e815/dist/background.js:680
    captureFullPageScreenshot moz-extension://c8807fa6-efe7-41c6-ba89-2075b767e815/dist/background.js:640
    takeScreenshot moz-extension://c8807fa6-efe7-41c6-ba89-2075b767e815/dist/background.js:613
```

## Issues Identified
1. **API Deprecation**: `browser.tabs.executeScript` doesn't exist in Manifest V3
2. **Full Page Capture Failure**: Falls back to viewport capture only
3. **Wrong Tab Screenshot**: Screenshot is taken of incorrect tab

## Technical Context
### Manifest V2 → V3 API Changes
- **Old**: `browser.tabs.executeScript(tabId, { code: "..." })`
- **New**: `browser.scripting.executeScript({ target: { tabId }, func: ... })`

### Key Differences
1. **Namespace**: Changed from `tabs` to `scripting`
2. **Parameters**: Different structure with `target` object
3. **Function Injection**: Prefers function references over code strings
4. **Permissions**: Requires `scripting` permission (already in manifest)

## Required Changes
1. **Update getPageDimensions**: Replace tabs.executeScript with scripting.executeScript
2. **Update all screenshot-related script injections**: Ensure V3 compatibility
3. **Fix tab targeting**: Ensure correct tab ID is used
4. **Test full page capture**: Verify scrolling and stitching work correctly

## Acceptance Criteria
1. Screenshot functionality works without errors
2. Full page screenshots capture entire page content
3. Screenshots are taken of the correct tab
4. All Manifest V3 APIs are used correctly
5. Existing screenshot tests pass

## Files to Investigate
- `firefox-extension/message-handler.ts` - Main screenshot handling
- `firefox-extension/background.ts` (if exists) - Background script
- Any other files with `tabs.executeScript` calls

## Testing Requirements
1. Test viewport screenshot
2. Test full page screenshot on long pages
3. Test screenshot of specific tab
4. Verify correct tab targeting
5. Test error handling for restricted pages