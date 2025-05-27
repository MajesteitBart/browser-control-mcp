import WebSocket from "ws";
import {
  ExtensionMessage,
  BrowserTab,
  BrowserHistoryItem,
  ServerMessage,
  TabContentExtensionMessage,
  ServerMessageRequest,
  ExtensionError,
  ScreenshotExtensionMessage,
  ScrollResultExtensionMessage,
  ClickResultExtensionMessage,
  HoverResultExtensionMessage,
  TypeResultExtensionMessage,
  WaitResultExtensionMessage,
} from "@browser-control-mcp/common";
import { isPortInUse } from "./util";
import { join, resolve, relative } from "path";
import { readFile, writeFile } from "fs/promises";
import * as fs from "fs";
import * as crypto from "crypto";

// Support up to ten initializations of the MCP server by clients
// Expanded port range to handle multiple instances and port conflicts
const WS_PORTS = [8081, 8082, 8083, 8084, 8085, 8086, 8087, 8088, 8089, 8090];
// Default timeout for most extension operations (1 second)
// Note: Screenshot operations use a longer timeout (30 seconds) due to the time needed
// for scrolling, content loading, and image stitching in full-page captures
const EXTENSION_RESPONSE_TIMEOUT_MS = 1000;

interface ExtensionRequestResolver<T extends ExtensionMessage["resource"]> {
  resource: T;
  resolve: (value: Extract<ExtensionMessage, { resource: T }>) => void;
  reject: (reason?: string) => void;
}

export class BrowserAPI {
  private ws: WebSocket | null = null;
  private wsServer: WebSocket.Server | null = null;
  private sharedSecret: string | null = null;
  private screenshotDir: string | null;

  // Map to persist the request to the extension. It maps the request correlationId
  // to a resolver, fulfulling a promise created when sending a message to the extension.
  private extensionRequestMap: Map<
    string,
    ExtensionRequestResolver<ExtensionMessage["resource"]>
  > = new Map();

  constructor(screenshotDir?: string | null) {
    this.screenshotDir = screenshotDir || null;
  }

  async init() {
    const { secret } = readConfig();
    if (!secret) {
      throw new Error("EXTENSION_SECRET env var missing. See the extension's options page.");
    }
    this.sharedSecret = secret;

    let selectedPort = null;
    const portsInUse: number[] = [];

    console.error(`Checking ${WS_PORTS.length} available ports: ${WS_PORTS.join(', ')}`);

    for (const port of WS_PORTS) {
      const inUse = await isPortInUse(port);
      if (!inUse) {
        selectedPort = port;
        console.error(`Selected available port: ${port}`);
        break;
      } else {
        portsInUse.push(port);
        console.error(`Port ${port} is already in use`);
      }
    }
    
    if (!selectedPort) {
      const errorMessage = `All available ports are in use. Checked ports: ${WS_PORTS.join(', ')}. ` +
        `Ports in use: ${portsInUse.join(', ')}. ` +
        `Please ensure no other MCP server instances are running, or restart your system to free up ports.`;
      throw new Error(errorMessage);
    }

    this.wsServer = new WebSocket.Server({
      host: "localhost",
      port: selectedPort,
    });
    this.wsServer.on("connection", async (connection) => {
      this.ws = connection;

      this.ws.on("message", (message) => {
        const decoded = JSON.parse(message.toString());
        if (isErrorMessage(decoded)) {
          this.handleExtensionError(decoded);
          return;
        }
        const signature = this.createSignature(JSON.stringify(decoded.payload));
        if (signature !== decoded.signature) {
          console.error("Invalid message signature");
          return;
        }
        this.handleDecodedExtensionMessage(decoded.payload);
      });
    });
    this.wsServer.on("error", (error) => {
      console.error("WebSocket server error:", error);
    });
    return selectedPort;
  }

  close() {
    console.error("Closing Browser API and cleaning up resources...");
    
    // Close WebSocket connection if it exists
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      console.error("Closing WebSocket connection");
      this.ws.close();
      this.ws = null;
    }
    
    // Close WebSocket server if it exists
    if (this.wsServer) {
      console.error(`Closing WebSocket server on port ${this.wsServer.options.port}`);
      this.wsServer.close((err) => {
        if (err) {
          console.error("Error closing WebSocket server:", err);
        } else {
          console.error("WebSocket server closed successfully");
        }
      });
      this.wsServer = null;
    }
    
