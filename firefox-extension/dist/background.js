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
    "take-screenshot": "take-screenshot"
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
    `
      });
      const { isTruncated, fullText, links, totalLength } = results[0];
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
          return await this.captureSingleScreenshot(windowId, format, quality);
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
            const screenshot = await this.captureSingleScreenshot(windowId, format, quality);
            screenshots.push(screenshot);
          }
          if (screenshots.length === 1) {
            return screenshots[0];
          }
          return await this.stitchScreenshots(screenshots, viewportHeight, captureHeight);
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
          return await this.captureSingleScreenshot(windowId, format, quality);
        } catch (fallbackError) {
          throw new Error(`Both full page and fallback screenshot capture failed: ${error instanceof Error ? error.message : "Unknown error"}`);
        }
      }
    }
    async getPageDimensions(tabId) {
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
    async getCurrentScrollPosition(tabId) {
      const results = await browser.tabs.executeScript(tabId, {
        code: `window.pageYOffset || document.documentElement.scrollTop;`
      });
      return results[0] || 0;
    }
    async scrollToPosition(tabId, scrollY) {
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
    async waitForScrollComplete(tabId, delay = 300) {
      await new Promise((resolve) => setTimeout(resolve, delay));
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
    async captureSingleScreenshot(windowId, format, quality) {
      const captureOptions = { format };
      if (format === "jpeg") {
        captureOptions.quality = Math.max(0, Math.min(100, quality));
      }
      const capturePromise = browser.tabs.captureVisibleTab(windowId, captureOptions);
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error("Screenshot capture timed out after 10 seconds")), 1e4);
      });
      const imageDataUrl = await Promise.race([capturePromise, timeoutPromise]);
      if (!imageDataUrl || !imageDataUrl.startsWith("data:image/")) {
        throw new Error("Invalid image data received from capture operation");
      }
      return imageDataUrl;
    }
    async stitchScreenshots(screenshots, viewportHeight, totalHeight) {
      const canvas = new OffscreenCanvas(1, 1);
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        throw new Error("Failed to get canvas context for stitching");
      }
      const firstImage = await this.loadImage(screenshots[0]);
      const width = firstImage.width;
      canvas.width = width;
      canvas.height = totalHeight;
      let currentY = 0;
      for (let i = 0; i < screenshots.length; i++) {
        const image = await this.loadImage(screenshots[i]);
        const remainingHeight = totalHeight - currentY;
        const imageHeight = Math.min(image.height, remainingHeight);
        if (imageHeight <= 0) break;
        ctx.drawImage(
          image,
          0,
          0,
          width,
          imageHeight,
          // source
          0,
          currentY,
          width,
          imageHeight
          // destination
        );
        currentY += imageHeight;
        if (currentY >= totalHeight) break;
      }
      const blob = await canvas.convertToBlob({ type: "image/png" });
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error("Failed to convert stitched image to data URL"));
        reader.readAsDataURL(blob);
      });
    }
    async loadImage(dataUrl) {
      const response = await fetch(dataUrl);
      const blob = await response.blob();
      return await createImageBitmap(blob);
    }
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
