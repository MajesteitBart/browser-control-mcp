"use strict";
(() => {
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
  async function getSecret() {
    const config = await getConfig();
    return config.secret;
  }
  async function setToolEnabled(toolId, enabled) {
    const config = await getConfig();
    if (!config.toolSettings) {
      config.toolSettings = getDefaultToolSettings();
    }
    config.toolSettings[toolId] = enabled;
    await saveConfig(config);
  }
  async function getAllToolSettings() {
    const config = await getConfig();
    return config.toolSettings || getDefaultToolSettings();
  }
  async function getDomainDenyList() {
    const config = await getConfig();
    return config.domainDenyList || [];
  }
  async function setDomainDenyList(domains) {
    const config = await getConfig();
    config.domainDenyList = domains;
    await saveConfig(config);
  }
  async function getScreenshotConfig() {
    const config = await getConfig();
    return config.screenshotConfig || getDefaultScreenshotConfig();
  }
  async function setScreenshotConfig(screenshotConfig) {
    const config = await getConfig();
    config.screenshotConfig = screenshotConfig;
    await saveConfig(config);
  }

  // options.ts
  var secretDisplay = document.getElementById(
    "secret-display"
  );
  var copyButton = document.getElementById("copy-button");
  var statusElement = document.getElementById("status");
  var toolSettingsContainer = document.getElementById(
    "tool-settings-container"
  );
  var domainDenyListTextarea = document.getElementById(
    "domain-deny-list"
  );
  var saveDomainListsButton = document.getElementById(
    "save-domain-lists"
  );
  var domainStatusElement = document.getElementById(
    "domain-status"
  );
  var screenshotFormatSelect = document.getElementById(
    "screenshot-format"
  );
  var screenshotQualityRange = document.getElementById(
    "screenshot-quality"
  );
  var qualityValueSpan = document.getElementById(
    "quality-value"
  );
  var screenshotMaxWidthInput = document.getElementById(
    "screenshot-max-width"
  );
  var screenshotMaxHeightInput = document.getElementById(
    "screenshot-max-height"
  );
  var saveScreenshotSettingsButton = document.getElementById(
    "save-screenshot-settings"
  );
  var screenshotStatusElement = document.getElementById(
    "screenshot-status"
  );
  async function loadSecret() {
    try {
      const secret = await getSecret();
      if (secret) {
        secretDisplay.textContent = secret;
      } else {
        secretDisplay.textContent = "No secret found. Please reinstall the extension.";
        secretDisplay.style.color = "red";
        copyButton.disabled = true;
      }
    } catch (error) {
      console.error("Error loading secret:", error);
      secretDisplay.textContent = "Error loading secret. Please check console for details.";
      secretDisplay.style.color = "red";
      copyButton.disabled = true;
    }
  }
  async function copyToClipboard(event) {
    if (!event.isTrusted) {
      return;
    }
    try {
      const secret = secretDisplay.textContent;
      if (!secret || secret === "Loading..." || secret.includes("No secret found") || secret.includes("Error loading")) {
        return;
      }
      await navigator.clipboard.writeText(secret);
      statusElement.textContent = "Secret copied to clipboard!";
      setTimeout(() => {
        statusElement.textContent = "";
      }, 3e3);
    } catch (error) {
      console.error("Error copying to clipboard:", error);
      statusElement.textContent = "Failed to copy to clipboard";
      statusElement.style.color = "red";
      setTimeout(() => {
        statusElement.textContent = "";
        statusElement.style.color = "";
      }, 3e3);
    }
  }
  async function createToolSettingsUI() {
    const toolSettings = await getAllToolSettings();
    toolSettingsContainer.innerHTML = "";
    AVAILABLE_TOOLS.forEach((tool) => {
      const isEnabled = toolSettings[tool.id] !== false;
      const toolRow = document.createElement("div");
      toolRow.className = "tool-row";
      const labelContainer = document.createElement("div");
      labelContainer.className = "tool-label-container";
      const toolName = document.createElement("div");
      toolName.className = "tool-name";
      toolName.textContent = tool.name;
      const toolDescription = document.createElement("div");
      toolDescription.className = "tool-description";
      toolDescription.textContent = tool.description;
      labelContainer.appendChild(toolName);
      labelContainer.appendChild(toolDescription);
      const toggleContainer = document.createElement("label");
      toggleContainer.className = "toggle-switch";
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = isEnabled;
      checkbox.dataset.toolId = tool.id;
      checkbox.addEventListener("change", handleToolToggle);
      const slider = document.createElement("span");
      slider.className = "slider";
      toggleContainer.appendChild(checkbox);
      toggleContainer.appendChild(slider);
      toolRow.appendChild(labelContainer);
      toolRow.appendChild(toggleContainer);
      toolSettingsContainer.appendChild(toolRow);
    });
  }
  async function handleToolToggle(event) {
    const checkbox = event.target;
    const toolId = checkbox.dataset.toolId;
    const isEnabled = checkbox.checked;
    if (!toolId) {
      console.error("Tool ID not found");
      return;
    }
    try {
      await setToolEnabled(toolId, isEnabled);
    } catch (error) {
      console.error("Error saving tool setting:", error);
      checkbox.checked = !isEnabled;
    }
  }
  async function loadDomainLists() {
    try {
      const denyList = await getDomainDenyList();
      domainDenyListTextarea.value = denyList.join("\n");
    } catch (error) {
      console.error("Error loading domain lists:", error);
      domainStatusElement.textContent = "Error loading domain lists. Please check console for details.";
      domainStatusElement.style.color = "red";
      setTimeout(() => {
        domainStatusElement.textContent = "";
        domainStatusElement.style.color = "";
      }, 3e3);
    }
  }
  async function saveDomainLists(event) {
    if (!event.isTrusted) {
      return;
    }
    try {
      const denyListText = domainDenyListTextarea.value.trim();
      const denyList = denyListText ? denyListText.split("\n").map((domain) => domain.trim()).filter(Boolean) : [];
      await setDomainDenyList(denyList);
      domainStatusElement.textContent = "Domain deny list saved successfully!";
      domainStatusElement.style.color = "#4caf50";
      setTimeout(() => {
        domainStatusElement.textContent = "";
        domainStatusElement.style.color = "";
      }, 3e3);
    } catch (error) {
      console.error("Error saving domain lists:", error);
      domainStatusElement.textContent = "Failed to save domain lists";
      domainStatusElement.style.color = "red";
      setTimeout(() => {
        domainStatusElement.textContent = "";
        domainStatusElement.style.color = "";
      }, 3e3);
    }
  }
  async function loadScreenshotConfig() {
    try {
      const config = await getScreenshotConfig();
      screenshotFormatSelect.value = config.defaultFormat;
      screenshotQualityRange.value = config.defaultQuality.toString();
      qualityValueSpan.textContent = config.defaultQuality.toString();
      screenshotMaxWidthInput.value = config.maxWidth?.toString() || "1920";
      screenshotMaxHeightInput.value = config.maxHeight?.toString() || "1080";
    } catch (error) {
      console.error("Error loading screenshot config:", error);
      screenshotStatusElement.textContent = "Error loading screenshot settings. Please check console for details.";
      screenshotStatusElement.style.color = "red";
      setTimeout(() => {
        screenshotStatusElement.textContent = "";
        screenshotStatusElement.style.color = "";
      }, 3e3);
    }
  }
  async function saveScreenshotConfig(event) {
    if (!event.isTrusted) {
      return;
    }
    try {
      const config = {
        defaultFormat: screenshotFormatSelect.value,
        defaultQuality: parseInt(screenshotQualityRange.value),
        maxWidth: parseInt(screenshotMaxWidthInput.value),
        maxHeight: parseInt(screenshotMaxHeightInput.value)
      };
      if (config.defaultQuality < 0 || config.defaultQuality > 100) {
        throw new Error("Quality must be between 0 and 100");
      }
      if (config.maxWidth < 100 || config.maxWidth > 4096) {
        throw new Error("Max width must be between 100 and 4096");
      }
      if (config.maxHeight < 100 || config.maxHeight > 4096) {
        throw new Error("Max height must be between 100 and 4096");
      }
      await setScreenshotConfig(config);
      screenshotStatusElement.textContent = "Screenshot settings saved successfully!";
      screenshotStatusElement.style.color = "#4caf50";
      setTimeout(() => {
        screenshotStatusElement.textContent = "";
        screenshotStatusElement.style.color = "";
      }, 3e3);
    } catch (error) {
      console.error("Error saving screenshot config:", error);
      screenshotStatusElement.textContent = `Failed to save screenshot settings: ${error instanceof Error ? error.message : "Unknown error"}`;
      screenshotStatusElement.style.color = "red";
      setTimeout(() => {
        screenshotStatusElement.textContent = "";
        screenshotStatusElement.style.color = "";
      }, 3e3);
    }
  }
  function updateQualityDisplay() {
    qualityValueSpan.textContent = screenshotQualityRange.value;
  }
  function initializeCollapsibleSections() {
    const sectionHeaders = document.querySelectorAll(".section-container > h2");
    sectionHeaders.forEach((header) => {
      header.addEventListener("click", (event) => {
        event.preventDefault();
        header.classList.toggle("collapsed");
        const sectionContent = header.nextElementSibling;
        sectionContent.classList.toggle("collapsed");
      });
    });
  }
  copyButton.addEventListener("click", copyToClipboard);
  saveDomainListsButton.addEventListener("click", saveDomainLists);
  saveScreenshotSettingsButton.addEventListener("click", saveScreenshotConfig);
  screenshotQualityRange.addEventListener("input", updateQualityDisplay);
  document.addEventListener("DOMContentLoaded", () => {
    loadSecret();
    createToolSettingsUI();
    loadDomainLists();
    loadScreenshotConfig();
    initializeCollapsibleSections();
  });
})();
