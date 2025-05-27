# Browser Interaction API Design

**Document Version**: 1.0  
**Date**: May 27, 2025  
**Task ID**: TASK-020 (Directus Subtask ID: 43)  
**Context**: Following comprehensive research on Firefox WebExtension capabilities

## Executive Summary

This document defines the API architecture for browser interaction features in the Browser Control MCP project. The design enables programmatic control of web pages through scroll, click, type/input, and wait operations while maintaining security boundaries and performance standards established by the existing system.

### Key Design Principles

1. **Security First**: All interactions are validated, sanitized, and respect Firefox WebExtension security boundaries
2. **Backward Compatibility**: New features integrate seamlessly with existing tab management and screenshot capabilities
3. **Performance Optimized**: Use event-driven observers over polling, implement proper resource cleanup
4. **Error Resilience**: Comprehensive error handling with graceful degradation
5. **Extensibility**: Design allows for future interaction types and enhancements

## 1. API Specification

### 1.1 Scroll Operations

#### 1.1.1 Scroll to Position (Absolute)

**MCP Tool**: `scroll-to-position`

```typescript
// MCP Server Tool Definition
mcpServer.tool(
  "scroll-to-position",
  "Scroll to absolute coordinates in a browser tab",
  {
    tabId: z.number(),
    x: z.number().min(0).default(0),
    y: z.number().min(0),
    behavior: z.enum(["auto", "smooth"]).default("smooth")
  },
  async ({ tabId, x, y, behavior }) => ScrollInteractionResponse
);
```

**Request Schema**:
```typescript
interface ScrollToPositionRequest {
  tabId: number;
  x?: number;      // Default: 0
  y: number;       // Required
  behavior?: "auto" | "smooth";  // Default: "smooth"
}
```

**Response Schema**:
```typescript
interface ScrollResponse {
  success: boolean;
  finalPosition: { x: number; y: number };
  message: string;
  timestamp: number;
}
```

#### 1.1.2 Scroll by Offset (Relative)

**MCP Tool**: `scroll-by-offset`

```typescript
mcpServer.tool(
  "scroll-by-offset",
  "Scroll by relative offset in a browser tab",
  {
    tabId: z.number(),
    deltaX: z.number().default(0),
    deltaY: z.number(),
    behavior: z.enum(["auto", "smooth"]).default("smooth")
  },
  async ({ tabId, deltaX, deltaY, behavior }) => ScrollInteractionResponse
);
```

#### 1.1.3 Scroll to Element

**MCP Tool**: `scroll-to-element`

```typescript
mcpServer.tool(
  "scroll-to-element",
  "Scroll to bring an element into view using CSS selector",
  {
    tabId: z.number(),
    selector: z.string(),
    block: z.enum(["start", "center", "end", "nearest"]).default("center"),
    inline: z.enum(["start", "center", "end", "nearest"]).default("nearest"),
    behavior: z.enum(["auto", "smooth"]).default("smooth")
  },
  async ({ tabId, selector, block, inline, behavior }) => ScrollInteractionResponse
);
```

### 1.2 Click Operations

#### 1.2.1 Click at Coordinates

**MCP Tool**: `click-at-coordinates`

```typescript
mcpServer.tool(
  "click-at-coordinates",
  "Click at specific coordinates in a browser tab",
  {
    tabId: z.number(),
    x: z.number().min(0),
    y: z.number().min(0),
    button: z.enum(["left", "right", "middle"]).default("left"),
    clickType: z.enum(["single", "double"]).default("single"),
    modifiers: z.object({
      ctrl: z.boolean().default(false),
      alt: z.boolean().default(false),
      shift: z.boolean().default(false),
      meta: z.boolean().default(false)
    }).default({})
  },
  async ({ tabId, x, y, button, clickType, modifiers }) => ClickInteractionResponse
);
```

#### 1.2.2 Click Element

**MCP Tool**: `click-element`

```typescript
mcpServer.tool(
  "click-element",
  "Click an element using CSS selector",
  {
    tabId: z.number(),
    selector: z.string(),
    button: z.enum(["left", "right", "middle"]).default("left"),
    clickType: z.enum(["single", "double"]).default("single"),
    waitForElement: z.number().min(0).max(10000).default(5000), // timeout in ms
    scrollIntoView: z.boolean().default(true),
    modifiers: z.object({
      ctrl: z.boolean().default(false),
      alt: z.boolean().default(false),
      shift: z.boolean().default(false),
      meta: z.boolean().default(false)
    }).default({})
  },
  async ({ tabId, selector, button, clickType, waitForElement, scrollIntoView, modifiers }) => ClickInteractionResponse
);
```

#### 1.2.3 Hover Element

**MCP Tool**: `hover-element`

