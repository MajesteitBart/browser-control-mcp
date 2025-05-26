# Browser Control MCP

An MCP server paired with a browser extension that enables AI agents, such as Claude Desktop, to manage the user's local browser, to interact with open tabs and to use the browser for research and information retrieval.

## Features

The MCP server supports the following tools:
- Open or close tabs
- Get the list of opened tabs
- Reorder opened tabs
- Read and search the browser's history
- Read a webpage's text content and links
- Find and highlight text in a browser tab
- **Take screenshots of browser tabs**

In addition, the contents of each opened tab in the browser is available as an MCP resource, allowing the user
to select browser tabs in the MCP client itself (e.g. Claude) and load their content into the context.

## Example use-cases:

### Tab management
- *"Close all non-work related tabs in my browser."*
- *"Rearrange tabs in my browser in an order that makes sense."*
- *"Close all tabs in my browser that haven't been accessed within the past 24 hours"*

### Browser history search
- *"Help me find an article in my browser history about the Milford track in NZ."*
- *"Open all the articles about AI that I visited during the last week, up to 10 articles, avoid duplications."*

### Browsing and research 
- *"Open hackernews in my browser, then open the top story, read it, also read the comments. Do the comments agree with the story?"*
- *"In my browser, use Google Scholar to search for papers about L-theanine in the last 3 years. Open the 3 most cited papers. Read them and summarize them for me."*
- *"Use google search in my browser to look for flower shops. Open the 10 most relevant results. Show me a table of each flower shop with location and opening hours."*

### Screenshot capture
- *"Take a screenshot of the current tab to show me what the page looks like."*
- *"Capture screenshots of all my open tabs so I can see what's on each one."*
- *"Take a high-quality screenshot of this webpage for my presentation."*

## Comparison to web automation MCP servers

The purpose of this MCP server is to provide AI agents with safe access to the user's **personal** browser. It does not support web pages modification or arbitrary scripting. The browser extension can also be configured to limit the actions that the MCP server can perform (in the extension's preferences page).

## Installation

Clone this repository, then run the following commands in the main repository directory to build both the MCP server and the browser extension.
```
npm install
npm install --prefix mcp-server
npm install --prefix firefox-extension
npm run build
```

### Usage with Firefox

The browser-control-mcp extension was developed for Firefox.

To install the extension:

1. Type `about:debugging` in the Firefox URL bar
2. Click on "This Firefox"
3. click on "Load Temporary Add-on..."
4. Select the `manifest.json` file under the `firefox-extension` folder in this project
5. The extension's preferences page will open. Copy the secret key to your clipboard. It will be used to configure the MCP server.

If you prefer not to run the extension on your personal Firefox browser, an alternative is to download a separate Firefox instance (such as Firefox Developer Edition, available at https://www.mozilla.org/en-US/firefox/developer/).


### Usage with Claude Desktop:

After installing the extension, add the following configuration to `claude_desktop_config.json` (use the Edit Config button in Claude Desktop Developer settings):
```
{
    "mcpServers": {
        "browser-control": {
            "command": "node",
            "args": [
                "/path/to/repo/mcp-server/dist/server.js"
            ],
            "env": {
                "EXTENSION_SECRET": "<secret_from_extension>"
            }
        }
    }
}
```
Replace `/path/to/repo` with the correct path.

Set the EXTENSION_SECRET based on the value provided on the extension's preferences in the extension management page in Firefox (you can access it from `about:addons`).

Make sure to restart Claude Desktop. It might take a few seconds for the MCP server to connect to the extension.

## Screenshot Functionality

The Browser Control MCP now supports taking screenshots of browser tabs, enabling AI agents to visually inspect web pages for testing, documentation, or analysis purposes.

### Screenshot Tool

The `take-screenshot` tool captures the visible content of a browser tab and returns it as base64-encoded image data.

**Parameters:**
- `tabId` (required): The ID of the tab to capture
- `format` (optional): Image format - "png" (default) or "jpeg"
- `quality` (optional): JPEG quality from 0-100 (only applies to JPEG format)

**Example usage:**
```
Take a screenshot of tab 123 in PNG format
Take a screenshot of tab 456 in JPEG format with 80% quality
```

### Screenshot Configuration

You can configure default screenshot settings in the Firefox extension's options page:

1. Open Firefox and go to `about:addons`
2. Find "Browser Control MCP" and click "Options"
3. Expand the "Screenshot Settings" section
4. Configure:
   - **Default Format**: PNG (lossless) or JPEG (compressed)
   - **JPEG Quality**: 0-100 (higher = better quality, larger file size)
   - **Max Width/Height**: Maximum dimensions for captured screenshots

### Security and Permissions

Screenshot functionality includes several security measures:

- **Domain Filtering**: Screenshots are blocked for domains in your deny list
- **System Page Protection**: Cannot capture system pages (about:, chrome:, moz-extension:)
- **Tab State Validation**: Only captures tabs that are fully loaded
- **Window State Checks**: Cannot capture minimized windows
- **Permission Validation**: Requires appropriate browser permissions

### Error Handling

The screenshot tool provides detailed error messages for various failure scenarios:
- Invalid tab IDs or non-existent tabs
- Tabs that are still loading
- Permission denied errors
- System or restricted pages
- Network timeouts
- Invalid image data

### Technical Details

- Screenshots capture the visible area of the tab (viewport)
- Images are returned as base64-encoded data URLs
- PNG format provides lossless compression
- JPEG format allows quality adjustment for smaller file sizes
- Capture operations have a 10-second timeout for reliability

