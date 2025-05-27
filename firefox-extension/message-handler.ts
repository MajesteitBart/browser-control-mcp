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

      // Capture full page screenshot using scroll-and-stitch method
      const imageDataUrl = await this.captureFullPageScreenshot(tabId, windowId, finalFormat, finalQuality);

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

  private async captureFullPageScreenshot(
    tabId: number,
    windowId: number,
    format: "png" | "jpeg",
    quality: number
  ): Promise<string> {
    // Maximum height limit to prevent excessive memory usage
    const MAX_PAGE_HEIGHT = 6000;
    
    try {
      // Inject content script to get page dimensions and handle scrolling
      const pageDimensions = await this.getPageDimensions(tabId);
      
      // Calculate the effective capture height (limited by MAX_PAGE_HEIGHT)
      const captureHeight = Math.min(pageDimensions.fullHeight, MAX_PAGE_HEIGHT);
      
      // If the page is short enough to fit in viewport, use single capture
      if (captureHeight <= pageDimensions.viewportHeight) {
        return await this.captureSingleScreenshot(windowId, format, quality);
      }

      // Store original scroll position to restore later
      const originalScrollY = await this.getCurrentScrollPosition(tabId);
      
      try {
        // Calculate number of captures needed
        const viewportHeight = pageDimensions.viewportHeight;
        const numCaptures = Math.ceil(captureHeight / viewportHeight);
        
        // Capture screenshots for each section
        const screenshots: string[] = [];
        
        for (let i = 0; i < numCaptures; i++) {
          const scrollY = i * viewportHeight;
          
          // Don't scroll beyond our capture limit
          if (scrollY >= captureHeight) break;
          
          // Scroll to position
          await this.scrollToPosition(tabId, scrollY);
          
          // Wait for scroll to complete and any lazy content to load
          await this.waitForScrollComplete(tabId, 300);
          
          // Capture this section
          const screenshot = await this.captureSingleScreenshot(windowId, format, quality);
          screenshots.push(screenshot);
        }
        
        // Stitch screenshots together if we have multiple
        if (screenshots.length === 1) {
          return screenshots[0];
        }
        
        return await this.stitchScreenshots(screenshots, viewportHeight, captureHeight);
        
      } finally {
        // Restore original scroll position
        try {
          await this.scrollToPosition(tabId, originalScrollY);
          await this.waitForScrollComplete(tabId, 100);
        } catch (restoreError) {
          console.warn("Failed to restore original scroll position:", restoreError);
        }
      }
      
    } catch (error) {
      console.error("Full page capture failed, falling back to viewport capture:", error);
      
      // Fallback to single viewport capture if full page capture fails
      try {
        return await this.captureSingleScreenshot(windowId, format, quality);
      } catch (fallbackError) {
        throw new Error(`Both full page and fallback screenshot capture failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }
  }

  private async getPageDimensions(tabId: number): Promise<{
    fullHeight: number;
    viewportHeight: number;
    viewportWidth: number;
  }> {
    const results = await browser.tabs.executeScript(tabId, {
      code: `
        (function() {
          // Get the full document height
          const body = document.body;
          const html = document.documentElement;
          
          const fullHeight = Math.max(
            body.scrollHeight,
            body.offsetHeight,
            html.clientHeight,
            html.scrollHeight,
            html.offsetHeight
          );
          
          const viewportHeight = window.innerHeight;
          const viewportWidth = window.innerWidth;
          
          return {
            fullHeight: fullHeight,
            viewportHeight: viewportHeight,
            viewportWidth: viewportWidth
          };
        })();
      `
    });
    
    return results[0];
  }

  private async getCurrentScrollPosition(tabId: number): Promise<number> {
    const results = await browser.tabs.executeScript(tabId, {
      code: `window.pageYOffset || document.documentElement.scrollTop;`
    });
    
    return results[0] || 0;
  }

  private async scrollToPosition(tabId: number, scrollY: number): Promise<void> {
    await browser.tabs.executeScript(tabId, {
      code: `
        window.scrollTo({
          top: ${scrollY},
          left: 0,
          behavior: 'instant'
        });
      `
    });
  }

  private async waitForScrollComplete(tabId: number, delay: number = 300): Promise<void> {
    // Wait for scroll to complete and any dynamic content to load
    await new Promise(resolve => setTimeout(resolve, delay));
    
    // Wait for any lazy images to load
    await browser.tabs.executeScript(tabId, {
      code: `
        (function() {
          const images = document.querySelectorAll('img[loading="lazy"], img[data-src]');
          const promises = Array.from(images).map(img => {
            if (img.complete) return Promise.resolve();
            return new Promise(resolve => {
              img.onload = img.onerror = resolve;
              setTimeout(resolve, 1000); // Timeout after 1s
            });
          });
          return Promise.all(promises);
        })();
      `
    });
  }

  private async captureSingleScreenshot(
    windowId: number,
    format: "png" | "jpeg",
    quality: number
  ): Promise<string> {
    const captureOptions: any = { format };
    
    if (format === "jpeg") {
      captureOptions.quality = Math.max(0, Math.min(100, quality));
    }
    
    // Set up timeout for capture operation
    const capturePromise = browser.tabs.captureVisibleTab(windowId, captureOptions);
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error("Screenshot capture timed out after 10 seconds")), 10000);
    });
    
    const imageDataUrl = await Promise.race([capturePromise, timeoutPromise]);
    
    if (!imageDataUrl || !imageDataUrl.startsWith("data:image/")) {
      throw new Error("Invalid image data received from capture operation");
    }
    
    return imageDataUrl;
  }

  private async stitchScreenshots(
    screenshots: string[],
    viewportHeight: number,
    totalHeight: number
  ): Promise<string> {
    // Create a canvas to stitch the screenshots
    const canvas = new OffscreenCanvas(1, 1);
    const ctx = canvas.getContext('2d');
    
    if (!ctx) {
      throw new Error("Failed to get canvas context for stitching");
    }
    
    // Load the first image to get dimensions
    const firstImage = await this.loadImage(screenshots[0]);
    const width = firstImage.width;
    
    // Set canvas size
    canvas.width = width;
    canvas.height = totalHeight;
    
    // Draw each screenshot onto the canvas
    let currentY = 0;
    
    for (let i = 0; i < screenshots.length; i++) {
      const image = await this.loadImage(screenshots[i]);
      
      // Calculate how much of this image to use
      const remainingHeight = totalHeight - currentY;
      const imageHeight = Math.min(image.height, remainingHeight);
      
      if (imageHeight <= 0) break;
      
      // Draw the image (or portion of it) onto the canvas
      ctx.drawImage(
        image,
        0, 0, width, imageHeight,  // source
        0, currentY, width, imageHeight  // destination
      );
      
      currentY += imageHeight;
      
      // Break if we've filled the total height
      if (currentY >= totalHeight) break;
    }
    
    // Convert canvas to data URL
    const blob = await canvas.convertToBlob({ type: 'image/png' });
    
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error("Failed to convert stitched image to data URL"));
      reader.readAsDataURL(blob);
    });
  }

  private async loadImage(dataUrl: string): Promise<ImageBitmap> {
    const response = await fetch(dataUrl);
    const blob = await response.blob();
    return await createImageBitmap(blob);
  }
}