```typescript
mcpServer.tool(
  "hover-element",
  "Hover over an element to trigger mouseover events",
  {
    tabId: z.number(),
    selector: z.string().optional(),
    x: z.number().min(0).optional(),
    y: z.number().min(0).optional(),
    waitForElement: z.number().min(0).max(10000).default(5000)
  },
  async ({ tabId, selector, x, y, waitForElement }) => HoverInteractionResponse
);
```

### 1.3 Type/Input Operations

#### 1.3.1 Type Text

**MCP Tool**: `type-text`

```typescript
mcpServer.tool(
  "type-text",
  "Type text into the currently focused element or specified element",
  {
    tabId: z.number(),
    text: z.string(),
    selector: z.string().optional(), // If provided, focus this element first
    clearFirst: z.boolean().default(false),
    typeDelay: z.number().min(0).max(1000).default(0), // ms between characters
    waitForElement: z.number().min(0).max(10000).default(5000)
  },
  async ({ tabId, text, selector, clearFirst, typeDelay, waitForElement }) => TypeInteractionResponse
);
```

#### 1.3.2 Send Special Keys

**MCP Tool**: `send-special-keys`

```typescript
mcpServer.tool(
  "send-special-keys",
  "Send special keys (Enter, Tab, Escape, etc.) to focused element",
  {
    tabId: z.number(),
    keys: z.array(z.enum([
      "Enter", "Tab", "Escape", "Backspace", "Delete", "ArrowUp", "ArrowDown", 
      "ArrowLeft", "ArrowRight", "Home", "End", "PageUp", "PageDown", "F1", 
      "F2", "F3", "F4", "F5", "F6", "F7", "F8", "F9", "F10", "F11", "F12"
    ])),
    selector: z.string().optional(),
    modifiers: z.object({
      ctrl: z.boolean().default(false),
      alt: z.boolean().default(false),
      shift: z.boolean().default(false),
      meta: z.boolean().default(false)
    }).default({})
  },
  async ({ tabId, keys, selector, modifiers }) => TypeInteractionResponse
);
```

#### 1.3.3 Clear Input Field

**MCP Tool**: `clear-input-field`

```typescript
mcpServer.tool(
  "clear-input-field",
  "Clear text from an input field",
  {
    tabId: z.number(),
    selector: z.string(),
    waitForElement: z.number().min(0).max(10000).default(5000)
  },
  async ({ tabId, selector, waitForElement }) => TypeInteractionResponse
);
```

### 1.4 Wait Operations

#### 1.4.1 Wait for Time

**MCP Tool**: `wait-for-time`

```typescript
mcpServer.tool(
  "wait-for-time",
  "Wait for a specified amount of time",
  {
    duration: z.number().min(0).max(30000), // Max 30 seconds
    message: z.string().optional()
  },
  async ({ duration, message }) => WaitInteractionResponse
);
```

#### 1.4.2 Wait for Element

**MCP Tool**: `wait-for-element`

```typescript
mcpServer.tool(
  "wait-for-element",
  "Wait for an element to appear in the DOM",
  {
    tabId: z.number(),
    selector: z.string(),
    timeout: z.number().min(100).max(30000).default(5000),
    pollInterval: z.number().min(50).max(1000).default(100),
    visible: z.boolean().default(false) // Wait for element to be visible, not just present
  },
  async ({ tabId, selector, timeout, pollInterval, visible }) => WaitInteractionResponse
);
```

#### 1.4.3 Wait for Element Visibility

**MCP Tool**: `wait-for-element-visibility`

```typescript
mcpServer.tool(
  "wait-for-element-visibility",
  "Wait for an element to become visible using IntersectionObserver",
  {
    tabId: z.number(),
    selector: z.string(),
    timeout: z.number().min(100).max(30000).default(5000),
    threshold: z.number().min(0).max(1).default(0.1) // Percentage of element visible
  },
  async ({ tabId, selector, timeout, threshold }) => WaitInteractionResponse
);
```

#### 1.4.4 Wait for Custom Condition

**MCP Tool**: `wait-for-condition`

```typescript
mcpServer.tool(
  "wait-for-condition",
  "Wait for a custom JavaScript condition to be true",
  {
    tabId: z.number(),
    condition: z.string(), // JavaScript expression that returns boolean
    timeout: z.number().min(100).max(30000).default(5000),
    pollInterval: z.number().min(50).max(1000).default(100),
    args: z.record(z.any()).optional() // Arguments to pass to condition function
  },
  async ({ tabId, condition, timeout, pollInterval, args }) => WaitInteractionResponse
);
```

## 2. Message Protocol Design

### 2.1 Extension Message Types

Building on the existing `ServerMessageRequest` pattern, new command types are added:

