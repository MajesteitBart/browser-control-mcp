import {
  McpServer,
  ResourceTemplate,
} from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { BrowserAPI } from "./browser-api";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import * as fs from "fs";
import * as path from "path";

dayjs.extend(relativeTime);

const mcpServer = new McpServer({
  name: "BrowserControl",
  version: "1.3.0",
});

mcpServer.tool(
  "open-browser-tab",
  "Open a new tab in the user's browser",
  { url: z.string() },
  async ({ url }) => {
    const openedTabId = await browserApi.openTab(url);
    if (openedTabId !== undefined) {
      return {
        content: [
          {
            type: "text",
            text: `${url} opened in tab id ${openedTabId}`,
          },
        ],
      };
    } else {
      return {
        content: [{ type: "text", text: "Failed to open tab", isError: true }],
      };
    }
  }
);

mcpServer.tool(
  "close-browser-tabs",
  "Close tabs in the user's browser by tab IDs",
  { tabIds: z.array(z.number()) },
  async ({ tabIds }) => {
    await browserApi.closeTabs(tabIds);
    return {
      content: [{ type: "text", text: "Closed tabs" }],
    };
  }
);

mcpServer.tool(
  "get-list-of-open-tabs",
  "Get the list of open tabs in the user's browser",
  {},
  async () => {
    const openTabs = await browserApi.getTabList();
    return {
      content: openTabs.map((tab) => {
        let lastAccessed = "unknown";
        if (tab.lastAccessed) {
          lastAccessed = dayjs(tab.lastAccessed).fromNow(); // LLM-friendly time ago
        }
        return {
          type: "text",
          text: `tab id=${tab.id}, tab url=${tab.url}, tab title=${tab.title}, last accessed=${lastAccessed}`,
        };
      }),
    };
  }
);

mcpServer.tool(
  "get-recent-browser-history",
  "Get the list of recent browser history (to get all, don't use searchQuery)",
  { searchQuery: z.string().optional() },
  async ({ searchQuery }) => {
    const browserHistory = await browserApi.getBrowserRecentHistory(
      searchQuery
    );
    if (browserHistory.length > 0) {
      return {
        content: browserHistory.map((item) => {
          let lastVisited = "unknown";
          if (item.lastVisitTime) {
            lastVisited = dayjs(item.lastVisitTime).fromNow(); // LLM-friendly time ago
          }
          return {
            type: "text",
            text: `url=${item.url}, title="${item.title}", lastVisitTime=${lastVisited}`,
          };
        }),
      };
    } else {
      // If nothing was found for the search query, hint the AI to list
      // all the recent history items instead.
      const hint = searchQuery ? "Try without a searchQuery" : "";
      return { content: [{ type: "text", text: `No history found. ${hint}` }] };
    }
  }
);

mcpServer.tool(
  "get-tab-web-content",
  `
    Get the full text content of the webpage and the list of links in the webpage, by tab ID. 
    Use "offset" only for larger documents when the first call was truncated and if you require more content in order to assist the user.
  `,
  { tabId: z.number(), offset: z.number().default(0) },
  async ({ tabId, offset }) => {
    const content = await browserApi.getTabContent(tabId, offset);
    let links: { type: "text"; text: string }[] = [];
    if (offset === 0) {
      // Only include the links if offset is 0 (default value). Otherwise, we can
      // assume this is not the first call. Adding the links again would be redundant.
      links = content.links.map((link: { text: string; url: string }) => {
        return {
          type: "text",

          text: `Link text: ${link.text}, Link URL: ${link.url}`,
        };
      });
    }

    let text = content.fullText;
    let hint: { type: "text"; text: string }[] = [];
    if (content.isTruncated || offset > 0) {
      // If the content is truncated, add a "tip" suggesting
      // that another tool, search in page, can be used to
      // discover additional data.
      const rangeString = `${offset}-${offset + text.length}`;
      hint = [
        {
          type: "text",
          text:
            `The following text content is truncated due to size (includes character range ${rangeString} out of ${content.totalLength}). ` +
            "If you want to read characters beyond this range, please use the 'get-tab-web-content' tool with an offset. ",
        },
      ];
    }

    return {
      content: [...hint, { type: "text", text }, ...links],
    };
  }
);

mcpServer.tool(
  "reorder-browser-tabs",
  "Change the order of open browser tabs",
  { tabOrder: z.array(z.number()) },
  async ({ tabOrder }) => {
    const newOrder = await browserApi.reorderTabs(tabOrder);
    return {
      content: [
        { type: "text", text: `Tabs reordered: ${newOrder.join(", ")}` },
      ],
    };
  }
);

