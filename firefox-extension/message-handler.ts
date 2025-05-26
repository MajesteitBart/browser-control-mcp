import type { ServerMessageRequest } from "@browser-control-mcp/common";
import { WebsocketClient } from "./client";
import { isCommandAllowed, isDomainInDenyList, getScreenshotConfig } from "./extension-config";

export class MessageHandler {
  private client: WebsocketClient;

  constructor(client: WebsocketClient) {
    this.client = client;
  }

  public async handleDecodedMessage(req: ServerMessageRequest): Promise<void> {
    const isAllowed = await isCommandAllowed(req.cmd);
    if (!isAllowed) {
      throw new Error(`Command '${req.cmd}' is disabled in extension settings`);
    }

    switch (req.cmd) {
      case "open-tab":
        await this.openUrl(req.correlationId, req.url);
        break;
      case "close-tabs":
        await this.closeTabs(req.correlationId, req.tabIds);
        break;
      case "get-tab-list":
        await this.sendTabs(req.correlationId);
        break;
      case "get-browser-recent-history":
        await this.sendRecentHistory(req.correlationId, req.searchQuery);
        break;
      case "get-tab-content":
        await this.sendTabsContent(req.correlationId, req.tabId, req.offset);
        break;
      case "reorder-tabs":
        await this.reorderTabs(req.correlationId, req.tabOrder);
        break;
      case "find-highlight":
        await this.findAndHighlightText(
          req.correlationId,
          req.tabId,
          req.queryPhrase
        );
        break;
      case "take-screenshot":
        await this.takeScreenshot(
          req.correlationId,
          req.tabId,
          req.format,
          req.quality
        );
        break;
      default:
        const _exhaustiveCheck: never = req;
        console.error("Invalid message received:", req);
    }
  }

  private async openUrl(correlationId: string, url: string): Promise<void> {
    if (!url.startsWith("https://")) {
      console.error("Invalid URL:", url);
      throw new Error("Invalid URL");
    }

    if (await isDomainInDenyList(url)) {
      throw new Error("Domain in user defined deny list");
    }

    const tab = await browser.tabs.create({
      url,
    });

    await this.client.sendResourceToServer({
      resource: "opened-tab-id",
      correlationId,
      tabId: tab.id,
    });
  }

  private async closeTabs(
    correlationId: string,
    tabIds: number[]
  ): Promise<void> {
    await browser.tabs.remove(tabIds);
    await this.client.sendResourceToServer({
      resource: "tabs-closed",
      correlationId,
    });
  }

  private async sendTabs(correlationId: string): Promise<void> {
    const tabs = await browser.tabs.query({});
    await this.client.sendResourceToServer({
      resource: "tabs",
      correlationId,
      tabs,
    });
  }

  private async sendRecentHistory(
    correlationId: string,
    searchQuery: string | null = null
  ): Promise<void> {
    const historyItems = await browser.history.search({
      text: searchQuery ?? "", // Search for all URLs (empty string matches everything)
      maxResults: 200, // Limit to 200 results
      startTime: 0, // Search from the beginning of time
    });
    const filteredHistoryItems = historyItems.filter((item) => {
      return !!item.url;
    });
    await this.client.sendResourceToServer({
      resource: "history",
      correlationId,
      historyItems: filteredHistoryItems,
    });
  }

  private async sendTabsContent(
    correlationId: string,
    tabId: number,
    offset?: number
  ): Promise<void> {
    const tab = await browser.tabs.get(tabId);
    if (tab.url && (await isDomainInDenyList(tab.url))) {
      throw new Error(`Domain in tab URL '${tab.url}' is in the deny list`);
    }

    const MAX_CONTENT_LENGTH = 50_000;
    const results = await browser.tabs.executeScript(tabId, {
      code: `
      (function () {
        function getLinks() {
          const linkElements = document.querySelectorAll('a[href]');
          return Array.from(linkElements).map(el => ({
            url: el.href,
            text: el.innerText.trim() || el.getAttribute('aria-label') || el.getAttribute('title') || ''
          })).filter(link => link.text !== '' && link.url.startsWith('https://') && !link.url.includes('#'));
        }

        function getTextContent() {
          let isTruncated = false;
          let text = document.body.innerText.substring(${offset || 0});
          if (text.length > ${MAX_CONTENT_LENGTH}) {
            text = text.substring(0, ${MAX_CONTENT_LENGTH});
            isTruncated = true;
          }
          return {
            text, isTruncated
          }
        }

        const textContent = getTextContent();

        return {
          links: getLinks(),
          fullText: textContent.text,
          isTruncated: textContent.isTruncated,
          totalLength: document.body.innerText.length
        };
      })();
    `,
    });
    const { isTruncated, fullText, links, totalLength } = results[0];
    await this.client.sendResourceToServer({
      resource: "tab-content",
      tabId,
      correlationId,
      isTruncated,
      fullText,
      links,
      totalLength,
    });
  }

  private async reorderTabs(
    correlationId: string,
    tabOrder: number[]
  ): Promise<void> {
    // Reorder the tabs sequentially
    for (let newIndex = 0; newIndex < tabOrder.length; newIndex++) {
      const tabId = tabOrder[newIndex];
      await browser.tabs.move(tabId, { index: newIndex });
    }
    await this.client.sendResourceToServer({
      resource: "tabs-reordered",
      correlationId,
      tabOrder,
    });
  }