```typescript
// Extend existing ServerMessageRequest interface
interface ServerMessageRequest {
  correlationId: string;
  cmd: 
    // Existing commands
    | "open-tab" | "close-tabs" | "get-tab-list" | "get-browser-recent-history"
    | "get-tab-content" | "reorder-tabs" | "find-highlight" | "take-screenshot"
    // New interaction commands
    | "scroll-to-position" | "scroll-by-offset" | "scroll-to-element"
    | "click-at-coordinates" | "click-element" | "hover-element"
    | "type-text" | "send-special-keys" | "clear-input-field"
    | "wait-for-time" | "wait-for-element" | "wait-for-element-visibility" | "wait-for-condition";
  
  // Existing fields + new interaction-specific fields
  tabId?: number;
  
  // Scroll fields
  x?: number;
  y?: number;
  deltaX?: number;
  deltaY?: number;
  behavior?: "auto" | "smooth";
  block?: "start" | "center" | "end" | "nearest";
  inline?: "start" | "center" | "end" | "nearest";
  
  // Click fields
  button?: "left" | "right" | "middle";
  clickType?: "single" | "double";
  modifiers?: {
    ctrl?: boolean;
    alt?: boolean;
    shift?: boolean;
    meta?: boolean;
  };
  
  // Type fields
  text?: string;
  keys?: string[];
  clearFirst?: boolean;
  typeDelay?: number;
  
  // Wait fields
  duration?: number;
  timeout?: number;
  pollInterval?: number;
  threshold?: number;
  condition?: string;
  args?: Record<string, any>;
  
  // Common fields
  selector?: string;
  waitForElement?: number;
  scrollIntoView?: boolean;
  visible?: boolean;
  message?: string;
}
```

### 2.2 Response Message Types

```typescript
// Extend existing resource types
interface ExtensionResponseMessage {
  resource: 
    // Existing resources
    | "opened-tab-id" | "tabs-closed" | "tabs" | "history" | "tab-content"
    | "tabs-reordered" | "find-highlight-result" | "screenshot"
    // New interaction resources
    | "scroll-result" | "click-result" | "hover-result" | "type-result" | "wait-result";
  
  correlationId: string;
  
  // Common interaction response fields
  success?: boolean;
  message?: string;
  timestamp?: number;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
  
  // Scroll-specific response fields
  finalPosition?: { x: number; y: number };
  
  // Click-specific response fields
  elementFound?: boolean;
  clickExecuted?: boolean;
  
  // Type-specific response fields
  charactersTyped?: number;
  
  // Wait-specific response fields
  conditionMet?: boolean;
  waitTime?: number;
  
  // Element-related fields
  elementInfo?: {
    exists: boolean;
    visible: boolean;
    interactable: boolean;
    boundingRect?: DOMRect;
  };
}
```

### 2.3 Communication Flow

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────────┐
│   MCP Server    │    │ WebSocket Client │    │ Content Script      │
│                 │    │                  │    │                     │
├─────────────────┤    ├──────────────────┤    ├─────────────────────┤
│ 1. Validate     │───▶│ 2. Send Message  │───▶│ 3. Execute Action   │
│    Request      │    │                  │    │                     │
│                 │    │                  │    │ 4. Validate Result  │
│ 6. Format       │◀───│ 5. Receive       │◀───│                     │
│    Response     │    │    Response      │    │ 5. Send Response    │
└─────────────────┘    └──────────────────┘    └─────────────────────┘
```

### 2.4 Error Handling Protocol

```typescript
interface InteractionError {
  code: string;
  message: string;
  details?: {
    tabId?: number;
    selector?: string;
    element?: {
      found: boolean;
      visible: boolean;
      interactable: boolean;
    };
    position?: { x: number; y: number };
    timeout?: number;
    retryable: boolean;
  };
}

// Standard error codes
enum InteractionErrorCode {
  // Element errors
  ELEMENT_NOT_FOUND = "ELEMENT_NOT_FOUND",
  ELEMENT_NOT_VISIBLE = "ELEMENT_NOT_VISIBLE",
  ELEMENT_NOT_INTERACTABLE = "ELEMENT_NOT_INTERACTABLE",
  INVALID_SELECTOR = "INVALID_SELECTOR",
  
  // Position errors
  COORDINATES_OUT_OF_BOUNDS = "COORDINATES_OUT_OF_BOUNDS",
  SCROLL_FAILED = "SCROLL_FAILED",
  
  // Input errors
  TYPE_FAILED = "TYPE_FAILED",
  INVALID_KEY = "INVALID_KEY",
  INPUT_FIELD_READONLY = "INPUT_FIELD_READONLY",
  
  // Wait errors
  WAIT_TIMEOUT = "WAIT_TIMEOUT",
  CONDITION_NEVER_MET = "CONDITION_NEVER_MET",
  INVALID_CONDITION = "INVALID_CONDITION",
  
  // Security errors
  CROSS_ORIGIN_BLOCKED = "CROSS_ORIGIN_BLOCKED",
  PERMISSION_DENIED = "PERMISSION_DENIED",
  DOMAIN_IN_DENY_LIST = "DOMAIN_IN_DENY_LIST",
  