    // Clear any pending extension requests
    if (this.extensionRequestMap.size > 0) {
      console.error(`Clearing ${this.extensionRequestMap.size} pending extension requests`);
      for (const [correlationId, resolver] of this.extensionRequestMap.entries()) {
        resolver.reject("Server is shutting down");
      }
      this.extensionRequestMap.clear();
    }
    
    console.error("Browser API cleanup completed");
  }

  getSelectedPort() {
    return this.wsServer?.options.port;
  }

  async openTab(url: string): Promise<number | undefined> {
    const correlationId = this.sendMessageToExtension({
      cmd: "open-tab",
      url,
    });
    const message = await this.waitForResponse(correlationId, "opened-tab-id");
    return message.tabId;
  }

  async closeTabs(tabIds: number[]) {
    const correlationId = this.sendMessageToExtension({
      cmd: "close-tabs",
      tabIds,
    });
    await this.waitForResponse(correlationId, "tabs-closed");
  }

  async getTabList(): Promise<BrowserTab[]> {
    const correlationId = this.sendMessageToExtension({
      cmd: "get-tab-list",
    });
    const message = await this.waitForResponse(correlationId, "tabs");
    return message.tabs;
  }

  async getBrowserRecentHistory(
    searchQuery?: string
  ): Promise<BrowserHistoryItem[]> {
    const correlationId = this.sendMessageToExtension({
      cmd: "get-browser-recent-history",
      searchQuery,
    });
    const message = await this.waitForResponse(correlationId, "history");
    return message.historyItems;
  }

  async getTabContent(
    tabId: number,
    offset: number
  ): Promise<TabContentExtensionMessage> {
    const correlationId = this.sendMessageToExtension({
      cmd: "get-tab-content",
      tabId,
      offset,
    });
    return await this.waitForResponse(correlationId, "tab-content");
  }

  async reorderTabs(tabOrder: number[]): Promise<number[]> {
    const correlationId = this.sendMessageToExtension({
      cmd: "reorder-tabs",
      tabOrder,
    });
    const message = await this.waitForResponse(correlationId, "tabs-reordered");
    return message.tabOrder;
  }

  async findHighlight(tabId: number, queryPhrase: string): Promise<number> {
    const correlationId = this.sendMessageToExtension({
      cmd: "find-highlight",
      tabId,
      queryPhrase,
    });
    const message = await this.waitForResponse(
      correlationId,
      "find-highlight-result"
    );
    return message.noOfResults;
  }

  // Security and validation utility methods
  private sanitizeFilename(filename: string): string {
    // Remove or replace invalid characters for both Windows and Unix
    const invalidChars = /[<>:"/\\|?*\x00-\x1F]/g;
    return filename.replace(invalidChars, '_');
  }

  private async validateScreenshotDirectory(): Promise<boolean> {
    if (!this.screenshotDir) {
      return false;
    }

    try {
      // Check if directory exists and is accessible
      await fs.promises.access(this.screenshotDir, fs.constants.F_OK);
      
      // Check if directory is writable
      await fs.promises.access(this.screenshotDir, fs.constants.W_OK);
      
      // Verify it's actually a directory
      const stats = await fs.promises.stat(this.screenshotDir);
      if (!stats.isDirectory()) {
        console.error(`Screenshot path '${this.screenshotDir}' exists but is not a directory`);
        return false;
      }
      
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        // Directory doesn't exist, try to create it
        try {
          await fs.promises.mkdir(this.screenshotDir, { recursive: true });
          return true;
        } catch (mkdirError) {
          console.error(`Failed to create screenshot directory: ${(mkdirError as Error).message}`);
          return false;
        }
      }
      console.error(`Screenshot directory validation failed: ${(error as Error).message}`);
      return false;
    }
  }

  private async validateSecurePath(filename: string): Promise<string> {
    if (!this.screenshotDir) {
      throw new Error('Screenshot directory not configured');
    }

    // Resolve the screenshot directory to an absolute path
    const resolvedDir = resolve(this.screenshotDir);
    const filePath = join(resolvedDir, filename);

    // Validate the final path stays within the screenshot directory
    const resolvedFilePath = resolve(filePath);
    if (!resolvedFilePath.startsWith(resolvedDir)) {
      throw new Error('Invalid file path: potential directory traversal attempt');
    }

    // Additional validation for symbolic links
    try {
      const stats = await fs.promises.lstat(resolvedDir);
      if (stats.isSymbolicLink()) {
        throw new Error('Screenshot directory cannot be a symbolic link');
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
      // Directory doesn't exist yet, which is OK
    }

    return resolvedFilePath;
  }

  private async saveScreenshotWithRetry(
    filePath: string,
    imageBuffer: Buffer,
    maxRetries: number = 2
  ): Promise<void> {
    let lastError: Error | null = null;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        await writeFile(filePath, imageBuffer);
        return; // Success
      } catch (error) {
        lastError = error as Error;
        const errorCode = (error as NodeJS.ErrnoException).code;
        
        // Only retry for specific transient errors
        if (attempt < maxRetries &&
            (errorCode === 'EBUSY' || errorCode === 'EAGAIN' || errorCode === 'ETIMEDOUT')) {
          console.error(`Screenshot save attempt ${attempt + 1} failed, retrying...`);
          await new Promise(resolve => setTimeout(resolve, 100 * (attempt + 1))); // Exponential backoff
          continue;
        }
        
        // Don't retry for permanent errors
        break;
      }
    }
    
    throw lastError!;
  }

  async takeScreenshot(
    tabId: number,
    format: "png" | "jpeg" = "png",
    quality?: number
  ): Promise<ScreenshotExtensionMessage> {
    const correlationId = this.sendMessageToExtension({
      cmd: "take-screenshot",
      tabId,
      format,
      quality,
    });
    // Use 30 second timeout for screenshot operations since full-page captures
    // can take a long time due to scrolling, waiting for content to load, and stitching
    const screenshot = await this.waitForResponse(correlationId, "screenshot", 30000);

    // Try to save screenshot to file (non-blocking, maintains backward compatibility)
    if (this.screenshotDir) {
      try {
        // Validate format
        const validFormats = ['png', 'jpeg'] as const;
        if (!validFormats.includes(format)) {
          console.error(`Invalid screenshot format: ${format}, defaulting to png`);
          format = 'png';
        }

        // Validate directory exists and is writable
        const isDirectoryValid = await this.validateScreenshotDirectory();
        if (!isDirectoryValid) {
          throw new Error('Screenshot directory is not accessible or writable');
        }

        // Create and sanitize filename
        const rawFilename = `screenshot-${screenshot.timestamp}-${tabId}.${format}`;
        const filename = this.sanitizeFilename(rawFilename);
        
        // Validate secure path (prevents directory traversal)
        const filePath = await this.validateSecurePath(filename);
        
        // Convert base64 to buffer
        const imageBuffer = Buffer.from(screenshot.imageData, 'base64');
        
        // Save with retry logic
        await this.saveScreenshotWithRetry(filePath, imageBuffer);
        
        // Create enhanced screenshot response
        const screenshotWithPath = {
          ...screenshot,
          filePath: filePath
        };
        
        // Success logging with context
        console.log(`Screenshot saved successfully:`, {
          path: filePath,
          tabId: tabId,
          format: format,
          size: imageBuffer.length,
          timestamp: new Date(screenshot.timestamp).toISOString()
        });
        
        return screenshotWithPath;
        
      } catch (error) {
        const errorCode = (error as NodeJS.ErrnoException).code;
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        
        // Enhanced error handling with specific cases
        switch (errorCode) {
          case 'ENOENT':
            console.error(`Screenshot directory does not exist: ${this.screenshotDir}`);
            break;
          case 'EACCES':
            console.error(`Permission denied writing to screenshot directory: ${this.screenshotDir}`);
            break;
          case 'ENOSPC':
            console.error(`Insufficient disk space to save screenshot`);
            break;
          case 'EROFS':
            console.error(`Cannot save screenshot: file system is read-only`);
            break;
          case 'EMFILE':
            console.error(`Too many open files, cannot save screenshot`);
            break;
          default:
            console.error(`Failed to save screenshot file: ${errorMessage} (code: ${errorCode || 'none'})`);
        }
        
        // Enhanced error logging with context
        console.error(`Screenshot save failed:`, {
          error: errorMessage,
          code: errorCode,
          directory: this.screenshotDir,
          tabId: tabId,
          format: format,
          timestamp: new Date(screenshot.timestamp).toISOString(),
          estimatedSize: screenshot.imageData.length * 0.75
        });
        
        // Don't fail the whole operation - file saving is optional
        // Return original screenshot without filePath
      }
    } else {
      // Screenshot directory not configured, skip file saving
      console.error('Screenshot directory not configured, file saving disabled');
    }

    return screenshot;
  }

  async scrollToPosition(
    tabId: number,
    x: number = 0,
    y: number,
    behavior: "auto" | "smooth" = "smooth"
  ): Promise<ScrollResultExtensionMessage> {
    const correlationId = this.sendMessageToExtension({
      cmd: "scroll-to-position",
      tabId,
      x,
      y,
      behavior,
    });
    return await this.waitForResponse(correlationId, "scroll-result");
  }

  async scrollByOffset(
    tabId: number,
    deltaX: number = 0,
    deltaY: number,
    behavior: "auto" | "smooth" = "smooth"
  ): Promise<ScrollResultExtensionMessage> {
    const correlationId = this.sendMessageToExtension({
      cmd: "scroll-by-offset",
      tabId,
      deltaX,
      deltaY,
      behavior,
    });
    return await this.waitForResponse(correlationId, "scroll-result");
  }

  async scrollToElement(
    tabId: number,
    selector: string,
    block: "start" | "center" | "end" | "nearest" = "center",
    inline: "start" | "center" | "end" | "nearest" = "nearest",
    behavior: "auto" | "smooth" = "smooth"
  ): Promise<ScrollResultExtensionMessage> {
    const correlationId = this.sendMessageToExtension({
      cmd: "scroll-to-element",
      tabId,
      selector,
      block,
      inline,
      behavior,
    });
    return await this.waitForResponse(correlationId, "scroll-result");
  }

  async clickAtCoordinates(
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
  ): Promise<ClickResultExtensionMessage> {
    const correlationId = this.sendMessageToExtension({
      cmd: "click-at-coordinates",
      tabId,
      x,
      y,
      button,
      clickType,
      modifiers,
    });
    return await this.waitForResponse(correlationId, "click-result");
  }

  async clickElement(
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
  ): Promise<ClickResultExtensionMessage> {
    const correlationId = this.sendMessageToExtension({
      cmd: "click-element",
      tabId,
      selector,
      button,
      clickType,
      waitForElement,
      scrollIntoView,
      modifiers,
    });
    return await this.waitForResponse(correlationId, "click-result");
  }

  async hoverElement(
    tabId: number,
    selector?: string,
    x?: number,
    y?: number,
    waitForElement: number = 5000
  ): Promise<HoverResultExtensionMessage> {
    const correlationId = this.sendMessageToExtension({
      cmd: "hover-element",
      tabId,
      selector,
      x,
      y,
      waitForElement,
    });
    return await this.waitForResponse(correlationId, "hover-result");
  }

  async typeText(
    tabId: number,
    text: string,
    selector?: string,
    clearFirst?: boolean,
    typeDelay?: number,
    waitForElement?: number
  ): Promise<TypeResultExtensionMessage> {
    const correlationId = this.sendMessageToExtension({
      cmd: "type-text",
      tabId,
      text,
      selector,
      clearFirst,
      typeDelay,
      waitForElement,
    });
    return await this.waitForResponse(correlationId, "type-result");
  }

  async sendSpecialKeys(
    tabId: number,
    keys: string[],
    selector?: string,
    modifiers?: {
      ctrl?: boolean;
      alt?: boolean;
      shift?: boolean;
      meta?: boolean;
    }
  ): Promise<TypeResultExtensionMessage> {
    const correlationId = this.sendMessageToExtension({
      cmd: "send-special-keys",
      tabId,
      keys,
      selector,
      modifiers,
    });
    return await this.waitForResponse(correlationId, "type-result");
  }

  async clearInputField(
    tabId: number,
    selector: string,
    waitForElement?: number
  ): Promise<TypeResultExtensionMessage> {
    const correlationId = this.sendMessageToExtension({
      cmd: "clear-input-field",
      tabId,
      selector,
      waitForElement,
    });
    return await this.waitForResponse(correlationId, "type-result");
  }

  async waitForTime(
    duration: number,
    message?: string
  ): Promise<WaitResultExtensionMessage> {
    const correlationId = this.sendMessageToExtension({
      cmd: "wait-for-time",
      duration,
      message,
    });
    return await this.waitForResponse(correlationId, "wait-result");
  }

  async waitForElement(
    tabId: number,
    selector: string,
    timeout: number = 5000,
    pollInterval: number = 100,
    visible: boolean = false
  ): Promise<WaitResultExtensionMessage> {
    const correlationId = this.sendMessageToExtension({
      cmd: "wait-for-element",
      tabId,
      selector,
      timeout,
      pollInterval,
      visible,
    });
    return await this.waitForResponse(correlationId, "wait-result");
  }

  async waitForElementVisibility(
    tabId: number,
    selector: string,
    timeout: number = 5000,
    threshold: number = 0.1
  ): Promise<WaitResultExtensionMessage> {
    const correlationId = this.sendMessageToExtension({
      cmd: "wait-for-element-visibility",
      tabId,
      selector,
      timeout,
      threshold,
    });
    return await this.waitForResponse(correlationId, "wait-result");
  }

  async waitForCondition(
    tabId: number,
    condition: string,
    timeout: number = 5000,
    pollInterval: number = 100,
    args?: Record<string, any>
  ): Promise<WaitResultExtensionMessage> {
    // SECURITY FIX: This method has been disabled due to critical security vulnerability
    // The previous implementation allowed arbitrary JavaScript execution via new Function()
    // which could lead to complete system compromise, data theft, and malicious redirects
    
    // Send message to extension which will return a security error
    const correlationId = this.sendMessageToExtension({
      cmd: "wait-for-condition",
      tabId,
      condition,
      timeout,
      pollInterval,
      args,
    });
    
    // The extension will return an error message explaining the security fix
    return await this.waitForResponse(correlationId, "wait-result");
  }

  private createSignature(payload: string): string {
    if (!this.sharedSecret) {
      throw new Error("Shared secret not initialized");
    }
    const hmac = crypto.createHmac("sha256", this.sharedSecret);
    hmac.update(payload);
    return hmac.digest("hex");
  }

  private sendMessageToExtension(message: ServerMessage): string {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error("WebSocket is not open");
    }

    const correlationId = Math.random().toString(36).substring(2);
    const req: ServerMessageRequest = { ...message, correlationId };
    const payload = JSON.stringify(req);
    const signature = this.createSignature(payload);
    const signedMessage = {
      payload: req,
      signature: signature,
    };

    // Send the signed message to the extension
    this.ws.send(JSON.stringify(signedMessage));

    return correlationId;
  }

  private handleDecodedExtensionMessage(decoded: ExtensionMessage) {
    const { correlationId } = decoded;
    const { resolve, resource } = this.extensionRequestMap.get(correlationId)!;
    if (resource !== decoded.resource) {
      console.error("Resource mismatch:", resource, decoded.resource);
      return;
    }
    this.extensionRequestMap.delete(correlationId);
    resolve(decoded);
  }

  private handleExtensionError(decoded: ExtensionError) {
    const { correlationId, errorMessage } = decoded;
    const { reject } = this.extensionRequestMap.get(correlationId)!;
    this.extensionRequestMap.delete(correlationId);
    reject(errorMessage);
  }

  private async waitForResponse<T extends ExtensionMessage["resource"]>(
    correlationId: string,
    resource: T,
    timeoutMs?: number
  ): Promise<Extract<ExtensionMessage, { resource: T }>> {
    // Use provided timeout or default to EXTENSION_RESPONSE_TIMEOUT_MS
    const timeout = timeoutMs || EXTENSION_RESPONSE_TIMEOUT_MS;
    
    return new Promise<Extract<ExtensionMessage, { resource: T }>>(
      (resolve, reject) => {
        this.extensionRequestMap.set(correlationId, {
          resolve: resolve as (value: ExtensionMessage) => void,
          resource,
          reject,
        });
        setTimeout(() => {
          this.extensionRequestMap.delete(correlationId);
          reject("Timed out waiting for response");
        }, timeout);
      }
    );
  }
}

function readConfig() {
  return {
    secret: process.env.EXTENSION_SECRET,
  }
}

export function isErrorMessage(
  message: any
): message is ExtensionError {
  return (
    message.errorMessage !== undefined &&
    message.correlationId !== undefined
  );
}