import { MessageHandler } from "../message-handler";
import { WebsocketClient } from "../client";
import { ServerMessageRequest } from "@browser-control-mcp/common";
import { ExtensionConfig } from "../extension-config";

// Mock the WebsocketClient
jest.mock("../client", () => {
  return {
    WebsocketClient: jest.fn().mockImplementation(() => {
      return {
        sendResourceToServer: jest.fn().mockResolvedValue(undefined),
        sendErrorToServer: jest.fn().mockResolvedValue(undefined),
      };
    }),
  };
});

describe("MessageHandler", () => {
  let messageHandler: MessageHandler;
  let mockClient: jest.Mocked<WebsocketClient>;

  beforeEach(() => {
    // Clear all mocks before each test
    jest.clearAllMocks();

    // Create a new instance of WebsocketClient and MessageHandler
    mockClient = new WebsocketClient(
      8080,
      "test-secret"
    ) as jest.Mocked<WebsocketClient>;
    messageHandler = new MessageHandler(mockClient);

    // Mock browser.storage.local.get to return default config
    const defaultConfig: ExtensionConfig = {
      secret: "test-secret",
      toolSettings: {
        "open-browser-tab": true,
        "close-browser-tabs": true,
        "get-list-of-open-tabs": true,
        "get-recent-browser-history": true,
        "get-tab-web-content": true,
        "reorder-browser-tabs": true,
        "find-highlight-in-browser-tab": true,
        "take-screenshot": true,
        "click-at-coordinates": true,
        "click-element": true,
      },
      domainDenyList: [],
      screenshotConfig: {
        defaultFormat: "png",
        defaultQuality: 90,
        maxWidth: 1920,
        maxHeight: 1080
      }
    };

    (browser.storage.local.get as jest.Mock).mockResolvedValue({
      config: defaultConfig,
    });
  });

  describe("handleDecodedMessage", () => {
    it("should throw an error if command is not allowed", async () => {
      // Arrange
      const configWithDisabledOpenTab: ExtensionConfig = {
        secret: "test-secret",
        toolSettings: {
          "open-browser-tab": false, // Disable open-tab command
          "close-browser-tabs": true,
          "get-list-of-open-tabs": true,
          "get-recent-browser-history": true,
          "get-tab-web-content": true,
          "reorder-browser-tabs": true,
          "find-highlight-in-browser-tab": true,
          "take-screenshot": true,
        },
        domainDenyList: [],
        screenshotConfig: {
          defaultFormat: "png",
          defaultQuality: 90,
          maxWidth: 1920,
          maxHeight: 1080
        }
      };
      (browser.storage.local.get as jest.Mock).mockResolvedValue({
        config: configWithDisabledOpenTab,
      });

      const request: ServerMessageRequest = {
        cmd: "open-tab",
        url: "https://example.com",
        correlationId: "test-correlation-id",
      };

      // Act & Assert
      await expect(
        messageHandler.handleDecodedMessage(request)
      ).rejects.toThrow("Command 'open-tab' is disabled in extension settings");
    });

    describe("open-tab command", () => {
      it("should open a new tab and send the tab ID to the server", async () => {
        // Arrange
        const request: ServerMessageRequest = {
          cmd: "open-tab",
          url: "https://example.com",
          correlationId: "test-correlation-id",
        };

        const mockTab = { id: 123 };
        (browser.tabs.create as jest.Mock).mockResolvedValue(mockTab);

        // Act
        await messageHandler.handleDecodedMessage(request);

        // Assert
        expect(browser.tabs.create).toHaveBeenCalledWith({
          url: "https://example.com",
        });
        expect(mockClient.sendResourceToServer).toHaveBeenCalledWith({
          resource: "opened-tab-id",
          correlationId: "test-correlation-id",
          tabId: 123,
        });
      });

      it("should throw an error if URL does not start with https://", async () => {
        // Arrange
        const request: ServerMessageRequest = {
          cmd: "open-tab",
          url: "http://example.com",
          correlationId: "test-correlation-id",
        };

        // Act & Assert
        await expect(
          messageHandler.handleDecodedMessage(request)
        ).rejects.toThrow("Invalid URL");
        expect(browser.tabs.create).not.toHaveBeenCalled();
      });

      it("should throw an error if domain is in deny list", async () => {
        // Arrange
        const configWithDenyList: ExtensionConfig = {
          secret: "test-secret",
          toolSettings: {
            "open-browser-tab": true,
            "close-browser-tabs": true,
            "get-list-of-open-tabs": true,
            "get-recent-browser-history": true,
            "get-tab-web-content": true,
            "reorder-browser-tabs": true,
            "find-highlight-in-browser-tab": true,
            "take-screenshot": true,
          },
          domainDenyList: ["example.com", "another.com"],
          screenshotConfig: {
            defaultFormat: "png",
            defaultQuality: 90,
            maxWidth: 1920,
            maxHeight: 1080
          }
        };
        (browser.storage.local.get as jest.Mock).mockResolvedValue({
          config: configWithDenyList,
        });

        const request: ServerMessageRequest = {
          cmd: "open-tab",
          url: "https://example.com",
          correlationId: "test-correlation-id",
        };

        // Act & Assert
        await expect(
          messageHandler.handleDecodedMessage(request)
        ).rejects.toThrow("Domain in user defined deny list");
        expect(browser.tabs.create).not.toHaveBeenCalled();
      });

      it("should open a new tab in the domain is not in the deny list", async () => {
        // Arrange
        const configWithDenyList: ExtensionConfig = {
          secret: "test-secret",
          toolSettings: {
            "open-browser-tab": true,
            "close-browser-tabs": true,
            "get-list-of-open-tabs": true,
            "get-recent-browser-history": true,
            "get-tab-web-content": true,
            "reorder-browser-tabs": true,
            "find-highlight-in-browser-tab": true,
            "take-screenshot": true,
          },
          domainDenyList: ["example.com", "another.com"],
          screenshotConfig: {
            defaultFormat: "png",
            defaultQuality: 90,
            maxWidth: 1920,
            maxHeight: 1080
          }
        };
        (browser.storage.local.get as jest.Mock).mockResolvedValue({
          config: configWithDenyList,
        });

        const request: ServerMessageRequest = {
          cmd: "open-tab",
          url: "https://allowed.com",
          correlationId: "test-correlation-id",
        };

        const mockTab = { id: 123 };
        (browser.tabs.create as jest.Mock).mockResolvedValue(mockTab);

        // Act
        await messageHandler.handleDecodedMessage(request);

        // Assert
        expect(browser.tabs.create).toHaveBeenCalledWith({
          url: "https://allowed.com",
        });
        expect(mockClient.sendResourceToServer).toHaveBeenCalledWith({
          resource: "opened-tab-id",
          correlationId: "test-correlation-id",
          tabId: 123,
        });
      });
    });

    describe("close-tabs command", () => {
      it("should close tabs and send confirmation to the server", async () => {
        // Arrange
        const request: ServerMessageRequest = {
          cmd: "close-tabs",
          tabIds: [123, 456],
          correlationId: "test-correlation-id",
        };

        (browser.tabs.remove as jest.Mock).mockResolvedValue(undefined);

        // Act
        await messageHandler.handleDecodedMessage(request);

        // Assert
        expect(browser.tabs.remove).toHaveBeenCalledWith([123, 456]);
        expect(mockClient.sendResourceToServer).toHaveBeenCalledWith({
          resource: "tabs-closed",
          correlationId: "test-correlation-id",
        });
      });
    });

    describe("get-tab-list command", () => {
      it("should get tabs and send them to the server", async () => {
        // Arrange
        const request: ServerMessageRequest = {
          cmd: "get-tab-list",
          correlationId: "test-correlation-id",
        };

        const mockTabs = [{ id: 123, url: "https://example.com" }];
        (browser.tabs.query as jest.Mock).mockResolvedValue(mockTabs);

        // Act
        await messageHandler.handleDecodedMessage(request);

        // Assert
        expect(browser.tabs.query).toHaveBeenCalledWith({});
        expect(mockClient.sendResourceToServer).toHaveBeenCalledWith({
          resource: "tabs",
          correlationId: "test-correlation-id",
          tabs: mockTabs,
        });
      });
    });

    describe("get-browser-recent-history command", () => {
      it("should get history items and send them to the server", async () => {
        // Arrange
        const request: ServerMessageRequest = {
          cmd: "get-browser-recent-history",
          searchQuery: "test",
          correlationId: "test-correlation-id",
        };

        const mockHistoryItems = [
          { url: "https://example.com", title: "Example" },
          { url: "https://test.com", title: "Test" },
        ];
        (browser.history.search as jest.Mock).mockResolvedValue(
          mockHistoryItems
        );

        // Act
        await messageHandler.handleDecodedMessage(request);

        // Assert
        expect(browser.history.search).toHaveBeenCalledWith({
          text: "test",
          maxResults: 200,
          startTime: 0,
        });
        expect(mockClient.sendResourceToServer).toHaveBeenCalledWith({
          resource: "history",
          correlationId: "test-correlation-id",
          historyItems: mockHistoryItems,
        });
      });

      it("should use empty string for search query if not provided", async () => {
        // Arrange
        const request: ServerMessageRequest = {
          cmd: "get-browser-recent-history",
          correlationId: "test-correlation-id",
        };

        const mockHistoryItems = [
          { url: "https://example.com", title: "Example" },
        ];
        (browser.history.search as jest.Mock).mockResolvedValue(
          mockHistoryItems
        );

        // Act
        await messageHandler.handleDecodedMessage(request);

        // Assert
        expect(browser.history.search).toHaveBeenCalledWith({
          text: "",
          maxResults: 200,
          startTime: 0,
        });
      });

      it("should filter out history items without URLs", async () => {
        // Arrange
        const request: ServerMessageRequest = {
          cmd: "get-browser-recent-history",
          correlationId: "test-correlation-id",
        };

        const mockHistoryItems = [
          { url: "https://example.com", title: "Example" },
          { title: "No URL" }, // This should be filtered out
        ];
        (browser.history.search as jest.Mock).mockResolvedValue(
          mockHistoryItems
        );

        // Act
        await messageHandler.handleDecodedMessage(request);

        // Assert
        expect(mockClient.sendResourceToServer).toHaveBeenCalledWith({
          resource: "history",
          correlationId: "test-correlation-id",
          historyItems: [{ url: "https://example.com", title: "Example" }],
        });
      });
    });

    describe("get-tab-content command", () => {
      it("should get tab content and send it to the server", async () => {
        // Arrange
        const request: ServerMessageRequest = {
          cmd: "get-tab-content",
          tabId: 123,
          correlationId: "test-correlation-id",
        };

        const mockTab = { id: 123, url: "https://example.com" };
        (browser.tabs.get as jest.Mock).mockResolvedValue(mockTab);

        // Mock the scripting API result with proper structure
        const mockScriptResult = [
          {
            result: {
              links: [{ url: "https://example.com/page", text: "Page" }],
              fullText: "Page content",
              isTruncated: false,
              totalLength: 12,
            }
          },
        ];
        (browser.scripting.executeScript as jest.Mock).mockResolvedValue(
          mockScriptResult
        );

        // Act
        await messageHandler.handleDecodedMessage(request);

        // Assert
        expect(browser.tabs.get).toHaveBeenCalledWith(123);
        expect(browser.scripting.executeScript).toHaveBeenCalled();
        expect(mockClient.sendResourceToServer).toHaveBeenCalledWith({
          resource: "tab-content",
          tabId: 123,
          correlationId: "test-correlation-id",
          content: "Page content",
          links: [{ url: "https://example.com/page", text: "Page" }],
          isTruncated: false,
          totalLength: 12,
        });
      });

      it("should throw an error if tab URL domain is in deny list", async () => {
        // Arrange
        const configWithDenyList: ExtensionConfig = {
          secret: "test-secret",
          toolSettings: {
            "open-browser-tab": true,
            "close-browser-tabs": true,
            "get-list-of-open-tabs": true,
            "get-recent-browser-history": true,
            "get-tab-web-content": true,
            "reorder-browser-tabs": true,
            "find-highlight-in-browser-tab": true,
            "take-screenshot": true,
          },
          domainDenyList: ["example.com"], // Add example.com to deny list
          screenshotConfig: {
            defaultFormat: "png",
            defaultQuality: 90,
            maxWidth: 1920,
            maxHeight: 1080
          }
        };
        (browser.storage.local.get as jest.Mock).mockResolvedValue({
          config: configWithDenyList,
        });

        const request: ServerMessageRequest = {
          cmd: "get-tab-content",
          tabId: 123,
          correlationId: "test-correlation-id",
        };

        const mockTab = { id: 123, url: "https://example.com" };
        (browser.tabs.get as jest.Mock).mockResolvedValue(mockTab);

        // Act & Assert
        await expect(
          messageHandler.handleDecodedMessage(request)
        ).rejects.toThrow(
          "Domain in tab URL 'https://example.com' is in the deny list"
        );
        expect(browser.tabs.executeScript).not.toHaveBeenCalled();
      });
    });

    describe("reorder-tabs command", () => {
      it("should reorder tabs and send confirmation to the server", async () => {
        // Arrange
        const request: ServerMessageRequest = {
          cmd: "reorder-tabs",
          tabOrder: [123, 456, 789],
          correlationId: "test-correlation-id",
        };

        (browser.tabs.move as jest.Mock).mockResolvedValue(undefined);

        // Act
        await messageHandler.handleDecodedMessage(request);

        // Assert
        expect(browser.tabs.move).toHaveBeenCalledTimes(3);
        expect(browser.tabs.move).toHaveBeenNthCalledWith(1, 123, { index: 0 });
        expect(browser.tabs.move).toHaveBeenNthCalledWith(2, 456, { index: 1 });
        expect(browser.tabs.move).toHaveBeenNthCalledWith(3, 789, { index: 2 });
        expect(mockClient.sendResourceToServer).toHaveBeenCalledWith({
          resource: "tabs-reordered",
          correlationId: "test-correlation-id",
          tabOrder: [123, 456, 789],
        });
      });
    });

    describe("find-highlight command", () => {
      it("should find and highlight text in a tab", async () => {
        // Arrange
        const request: ServerMessageRequest = {
          cmd: "find-highlight",
          tabId: 123,
          queryPhrase: "test",
          correlationId: "test-correlation-id",
        };

        const mockFindResults = { count: 5 };
        (browser.find.find as jest.Mock).mockResolvedValue(mockFindResults);
        (browser.tabs.update as jest.Mock).mockResolvedValue(undefined);

        // Act
        await messageHandler.handleDecodedMessage(request);

        // Assert
        expect(browser.find.find).toHaveBeenCalledWith("test", {
          tabId: 123,
          caseSensitive: true,
        });
        expect(browser.tabs.update).toHaveBeenCalledWith(123, { active: true });
        expect(browser.find.highlightResults).toHaveBeenCalledWith({
          tabId: 123,
        });
        expect(mockClient.sendResourceToServer).toHaveBeenCalledWith({
          resource: "find-highlight-result",
          correlationId: "test-correlation-id",
          noOfResults: 5,
        });
      });

      it("should not highlight or activate tab if no results found", async () => {
        // Arrange
        const request: ServerMessageRequest = {
          cmd: "find-highlight",
          tabId: 123,
          queryPhrase: "test",
          correlationId: "test-correlation-id",
        };

        const mockFindResults = { count: 0 };
        (browser.find.find as jest.Mock).mockResolvedValue(mockFindResults);

        // Act
        await messageHandler.handleDecodedMessage(request);

        // Assert
        expect(browser.tabs.update).not.toHaveBeenCalled();
        expect(browser.find.highlightResults).not.toHaveBeenCalled();
        expect(mockClient.sendResourceToServer).toHaveBeenCalledWith({
          resource: "find-highlight-result",
          correlationId: "test-correlation-id",
          noOfResults: 0,
        });
      });
    });

    describe("take-screenshot command", () => {
      beforeEach(() => {
        // Mock browser APIs for screenshot tests
        (browser.tabs.get as jest.Mock).mockResolvedValue({
          id: 123,
          url: "https://example.com",
          status: "complete",
          windowId: 1
        });
        (browser.windows.get as jest.Mock).mockResolvedValue({
          id: 1,
          state: "normal"
        });
        (browser.tabs.captureVisibleTab as jest.Mock).mockResolvedValue(
          "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="
        );
        
        // Mock browser.scripting.executeScript for page dimensions and scrolling
        (browser.scripting.executeScript as jest.Mock).mockImplementation((injection) => {
          const func = injection.func;
          const args = injection.args || [];
          
          if (func && func.toString().includes('fullHeight')) {
            // Mock page dimensions query - return short page that fits in viewport
            return Promise.resolve([{
              result: {
                fullHeight: 800,
                viewportHeight: 800,
                viewportWidth: 1280
              }
            }]);
          } else if (func && func.toString().includes('pageYOffset')) {
            // Mock scroll position query
            return Promise.resolve([{ result: 0 }]);
          } else if (func && func.toString().includes('scrollTo')) {
            // Mock scrollTo operation
            return Promise.resolve([{ result: undefined }]);
          } else if (func && func.toString().includes('img[loading="lazy"]')) {
            // Mock lazy image loading wait
            return Promise.resolve([{ result: Promise.resolve() }]);
          } else if (func && func.toString().includes('screenshots') && func.toString().includes('totalHeight')) {
            // Mock stitching function - return a data URL
            return Promise.resolve([{ result: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAGQAAABkCAYAAABw4pVUAAAABHNCSVQICAgIfAhkiAAAAAlwSFlzAAAAdgAAAHYBTnsmCAAAABl0RVh0U29mdHdhcmUAd3d3Lmlua3NjYXBlLm9yZ5vuPBoAAANCSURBVHic7ZzPaxNBFMafJBpSW1sQD4L05EXwIHjw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EX
          }
          // Default fallback
          return Promise.resolve([{ result: undefined }]);
        });
      });

      it("should capture screenshot successfully with default settings", async () => {
        // Arrange
        const request: ServerMessageRequest = {
          cmd: "take-screenshot",
          tabId: 123,
          correlationId: "test-correlation-id",
        };

        // Act
        await messageHandler.handleDecodedMessage(request);

        // Assert
        expect(browser.tabs.get).toHaveBeenCalledWith(123);
        expect(browser.windows.get).toHaveBeenCalledWith(1);
        expect(browser.tabs.captureVisibleTab).toHaveBeenCalledWith(1, {
          format: "png"
        });
        expect(mockClient.sendResourceToServer).toHaveBeenCalledWith({
          resource: "screenshot",
          correlationId: "test-correlation-id",
          tabId: 123,
          imageData: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
          format: "png",
          timestamp: expect.any(Number),
        });
      });

      it("should capture screenshot with custom format and quality", async () => {
        // Arrange
        const request: ServerMessageRequest = {
          cmd: "take-screenshot",
          tabId: 123,
          format: "jpeg",
          quality: 75,
          correlationId: "test-correlation-id",
        };

        (browser.tabs.captureVisibleTab as jest.Mock).mockResolvedValue(
          "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/2wBDAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAv/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwA/wA=="
        );

        // Act
        await messageHandler.handleDecodedMessage(request);

        // Assert
        expect(browser.tabs.captureVisibleTab).toHaveBeenCalledWith(1, {
          format: "jpeg",
          quality: 75
        });
        expect(mockClient.sendResourceToServer).toHaveBeenCalledWith({
          resource: "screenshot",
          correlationId: "test-correlation-id",
          tabId: 123,
          imageData: "/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/2wBDAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAv/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwA/wA==",
          format: "jpeg",
          timestamp: expect.any(Number),
        });
      });

      it("should throw error for invalid tab ID", async () => {
        // Arrange
        const request: ServerMessageRequest = {
          cmd: "take-screenshot",
          tabId: -1,
          correlationId: "test-correlation-id",
        };

        // Act & Assert
        await expect(
          messageHandler.handleDecodedMessage(request)
        ).rejects.toThrow("Invalid tab ID: -1. Tab ID must be a positive integer.");
        expect(browser.tabs.get).not.toHaveBeenCalled();
      });

      it("should throw error for invalid format", async () => {
        // Arrange
        const request: ServerMessageRequest = {
          cmd: "take-screenshot",
          tabId: 123,
          format: "gif" as any,
          correlationId: "test-correlation-id",
        };

        // Act & Assert
        await expect(
          messageHandler.handleDecodedMessage(request)
        ).rejects.toThrow("Invalid format: gif. Must be 'png' or 'jpeg'.");
        expect(browser.tabs.get).not.toHaveBeenCalled();
      });

      it("should throw error for invalid quality", async () => {
        // Arrange
        const request: ServerMessageRequest = {
          cmd: "take-screenshot",
          tabId: 123,
          quality: 150,
          correlationId: "test-correlation-id",
        };

        // Act & Assert
        await expect(
          messageHandler.handleDecodedMessage(request)
        ).rejects.toThrow("Invalid quality: 150. Quality must be an integer between 0 and 100.");
        expect(browser.tabs.get).not.toHaveBeenCalled();
      });

      it("should throw error when tab does not exist", async () => {
        // Arrange
        const request: ServerMessageRequest = {
          cmd: "take-screenshot",
          tabId: 999,
          correlationId: "test-correlation-id",
        };

        (browser.tabs.get as jest.Mock).mockRejectedValue(new Error("Tab not found"));

        // Act & Assert
        await expect(
          messageHandler.handleDecodedMessage(request)
        ).rejects.toThrow("Tab with ID 999 not found or is not accessible. The tab may have been closed or does not exist.");
      });

      it("should throw error when tab is still loading", async () => {
        // Arrange
        const request: ServerMessageRequest = {
          cmd: "take-screenshot",
          tabId: 123,
          correlationId: "test-correlation-id",
        };

        (browser.tabs.get as jest.Mock).mockResolvedValue({
          id: 123,
          url: "https://example.com",
          status: "loading",
          windowId: 1
        });

        // Act & Assert
        await expect(
          messageHandler.handleDecodedMessage(request)
        ).rejects.toThrow("Tab 123 is still loading. Please wait for the page to finish loading before taking a screenshot.");
      });

      it("should throw error for system pages", async () => {
        // Arrange
        const request: ServerMessageRequest = {
          cmd: "take-screenshot",
          tabId: 123,
          correlationId: "test-correlation-id",
        };

        (browser.tabs.get as jest.Mock).mockResolvedValue({
          id: 123,
          url: "about:blank",
          status: "complete",
          windowId: 1
        });

        // Act & Assert
        await expect(
          messageHandler.handleDecodedMessage(request)
        ).rejects.toThrow("Cannot capture screenshot of system page: about:blank");
      });

      it("should throw error when domain is in deny list", async () => {
        // Arrange
        const configWithDenyList: ExtensionConfig = {
          secret: "test-secret",
          toolSettings: {
            "open-browser-tab": true,
            "close-browser-tabs": true,
            "get-list-of-open-tabs": true,
            "get-recent-browser-history": true,
            "get-tab-web-content": true,
            "reorder-browser-tabs": true,
            "find-highlight-in-browser-tab": true,
            "take-screenshot": true,
          },
          domainDenyList: ["example.com"],
          screenshotConfig: {
            defaultFormat: "png",
            defaultQuality: 90,
            maxWidth: 1920,
            maxHeight: 1080
          }
        };
        (browser.storage.local.get as jest.Mock).mockResolvedValue({
          config: configWithDenyList,
        });

        const request: ServerMessageRequest = {
          cmd: "take-screenshot",
          tabId: 123,
          correlationId: "test-correlation-id",
        };

        // Act & Assert
        await expect(
          messageHandler.handleDecodedMessage(request)
        ).rejects.toThrow("Domain in tab URL 'https://example.com' is in the deny list");
      });

      it("should throw error when window is minimized", async () => {
        // Arrange
        const request: ServerMessageRequest = {
          cmd: "take-screenshot",
          tabId: 123,
          correlationId: "test-correlation-id",
        };

        (browser.windows.get as jest.Mock).mockResolvedValue({
          id: 1,
          state: "minimized"
        });

        // Act & Assert
        await expect(
          messageHandler.handleDecodedMessage(request)
        ).rejects.toThrow("Cannot capture screenshot: window 1 is minimized");
      });

      it("should throw error when capture operation fails", async () => {
        // Arrange
        const request: ServerMessageRequest = {
          cmd: "take-screenshot",
          tabId: 123,
          correlationId: "test-correlation-id",
        };

        (browser.tabs.captureVisibleTab as jest.Mock).mockRejectedValue(
          new Error("Capture failed")
        );

        // Act & Assert
        await expect(
          messageHandler.handleDecodedMessage(request)
        ).rejects.toThrow("Both full page and fallback screenshot capture failed: Capture failed");
      });

      it("should throw error when capture returns invalid data", async () => {
        // Arrange
        const request: ServerMessageRequest = {
          cmd: "take-screenshot",
          tabId: 123,
          correlationId: "test-correlation-id",
        };

        (browser.tabs.captureVisibleTab as jest.Mock).mockResolvedValue("invalid-data");

        // Act & Assert
        await expect(
          messageHandler.handleDecodedMessage(request)
        ).rejects.toThrow("Both full page and fallback screenshot capture failed: Invalid image data received from capture operation");
      });

      it("should throw error when base64 data is too small", async () => {
        // Arrange
        const request: ServerMessageRequest = {
          cmd: "take-screenshot",
          tabId: 123,
          correlationId: "test-correlation-id",
        };

        (browser.tabs.captureVisibleTab as jest.Mock).mockResolvedValue("data:image/png;base64,abc");

        // Act & Assert
        await expect(
          messageHandler.handleDecodedMessage(request)
        ).rejects.toThrow("Captured image data appears to be too small or corrupted");
      });

      it("should handle permission errors gracefully", async () => {
        // Arrange
        const request: ServerMessageRequest = {
          cmd: "take-screenshot",
          tabId: 123,
          correlationId: "test-correlation-id",
        };

        (browser.tabs.captureVisibleTab as jest.Mock).mockRejectedValue(
          new Error("permission denied")
        );

        // Act & Assert
        await expect(
          messageHandler.handleDecodedMessage(request)
        ).rejects.toThrow("Both full page and fallback screenshot capture failed: permission denied");
      });

      it("should respect screenshot configuration from storage", async () => {
        // Arrange
        const configWithCustomScreenshot: ExtensionConfig = {
          secret: "test-secret",
          toolSettings: {
            "open-browser-tab": true,
            "close-browser-tabs": true,
            "get-list-of-open-tabs": true,
            "get-recent-browser-history": true,
            "get-tab-web-content": true,
            "reorder-browser-tabs": true,
            "find-highlight-in-browser-tab": true,
            "take-screenshot": true,
          },
          domainDenyList: [],
          screenshotConfig: {
            defaultFormat: "jpeg",
            defaultQuality: 80,
            maxWidth: 1280,
            maxHeight: 720
          }
        };
        (browser.storage.local.get as jest.Mock).mockResolvedValue({
          config: configWithCustomScreenshot,
        });

        const request: ServerMessageRequest = {
          cmd: "take-screenshot",
          tabId: 123,
          correlationId: "test-correlation-id",
        };

        (browser.tabs.captureVisibleTab as jest.Mock).mockResolvedValue(
          "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/2wBDAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAv/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwA/wA=="
        );

        // Act
        await messageHandler.handleDecodedMessage(request);

        // Assert
        expect(browser.tabs.captureVisibleTab).toHaveBeenCalledWith(1, {
          format: "jpeg",
          quality: 80
        });
        expect(mockClient.sendResourceToServer).toHaveBeenCalledWith({
          resource: "screenshot",
          correlationId: "test-correlation-id",
          tabId: 123,
          imageData: "/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/2wBDAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAv/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwA/wA==",
          format: "jpeg",
          timestamp: expect.any(Number),
        });
      });

      it.skip("should handle content-aware segmentation for full page screenshots", async () => {
        // Arrange
        const request: ServerMessageRequest = {
          cmd: "take-screenshot",
          tabId: 123,
          correlationId: "test-correlation-id",
        };

        // Mock a tall page that requires segmentation
        let callCount = 0;
        (browser.scripting.executeScript as jest.Mock).mockImplementation(({ func }) => {
          callCount++;
          if (func && func.toString().includes('document.documentElement.scrollHeight')) {
            // Mock getPageDimensions - return a tall page
            return Promise.resolve([{ result: { viewportHeight: 800, fullHeight: 2400 } }]);
          } else if (func && func.toString().includes('breakElements')) {
            // Mock getContentAwareSegments - return content boundaries
            return Promise.resolve([{ result: [
              { scrollY: 0, waitTime: 300, overlapHeight: 0 },
              { scrollY: 750, waitTime: 300, overlapHeight: 50 },
              { scrollY: 1550, waitTime: 300, overlapHeight: 50 }
            ]}]);
          } else if (func && func.toString().includes('window.pageYOffset')) {
            // Mock getCurrentScrollPosition
            return Promise.resolve([{ result: 0 }]);
          } else if (func && func.toString().includes('window.scrollTo')) {
            // Mock scrollToPosition
            return Promise.resolve([{ result: undefined }]);
          } else if (func && func.toString().includes('screenshots') && func.toString().includes('totalHeight')) {
            // Mock stitching function - return a data URL
            return Promise.resolve([{ result: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAGQAAABkCAYAAABw4pVUAAAABHNCSVQICAgIfAhkiAAAAAlwSFlzAAAAdgAAAHYBTnsmCAAAABl0RVh0U29mdHdhcmUAd3d3Lmlua3NjYXBlLm9yZ5vuPBoAAANCSURBVHic7ZzPaxNBFMafJBpSW1sQD4L05EXwIHjw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EXw4EX
          }
          return Promise.resolve([{ result: undefined }]);
        });

        // Mock multiple captures for segmentation
        (browser.tabs.captureVisibleTab as jest.Mock)
          .mockResolvedValueOnce("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==")
          .mockResolvedValueOnce("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==")
          .mockResolvedValueOnce("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==");

        // Act
        await messageHandler.handleDecodedMessage(request);

        // Assert - should capture multiple segments
        expect(browser.tabs.captureVisibleTab).toHaveBeenCalledTimes(3); // Three segments
        expect(mockClient.sendResourceToServer).toHaveBeenCalledWith({
          resource: "screenshot",
          correlationId: "test-correlation-id",
          tabId: 123,
          imageData: expect.any(String),
          format: "png",
          timestamp: expect.any(Number),
        });
      });

      it("should apply AI optimization when enabled", async () => {
        // Arrange
        const configWithAI: ExtensionConfig = {
          secret: "test-secret",
          toolSettings: {
            "open-browser-tab": true,
            "close-browser-tabs": true,
            "get-list-of-open-tabs": true,
            "get-recent-browser-history": true,
            "get-tab-web-content": true,
            "reorder-browser-tabs": true,
            "find-highlight-in-browser-tab": true,
            "take-screenshot": true,
          },
          domainDenyList: [],
          screenshotConfig: {
            defaultFormat: "png",
            defaultQuality: 90,
            maxWidth: 1920,
            maxHeight: 1080,
            aiOptimization: {
              enabled: true,
              format: "jpeg",
              quality: 85,
              maxFileSize: 2 * 1024 * 1024,
              compressionLevel: 80
            }
          }
        };
        (browser.storage.local.get as jest.Mock).mockResolvedValue({
          config: configWithAI,
        });

        const request: ServerMessageRequest = {
          cmd: "take-screenshot",
          tabId: 123,
          correlationId: "test-correlation-id",
        };

        // Mock DOM operations for AI optimization
        const mockCanvas = {
          width: 0,
          height: 0,
          getContext: jest.fn().mockReturnValue({
            drawImage: jest.fn()
          }),
          toDataURL: jest.fn().mockReturnValue('data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/2wBDAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAv/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwA/wA==')
        };
        global.document = {
          createElement: jest.fn().mockReturnValue(mockCanvas)
        } as any;
        global.Image = jest.fn().mockImplementation(() => ({
          onload: null,
          onerror: null,
          src: '',
          width: 100,
          height: 100
        }));

        // Act
        await messageHandler.handleDecodedMessage(request);

        // Assert - should use JPEG format due to AI optimization
        expect(mockClient.sendResourceToServer).toHaveBeenCalledWith({
          resource: "screenshot",
          correlationId: "test-correlation-id",
          tabId: 123,
          imageData: expect.any(String),
          format: "jpeg", // AI optimization should convert to JPEG
          timestamp: expect.any(Number),
        });
      }, 10000); // Increase timeout for AI optimization test
    });

    describe("click-at-coordinates command", () => {
      beforeEach(() => {
        // Mock browser APIs for click tests
        (browser.tabs.get as jest.Mock).mockResolvedValue({
          id: 123,
          url: "https://example.com",
          status: "complete",
          windowId: 1
        });
        
        // Mock content script response
        (browser.tabs.sendMessage as jest.Mock).mockResolvedValue({
          success: true,
          data: {
            success: true,
            elementFound: true,
            clickExecuted: true,
            message: "Click executed successfully",
            elementInfo: {
              exists: true,
              visible: true,
              interactable: true,
              boundingRect: {
                x: 90,
                y: 190,
                width: 20,
                height: 20,
                top: 190,
                right: 110,
                bottom: 210,
                left: 90
              }
            }
          }
        });
      });

      it("should successfully click at coordinates with default parameters", async () => {
        // Arrange
        const request: ServerMessageRequest = {
          cmd: "click-at-coordinates",
          tabId: 123,
          x: 100,
          y: 200,
          correlationId: "test-correlation-id",
        };

        const mockScriptResult = [{
          success: true,
          elementFound: true,
          clickExecuted: true,
          message: "Click executed successfully at coordinates (100, 200)",
          elementInfo: {
            exists: true,
            visible: true,
            interactable: true,
            boundingRect: {
              x: 90,
              y: 190,
              width: 20,
              height: 20,
              top: 190,
              right: 110,
              bottom: 210,
              left: 90
            }
          }
        }];

        // Act
        await messageHandler.handleDecodedMessage(request);

        // Assert
        expect(browser.tabs.get).toHaveBeenCalledWith(123);
        expect(browser.tabs.sendMessage).toHaveBeenCalledWith(123, {
          type: "click-at-coordinates",
          correlationId: "test-correlation-id",
          data: {
            x: 100,
            y: 200,
            button: "left",
            clickType: "single",
            modifiers: {}
          }
        });
        expect(mockClient.sendResourceToServer).toHaveBeenCalledWith({
          resource: "click-result",
          correlationId: "test-correlation-id",
          success: true,
          elementFound: true,
          clickExecuted: true,
          message: "Click executed successfully",
          timestamp: expect.any(Number),
          elementInfo: {
            exists: true,
            visible: true,
            interactable: true,
            boundingRect: {
              x: 90,
              y: 190,
              width: 20,
              height: 20,
              top: 190,
              right: 110,
              bottom: 210,
              left: 90
            }
          }
        });
      });

      it("should successfully click at coordinates with right button and double click", async () => {
        // Arrange
        const request: ServerMessageRequest = {
          cmd: "click-at-coordinates",
          tabId: 123,
          x: 150,
          y: 250,
          button: "right",
          clickType: "double",
          correlationId: "test-correlation-id",
        };

        // Mock content script response
        (browser.tabs.sendMessage as jest.Mock).mockResolvedValue({
          success: true,
          data: {
            success: true,
            elementFound: true,
            clickExecuted: true,
            message: "Click executed successfully at coordinates (150, 250)",
            elementInfo: {
              exists: true,
              visible: true,
              interactable: true,
              boundingRect: {
                x: 140,
                y: 240,
                width: 20,
                height: 20,
                top: 240,
                right: 160,
                bottom: 260,
                left: 140
              }
            }
          }
        });

        // Act
        await messageHandler.handleDecodedMessage(request);

        // Assert
        expect(browser.tabs.sendMessage).toHaveBeenCalledWith(123, {
          type: "click-at-coordinates",
          correlationId: "test-correlation-id",
          data: {
            x: 150,
            y: 250,
            button: "right",
            clickType: "double",
            modifiers: {}
          }
        });
        expect(mockClient.sendResourceToServer).toHaveBeenCalledWith({
          resource: "click-result",
          correlationId: "test-correlation-id",
          success: true,
          elementFound: true,
          clickExecuted: true,
          message: "Click executed successfully at coordinates (150, 250)",
          timestamp: expect.any(Number),
          elementInfo: expect.any(Object)
        });
      });

      it("should successfully click at coordinates with modifier keys", async () => {
        // Arrange
        const request: ServerMessageRequest = {
          cmd: "click-at-coordinates",
          tabId: 123,
          x: 100,
          y: 200,
          modifiers: {
            ctrl: true,
            shift: true
          },
          correlationId: "test-correlation-id",
        };

        // Mock content script response
        (browser.tabs.sendMessage as jest.Mock).mockResolvedValue({
          success: true,
          data: {
            success: true,
            elementFound: true,
            clickExecuted: true,
            message: "Click executed successfully at coordinates (100, 200)",
            elementInfo: {
              exists: true,
              visible: true,
              interactable: true,
              boundingRect: {
                x: 90,
                y: 190,
                width: 20,
                height: 20,
                top: 190,
                right: 110,
                bottom: 210,
                left: 90
              }
            }
          }
        });

        // Act
        await messageHandler.handleDecodedMessage(request);

        // Assert
        expect(browser.tabs.sendMessage).toHaveBeenCalledWith(123, {
          type: "click-at-coordinates",
          correlationId: "test-correlation-id",
          data: {
            x: 100,
            y: 200,
            button: "left",
            clickType: "single",
            modifiers: {
              ctrl: true,
              shift: true
            }
          }
        });
      });

      it("should handle case when no element found at coordinates", async () => {
        // Arrange
        const request: ServerMessageRequest = {
          cmd: "click-at-coordinates",
          tabId: 123,
          x: 100,
          y: 200,
          correlationId: "test-correlation-id",
        };

        // Mock content script response for no element found
        (browser.tabs.sendMessage as jest.Mock).mockResolvedValue({
          success: true,
          data: {
            success: false,
            elementFound: false,
            clickExecuted: false,
            message: "No element found at coordinates (100, 200)"
          }
        });

        // Act
        await messageHandler.handleDecodedMessage(request);

        // Assert
        expect(mockClient.sendResourceToServer).toHaveBeenCalledWith({
          resource: "click-result",
          correlationId: "test-correlation-id",
          success: false,
          elementFound: false,
          clickExecuted: false,
          message: "No element found at coordinates (100, 200)",
          timestamp: expect.any(Number),
          elementInfo: undefined
        });
      });

      it("should handle security blocking on sensitive elements", async () => {
        // Arrange
        const request: ServerMessageRequest = {
          cmd: "click-at-coordinates",
          tabId: 123,
          x: 100,
          y: 200,
          correlationId: "test-correlation-id",
        };

        // Mock content script response for security blocking
        (browser.tabs.sendMessage as jest.Mock).mockResolvedValue({
          success: true,
          data: {
            success: false,
            elementFound: true,
            clickExecuted: false,
            message: "Click blocked on sensitive element for security reasons"
          }
        });

        // Act
        await messageHandler.handleDecodedMessage(request);

        // Assert
        expect(mockClient.sendResourceToServer).toHaveBeenCalledWith({
          resource: "click-result",
          correlationId: "test-correlation-id",
          success: false,
          elementFound: true,
          clickExecuted: false,
          message: "Click blocked on sensitive element for security reasons",
          timestamp: expect.any(Number),
          elementInfo: undefined
        });
      });

      it("should handle script execution failure (simulating CSP issues)", async () => {
        // Arrange
        const request: ServerMessageRequest = {
          cmd: "click-at-coordinates",
          tabId: 123,
          x: 100,
          y: 200,
          correlationId: "test-correlation-id",
        };

        // Mock sendMessage failure (content script not responding/loaded)
        (browser.tabs.sendMessage as jest.Mock).mockRejectedValue(
          new Error("Could not establish connection. Receiving end does not exist.")
        );

        // Act
        await messageHandler.handleDecodedMessage(request);

        // Assert
        expect(mockClient.sendResourceToServer).toHaveBeenCalledWith({
          resource: "click-result",
          correlationId: "test-correlation-id",
          success: false,
          elementFound: false,
          clickExecuted: false,
          message: "Click failed: Could not establish connection. Receiving end does not exist.",
          timestamp: expect.any(Number)
        });
      });

      it("should throw error for invalid tab ID", async () => {
        // Arrange
        const request: ServerMessageRequest = {
          cmd: "click-at-coordinates",
          tabId: -1,
          x: 100,
          y: 200,
          correlationId: "test-correlation-id",
        };

        // Act
        await messageHandler.handleDecodedMessage(request);

        // Assert
        expect(browser.tabs.get).not.toHaveBeenCalled();
        expect(browser.tabs.executeScript).not.toHaveBeenCalled();
        expect(mockClient.sendResourceToServer).toHaveBeenCalledWith({
          resource: "click-result",
          correlationId: "test-correlation-id",
          success: false,
          elementFound: false,
          clickExecuted: false,
          message: "Click failed: Invalid tab ID: -1. Tab ID must be a positive integer.",
          timestamp: expect.any(Number)
        });
      });

      it("should throw error for invalid coordinates", async () => {
        // Arrange
        const request: ServerMessageRequest = {
          cmd: "click-at-coordinates",
          tabId: 123,
          x: -10,
          y: 200,
          correlationId: "test-correlation-id",
        };

        // Act
        await messageHandler.handleDecodedMessage(request);

        // Assert
        expect(browser.tabs.get).not.toHaveBeenCalled();
        expect(browser.tabs.executeScript).not.toHaveBeenCalled();
        expect(mockClient.sendResourceToServer).toHaveBeenCalledWith({
          resource: "click-result",
          correlationId: "test-correlation-id",
          success: false,
          elementFound: false,
          clickExecuted: false,
          message: "Click failed: Invalid x coordinate: -10. X coordinate must be a non-negative integer.",
          timestamp: expect.any(Number)
        });
      });

      it("should throw error when tab is not ready", async () => {
        // Arrange
        const request: ServerMessageRequest = {
          cmd: "click-at-coordinates",
          tabId: 123,
          x: 100,
          y: 200,
          correlationId: "test-correlation-id",
        };

        (browser.tabs.get as jest.Mock).mockResolvedValue({
          id: 123,
          url: "https://example.com",
          status: "loading",
          windowId: 1
        });

        // Act
        await messageHandler.handleDecodedMessage(request);

        // Assert
        expect(browser.tabs.executeScript).not.toHaveBeenCalled();
        expect(mockClient.sendResourceToServer).toHaveBeenCalledWith({
          resource: "click-result",
          correlationId: "test-correlation-id",
          success: false,
          elementFound: false,
          clickExecuted: false,
          message: "Click failed: Tab 123 not found or not ready",
          timestamp: expect.any(Number)
        });
      });

      it("should throw error when domain is in deny list", async () => {
        // Arrange
        const configWithDenyList: ExtensionConfig = {
          secret: "test-secret",
          toolSettings: {
            "open-browser-tab": true,
            "close-browser-tabs": true,
            "get-list-of-open-tabs": true,
            "get-recent-browser-history": true,
            "get-tab-web-content": true,
            "reorder-browser-tabs": true,
            "find-highlight-in-browser-tab": true,
            "take-screenshot": true,
          },
          domainDenyList: ["example.com"],
          screenshotConfig: {
            defaultFormat: "png",
            defaultQuality: 90,
            maxWidth: 1920,
            maxHeight: 1080
          }
        };
        (browser.storage.local.get as jest.Mock).mockResolvedValue({
          config: configWithDenyList,
        });

        const request: ServerMessageRequest = {
          cmd: "click-at-coordinates",
          tabId: 123,
          x: 100,
          y: 200,
          correlationId: "test-correlation-id",
        };

        // Act
        await messageHandler.handleDecodedMessage(request);

        // Assert
        expect(browser.tabs.executeScript).not.toHaveBeenCalled();
        expect(mockClient.sendResourceToServer).toHaveBeenCalledWith({
          resource: "click-result",
          correlationId: "test-correlation-id",
          success: false,
          elementFound: false,
          clickExecuted: false,
          message: "Click failed: Domain in tab URL 'https://example.com' is in the deny list",
          timestamp: expect.any(Number)
        });
      });
    });

    describe("click-element command", () => {
      beforeEach(() => {
        // Mock browser APIs for click tests
        (browser.tabs.get as jest.Mock).mockResolvedValue({
          id: 123,
          url: "https://example.com",
          status: "complete",
          windowId: 1
        });
      });

      it("should successfully click element with default parameters", async () => {
        // Arrange
        const request: ServerMessageRequest = {
          cmd: "click-element",
          tabId: 123,
          selector: "#submit-button",
          correlationId: "test-correlation-id",
        };

        // Mock content script response
        (browser.tabs.sendMessage as jest.Mock).mockResolvedValue({
          success: true,
          data: {
            success: true,
            elementFound: true,
            clickExecuted: true,
            message: "Element clicked successfully",
            elementInfo: {
              exists: true,
              visible: true,
              interactable: true,
              boundingRect: {
                x: 100,
                y: 200,
                width: 80,
                height: 30,
                top: 200,
                right: 180,
                bottom: 230,
                left: 100
              }
            }
          }
        });

        // Act
        await messageHandler.handleDecodedMessage(request);

        // Assert
        expect(browser.tabs.get).toHaveBeenCalledWith(123);
        expect(browser.tabs.sendMessage).toHaveBeenCalledWith(123, {
          type: "click-element",
          correlationId: "test-correlation-id",
          data: {
            selector: "#submit-button",
            button: "left",
            clickType: "single",
            modifiers: {},
            scrollIntoView: true,
            waitForElement: 5000
          }
        });
        expect(mockClient.sendResourceToServer).toHaveBeenCalledWith({
          resource: "click-result",
          correlationId: "test-correlation-id",
          success: true,
          elementFound: true,
          clickExecuted: true,
          message: "Element clicked successfully",
          timestamp: expect.any(Number),
          elementInfo: {
            exists: true,
            visible: true,
            interactable: true,
            boundingRect: {
              x: 100,
              y: 200,
              width: 80,
              height: 30,
              top: 200,
              right: 180,
              bottom: 230,
              left: 100
            }
          }
        });
      });

      it("should successfully click element with middle button and custom wait time", async () => {
        // Arrange
        const request: ServerMessageRequest = {
          cmd: "click-element",
          tabId: 123,
          selector: ".action-button",
          button: "middle",
          waitForElement: 10000,
          correlationId: "test-correlation-id",
        };

        // Mock content script response
        (browser.tabs.sendMessage as jest.Mock).mockResolvedValue({
          success: true,
          data: {
            success: true,
            elementFound: true,
            clickExecuted: true,
            message: "Element clicked successfully",
            elementInfo: {
              exists: true,
              visible: true,
              interactable: true,
              boundingRect: {
                x: 50,
                y: 150,
                width: 100,
                height: 40,
                top: 150,
                right: 150,
                bottom: 190,
                left: 50
              }
            }
          }
        });

        // Act
        await messageHandler.handleDecodedMessage(request);

        // Assert
        expect(browser.tabs.sendMessage).toHaveBeenCalledWith(123, {
          type: "click-element",
          correlationId: "test-correlation-id",
          data: {
            selector: ".action-button",
            button: "middle",
            clickType: "single",
            modifiers: {},
            scrollIntoView: true,
            waitForElement: 10000
          }
        });
      });

      it("should successfully click element without scrolling into view", async () => {
        // Arrange
        const request: ServerMessageRequest = {
          cmd: "click-element",
          tabId: 123,
          selector: "button[data-action='save']",
          scrollIntoView: false,
          correlationId: "test-correlation-id",
        };

        // Mock content script response
        (browser.tabs.sendMessage as jest.Mock).mockResolvedValue({
          success: true,
          data: {
            success: true,
            elementFound: true,
            clickExecuted: true,
            message: "Element clicked successfully",
            elementInfo: {
              exists: true,
              visible: true,
              interactable: true,
              boundingRect: {
                x: 200,
                y: 300,
                width: 60,
                height: 25,
                top: 300,
                right: 260,
                bottom: 325,
                left: 200
              }
            }
          }
        });

        // Act
        await messageHandler.handleDecodedMessage(request);

        // Assert
        expect(browser.tabs.sendMessage).toHaveBeenCalledWith(123, {
          type: "click-element",
          correlationId: "test-correlation-id",
          data: {
            selector: "button[data-action='save']",
            button: "left",
            clickType: "single",
            modifiers: {},
            scrollIntoView: false,
            waitForElement: 5000
          }
        });
      });

      it("should successfully click element with all modifier keys", async () => {
        // Arrange
        const request: ServerMessageRequest = {
          cmd: "click-element",
          tabId: 123,
          selector: "a.external-link",
          modifiers: {
            ctrl: true,
            alt: true,
            shift: true,
            meta: true
          },
          correlationId: "test-correlation-id",
        };

        // Mock content script response
        (browser.tabs.sendMessage as jest.Mock).mockResolvedValue({
          success: true,
          data: {
            success: true,
            elementFound: true,
            clickExecuted: true,
            message: "Element clicked successfully",
            elementInfo: {
              exists: true,
              visible: true,
              interactable: true,
              boundingRect: {
                x: 75,
                y: 125,
                width: 150,
                height: 20,
                top: 125,
                right: 225,
                bottom: 145,
                left: 75
              }
            }
          }
        });

        // Act
        await messageHandler.handleDecodedMessage(request);

        // Assert
        expect(browser.tabs.sendMessage).toHaveBeenCalledWith(123, {
          type: "click-element",
          correlationId: "test-correlation-id",
          data: {
            selector: "a.external-link",
            button: "left",
            clickType: "single",
            modifiers: {
              ctrl: true,
              alt: true,
              shift: true,
              meta: true
            },
            scrollIntoView: true,
            waitForElement: 5000
          }
        });
      });

      it("should handle case when element is not found", async () => {
        // Arrange
        const request: ServerMessageRequest = {
          cmd: "click-element",
          tabId: 123,
          selector: "#non-existent-element",
          correlationId: "test-correlation-id",
        };

        // Mock content script response for element not found
        (browser.tabs.sendMessage as jest.Mock).mockResolvedValue({
          success: true,
          data: {
            success: false,
            elementFound: false,
            clickExecuted: false,
            message: "Element not found with selector: #non-existent-element"
          }
        });

        // Act
        await messageHandler.handleDecodedMessage(request);

        // Assert
        expect(mockClient.sendResourceToServer).toHaveBeenCalledWith({
          resource: "click-result",
          correlationId: "test-correlation-id",
          success: false,
          elementFound: false,
          clickExecuted: false,
          message: "Element not found with selector: #non-existent-element",
          timestamp: expect.any(Number),
          elementInfo: undefined
        });
      });

      it("should handle security blocking on sensitive elements", async () => {
        // Arrange
        const request: ServerMessageRequest = {
          cmd: "click-element",
          tabId: 123,
          selector: "input[type='password']",
          correlationId: "test-correlation-id",
        };

        // Mock content script response for security blocking
        (browser.tabs.sendMessage as jest.Mock).mockResolvedValue({
          success: true,
          data: {
            success: false,
            elementFound: true,
            clickExecuted: false,
            message: "Click blocked on sensitive element for security reasons"
          }
        });

        // Act
        await messageHandler.handleDecodedMessage(request);

        // Assert
        expect(mockClient.sendResourceToServer).toHaveBeenCalledWith({
          resource: "click-result",
          correlationId: "test-correlation-id",
          success: false,
          elementFound: true,
          clickExecuted: false,
          message: "Click blocked on sensitive element for security reasons",
          timestamp: expect.any(Number),
          elementInfo: undefined
        });
      });

      it("should handle script execution failure due to CSP", async () => {
        // Arrange
        const request: ServerMessageRequest = {
          cmd: "click-element",
          tabId: 123,
          selector: "#target-element",
          correlationId: "test-correlation-id",
        };

        // Mock sendMessage failure (content script not responding/loaded)
        (browser.tabs.sendMessage as jest.Mock).mockRejectedValue(
          new Error("Could not establish connection. Receiving end does not exist.")
        );

        // Act
        await messageHandler.handleDecodedMessage(request);

        // Assert
        expect(mockClient.sendResourceToServer).toHaveBeenCalledWith({
          resource: "click-result",
          correlationId: "test-correlation-id",
          success: false,
          elementFound: false,
          clickExecuted: false,
          message: "Click failed: Could not establish connection. Receiving end does not exist.",
          timestamp: expect.any(Number)
        });
      });

      it("should throw error for invalid tab ID", async () => {
        // Arrange
        const request: ServerMessageRequest = {
          cmd: "click-element",
          tabId: -1,
          selector: "#button",
          correlationId: "test-correlation-id",
        };

        // Act
        await messageHandler.handleDecodedMessage(request);

        // Assert
        expect(browser.tabs.sendMessage).not.toHaveBeenCalled();
        expect(mockClient.sendResourceToServer).toHaveBeenCalledWith({
          resource: "click-result",
          correlationId: "test-correlation-id",
          success: false,
          elementFound: false,
          clickExecuted: false,
          message: "Click failed: Invalid tab ID: -1. Tab ID must be a positive integer.",
          timestamp: expect.any(Number)
        });
      });

      it("should throw error for empty selector", async () => {
        // Arrange
        const request: ServerMessageRequest = {
          cmd: "click-element",
          tabId: 123,
          selector: "",
          correlationId: "test-correlation-id",
        };

        // Act
        await messageHandler.handleDecodedMessage(request);

        // Assert
        expect(browser.tabs.get).not.toHaveBeenCalled();
        expect(browser.tabs.executeScript).not.toHaveBeenCalled();
        expect(mockClient.sendResourceToServer).toHaveBeenCalledWith({
          resource: "click-result",
          correlationId: "test-correlation-id",
          success: false,
          elementFound: false,
          clickExecuted: false,
          message: "Click failed: Invalid selector: selector must be a non-empty string.",
          timestamp: expect.any(Number)
        });
      });

      it("should throw error for potentially dangerous selector", async () => {
        // Arrange
        const request: ServerMessageRequest = {
          cmd: "click-element",
          tabId: 123,
          selector: "<script>alert('xss')</script>",
          correlationId: "test-correlation-id",
        };

        // Act
        await messageHandler.handleDecodedMessage(request);

        // Assert
        expect(browser.tabs.get).not.toHaveBeenCalled();
        expect(browser.tabs.executeScript).not.toHaveBeenCalled();
        expect(mockClient.sendResourceToServer).toHaveBeenCalledWith({
          resource: "click-result",
          correlationId: "test-correlation-id",
          success: false,
          elementFound: false,
          clickExecuted: false,
          message: "Click failed: Invalid selector: potentially dangerous characters detected.",
          timestamp: expect.any(Number)
        });
      });

      it("should throw error when tab does not exist", async () => {
        // Arrange
        const request: ServerMessageRequest = {
          cmd: "click-element",
          tabId: 999,
          selector: "#button",
          correlationId: "test-correlation-id",
        };

        (browser.tabs.get as jest.Mock).mockRejectedValue(new Error("Tab not found"));

        // Act
        await messageHandler.handleDecodedMessage(request);

        // Assert
        expect(browser.tabs.executeScript).not.toHaveBeenCalled();
        expect(mockClient.sendResourceToServer).toHaveBeenCalledWith({
          resource: "click-result",
          correlationId: "test-correlation-id",
          success: false,
          elementFound: false,
          clickExecuted: false,
          message: "Click failed: Tab not found",
          timestamp: expect.any(Number)
        });
      });

      it("should handle complex selectors with proper escaping", async () => {
        // Arrange
        const request: ServerMessageRequest = {
          cmd: "click-element",
          tabId: 123,
          selector: "div[data-value='test\\'s value']",
          correlationId: "test-correlation-id",
        };

        const mockContentScriptResponse = {
          success: true,
          data: {
            success: true,
            elementFound: true,
            clickExecuted: true,
            message: "Element clicked successfully",
            elementInfo: {
              exists: true,
              visible: true,
              interactable: true,
              boundingRect: {
                x: 10,
                y: 20,
                width: 30,
                height: 40,
                top: 20,
                right: 40,
                bottom: 60,
                left: 10
              }
            }
          }
        };
        (browser.tabs.sendMessage as jest.Mock).mockResolvedValue(mockContentScriptResponse);

        // Act
        await messageHandler.handleDecodedMessage(request);

        // Assert
        expect(browser.tabs.sendMessage).toHaveBeenCalledWith(123, {
          type: "click-element",
          correlationId: "test-correlation-id",
          data: {
            selector: "div[data-value='test\\'s value']",
            button: "left",
            clickType: "single",
            modifiers: {},
            scrollIntoView: true,
            waitForElement: 5000
          }
        });
        expect(mockClient.sendResourceToServer).toHaveBeenCalledWith({
          resource: "click-result",
          correlationId: "test-correlation-id",
          success: true,
          elementFound: true,
          clickExecuted: true,
          message: "Element clicked successfully",
          timestamp: expect.any(Number),
          elementInfo: expect.any(Object)
        });
      });
    });
  });
});