  // General errors
  TAB_NOT_FOUND = "TAB_NOT_FOUND",
  TAB_NOT_READY = "TAB_NOT_READY",
  UNKNOWN_ERROR = "UNKNOWN_ERROR"
}
```

### 2.5 Async Operation Patterns

For operations that may take time (waiting, animations), use the following pattern:

```typescript
// In MessageHandler
private async executeInteractionWithTimeout<T>(
  operation: () => Promise<T>,
  timeout: number,
  timeoutMessage: string
): Promise<T> {
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error(timeoutMessage)), timeout);
  });
  
  return Promise.race([operation(), timeoutPromise]);
}
```

## 3. Security Architecture

### 3.1 Permission Model

Building on existing security infrastructure:

```typescript
// Extend existing permission checks
interface InteractionPermissions {
  scrollingEnabled: boolean;
  clickingEnabled: boolean;
  typingEnabled: boolean;
  waitingEnabled: boolean;
  customConditionsEnabled: boolean;
  maxWaitTime: number; // milliseconds
  maxTypeDelay: number; // milliseconds
  allowedDomains: string[];
  blockedSelectors: string[]; // CSS selectors that should never be interacted with
}

// Add to extension-config.ts
export async function isInteractionAllowed(
  cmd: string,
  tabId: number,
  selector?: string
): Promise<boolean> {
  // Check if command is enabled
  const permissions = await getInteractionPermissions();
  
  switch (cmd) {
    case "scroll-to-position":
    case "scroll-by-offset":
    case "scroll-to-element":
      return permissions.scrollingEnabled;
      
    case "click-at-coordinates":
    case "click-element":
    case "hover-element":
      return permissions.clickingEnabled;
      
    case "type-text":
    case "send-special-keys":
    case "clear-input-field":
      return permissions.typingEnabled;
      
    case "wait-for-time":
    case "wait-for-element":
    case "wait-for-element-visibility":
      return permissions.waitingEnabled;
      
    case "wait-for-condition":
      return permissions.customConditionsEnabled;
      
    default:
      return false;
  }
}
```

### 3.2 Input Validation Rules

```typescript
interface ValidationRule {
  field: string;
  type: "string" | "number" | "boolean" | "array";
  required?: boolean;
  min?: number;
  max?: number;
  pattern?: RegExp;
  allowedValues?: any[];
  sanitizer?: (value: any) => any;
}

