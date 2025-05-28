# Task Context: Screenshot Stitching Inconsistencies Fix

## Task Information
- **Task ID**: SCREENSHOT-STITCH-001 (Directus ID: 23)
- **Task Name**: Fix Screenshot Stitching Inconsistencies and Optimize for AI Processing
- **Priority**: High
- **Status**: To Do
- **Project**: Browser Control MCP (ID: 2)

## Problem Analysis

### User Report
The user has identified inconsistencies in how full-page screenshots are being stitched together by the MCP, resulting in content alignment and continuity issues. Two comparison screenshots have been provided:

1. **MCP-generated screenshot**: `screenshots/jpgcopy-screenshot-1748422365120-3.jpg`
2. **Manual screenshot**: `screenshots/manual-screenshot.jpg`

### Current Implementation Analysis

Based on code review of `firefox-extension/message-handler.ts`, the current screenshot stitching process:

1. **Page Dimension Detection** (`getPageDimensions`):
   - Gets full document height using `Math.max()` of various height properties
   - Determines viewport dimensions for capture planning

2. **Scroll-and-Capture Process** (`captureFullPageScreenshot`):
   - Calculates number of captures needed: `Math.ceil(captureHeight / viewportHeight)`
   - Scrolls to each position: `scrollY = i * viewportHeight`
   - Captures each section using `captureSingleScreenshot`
   - Waits for scroll completion and lazy content loading

3. **Stitching Process** (`executeStitchingInContentScript`):
   - Creates canvas with dimensions: `width × totalHeight`
   - Loads all screenshot images
   - Draws images sequentially with: `ctx.drawImage(image, 0, 0, width, imageHeight, 0, currentY, width, imageHeight)`
   - Updates `currentY += imageHeight` for next image

### Potential Issues Identified

1. **Overlap/Gap Problems**:
   - Fixed viewport height increments may not account for dynamic content changes
   - Scroll position may not be exact due to smooth scrolling behavior
   - Content that changes between captures (lazy loading, animations)

2. **Canvas Drawing Issues**:
   - Simple sequential drawing without overlap detection
   - No validation of actual content alignment
   - Fixed `imageHeight` calculation may not match actual content boundaries

3. **Timing Issues**:
   - 300ms wait may be insufficient for complex pages
   - Lazy image loading detection may miss some content types
   - Race conditions between scroll and capture

4. **Content Boundary Problems**:
   - Viewport-based segmentation doesn't respect content boundaries
   - Text/elements may be cut mid-line between segments
   - Dynamic content height changes during capture process

## Technical Requirements

### Core Improvements Needed

1. **Enhanced Content Boundary Detection**:
   - Implement smart segmentation that respects content boundaries
   - Add overlap detection and correction
   - Validate content continuity between segments

2. **Improved Stitching Algorithm**:
   - Add overlap detection and removal
   - Implement content-aware alignment
   - Add validation of stitching accuracy

3. **AI Processing Optimization**:
   - Implement JPG compression with quality controls
   - Add size optimization while maintaining readability
   - Configure output format based on use case

4. **Enhanced Error Handling**:
   - Add stitching validation
   - Improve fallback mechanisms
   - Add detailed error reporting

### Implementation Strategy

1. **Phase 1: Analysis and Diagnosis**
   - Analyze the provided screenshots to identify specific issues
   - Create test cases that reproduce the problems
   - Document exact failure modes

2. **Phase 2: Algorithm Enhancement**
   - Implement content-boundary-aware segmentation
   - Add overlap detection and correction
   - Improve canvas stitching logic

3. **Phase 3: Optimization**
   - Add JPG compression and optimization
   - Implement AI-processing-specific configurations
   - Add quality vs. size controls

4. **Phase 4: Testing and Validation**
   - Create comprehensive test suite
   - Validate against various page types
   - Ensure backward compatibility

## Files to Modify

### Primary Files
- `firefox-extension/message-handler.ts` - Core stitching logic
- `firefox-extension/extension-config.ts` - Add screenshot configuration options
- `mcp-server/browser-api.ts` - Add JPG optimization parameters

### Test Files
- `firefox-extension/__tests__/message-handler.test.ts` - Add stitching validation tests

### Documentation
- Create implementation documentation
- Update API documentation for new parameters

## Success Criteria

1. **Functional Requirements**:
   - Screenshot stitching produces visually consistent full-page captures
   - No visible gaps, overlaps, or misalignments between segments
   - Content alignment is accurate and natural

2. **Quality Requirements**:
   - Optimized JPG output suitable for AI processing
   - Configurable quality vs. size trade-offs
   - Maintains visual fidelity for text and images

3. **Technical Requirements**:
   - All existing tests continue to pass
   - New tests validate stitching accuracy
   - Performance impact is minimal
   - Backward compatibility maintained

4. **Validation Requirements**:
   - Works across different page layouts and content types
   - Consistent results across multiple captures of same page
   - Handles edge cases gracefully (very long pages, dynamic content, etc.)

## Dependencies

- Existing screenshot infrastructure (Manifest V3 migration completed)
- Canvas API support in content script context
- WebSocket communication between MCP server and extension
- File system access for screenshot saving

## Risk Assessment

### Technical Risks
- **Medium**: Canvas operations may have browser-specific limitations
- **Low**: Performance impact on large pages
- **Low**: Memory usage with large canvases

### Compatibility Risks
- **Low**: Changes may affect existing screenshot functionality
- **Low**: New parameters may require API version management

### Mitigation Strategies
- Comprehensive testing across different browsers and page types
- Gradual rollout with feature flags
- Robust fallback mechanisms
- Performance monitoring and optimization