mcpServer.tool(
  "find-highlight-in-browser-tab",
  "Find and highlight text in a browser tab (use a query phrase that exists in the web content)",
  { tabId: z.number(), queryPhrase: z.string() },
  async ({ tabId, queryPhrase }) => {
    const noOfResults = await browserApi.findHighlight(tabId, queryPhrase);
    return {
      content: [
        {
          type: "text",
          text: `Number of results found and highlighted in the tab: ${noOfResults}`,
        },
      ],
    };
  }
);

mcpServer.tool(
  "take-screenshot",
  "Take a screenshot of a browser tab and return it as base64 encoded image data",
  {
    tabId: z.number(),
    format: z.enum(["png", "jpeg"]).default("png"),
    quality: z.number().min(0).max(100).optional()
  },
  async ({ tabId, format, quality }) => {
    try {
      const screenshot = await browserApi.takeScreenshot(tabId, format, quality);
      
      // Create response text based on whether file was saved
      const mainMessage = screenshot.filePath
        ? `Screenshot saved to: ${screenshot.filePath}`
        : `Screenshot captured from tab ${tabId} in ${screenshot.format} format`;
      
      return {
        content: [
          {
            type: "text",
            text: mainMessage,
          },
          {
            type: "text",
            text: `Format: ${screenshot.format}`,
          },
          {
            type: "text",
            text: `Timestamp: ${new Date(screenshot.timestamp).toISOString()}`,
          },
          {
            type: "text",
            text: `Image data (base64): ${screenshot.imageData.substring(0, 100)}...`,
          }
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Failed to take screenshot: ${error instanceof Error ? error.message : 'Unknown error'}`,
            isError: true
          }
        ],
      };
    }
  }
);

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
            text: result.success ? result.message : `Scroll failed: ${result.message}`,
            isError: !result.success
          },
          {
            type: "text",
            text: `Final position: x=${result.finalPosition.x}, y=${result.finalPosition.y}`
          },
          {
            type: "text",
            text: `Timestamp: ${new Date(result.timestamp).toISOString()}`
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

mcpServer.tool(
  "scroll-by-offset",
  "Scroll by relative offset in a browser tab",
  {
    tabId: z.number(),
    deltaX: z.number().default(0),
    deltaY: z.number(),
    behavior: z.enum(["auto", "smooth"]).default("smooth")
  },
  async ({ tabId, deltaX, deltaY, behavior }) => {
    try {
      const result = await browserApi.scrollByOffset(tabId, deltaX, deltaY, behavior);
      
      return {
        content: [
          {
            type: "text",
            text: result.success ? result.message : `Scroll failed: ${result.message}`,
            isError: !result.success
          },
          {
            type: "text",
            text: `Final position: x=${result.finalPosition.x}, y=${result.finalPosition.y}`
          },
          {
            type: "text",
            text: `Timestamp: ${new Date(result.timestamp).toISOString()}`
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
  async ({ tabId, selector, block, inline, behavior }) => {
    try {
      const result = await browserApi.scrollToElement(tabId, selector, block, inline, behavior);
      
      return {
        content: [
          {
            type: "text",
            text: result.success ? result.message : `Scroll failed: ${result.message}`,
            isError: !result.success
          },
          {
            type: "text",
            text: `Final position: x=${result.finalPosition.x}, y=${result.finalPosition.y}`
          },
          {
            type: "text",
            text: `Timestamp: ${new Date(result.timestamp).toISOString()}`
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
  async ({ tabId, x, y, button, clickType, modifiers }) => {
    try {
      const result = await browserApi.clickAtCoordinates(tabId, x, y, button, clickType, modifiers);
      
      return {
        content: [
          {
            type: "text",
            text: result.success ? result.message : `Click failed: ${result.message}`,
            isError: !result.success
          },
          {
            type: "text",
            text: `Element found: ${result.elementFound}, Click executed: ${result.clickExecuted}`
          },
          {
            type: "text",
            text: `Timestamp: ${new Date(result.timestamp).toISOString()}`
          }
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Failed to click: ${error instanceof Error ? error.message : 'Unknown error'}`,
            isError: true
          }
        ],
      };
    }
  }
);