const interactionValidationRules: Record<string, ValidationRule[]> = {
  "scroll-to-position": [
    { field: "tabId", type: "number", required: true, min: 0 },
    { field: "x", type: "number", min: 0, max: 50000 },
    { field: "y", type: "number", required: true, min: 0, max: 50000 },
    { field: "behavior", type: "string", allowedValues: ["auto", "smooth"] }
  ],
  
  "click-element": [
    { field: "tabId", type: "number", required: true, min: 0 },
    { 
      field: "selector", 
      type: "string", 
      required: true, 
      pattern: /^[a-zA-Z0-9\s\-_#.\[\]="':(),>+~*]+$/,
      sanitizer: (value: string) => value.trim()
    },
    { field: "button", type: "string", allowedValues: ["left", "right", "middle"] },
    { field: "waitForElement", type: "number", min: 0, max: 10000 }
  ],
  
  "type-text": [
    { field: "tabId", type: "number", required: true, min: 0 },
    { 
      field: "text", 
      type: "string", 
      required: true,
      sanitizer: (value: string) => value.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
    },
    { field: "typeDelay", type: "number", min: 0, max: 1000 }
  ]
};
```

### 3.3 Rate Limiting Strategy

```typescript
interface RateLimitConfig {
  maxRequestsPerMinute: number;
  maxRequestsPerSecond: number;
  burstAllowance: number;
  cooldownPeriod: number; // milliseconds
}

class InteractionRateLimiter {
  private requestCounts = new Map<string, number[]>();
  private config: RateLimitConfig = {
    maxRequestsPerMinute: 100,
    maxRequestsPerSecond: 10,
    burstAllowance: 5,
    cooldownPeriod: 1000
  };
  
  public isAllowed(identifier: string): boolean {
    const now = Date.now();
    const requests = this.requestCounts.get(identifier) || [];
    
    // Clean old requests (older than 1 minute)
    const recentRequests = requests.filter(time => now - time < 60000);
    
    // Check rate limits
    const requestsLastSecond = recentRequests.filter(time => now - time < 1000).length;
    const requestsLastMinute = recentRequests.length;
    
    if (requestsLastSecond >= this.config.maxRequestsPerSecond) {
      return false;
    }
    
    if (requestsLastMinute >= this.config.maxRequestsPerMinute) {
      return false;
    }
    
    // Add current request
    recentRequests.push(now);
    this.requestCounts.set(identifier, recentRequests);
    
    return true;
  }
}
```

### 3.4 Security Boundaries

```typescript
// Enhanced domain and selector security
interface SecurityCheck {
  checkCrossOriginRestrictions(tabId: number, operation: string): Promise<boolean>;
  validateSelector(selector: string): boolean;
  sanitizeInput(input: string, type: 'text' | 'selector' | 'condition'): string;
  checkElementInteractability(element: Element): boolean;
}

// Blocked selectors for security
const BLOCKED_SELECTORS = [
  'input[type="password"]',     // Password fields
  'input[name*="password"]',    // Password-related fields
  'input[name*="ssn"]',         // Social Security Numbers
  'input[name*="social"]',      // Social Security variants
  'input[name*="credit"]',      // Credit card fields
  'input[name*="card"]',        // Card number fields
  'input[autocomplete*="cc"]',  // Credit card autocomplete
  '[data-sensitive="true"]',    // Custom sensitive markers
  '.sensitive',                 // Sensitive class markers
  '#sensitive'                  // Sensitive ID markers
];
```

## 4. Implementation Guidelines

### 4.1 Code Organization Structure

```
mcp-server/
├── interaction-api.ts          # New interaction API handlers
├── interaction-validator.ts    # Input validation and security
├── interaction-rate-limiter.ts # Rate limiting logic
└── server.ts                   # Updated with new tools

firefox-extension/
├── interaction-handler.ts      # New interaction logic
├── interaction-executor.ts     # Core interaction execution
├── element-utils.ts           # Element finding and validation utilities
├── wait-strategies.ts         # Wait operation implementations
└── message-handler.ts         # Updated with new commands

common/
├── interaction-types.ts       # Shared TypeScript interfaces
└── interaction-errors.ts     # Error definitions and codes
```

### 4.2 Extension Manifest Updates

```json
{
  "manifest_version": 2,
  "permissions": [
    "activeTab",
    "scripting",
    "tabs",
    "history",
    "find",
    "storage"
  ],
  "host_permissions": [
    "<all_urls>"
  ],
  "content_scripts": [
    {
      "matches": ["<all_urls>"],
      "js": [
        "interaction-executor.js",
        "element-utils.js",
        "wait-strategies.js"
      ],
      "all_frames": true,
      "run_at": "document_start"
    }
  ]
}
```

### 4.3 MCP Tool Definitions

Following the existing pattern in `server.ts`:

```typescript
// Example: Scroll to position tool
mcpServer.tool(
  "scroll-to-position",
  "Scroll to absolute coordinates in a browser tab",
  {
    tabId: z.number(),
    x: z.number().min(0).default(0),
    y: z.number().min(0),
    behavior: z.enum(["auto", "smooth"]).default("smooth")
  },
  async ({ tabId, x, y, behavior }) => {
    try {
      const result = await browserApi.scrollToPosition(tabId, x, y, behavior);
      return {
        content: [
          {
            type: "text",
            text: `Scrolled to position (${result.finalPosition.x}, ${result.finalPosition.y}) in tab ${tabId}`,
          },
          {
            type: "text",
            text: `Scroll completed at: ${new Date(result.timestamp).toISOString()}`,
          }
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Failed to scroll: ${error instanceof Error ? error.message : 'Unknown error'}`,
            isError: true
          }
        ],
      };
    }
  }
);
```

### 4.4 Integration Points

#### 4.4.1 BrowserAPI Class Extensions

```typescript
// Add to browser-api.ts
export class BrowserAPI {
  // ... existing methods ...

  // Scroll operations
  public async scrollToPosition(
    tabId: number, 
    x: number, 
    y: number, 
    behavior: "auto" | "smooth" = "smooth"
  ): Promise<ScrollResponse> {
    return this.sendMessage({
      cmd: "scroll-to-position",
      correlationId: generateCorrelationId(),
      tabId,
      x,
      y,
      behavior
    });
  }

  // Click operations
  public async clickElement(
    tabId: number,
    selector: string,
    options: ClickOptions = {}
  ): Promise<ClickResponse> {
    return this.sendMessage({
      cmd: "click-element",
      correlationId: generateCorrelationId(),
      tabId,
      selector,
      ...options
    });
  }

  // Type operations
  public async typeText(
    tabId: number,
    text: string,
    options: TypeOptions = {}
  ): Promise<TypeResponse> {
    return this.sendMessage({
      cmd: "type-text",
      correlationId: generateCorrelationId(),
      tabId,
      text,
      ...options
    });
  }

  // Wait operations
  public async waitForElement(
    tabId: number,
    selector: string,
    options: WaitOptions = {}
  ): Promise<WaitResponse> {
    return this.sendMessage({
      cmd: "wait-for-element",
      correlationId: generateCorrelationId(),
      tabId,
      selector,
      ...options
    });
  }
}
```

#### 4.4.2 MessageHandler Class Extensions

```typescript
// Add to message-handler.ts handleDecodedMessage switch statement
case "scroll-to-position":
  await this.scrollToPosition(req.correlationId, req.tabId, req.x, req.y, req.behavior);
  break;
case "click-element":
  await this.clickElement(req.correlationId, req.tabId, req.selector, req);
  break;
case "type-text":
  await this.typeText(req.correlationId, req.tabId, req.text, req);
  break;
case "wait-for-element":
  await this.waitForElement(req.correlationId, req.tabId, req.selector, req);
  break;
```

## 5. Testing Strategy

### 5.1 Unit Test Approach

#### 5.1.1 Input Validation Tests

```typescript
// Test file: interaction-validator.test.ts
describe('InteractionValidator', () => {
  describe('validateScrollRequest', () => {
    it('should accept valid scroll coordinates', () => {
      const request = { tabId: 1, x: 100, y: 200, behavior: 'smooth' };
      expect(validateScrollRequest(request)).toBe(true);
    });

    it('should reject negative coordinates', () => {
      const request = { tabId: 1, x: -10, y: 200 };
      expect(() => validateScrollRequest(request)).toThrow('Invalid coordinates');
    });

    it('should reject coordinates exceeding maximum', () => {
      const request = { tabId: 1, x: 100000, y: 200 };
      expect(() => validateScrollRequest(request)).toThrow('Coordinates exceed maximum');
    });
  });

  describe('validateSelector', () => {
    it('should accept valid CSS selectors', () => {
      expect(validateSelector('#myId')).toBe(true);
      expect(validateSelector('.myClass')).toBe(true);
      expect(validateSelector('div[data-test="value"]')).toBe(true);
    });

    it('should reject malicious selectors', () => {
      expect(() => validateSelector('<script>')).toThrow('Invalid selector');
      expect(() => validateSelector('javascript:')).toThrow('Invalid selector');
    });

    it('should reject blocked sensitive selectors', () => {
      expect(() => validateSelector('input[type="password"]')).toThrow('Selector blocked');
    });
  });
});
```

#### 5.1.2 Rate Limiting Tests

```typescript
// Test file: interaction-rate-limiter.test.ts
describe('InteractionRateLimiter', () => {
  let rateLimiter: InteractionRateLimiter;

  beforeEach(() => {
    rateLimiter = new InteractionRateLimiter();
  });

  it('should allow requests within rate limit', () => {
    for (let i = 0; i < 5; i++) {
      expect(rateLimiter.isAllowed('test-client')).toBe(true);
    }
  });

  it('should block requests exceeding per-second limit', () => {
    // Simulate rapid requests
    for (let i = 0; i < 10; i++) {
      rateLimiter.isAllowed('test-client');
    }
    expect(rateLimiter.isAllowed('test-client')).toBe(false);
  });

  it('should reset limits after time window', async () => {
    // Fill up the rate limit
    for (let i = 0; i < 10; i++) {
      rateLimiter.isAllowed('test-client');
    }
    
    // Wait for reset window
    await new Promise(resolve => setTimeout(resolve, 1100));
    
    expect(rateLimiter.isAllowed('test-client')).toBe(true);
  });
});
```

### 5.2 Integration Test Scenarios

#### 5.2.1 End-to-End Interaction Tests

```typescript
// Test file: interaction-e2e.test.ts
describe('Browser Interaction E2E', () => {
  let testServer: TestServer;
  let browserApi: BrowserAPI;
  let testTabId: number;

  beforeAll(async () => {
    testServer = new TestServer();
    await testServer.start();
    browserApi = new BrowserAPI();
    await browserApi.init();
    
    // Open a test page
    testTabId = await browserApi.openTab(testServer.getTestPageUrl());
  });

  afterAll(async () => {
    await browserApi.close();
    await testServer.stop();
  });

  describe('Scroll Operations', () => {
    it('should scroll to specific position', async () => {
      const result = await browserApi.scrollToPosition(testTabId, 0, 500);
      expect(result.success).toBe(true);
      expect(result.finalPosition.y).toBe(500);
    });

    it('should scroll element into view', async () => {
      const result = await browserApi.scrollToElement(testTabId, '#bottom-element');
      expect(result.success).toBe(true);
    });
  });

  describe('Click Operations', () => {
    it('should click button by selector', async () => {
      const result = await browserApi.clickElement(testTabId, '#test-button');
      expect(result.success).toBe(true);
      expect(result.clickExecuted).toBe(true);
    });

    it('should click at coordinates', async () => {
      const result = await browserApi.clickAtCoordinates(testTabId, 100, 200);
      expect(result.success).toBe(true);
    });
  });

  describe('Type Operations', () => {
    it('should type text into input field', async () => {
      const result = await browserApi.typeText(testTabId, 'Hello World', {
        selector: '#test-input'
      });
      expect(result.success).toBe(true);
      expect(result.charactersTyped).toBe(11);
    });

    it('should send special keys', async () => {
      const result = await browserApi.sendSpecialKeys(testTabId, ['Enter'], {
        selector: '#test-input'
      });
      expect(result.success).toBe(true);
    });
  });

  describe('Wait Operations', () => {
    it('should wait for element to appear', async () => {
      // Trigger dynamic content
      await browserApi.clickElement(testTabId, '#load-content-button');
      
      const result = await browserApi.waitForElement(testTabId, '#dynamic-content', {
        timeout: 3000
      });
      expect(result.success).toBe(true);
      expect(result.conditionMet).toBe(true);
    });

    it('should timeout when element never appears', async () => {
      const result = await browserApi.waitForElement(testTabId, '#nonexistent-element', {
        timeout: 1000
      });
      expect(result.success).toBe(false);
      expect(result.conditionMet).toBe(false);
    });
  });
});
```

### 5.3 Security Test Cases

#### 5.3.1 Cross-Origin Security Tests

```typescript
// Test file: interaction-security.test.ts
describe('Interaction Security', () => {
  describe('Cross-Origin Protection', () => {
    it('should block interactions with cross-origin iframes', async () => {
      const testPage = `
        <iframe src="https://external-domain.com/page" id="external-frame"></iframe>
      `;
      
      const tabId = await openTestPage(testPage);
      
      await expect(
        browserApi.clickElement(tabId, '#external-frame button')
      ).rejects.toThrow('Cross-origin access blocked');
    });

    it('should allow interactions within same origin', async () => {
      const testPage = `
        <iframe src="/same-origin-page" id="internal-frame"></iframe>
      `;
      
      const tabId = await openTestPage(testPage);
      
      const result = await browserApi.clickElement(tabId, '#internal-frame button');
      expect(result.success).toBe(true);
    });
  });

  describe('Sensitive Element Protection', () => {
    it('should block interactions with password fields', async () => {
      const testPage = '<input type="password" id="password-field">';
      const tabId = await openTestPage(testPage);
      
      await expect(
        browserApi.typeText(tabId, 'secret', { selector: '#password-field' })
      ).rejects.toThrow('Selector blocked for security reasons');
    });

    it('should block interactions with credit card fields', async () => {
      const testPage = '<input autocomplete="cc-number" id="card-field">';
      const tabId = await openTestPage(testPage);
      
      await expect(
        browserApi.typeText(tabId, '1234', { selector: '#card-field' })
      ).rejects.toThrow('Selector blocked for security reasons');
    });
  });

  describe('Input Sanitization', () => {
    it('should sanitize malicious text input', async () => {
      const maliciousText = '<script>alert("xss")</script>';
      const testPage = '<input type="text" id="text-field">';
      const tabId = await openTestPage(testPage);
      
      const result = await browserApi.typeText(tabId, maliciousText, {
        selector: '#text-field'
      });
      
      // Should succeed but with sanitized text
      expect(result.success).toBe(true);
      expect(result.textTyped).not.toContain('<script>');
    });

    it('should validate selector format', async () => {
      const maliciousSelector = 'input"; alert("xss"); //';
      
      await expect(
        browserApi.clickElement(1, maliciousSelector)
      ).rejects.toThrow('Invalid selector format');
    });
  });
});
```

### 5.4 Performance Benchmarks

#### 5.4.1 Response Time Tests

```typescript
// Test file: interaction-performance.test.ts
describe('Interaction Performance', () => {
  describe('Response Times', () => {
    it('should complete scroll operations within 500ms', async () => {
      const startTime = Date.now();
      await browserApi.scrollToPosition(testTabId, 0, 500);
      const duration = Date.now() - startTime;
      
      expect(duration).toBeLessThan(500);
    });

    it('should complete click operations within 200ms', async () => {
      const startTime = Date.now();
      await browserApi.clickElement(testTabId, '#test-button');
      const duration = Date.now() - startTime;
      
      expect(duration).toBeLessThan(200);
    });

    it('should handle bulk operations efficiently', async () => {
      const operations = Array(10).fill(0).map((_, i) => 
        browserApi.scrollToPosition(testTabId, 0, i * 100)
      );
      
      const startTime = Date.now();
      await Promise.all(operations);
      const duration = Date.now() - startTime;
      
      // Should complete 10 operations in under 2 seconds
      expect(duration).toBeLessThan(2000);
    });
  });

  describe('Memory Usage', () => {
    it('should not leak memory during repeated operations', async () => {
      const initialMemory = process.memoryUsage();
      
      // Perform many operations
      for (let i = 0; i < 100; i++) {
        await browserApi.scrollToPosition(testTabId, 0, i);
      }
      
      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }
      
      const finalMemory = process.memoryUsage();
      const memoryIncrease = finalMemory.heapUsed - initialMemory.heapUsed;
      
      // Memory increase should be minimal (less than 10MB)
      expect(memoryIncrease).toBeLessThan(10 * 1024 * 1024);
    });
  });
});
```

## 6. Advanced Features and Future Considerations

### 6.1 Batch Operations

For improved performance, consider implementing batch operations:

```typescript
// Future enhancement: Batch multiple interactions
mcpServer.tool(
  "batch-interactions",
  "Execute multiple interactions in sequence",
  {
    tabId: z.number(),
    operations: z.array(z.object({
      type: z.enum(["scroll", "click", "type", "wait"]),
      params: z.record(z.any()),
      continueOnError: z.boolean().default(false)
    }))
  },
  async ({ tabId, operations }) => BatchInteractionResponse
);
```

### 6.2 Element Recording and Playback

```typescript
// Future enhancement: Record user interactions
mcpServer.tool(
  "start-interaction-recording",
  "Start recording user interactions for playback",
  {
    tabId: z.number(),
    recordClicks: z.boolean().default(true),
    recordScrolls: z.boolean().default(true),
    recordTypes: z.boolean().default(true)
  },
  async ({ tabId, recordClicks, recordScrolls, recordTypes }) => RecordingResponse
);
```

### 6.3 Visual Element Selection

```typescript
// Future enhancement: Visual element selection by image
mcpServer.tool(
  "click-visual-element",
  "Click on an element by visual matching",
  {
    tabId: z.number(),
    templateImage: z.string(), // Base64 image
    confidence: z.number().min(0).max(1).default(0.8),
    timeout: z.number().default(5000)
  },
  async ({ tabId, templateImage, confidence, timeout }) => VisualClickResponse
);
```

### 6.4 Accessibility Enhancements

```typescript
// Future enhancement: Accessibility-focused interactions
mcpServer.tool(
  "interact-with-accessibility",
  "Interact with elements using accessibility properties",
  {
    tabId: z.number(),
    role: z.string().optional(),
    ariaLabel: z.string().optional(),
    accessibleName: z.string().optional(),
    action: z.enum(["click", "focus", "activate"])
  },
  async ({ tabId, role, ariaLabel, accessibleName, action }) => AccessibilityResponse
);
```

## 7. Migration and Deployment Strategy

### 7.1 Backward Compatibility

- All existing MCP tools remain unchanged
- New interaction tools are additive
- Existing message protocol is extended, not replaced
- Configuration options have sensible defaults

### 7.2 Gradual Rollout Plan

1. **Phase 1**: Deploy core scroll and click functionality
2. **Phase 2**: Add type/input operations
3. **Phase 3**: Implement wait operations
4. **Phase 4**: Add advanced features and optimizations

### 7.3 Configuration Migration

```typescript
// Extension settings migration
interface LegacySettings {
  commandsEnabled: string[];
  domainDenyList: string[];
}

interface NewSettings extends LegacySettings {
  interactionPermissions: InteractionPermissions;
  rateLimiting: RateLimitConfig;
  securitySettings: SecuritySettings;
}

// Automatic migration function
function migrateSettings(legacy: LegacySettings): NewSettings {
  return {
    ...legacy,
    interactionPermissions: {
      scrollingEnabled: true,
      clickingEnabled: true,
      typingEnabled: true,
      waitingEnabled: true,
      customConditionsEnabled: false, // Conservative default
      maxWaitTime: 30000,
      maxTypeDelay: 1000,
      allowedDomains: [],
      blockedSelectors: BLOCKED_SELECTORS
    },
    rateLimiting: DEFAULT_RATE_LIMIT_CONFIG,
    securitySettings: DEFAULT_SECURITY_SETTINGS
  };
}
```

## 8. Conclusion

This API design provides a comprehensive foundation for browser interaction capabilities while maintaining the security, performance, and architectural standards of the existing Browser Control MCP project. The design is:

- **Secure by default**: Comprehensive input validation, rate limiting, and security boundaries
- **Performance optimized**: Event-driven approaches, proper resource cleanup, and efficient observer patterns
- **Extensible**: Clean architecture allowing for future enhancements and additional interaction types
- **Well-tested**: Comprehensive testing strategy covering unit, integration, security, and performance scenarios
- **Backward compatible**: Seamless integration with existing functionality

The implementation follows established patterns from the existing codebase while introducing new capabilities that enable powerful browser automation workflows within the constraints and security model of Firefox WebExtensions.

### Success Metrics

- All interaction types function reliably across different websites
- Security boundaries prevent unauthorized access to sensitive elements
- Performance meets established benchmarks (< 500ms for most operations)
- Error messages provide clear guidance for troubleshooting
- Rate limiting effectively prevents abuse while allowing legitimate usage
- Integration tests pass consistently across different environments

This design serves as the foundation for TASK-021 through TASK-024, providing clear implementation guidance while ensuring security and performance requirements are met.