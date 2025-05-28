# Browser Control MCP

An MCP server paired with a browser extension that enables AI agents (like Claude Desktop) to manage the user's local browser. It allows interaction with open tabs and using the browser for research and information retrieval.

## Features

The MCP server supports the following tools:

**Tab Management:**
- `open-browser-tab`: Open a new tab.
- `close-browser-tabs`: Close specified tabs by their IDs.
- `get-list-of-open-tabs`: List all open tabs.
- `reorder-browser-tabs`: Change the order of open tabs.

**Content Retrieval & History:**
- `get-recent-browser-history`: Get browser history (optionally filtered by `searchQuery`).
- `get-tab-web-content`: Get a webpage's full text content and links by tab ID. Use `offset` for large documents if the initial call was truncated.
- `find-highlight-in-browser-tab`: Find and highlight text in a tab using a query phrase.

**Page Interaction:**
- `scroll-to-position`: Scroll to absolute coordinates (X, Y) in a tab.
- `scroll-by-offset`: Scroll by a relative offset (delta X, delta Y) in a tab.
- `scroll-to-element`: Scroll to bring an element into view using a CSS selector.
- `click-at-coordinates`: Click at specific X, Y coordinates in a tab.
- `click-element`: Click an element using a CSS selector.
- `hover-element`: Hover over an element (CSS selector) to trigger mouseover events.
- `type-text`: Type text into the currently focused element or a specified element (CSS selector).
- `send-special-keys`: Send special keys (e.g., Enter, Tab, Escape) to the focused element.
- `clear-input-field`: Clear text from an input field (CSS selector).

**Synchronization:**
- `wait-for-time`: Pause execution for a specified duration.
- `wait-for-element`: Wait for an element to appear in the DOM (CSS selector).
- `wait-for-element-visibility`: Wait for an element to become visible using IntersectionObserver (CSS selector).

**Screenshots:**
- `take-screenshot`: Capture the visible content of a browser tab.
    - **Parameters:**
        - `tabId` (required): The ID of the tab to capture.
        - `format` (optional): Image format - "png" (default) or "jpeg".
        - `quality` (optional): JPEG quality (0-100, default 80-90 based on extension settings, applies only to JPEG).
    - Returns base64-encoded image data.
    - Screenshot settings (default format, quality, max dimensions) can be configured in the Firefox extension's options.
    - Includes security measures like domain filtering and protection against capturing system pages.

In addition, the contents of each opened tab are available as an MCP resource, allowing the user to select browser tabs in the MCP client (e.g., Claude) and load their content into the context.

## Example Use-Cases:

### Tab Management
- *"Close all non-work related tabs."*
- *"Rearrange my browser tabs in a logical order."*
- *"Close tabs not accessed in the last 24 hours."*

### Browser History Search
- *"Find an article in my history about the Milford track in NZ."*
- *"Open up to 10 unique AI articles I visited last week."*

### Browsing, Research & Interaction
- *"Open Hacker News, navigate to the top story, read it and its comments. Do comments agree with the story?"*
- *"Use Google Scholar to find papers on L-theanine from the last 3 years. Open the 3 most cited, read, and summarize them."*
- *"Search Google for flower shops. Open the top 10 results and create a table with their location and opening hours."*
- *"On the current page, scroll down to the 'Pricing' section."*
- *"Click the 'Next' button on this article."*
- *"Type 'benefits of meditation' into the search bar on this page and press Enter."*

### Screenshot Capture
- *"Take a screenshot of the current tab."*
- *"Capture screenshots of all my open tabs."*
- *"Take a high-quality PNG screenshot of this webpage for my presentation."*

## Comparison to Web Automation MCP Servers

This MCP server is designed to provide AI agents with safe access to the user's **personal** browser. While it supports page interactions like clicking and typing, it is not intended for full-scale web automation or arbitrary scripting. The browser extension can be configured (in its preferences page) to limit the actions the MCP server can perform.

## Installation

Clone this repository, then run the following commands in the main repository directory to build both the MCP server and the browser extension:
```bash
npm install
npm install --prefix mcp-server
npm install --prefix firefox-extension
npm run build
```

### Usage with Firefox

The browser-control-mcp extension was developed for Firefox.

To install the extension:
1.  Type `about:debugging` in the Firefox URL bar.
2.  Click on "This Firefox".
3.  Click on "Load Temporary Add-on...".
4.  Select the `manifest.json` file under the `firefox-extension` folder in this project.
5.  The extension's preferences page will open. Copy the secret key to your clipboard. It will be used to configure the MCP server. (You can also access preferences later via `about:addons`).

If you prefer not to run the extension on your personal Firefox browser, consider using a separate Firefox instance (e.g., Firefox Developer Edition: https://www.mozilla.org/en-US/firefox/developer/).

### Usage with Claude Desktop:

After installing the extension, add the following to `claude_desktop_config.json` (use the Edit Config button in Claude Desktop Developer settings):

```json
{
    "mcpServers": {
        "browser-control": {
            "command": "node",
            "args": [
                "/path/to/repo/mcp-server/dist/server.js"
            ],
            "env": {
                "EXTENSION_SECRET": "<secret_from_extension_preferences>",
                "SCREENSHOT_DIR": "/path/to/screenshot_folder"
            }
        }
    }
}
```

Replace `/path/to/repo` and `/path/to/screenshot_folder` with the correct paths.
Set `EXTENSION_SECRET` using the value from the extension's preferences page.
Restart Claude Desktop. The MCP server may take a few seconds to connect to the extension.

### Usage with RooCode:

After installing the extension, add the following configuration to your RooCode project's `mcp.json`:

```json
{
    "mcpServers": {
        "browser-control": {
            "command": "node",
            "args": [
                "D:\\path\\to\\repo\\mcp-server\\dist\\server.js"
            ],
            "env": {
                "EXTENSION_SECRET": "<secret_from_extension_preferences>",
                "SCREENSHOT_DIR": "D:\\path\\to\\screenshot_folder"
            },
            "alwaysAllow": [
                "open-browser-tab",
                "close-browser-tabs",
                "get-recent-browser-history",
                "reorder-browser-tabs",
                "find-highlight-in-browser-tab",
                "get-tab-web-content",
                "take-screenshot",
                "open-tab-contents",
                "get-list-of-open-tabs",
                "scroll-to-position",
                "scroll-by-offset",
                "scroll-to-element",
                "click-at-coordinates",
                "click-element",
                "hover-element",
                "type-text",
                "send-special-keys",
                "clear-input-field",
                "wait-for-time",
                "wait-for-element",
                "wait-for-element-visibility"
            ],
            "disabled": false
        }
    }
}
```