mcpServer.tool(
  "click-element",
  "Click an element using CSS selector",
  {
    tabId: z.number(),
    selector: z.string(),
    button: z.enum(["left", "right", "middle"]).default("left"),
    clickType: z.enum(["single", "double"]).default("single"),
    waitForElement: z.number().min(0).max(10000).default(5000),
    scrollIntoView: z.boolean().default(true),
    modifiers: z.object({
      ctrl: z.boolean().default(false),
      alt: z.boolean().default(false),
      shift: z.boolean().default(false),
      meta: z.boolean().default(false)
    }).default({})
  },
  async ({ tabId, selector, button, clickType, waitForElement, scrollIntoView, modifiers }) => {
    try {
      const result = await browserApi.clickElement(tabId, selector, button, clickType, waitForElement, scrollIntoView, modifiers);
      
      return {
        content: [
          {
            type: "text",
            text: result.success ? result.message : `Click failed: ${result.message}`,
            isError: !result.success
          },
          {
            type: "text",
            text: `Element found: ${result.elementFound}, Click executed: ${result.clickExecuted}`
          },
          {
            type: "text",
            text: `Timestamp: ${new Date(result.timestamp).toISOString()}`
          },
          ...(result.elementInfo ? [{
            type: "text" as const,
            text: `Element info: visible=${result.elementInfo.visible}, interactable=${result.elementInfo.interactable}`
          }] : [])
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Failed to click element: ${error instanceof Error ? error.message : 'Unknown error'}`,
            isError: true
          }
        ],
      };
    }
  }
);

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
  async ({ tabId, selector, x, y, waitForElement }) => {
    try {
      const result = await browserApi.hoverElement(tabId, selector, x, y, waitForElement);
      
      return {
        content: [
          {
            type: "text",
            text: result.success ? result.message : `Hover failed: ${result.message}`,
            isError: !result.success
          },
          {
            type: "text",
            text: `Element found: ${result.elementFound}`
          },
          {
            type: "text",
            text: `Timestamp: ${new Date(result.timestamp).toISOString()}`
          },
          ...(result.elementInfo ? [{
            type: "text" as const,
            text: `Element info: visible=${result.elementInfo.visible}, interactable=${result.elementInfo.interactable}`
          }] : [])
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Failed to hover: ${error instanceof Error ? error.message : 'Unknown error'}`,
            isError: true
          }
        ],
      };
    }
  }
);

mcpServer.tool(
  "type-text",
  "Type text into the currently focused element or specified element",
  {
    tabId: z.number(),
    text: z.string(),
    selector: z.string().optional(),
    clearFirst: z.boolean().default(false),
    typeDelay: z.number().min(0).max(1000).default(0),
    waitForElement: z.number().min(0).max(10000).default(5000)
  },
  async ({ tabId, text, selector, clearFirst, typeDelay, waitForElement }) => {
    try {
      const result = await browserApi.typeText(tabId, text, selector, clearFirst, typeDelay, waitForElement);
      
      return {
        content: [
          {
            type: "text",
            text: result.success ? result.message : `Type failed: ${result.message}`,
            isError: !result.success
          },
          {
            type: "text",
            text: `Characters typed: ${result.charactersTyped || 0}`
          },
          {
            type: "text",
            text: `Timestamp: ${new Date(result.timestamp).toISOString()}`
          },
          ...(result.elementInfo ? [{
            type: "text" as const,
            text: `Element info: visible=${result.elementInfo.visible}, interactable=${result.elementInfo.interactable}`
          }] : [])
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Failed to type text: ${error instanceof Error ? error.message : 'Unknown error'}`,
            isError: true
          }
        ],
      };
    }
  }
);

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
  async ({ tabId, keys, selector, modifiers }) => {
    try {
      const result = await browserApi.sendSpecialKeys(tabId, keys, selector, modifiers);
      
      return {
        content: [
          {
            type: "text",
            text: result.success ? result.message : `Send special keys failed: ${result.message}`,
            isError: !result.success
          },
          {
            type: "text",
            text: `Keys sent: ${keys.join(', ')}`
          },
          {
            type: "text",
            text: `Timestamp: ${new Date(result.timestamp).toISOString()}`
          },
          ...(result.elementInfo ? [{
            type: "text" as const,
            text: `Element info: visible=${result.elementInfo.visible}, interactable=${result.elementInfo.interactable}`
          }] : [])
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Failed to send special keys: ${error instanceof Error ? error.message : 'Unknown error'}`,
            isError: true
          }
        ],
      };
    }
  }
);