  private async findAndHighlightText(
    correlationId: string,
    tabId: number,
    queryPhrase: string
  ): Promise<void> {
    const findResults = await browser.find.find(queryPhrase, {
      tabId,
      caseSensitive: true,
    });

    // If there are results, highlight them
    if (findResults.count > 0) {
      // But first, activate the tab. In firefox, this would also enable
      // auto-scrolling to the highlighted result.
      await browser.tabs.update(tabId, { active: true });
      browser.find.highlightResults({
        tabId,
      });
    }

    await this.client.sendResourceToServer({
      resource: "find-highlight-result",
      correlationId,
      noOfResults: findResults.count,
    });
  }

  private async takeScreenshot(
    correlationId: string,
    tabId: number,
    format?: "png" | "jpeg",
    quality?: number
  ): Promise<void> {
    try {
      // Validate input parameters
      if (!Number.isInteger(tabId) || tabId < 0) {
        throw new Error(`Invalid tab ID: ${tabId}. Tab ID must be a positive integer.`);
      }

      if (format && !["png", "jpeg"].includes(format)) {
        throw new Error(`Invalid format: ${format}. Must be 'png' or 'jpeg'.`);
      }

      if (quality !== undefined && (!Number.isInteger(quality) || quality < 0 || quality > 100)) {
        throw new Error(`Invalid quality: ${quality}. Quality must be an integer between 0 and 100.`);
      }

      // Get screenshot configuration
      const screenshotConfig = await getScreenshotConfig();
      
      // Use provided format or default from config
      const finalFormat = format || screenshotConfig.defaultFormat;
      const finalQuality = quality || screenshotConfig.defaultQuality;

      // Validate that the tab exists and is accessible
      let tab;
      try {
        tab = await browser.tabs.get(tabId);
      } catch (tabError) {
        throw new Error(`Tab with ID ${tabId} not found or is not accessible. The tab may have been closed or does not exist.`);
      }

      if (!tab) {
        throw new Error(`Tab with ID ${tabId} not found`);
      }

      // Check if tab is in a valid state for screenshot
      if (tab.status !== "complete") {
        throw new Error(`Tab ${tabId} is still loading. Please wait for the page to finish loading before taking a screenshot.`);
      }

      // Check if the tab URL is valid and accessible
      if (!tab.url) {
        throw new Error(`Tab ${tabId} does not have a valid URL`);
      }

      // Check for special pages that can't be captured
      if (tab.url.startsWith("about:") || tab.url.startsWith("moz-extension:") || tab.url.startsWith("chrome:")) {
        throw new Error(`Cannot capture screenshot of system page: ${tab.url}`);
      }

      // Check if the tab URL is in the deny list
      if (await isDomainInDenyList(tab.url)) {
        throw new Error(`Domain in tab URL '${tab.url}' is in the deny list`);
      }

      // Validate window ID
      const windowId = tab.windowId;
      if (windowId === undefined || windowId < 0) {
        throw new Error(`Tab ${tabId} does not have a valid window ID`);
      }

      // Check if window exists and is accessible
      try {
        const window = await browser.windows.get(windowId);
        if (!window) {
          throw new Error(`Window ${windowId} not found`);
        }
        if (window.state === "minimized") {
          throw new Error(`Cannot capture screenshot: window ${windowId} is minimized`);
        }
      } catch (windowError) {
        throw new Error(`Window ${windowId} is not accessible: ${windowError instanceof Error ? windowError.message : 'Unknown error'}`);
      }

      // Prepare capture options with validation
      const captureOptions: any = {
        format: finalFormat
      };

      // Only add quality for JPEG format and validate range
      if (finalFormat === "jpeg") {
        const validatedQuality = Math.max(0, Math.min(100, finalQuality));
        captureOptions.quality = validatedQuality;
      }

      // Attempt to capture the visible tab with timeout handling
      let imageDataUrl: string;
      try {
        // Set up a timeout for the capture operation
        const capturePromise = browser.tabs.captureVisibleTab(windowId, captureOptions);
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error("Screenshot capture timed out after 10 seconds")), 10000);
        });
        
        imageDataUrl = await Promise.race([capturePromise, timeoutPromise]);
      } catch (captureError) {
        if (captureError instanceof Error) {
          if (captureError.message.includes("permission")) {
            throw new Error(`Permission denied: Cannot capture screenshot of tab ${tabId}. The extension may not have the required permissions.`);
          } else if (captureError.message.includes("timeout")) {
            throw captureError;
          } else {
            throw new Error(`Failed to capture screenshot: ${captureError.message}`);
          }
        } else {
          throw new Error(`Failed to capture screenshot: Unknown error during capture operation`);
        }
      }

      // Validate the captured image data
      if (!imageDataUrl || typeof imageDataUrl !== "string") {
        throw new Error("Invalid image data received from capture operation");
      }

      if (!imageDataUrl.startsWith("data:image/")) {
        throw new Error("Invalid image format received from capture operation");
      }

      // Extract base64 data from data URL
      const base64Data = imageDataUrl.split(',')[1];
      if (!base64Data) {
        throw new Error("Failed to extract base64 data from captured image");
      }

      // Validate base64 data length (basic sanity check)
      if (base64Data.length < 100) {
        throw new Error("Captured image data appears to be too small or corrupted");
      }

      await this.client.sendResourceToServer({
        resource: "screenshot",
        correlationId,
        tabId,
        imageData: base64Data,
        format: finalFormat,
        timestamp: Date.now(),
      });
    } catch (error) {
      console.error("Screenshot capture failed:", error);
      
      // Re-throw with more context if it's already a detailed error
      if (error instanceof Error && (error.message.includes("Tab") || error.message.includes("Window") || error.message.includes("Permission"))) {
        throw error;
      }
      
      // Otherwise, wrap in a generic error
      throw new Error(`Failed to capture screenshot: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}
