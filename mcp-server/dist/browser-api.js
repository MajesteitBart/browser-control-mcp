"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.BrowserAPI = void 0;
exports.isErrorMessage = isErrorMessage;
const ws_1 = __importDefault(require("ws"));
const util_1 = require("./util");
const crypto = __importStar(require("crypto"));
// Support up to ten initializations of the MCP server by clients
// Expanded port range to handle multiple instances and port conflicts
const WS_PORTS = [8081, 8082, 8083, 8084, 8085, 8086, 8087, 8088, 8089, 8090];
const EXTENSION_RESPONSE_TIMEOUT_MS = 1000;
class BrowserAPI {
    ws = null;
    wsServer = null;
    sharedSecret = null;
    // Map to persist the request to the extension. It maps the request correlationId
    // to a resolver, fulfulling a promise created when sending a message to the extension.
    extensionRequestMap = new Map();
    async init() {
        const { secret } = readConfig();
        if (!secret) {
            throw new Error("EXTENSION_SECRET env var missing. See the extension's options page.");
        }
        this.sharedSecret = secret;
        let selectedPort = null;
        const portsInUse = [];
        console.error(`Checking ${WS_PORTS.length} available ports: ${WS_PORTS.join(', ')}`);
        for (const port of WS_PORTS) {
            const inUse = await (0, util_1.isPortInUse)(port);
            if (!inUse) {
                selectedPort = port;
                console.error(`Selected available port: ${port}`);
                break;
            }
            else {
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
        this.wsServer = new ws_1.default.Server({
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
        if (this.ws && this.ws.readyState === ws_1.default.OPEN) {
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
                }
                else {
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
    async openTab(url) {
        const correlationId = this.sendMessageToExtension({
            cmd: "open-tab",
            url,
        });
        const message = await this.waitForResponse(correlationId, "opened-tab-id");
        return message.tabId;
    }
    async closeTabs(tabIds) {
        const correlationId = this.sendMessageToExtension({
            cmd: "close-tabs",
            tabIds,
        });
        await this.waitForResponse(correlationId, "tabs-closed");
    }
    async getTabList() {
        const correlationId = this.sendMessageToExtension({
            cmd: "get-tab-list",
        });
        const message = await this.waitForResponse(correlationId, "tabs");
        return message.tabs;
    }
    async getBrowserRecentHistory(searchQuery) {
        const correlationId = this.sendMessageToExtension({
            cmd: "get-browser-recent-history",
            searchQuery,
        });
        const message = await this.waitForResponse(correlationId, "history");
        return message.historyItems;
    }
    async getTabContent(tabId, offset) {
        const correlationId = this.sendMessageToExtension({
            cmd: "get-tab-content",
            tabId,
            offset,
        });
        return await this.waitForResponse(correlationId, "tab-content");
    }
    async reorderTabs(tabOrder) {
        const correlationId = this.sendMessageToExtension({
            cmd: "reorder-tabs",
            tabOrder,
        });
        const message = await this.waitForResponse(correlationId, "tabs-reordered");
        return message.tabOrder;
    }
    async findHighlight(tabId, queryPhrase) {
        const correlationId = this.sendMessageToExtension({
            cmd: "find-highlight",
            tabId,
            queryPhrase,
        });
        const message = await this.waitForResponse(correlationId, "find-highlight-result");
        return message.noOfResults;
    }
    async takeScreenshot(tabId, format = "png", quality) {
        const correlationId = this.sendMessageToExtension({
            cmd: "take-screenshot",
            tabId,
            format,
            quality,
        });
        return await this.waitForResponse(correlationId, "screenshot");
    }
    createSignature(payload) {
        if (!this.sharedSecret) {
            throw new Error("Shared secret not initialized");
        }
        const hmac = crypto.createHmac("sha256", this.sharedSecret);
        hmac.update(payload);
        return hmac.digest("hex");
    }
    sendMessageToExtension(message) {
        if (!this.ws || this.ws.readyState !== ws_1.default.OPEN) {
            throw new Error("WebSocket is not open");
        }
        const correlationId = Math.random().toString(36).substring(2);
        const req = { ...message, correlationId };
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
    handleDecodedExtensionMessage(decoded) {
        const { correlationId } = decoded;
        const { resolve, resource } = this.extensionRequestMap.get(correlationId);
        if (resource !== decoded.resource) {
            console.error("Resource mismatch:", resource, decoded.resource);
            return;
        }
        this.extensionRequestMap.delete(correlationId);
        resolve(decoded);
    }
    handleExtensionError(decoded) {
        const { correlationId, errorMessage } = decoded;
        const { reject } = this.extensionRequestMap.get(correlationId);
        this.extensionRequestMap.delete(correlationId);
        reject(errorMessage);
    }
    async waitForResponse(correlationId, resource) {
        return new Promise((resolve, reject) => {
            this.extensionRequestMap.set(correlationId, {
                resolve: resolve,
                resource,
                reject,
            });
            setTimeout(() => {
                this.extensionRequestMap.delete(correlationId);
                reject("Timed out waiting for response");
            }, EXTENSION_RESPONSE_TIMEOUT_MS);
        });
    }
}
exports.BrowserAPI = BrowserAPI;
function readConfig() {
    return {
        secret: process.env.EXTENSION_SECRET,
    };
}
function isErrorMessage(message) {
    return (message.errorMessage !== undefined &&
        message.correlationId !== undefined);
}
