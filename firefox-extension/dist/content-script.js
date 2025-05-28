"use strict";
(() => {
  // content-script.ts
  var ContentScriptHandler = class {
    constructor() {
      this.setupMessageListener();
    }
    setupMessageListener() {
      browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
        this.handleMessage(message).then((result) => sendResponse({ success: true, data: result })).catch((error) => sendResponse({ success: false, error: error.message }));
        return true;
      });
    }
    async handleMessage(message) {
      switch (message.type) {
        case "click-at-coordinates":
          return this.clickAtCoordinates(message.data);
        case "click-element":
          return this.clickElement(message.data);
        case "hover-element":
          return this.hoverElement(message.data);
        case "type-text":
          return this.typeText(message.data);
        case "send-special-keys":
          return this.sendSpecialKeys(message.data);
        case "clear-input-field":
          return this.clearInputField(message.data);
        case "wait-for-element":
          return this.waitForElement(message.data);
        case "wait-for-element-visibility":
          return this.waitForElementVisibility(message.data);
        case "scroll-to-position":
          return this.scrollToPosition(message.data);
        case "scroll-by-offset":
          return this.scrollByOffset(message.data);
        case "scroll-to-element":
          return this.scrollToElement(message.data);
        default:
          throw new Error(`Unknown message type: ${message.type}`);
      }
    }
    async clickAtCoordinates(data) {
      try {
        const { x, y, button, clickType, modifiers } = data;
        const elementAtPoint = document.elementFromPoint(x, y);
        if (!elementAtPoint) {
          return {
            success: false,
            elementFound: false,
            clickExecuted: false,
            message: `No element found at coordinates (${x}, ${y})`
          };
        }
        const tagName = elementAtPoint.tagName.toLowerCase();
        const inputType = elementAtPoint.type?.toLowerCase();
        if (tagName === "input" && (inputType === "password" || inputType === "file") || tagName === "script" || tagName === "iframe") {
          return {
            success: false,
            elementFound: true,
            clickExecuted: false,
            message: "Click blocked on sensitive element for security reasons"
          };
        }
        this.executeClick(elementAtPoint, x, y, button, clickType, modifiers);
        const rect = elementAtPoint.getBoundingClientRect();
        const style = window.getComputedStyle(elementAtPoint);
        const isVisible = style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
        return {
          success: true,
          elementFound: true,
          clickExecuted: true,
          message: `Click executed successfully at coordinates (${x}, ${y})`,
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
    }
    async clickElement(data) {
      try {
        const { selector, button, clickType, waitForElement, scrollIntoView, modifiers } = data;
        const element = await this.waitForElementInternal(selector, waitForElement);
        if (!element) {
          return {
            success: false,
            elementFound: false,
            clickExecuted: false,
            message: `Element not found with selector: ${selector}`
          };
        }
        const tagName = element.tagName.toLowerCase();
        const inputType = element.type?.toLowerCase();
        if (tagName === "input" && (inputType === "password" || inputType === "file") || tagName === "script" || tagName === "iframe") {
          return {
            success: false,
            elementFound: true,
            clickExecuted: false,
            message: "Click blocked on sensitive element for security reasons"
          };
        }
        if (scrollIntoView) {
          element.scrollIntoView({
            behavior: "smooth",
            block: "center",
            inline: "nearest"
          });
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
        const rect = element.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        this.executeClick(element, centerX, centerY, button, clickType, modifiers);
        const style = window.getComputedStyle(element);
        const isVisible = style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
        return {
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
        };
      } catch (error) {
        return {
          success: false,
          elementFound: false,
          clickExecuted: false,
          message: "Click failed: " + error.message
        };
      }
    }
    executeClick(element, x, y, button, clickType, modifiers) {
      const buttonCode = {
        "left": 0,
        "middle": 1,
        "right": 2
      }[button];
      const modifierKeys = {
        ctrlKey: modifiers.ctrl || false,
        altKey: modifiers.alt || false,
        shiftKey: modifiers.shift || false,
        metaKey: modifiers.meta || false
      };
      if (button === "left" && clickType === "single") {
        if (typeof element.click === "function") {
          try {
            element.click();
          } catch (e) {
          }
        }
      }
      if (clickType === "double") {
        const clickEvent = new MouseEvent("click", {
          bubbles: true,
          cancelable: true,
          view: window,
          button: buttonCode,
          buttons: 1 << buttonCode,
          clientX: x,
          clientY: y,
          ...modifierKeys
        });
        element.dispatchEvent(clickEvent);
        const dblClickEvent = new MouseEvent("dblclick", {
          bubbles: true,
          cancelable: true,
          view: window,
          button: buttonCode,
          buttons: 1 << buttonCode,
          detail: 2,
          clientX: x,
          clientY: y,
          ...modifierKeys
        });
        element.dispatchEvent(dblClickEvent);
      } else if (button === "right") {
        const contextMenuEvent = new MouseEvent("contextmenu", {
          bubbles: true,
          cancelable: true,
          view: window,
          button: buttonCode,
          buttons: 1 << buttonCode,
          clientX: x,
          clientY: y,
          ...modifierKeys
        });
        element.dispatchEvent(contextMenuEvent);
      } else {
        const clickEvent = new MouseEvent("click", {
          bubbles: true,
          cancelable: true,
          view: window,
          button: buttonCode,
          buttons: 1 << buttonCode,
          clientX: x,
          clientY: y,
          ...modifierKeys
        });
        element.dispatchEvent(clickEvent);
      }
    }
    async hoverElement(data) {
      try {
        const { selector, x, y, waitForElement } = data;
        let element = null;
        let targetX, targetY;
        if (selector) {
          element = await this.waitForElementInternal(selector, waitForElement);
          if (!element) {
            return {
              success: false,
              elementFound: false,
              message: `Element not found with selector: ${selector}`
            };
          }
          const rect = element.getBoundingClientRect();
          targetX = rect.left + rect.width / 2;
          targetY = rect.top + rect.height / 2;
        } else if (x !== void 0 && y !== void 0) {
          targetX = x;
          targetY = y;
          element = document.elementFromPoint(x, y);
          if (!element) {
            return {
              success: false,
              elementFound: false,
              message: `No element found at coordinates (${x}, ${y})`
            };
          }
        } else {
          throw new Error("Either selector or coordinates must be provided");
        }
        const mouseOverEvent = new MouseEvent("mouseover", {
          bubbles: true,
          cancelable: true,
          view: window,
          clientX: targetX,
          clientY: targetY
        });
        element.dispatchEvent(mouseOverEvent);
        const mouseEnterEvent = new MouseEvent("mouseenter", {
          bubbles: false,
          cancelable: false,
          view: window,
          clientX: targetX,
          clientY: targetY
        });
        element.dispatchEvent(mouseEnterEvent);
        return {
          success: true,
          elementFound: true,
          message: "Hover executed successfully"
        };
      } catch (error) {
        return {
          success: false,
          elementFound: false,
          message: "Hover failed: " + error.message
        };
      }
    }
    async typeText(data) {
      try {
        const { text, selector, clearFirst, typeDelay, waitForElement } = data;
        let element = null;
        if (selector) {
          element = await this.waitForElementInternal(selector, waitForElement);
          if (!element) {
            return {
              success: false,
              elementFound: false,
              message: `Element not found with selector: ${selector}`
            };
          }
        } else {
          element = document.activeElement;
          if (!element) {
            return {
              success: false,
              elementFound: false,
              message: "No active element found for typing"
            };
          }
        }
        if (typeof element.focus === "function") {
          element.focus();
        }
        if (clearFirst && element.value !== void 0) {
          element.value = "";
          element.dispatchEvent(new Event("input", { bubbles: true }));
        }
        for (let i = 0; i < text.length; i++) {
          const char = text[i];
          const keydownEvent = new KeyboardEvent("keydown", {
            key: char,
            code: `Key${char.toUpperCase()}`,
            bubbles: true,
            cancelable: true
          });
          element.dispatchEvent(keydownEvent);
          const keypressEvent = new KeyboardEvent("keypress", {
            key: char,
            code: `Key${char.toUpperCase()}`,
            bubbles: true,
            cancelable: true
          });
          element.dispatchEvent(keypressEvent);
          if (element.value !== void 0) {
            element.value += char;
          }
          const inputEvent = new Event("input", { bubbles: true });
          element.dispatchEvent(inputEvent);
          const keyupEvent = new KeyboardEvent("keyup", {
            key: char,
            code: `Key${char.toUpperCase()}`,
            bubbles: true,
            cancelable: true
          });
          element.dispatchEvent(keyupEvent);
          if (typeDelay > 0) {
            await new Promise((resolve) => setTimeout(resolve, typeDelay));
          }
        }
        return {
          success: true,
          elementFound: true,
          message: "Text typed successfully"
        };
      } catch (error) {
        return {
          success: false,
          elementFound: false,
          message: "Type text failed: " + error.message
        };
      }
    }
    async sendSpecialKeys(data) {
      try {
        const { keys, selector, modifiers } = data;
        let element = null;
        if (selector) {
          element = document.querySelector(selector);
          if (!element) {
            return {
              success: false,
              elementFound: false,
              message: `Element not found with selector: ${selector}`
            };
          }
        } else {
          element = document.activeElement;
          if (!element) {
            return {
              success: false,
              elementFound: false,
              message: "No active element found for key input"
            };
          }
        }
        if (typeof element.focus === "function") {
          element.focus();
        }
        for (const key of keys) {
          const keydownEvent = new KeyboardEvent("keydown", {
            key,
            code: this.getKeyCode(key),
            bubbles: true,
            cancelable: true,
            ctrlKey: modifiers.ctrl || false,
            altKey: modifiers.alt || false,
            shiftKey: modifiers.shift || false,
            metaKey: modifiers.meta || false
          });
          element.dispatchEvent(keydownEvent);
          const keyupEvent = new KeyboardEvent("keyup", {
            key,
            code: this.getKeyCode(key),
            bubbles: true,
            cancelable: true,
            ctrlKey: modifiers.ctrl || false,
            altKey: modifiers.alt || false,
            shiftKey: modifiers.shift || false,
            metaKey: modifiers.meta || false
          });
          element.dispatchEvent(keyupEvent);
        }
        return {
          success: true,
          elementFound: true,
          message: "Special keys sent successfully"
        };
      } catch (error) {
        return {
          success: false,
          elementFound: false,
          message: "Send special keys failed: " + error.message
        };
      }
    }
    async clearInputField(data) {
      try {
        const { selector, waitForElement } = data;
        const element = await this.waitForElementInternal(selector, waitForElement);
        if (!element) {
          return {
            success: false,
            elementFound: false,
            message: `Element not found with selector: ${selector}`
          };
        }
        if (typeof element.focus === "function") {
          element.focus();
        }
        if (element.value !== void 0) {
          element.value = "";
          element.dispatchEvent(new Event("input", { bubbles: true }));
          element.dispatchEvent(new Event("change", { bubbles: true }));
        }
        return {
          success: true,
          elementFound: true,
          message: "Input field cleared successfully"
        };
      } catch (error) {
        return {
          success: false,
          elementFound: false,
          message: "Clear input field failed: " + error.message
        };
      }
    }
    async waitForElement(data) {
      try {
        const { selector, timeout, pollInterval, visible } = data;
        const element = await this.waitForElementInternal(selector, timeout, pollInterval, visible);
        if (!element) {
          return {
            success: false,
            elementFound: false,
            message: `Element not found with selector: ${selector} within ${timeout}ms`
          };
        }
        const rect = element.getBoundingClientRect();
        const style = window.getComputedStyle(element);
        const isVisible = style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
        return {
          success: true,
          elementFound: true,
          visible: isVisible,
          message: "Element found successfully",
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
        };
      } catch (error) {
        return {
          success: false,
          elementFound: false,
          message: "Wait for element failed: " + error.message
        };
      }
    }
    async waitForElementVisibility(data) {
      try {
        const { selector, timeout, threshold } = data;
        const startTime = Date.now();
        while (Date.now() - startTime < timeout) {
          const element = document.querySelector(selector);
          if (element) {
            const rect = element.getBoundingClientRect();
            const visibleArea = rect.width * rect.height;
            const totalArea = element.offsetWidth * element.offsetHeight;
            const visibilityRatio = totalArea > 0 ? visibleArea / totalArea : 0;
            if (visibilityRatio >= threshold / 100) {
              return {
                success: true,
                elementFound: true,
                visible: true,
                visibilityRatio: visibilityRatio * 100,
                message: "Element is sufficiently visible"
              };
            }
          }
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
        return {
          success: false,
          elementFound: false,
          visible: false,
          message: `Element visibility threshold not met within ${timeout}ms`
        };
      } catch (error) {
        return {
          success: false,
          elementFound: false,
          message: "Wait for element visibility failed: " + error.message
        };
      }
    }
    async scrollToPosition(data) {
      try {
        const { x, y, behavior } = data;
        window.scrollTo({
          left: x || 0,
          top: y,
          behavior: behavior || "auto"
        });
        return {
          success: true,
          message: `Scrolled to position (${x || 0}, ${y})`
        };
      } catch (error) {
        return {
          success: false,
          message: "Scroll to position failed: " + error.message
        };
      }
    }
    async scrollByOffset(data) {
      try {
        const { deltaX, deltaY, behavior } = data;
        window.scrollBy({
          left: deltaX || 0,
          top: deltaY,
          behavior: behavior || "auto"
        });
        return {
          success: true,
          message: `Scrolled by offset (${deltaX || 0}, ${deltaY})`
        };
      } catch (error) {
        return {
          success: false,
          message: "Scroll by offset failed: " + error.message
        };
      }
    }
    async scrollToElement(data) {
      try {
        const { selector, block, inline, behavior } = data;
        const element = document.querySelector(selector);
        if (!element) {
          return {
            success: false,
            elementFound: false,
            message: `Element not found with selector: ${selector}`
          };
        }
        element.scrollIntoView({
          block: block || "start",
          inline: inline || "nearest",
          behavior: behavior || "auto"
        });
        return {
          success: true,
          elementFound: true,
          message: "Scrolled to element successfully"
        };
      } catch (error) {
        return {
          success: false,
          elementFound: false,
          message: "Scroll to element failed: " + error.message
        };
      }
    }
    async waitForElementInternal(selector, timeout = 5e3, pollInterval = 100, mustBeVisible = false) {
      const startTime = Date.now();
      while (Date.now() - startTime < timeout) {
        const element = document.querySelector(selector);
        if (element) {
          if (!mustBeVisible) {
            return element;
          }
          const rect = element.getBoundingClientRect();
          const style = window.getComputedStyle(element);
          const isVisible = style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
          if (isVisible) {
            return element;
          }
        }
        await new Promise((resolve) => setTimeout(resolve, pollInterval));
      }
      return null;
    }
    getKeyCode(key) {
      const keyCodeMap = {
        "Enter": "Enter",
        "Tab": "Tab",
        "Escape": "Escape",
        "Backspace": "Backspace",
        "Delete": "Delete",
        "ArrowUp": "ArrowUp",
        "ArrowDown": "ArrowDown",
        "ArrowLeft": "ArrowLeft",
        "ArrowRight": "ArrowRight",
        "Home": "Home",
        "End": "End",
        "PageUp": "PageUp",
        "PageDown": "PageDown",
        "F1": "F1",
        "F2": "F2",
        "F3": "F3",
        "F4": "F4",
        "F5": "F5",
        "F6": "F6",
        "F7": "F7",
        "F8": "F8",
        "F9": "F9",
        "F10": "F10",
        "F11": "F11",
        "F12": "F12"
      };
      return keyCodeMap[key] || `Key${key.toUpperCase()}`;
    }
  };
  new ContentScriptHandler();
})();