mcpServer.tool(
  "clear-input-field",
  "Clear text from an input field",
  {
    tabId: z.number(),
    selector: z.string(),
    waitForElement: z.number().min(0).max(10000).default(5000)
  },
  async ({ tabId, selector, waitForElement }) => {
    try {
      const result = await browserApi.clearInputField(tabId, selector, waitForElement);
      
      return {
        content: [
          {
            type: "text",
            text: result.success ? result.message : `Clear field failed: ${result.message}`,
            isError: !result.success
          },
          {
            type: "text",
            text: `Timestamp: ${new Date(result.timestamp).toISOString()}`
          },
          ...(result.elementInfo ? [{
            type: "text" as const,
            text: `Element info: visible=${result.elementInfo.visible}, interactable=${result.elementInfo.interactable}`
          }] : [])
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Failed to clear input field: ${error instanceof Error ? error.message : 'Unknown error'}`,
            isError: true
          }
        ],
      };
    }
  }
);

mcpServer.tool(
  "wait-for-time",
  "Wait for a specified amount of time",
  {
    duration: z.number().min(100).max(30000),
    message: z.string().optional()
  },
  async ({ duration, message }) => {
    try {
      const result = await browserApi.waitForTime(duration, message);
      
      return {
        content: [
          {
            type: "text",
            text: result.success ? result.message : `Wait failed: ${result.message}`,
            isError: !result.success
          },
          {
            type: "text",
            text: `Wait time: ${result.waitTime || 0}ms`
          },
          {
            type: "text",
            text: `Timestamp: ${new Date(result.timestamp).toISOString()}`
          }
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Failed to wait for time: ${error instanceof Error ? error.message : 'Unknown error'}`,
            isError: true
          }
        ],
      };
    }
  }
);

mcpServer.tool(
  "wait-for-element",
  "Wait for an element to appear in the DOM",
  {
    tabId: z.number(),
    selector: z.string(),
    timeout: z.number().min(100).max(30000).default(5000),
    pollInterval: z.number().min(50).max(1000).default(100),
    visible: z.boolean().default(false)
  },
  async ({ tabId, selector, timeout, pollInterval, visible }) => {
    try {
      const result = await browserApi.waitForElement(tabId, selector, timeout, pollInterval, visible);
      
      return {
        content: [
          {
            type: "text",
            text: result.success ? result.message : `Wait failed: ${result.message}`,
            isError: !result.success
          },
          {
            type: "text",
            text: `Condition met: ${result.conditionMet}, Wait time: ${result.waitTime || 0}ms`
          },
          {
            type: "text",
            text: `Timestamp: ${new Date(result.timestamp).toISOString()}`
          },
          ...(result.elementInfo ? [{
            type: "text" as const,
            text: `Element info: exists=${result.elementInfo.exists}, visible=${result.elementInfo.visible}, interactable=${result.elementInfo.interactable}`
          }] : [])
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Failed to wait for element: ${error instanceof Error ? error.message : 'Unknown error'}`,
            isError: true
          }
        ],
      };
    }
  }
);

mcpServer.tool(
  "wait-for-element-visibility",
  "Wait for an element to become visible using IntersectionObserver",
  {
    tabId: z.number(),
    selector: z.string(),
    timeout: z.number().min(100).max(30000).default(5000),
    threshold: z.number().min(0).max(1).default(0.1)
  },
  async ({ tabId, selector, timeout, threshold }) => {
    try {
      const result = await browserApi.waitForElementVisibility(tabId, selector, timeout, threshold);
      
      return {
        content: [
          {
            type: "text",
            text: result.success ? result.message : `Wait failed: ${result.message}`,
            isError: !result.success
          },
          {
            type: "text",
            text: `Condition met: ${result.conditionMet}, Wait time: ${result.waitTime || 0}ms`
          },
          {
            type: "text",
            text: `Timestamp: ${new Date(result.timestamp).toISOString()}`
          },
          ...(result.elementInfo ? [{
            type: "text" as const,
            text: `Element info: exists=${result.elementInfo.exists}, visible=${result.elementInfo.visible}, interactable=${result.elementInfo.interactable}`
          }] : [])
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Failed to wait for element visibility: ${error instanceof Error ? error.message : 'Unknown error'}`,
            isError: true
          }
        ],
      };
    }
  }
);

