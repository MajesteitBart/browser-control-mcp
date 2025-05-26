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