mcpServer.tool(
  "wait-for-condition",
  "⚠️ DISABLED FOR SECURITY - This tool has been permanently disabled due to a critical security vulnerability",
  {
    tabId: z.number(),
    condition: z.string(),
    timeout: z.number().min(100).max(30000).default(5000),
    pollInterval: z.number().min(50).max(1000).default(100),
    args: z.record(z.any()).optional()
  },
  async ({ tabId, condition, timeout, pollInterval, args }) => {
    // SECURITY FIX: This tool has been disabled due to critical vulnerability
    // The previous implementation allowed arbitrary JavaScript execution via new Function()
    // which could lead to complete system compromise, data theft, and malicious redirects
    
    return {
      content: [
        {
          type: "text",
          text: "🚨 SECURITY ALERT: wait-for-condition feature has been disabled",
          isError: true
        },
        {
          type: "text",
          text: "This feature previously allowed arbitrary JavaScript execution which poses a critical security risk.",
          isError: true
        },
        {
          type: "text",
          text: "Use these safe alternatives instead:",
          isError: false
        },
        {
          type: "text",
          text: "• wait-for-element - Wait for an element to appear",
          isError: false
        },
        {
          type: "text",
          text: "• wait-for-element-visibility - Wait for an element to become visible",
          isError: false
        },
        {
          type: "text",
          text: "• wait-for-time - Wait for a specific duration",
          isError: false
        },
        {
          type: "text",
          text: "For more complex conditions, combine multiple safe wait operations.",
          isError: false
        }
      ],
    };
  }
);

mcpServer.resource(
  "open-tab-contents",
  new ResourceTemplate("browser://tab/{tabId}/content", {
    list: async () => {
      const openTabs = await browserApi.getTabList();
      return {
        resources: (openTabs ?? []).map((tab) => ({
          uri: `browser://tab/${tab.id}/content`,
          name: tab.title || tab.url || "",
          mimeType: "text/plain",
        })),
      };
    },
  }),
  async (uri, { tabId }) => {
    const content = await browserApi.getTabContent(Number(tabId), 0);
    const listOfLinks =
      content?.links
        .map(
          (link: { text: string; url: string }) => `${link.text}: ${link.url}`
        )
        .join("\n") ?? "";
    const fullText = content?.fullText ?? "";
    return {
      contents: [
        {
          uri: uri.href,
          mimeType: "text/plain",
          text: `Webpage text: \n\n${fullText} \n\nWeb page Links:\n${listOfLinks}`,
        },
      ],
    };
  }
);

// Initialize screenshot directory
function initializeScreenshotDirectory(): string | null {
  const screenshotDir = process.env.SCREENSHOT_DIR || './screenshots';
  const resolvedPath = path.resolve(screenshotDir);
  
  try {
    // Create directory if it doesn't exist
    fs.mkdirSync(resolvedPath, { recursive: true });
    
    // Validate directory is accessible and writable
    fs.accessSync(resolvedPath, fs.constants.W_OK | fs.constants.R_OK);
    
    // Ensure it's actually a directory
    const stats = fs.statSync(resolvedPath);
    if (!stats.isDirectory()) {
      throw new Error(`Path exists but is not a directory: ${resolvedPath}`);
    }
    
    // Test write with more comprehensive check
    const testFile = path.join(resolvedPath, `.write-test-${Date.now()}`);
    fs.writeFileSync(testFile, 'test');
    fs.unlinkSync(testFile);
    
    console.error(`Screenshot directory initialized successfully: ${resolvedPath}`);
    return resolvedPath;
    
  } catch (error) {
    const errorCode = (error as NodeJS.ErrnoException).code;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    console.error(`Failed to initialize screenshot directory '${resolvedPath}':`, {
      error: errorMessage,
      code: errorCode,
      originalPath: screenshotDir,
      resolvedPath: resolvedPath
    });
    
    console.error('Screenshot file saving will be disabled for this session');
    return null; // Return null to indicate failure
  }
}

// Initialize screenshot directory
const screenshotDir = initializeScreenshotDirectory();

const browserApi = new BrowserAPI(screenshotDir);
browserApi
  .init()
  .then((port) => {
    console.error("Browser API initialized on port", port);
  })
  .catch((err) => {
    console.error("Browser API init error", err);
    process.exit(1);
  });

const transport = new StdioServerTransport();
mcpServer
  .connect(transport)
  .then(() => {
    console.error("MCP Server running on stdio");
  })
  .catch((err) => {
    console.error("MCP Server connection error", err);
    process.exit(1);
  });

process.stdin.on("close", () => {
  console.error("MCP Server closed");
  browserApi.close();
  mcpServer.close();
  process.exit(0);
});
