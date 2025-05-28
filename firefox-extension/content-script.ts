// Content script for handling DOM interactions
// This script runs in the page context and communicates with the background script

interface ContentScriptMessage {
  type: string;
  correlationId: string;
  data?: any;
}

interface ClickAtCoordinatesData {
  x: number;
  y: number;
  button: "left" | "right" | "middle";
  clickType: "single" | "double";
  modifiers: {
    ctrl?: boolean;
    alt?: boolean;
    shift?: boolean;
    meta?: boolean;
  };
}

interface ClickElementData {
  selector: string;
  button: "left" | "right" | "middle";
  clickType: "single" | "double";
  waitForElement: number;
  scrollIntoView: boolean;
  modifiers: {
    ctrl?: boolean;
    alt?: boolean;
    shift?: boolean;
    meta?: boolean;
  };
}

interface HoverElementData {
  selector?: string;
  x?: number;
  y?: number;
  waitForElement: number;
}

interface TypeTextData {
  text: string;
  selector?: string;
  clearFirst: boolean;
  typeDelay: number;
  waitForElement: number;
}

interface SendSpecialKeysData {
  keys: string[];
  selector?: string;
  modifiers: {
    ctrl?: boolean;
    alt?: boolean;
    shift?: boolean;
    meta?: boolean;
  };
}

interface ClearInputFieldData {
  selector: string;
  waitForElement: number;
}

interface WaitForElementData {
  selector: string;
  timeout: number;
  pollInterval: number;
  visible: boolean;
}

interface WaitForElementVisibilityData {
  selector: string;
  timeout: number;
  threshold: number;
}

interface ScrollToPositionData {
  x?: number;
  y: number;
  behavior: "auto" | "smooth";
}

interface ScrollByOffsetData {
  deltaX?: number;
  deltaY: number;
  behavior: "auto" | "smooth";
}

interface ScrollToElementData {
  selector: string;
  block: "start" | "center" | "end" | "nearest";
  inline: "start" | "center" | "end" | "nearest";
  behavior: "auto" | "smooth";
}

class ContentScriptHandler {
  constructor() {
    this.setupMessageListener();
  }

  private setupMessageListener(): void {
    browser.runtime.onMessage.addListener((message: ContentScriptMessage, sender: any, sendResponse: any) => {
      this.handleMessage(message)
        .then(result => sendResponse({ success: true, data: result }))
        .catch(error => sendResponse({ success: false, error: error.message }));
      return true; // Keep the message channel open for async response
    });
  }

  private async handleMessage(message: ContentScriptMessage): Promise<any> {
    switch (message.type) {
      case "click-at-coordinates":
        return this.clickAtCoordinates(message.data as ClickAtCoordinatesData);
      case "click-element":
        return this.clickElement(message.data as ClickElementData);
      case "hover-element":
        return this.hoverElement(message.data as HoverElementData);
      case "type-text":
        return this.typeText(message.data as TypeTextData);
      case "send-special-keys":
        return this.sendSpecialKeys(message.data as SendSpecialKeysData);
      case "clear-input-field":
        return this.clearInputField(message.data as ClearInputFieldData);
      case "wait-for-element":
        return this.waitForElement(message.data as WaitForElementData);
      case "wait-for-element-visibility":
        return this.waitForElementVisibility(message.data as WaitForElementVisibilityData);
      case "scroll-to-position":
        return this.scrollToPosition(message.data as ScrollToPositionData);
      case "scroll-by-offset":
        return this.scrollByOffset(message.data as ScrollByOffsetData);
      case "scroll-to-element":
        return this.scrollToElement(message.data as ScrollToElementData);
      default:
        throw new Error(`Unknown message type: ${message.type}`);
    }
  }

  private async clickAtCoordinates(data: ClickAtCoordinatesData): Promise<any> {
    try {
      const { x, y, button, clickType, modifiers } = data;

      // Find element at coordinates
      const elementAtPoint = document.elementFromPoint(x, y);
      if (!elementAtPoint) {
        return {
          success: false,
          elementFound: false,
          clickExecuted: false,
          message: `No element found at coordinates (${x}, ${y})`
        };
      }

      // Security check - block clicks on sensitive elements
      const tagName = elementAtPoint.tagName.toLowerCase();
      const inputType = (elementAtPoint as HTMLInputElement).type?.toLowerCase();
      if ((tagName === 'input' && (inputType === 'password' || inputType === 'file')) ||
          tagName === 'script' || tagName === 'iframe') {
        return {
          success: false,
          elementFound: true,
          clickExecuted: false,
          message: "Click blocked on sensitive element for security reasons"
        };
      }

      // Execute click
      this.executeClick(elementAtPoint, x, y, button, clickType, modifiers);

      // Get element info
      const rect = elementAtPoint.getBoundingClientRect();
      const style = window.getComputedStyle(elementAtPoint);
      const isVisible = style.display !== 'none' && style.visibility !== 'hidden' &&
                       rect.width > 0 && rect.height > 0;

      return {
        success: true,
        elementFound: true,
        clickExecuted: true,
        message: `Click executed successfully at coordinates (${x}, ${y})`,
        elementInfo: {
          exists: true,
          visible: isVisible,
          interactable: !(elementAtPoint as HTMLInputElement).disabled,
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
        message: "Click failed: " + (error as Error).message
      };
    }
  }

  private async clickElement(data: ClickElementData): Promise<any> {
    try {
      const { selector, button, clickType, waitForElement, scrollIntoView, modifiers } = data;

      // Wait for element with timeout
      const element = await this.waitForElementInternal(selector, waitForElement);
      if (!element) {
        return {
          success: false,
          elementFound: false,
          clickExecuted: false,
          message: `Element not found with selector: ${selector}`
        };
      }

      // Security check - block clicks on sensitive elements
      const tagName = element.tagName.toLowerCase();
      const inputType = (element as HTMLInputElement).type?.toLowerCase();
      if ((tagName === 'input' && (inputType === 'password' || inputType === 'file')) ||
          tagName === 'script' || tagName === 'iframe') {
        return {
          success: false,
          elementFound: true,
          clickExecuted: false,
          message: "Click blocked on sensitive element for security reasons"
        };
      }

      // Scroll element into view if requested
      if (scrollIntoView) {
        element.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
          inline: 'nearest'
        });
        // Wait a bit for scrolling to complete
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      // Get element center coordinates for event
      const rect = element.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;

      // Execute click
      this.executeClick(element, centerX, centerY, button, clickType, modifiers);

      // Get element info
      const style = window.getComputedStyle(element);
      const isVisible = style.display !== 'none' && style.visibility !== 'hidden' &&
                       rect.width > 0 && rect.height > 0;

      return {
        success: true,
        elementFound: true,
        clickExecuted: true,
        message: "Element clicked successfully",
        elementInfo: {
          exists: true,
          visible: isVisible,
          interactable: !(element as HTMLInputElement).disabled,
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
        message: "Click failed: " + (error as Error).message
      };
    }
  }

  private executeClick(
    element: Element,
    x: number,
    y: number,
    button: "left" | "right" | "middle",
    clickType: "single" | "double",
    modifiers: any
  ): void {
    // Get the button code for MouseEvent
    const buttonCode = {
      'left': 0,
      'middle': 1,
      'right': 2
    }[button];

    // Create modifiers object
    const modifierKeys = {
      ctrlKey: modifiers.ctrl || false,
      altKey: modifiers.alt || false,
      shiftKey: modifiers.shift || false,
      metaKey: modifiers.meta || false
    };

    // For regular left clicks, try the native click method first
    if (button === 'left' && clickType === 'single') {
      if (typeof (element as HTMLElement).click === 'function') {
        try {
          (element as HTMLElement).click();
        } catch (e) {
          // If native click fails, continue with synthetic events
        }
      }
    }

    // Dispatch appropriate events
    if (clickType === 'double') {
      // For double click, dispatch both click and dblclick events
      const clickEvent = new MouseEvent('click', {
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

      const dblClickEvent = new MouseEvent('dblclick', {
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
    } else if (button === 'right') {
      // For right click, dispatch contextmenu event
      const contextMenuEvent = new MouseEvent('contextmenu', {
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
      // Regular click
      const clickEvent = new MouseEvent('click', {
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

  private async hoverElement(data: HoverElementData): Promise<any> {
    try {
      const { selector, x, y, waitForElement } = data;

      let element: Element | null = null;
      let targetX: number, targetY: number;

      if (selector) {
        // Wait for element with timeout
        element = await this.waitForElementInternal(selector, waitForElement);
        if (!element) {
          return {
            success: false,
            elementFound: false,
            message: `Element not found with selector: ${selector}`
          };
        }

        // Get element center coordinates
        const rect = element.getBoundingClientRect();
        targetX = rect.left + rect.width / 2;
        targetY = rect.top + rect.height / 2;
      } else if (x !== undefined && y !== undefined) {
        // Use provided coordinates
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

      // Dispatch mouseover and mouseenter events
      const mouseOverEvent = new MouseEvent('mouseover', {
        bubbles: true,
        cancelable: true,
        view: window,
        clientX: targetX,
        clientY: targetY
      });
      element.dispatchEvent(mouseOverEvent);

      const mouseEnterEvent = new MouseEvent('mouseenter', {
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
        message: "Hover failed: " + (error as Error).message
      };
    }
  }

  private async typeText(data: TypeTextData): Promise<any> {
    try {
      const { text, selector, clearFirst, typeDelay, waitForElement } = data;

      let element: Element | null = null;

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

      // Focus the element
      if (typeof (element as HTMLElement).focus === 'function') {
        (element as HTMLElement).focus();
      }

      // Clear the field if requested
      if (clearFirst && (element as HTMLInputElement).value !== undefined) {
        (element as HTMLInputElement).value = '';
        element.dispatchEvent(new Event('input', { bubbles: true }));
      }

      // Type text with delay
      for (let i = 0; i < text.length; i++) {
        const char = text[i];
        
        // Dispatch keydown, keypress, and keyup events
        const keydownEvent = new KeyboardEvent('keydown', {
          key: char,
          code: `Key${char.toUpperCase()}`,
          bubbles: true,
          cancelable: true
        });
        element.dispatchEvent(keydownEvent);

        const keypressEvent = new KeyboardEvent('keypress', {
          key: char,
          code: `Key${char.toUpperCase()}`,
          bubbles: true,
          cancelable: true
        });
        element.dispatchEvent(keypressEvent);

        // Update input value
        if ((element as HTMLInputElement).value !== undefined) {
          (element as HTMLInputElement).value += char;
        }

        const inputEvent = new Event('input', { bubbles: true });
        element.dispatchEvent(inputEvent);

        const keyupEvent = new KeyboardEvent('keyup', {
          key: char,
          code: `Key${char.toUpperCase()}`,
          bubbles: true,
          cancelable: true
        });
        element.dispatchEvent(keyupEvent);

        // Wait for type delay
        if (typeDelay > 0) {
          await new Promise(resolve => setTimeout(resolve, typeDelay));
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
        message: "Type text failed: " + (error as Error).message
      };
    }
  }

  private async sendSpecialKeys(data: SendSpecialKeysData): Promise<any> {
    try {
      const { keys, selector, modifiers } = data;

      let element: Element | null = null;

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

      // Focus the element
      if (typeof (element as HTMLElement).focus === 'function') {
        (element as HTMLElement).focus();
      }

      // Send each key
      for (const key of keys) {
        const keydownEvent = new KeyboardEvent('keydown', {
          key: key,
          code: this.getKeyCode(key),
          bubbles: true,
          cancelable: true,
          ctrlKey: modifiers.ctrl || false,
          altKey: modifiers.alt || false,
          shiftKey: modifiers.shift || false,
          metaKey: modifiers.meta || false
        });
        element.dispatchEvent(keydownEvent);

        const keyupEvent = new KeyboardEvent('keyup', {
          key: key,
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
        message: "Send special keys failed: " + (error as Error).message
      };
    }
  }

  private async clearInputField(data: ClearInputFieldData): Promise<any> {
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

      // Focus and clear the element
      if (typeof (element as HTMLElement).focus === 'function') {
        (element as HTMLElement).focus();
      }

      if ((element as HTMLInputElement).value !== undefined) {
        (element as HTMLInputElement).value = '';
        element.dispatchEvent(new Event('input', { bubbles: true }));
        element.dispatchEvent(new Event('change', { bubbles: true }));
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
        message: "Clear input field failed: " + (error as Error).message
      };
    }
  }

  private async waitForElement(data: WaitForElementData): Promise<any> {
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
      const isVisible = style.display !== 'none' && style.visibility !== 'hidden' &&
                       rect.width > 0 && rect.height > 0;

      return {
        success: true,
        elementFound: true,
        visible: isVisible,
        message: "Element found successfully",
        elementInfo: {
          exists: true,
          visible: isVisible,
          interactable: !(element as HTMLInputElement).disabled,
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
        message: "Wait for element failed: " + (error as Error).message
      };
    }
  }

  private async waitForElementVisibility(data: WaitForElementVisibilityData): Promise<any> {
    try {
      const { selector, timeout, threshold } = data;

      const startTime = Date.now();
      while (Date.now() - startTime < timeout) {
        const element = document.querySelector(selector);
        if (element) {
          const rect = element.getBoundingClientRect();
          const visibleArea = rect.width * rect.height;
          const totalArea = (element as HTMLElement).offsetWidth * (element as HTMLElement).offsetHeight;
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
        await new Promise(resolve => setTimeout(resolve, 100));
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
        message: "Wait for element visibility failed: " + (error as Error).message
      };
    }
  }

  private async scrollToPosition(data: ScrollToPositionData): Promise<any> {
    try {
      const { x, y, behavior } = data;

      window.scrollTo({
        left: x || 0,
        top: y,
        behavior: behavior || 'auto'
      });

      return {
        success: true,
        message: `Scrolled to position (${x || 0}, ${y})`
      };
    } catch (error) {
      return {
        success: false,
        message: "Scroll to position failed: " + (error as Error).message
      };
    }
  }

  private async scrollByOffset(data: ScrollByOffsetData): Promise<any> {
    try {
      const { deltaX, deltaY, behavior } = data;

      window.scrollBy({
        left: deltaX || 0,
        top: deltaY,
        behavior: behavior || 'auto'
      });

      return {
        success: true,
        message: `Scrolled by offset (${deltaX || 0}, ${deltaY})`
      };
    } catch (error) {
      return {
        success: false,
        message: "Scroll by offset failed: " + (error as Error).message
      };
    }
  }

  private async scrollToElement(data: ScrollToElementData): Promise<any> {
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
        block: block || 'start',
        inline: inline || 'nearest',
        behavior: behavior || 'auto'
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
        message: "Scroll to element failed: " + (error as Error).message
      };
    }
  }

  private async waitForElementInternal(
    selector: string,
    timeout: number = 5000,
    pollInterval: number = 100,
    mustBeVisible: boolean = false
  ): Promise<Element | null> {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
      const element = document.querySelector(selector);
      if (element) {
        if (!mustBeVisible) {
          return element;
        }

        // Check if element is visible
        const rect = element.getBoundingClientRect();
        const style = window.getComputedStyle(element);
        const isVisible = style.display !== 'none' && style.visibility !== 'hidden' &&
                         rect.width > 0 && rect.height > 0;

        if (isVisible) {
          return element;
        }
      }

      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }

    return null;
  }

  private getKeyCode(key: string): string {
    const keyCodeMap: Record<string, string> = {
      'Enter': 'Enter',
      'Tab': 'Tab',
      'Escape': 'Escape',
      'Backspace': 'Backspace',
      'Delete': 'Delete',
      'ArrowUp': 'ArrowUp',
      'ArrowDown': 'ArrowDown',
      'ArrowLeft': 'ArrowLeft',
      'ArrowRight': 'ArrowRight',
      'Home': 'Home',
      'End': 'End',
      'PageUp': 'PageUp',
      'PageDown': 'PageDown',
      'F1': 'F1',
      'F2': 'F2',
      'F3': 'F3',
      'F4': 'F4',
      'F5': 'F5',
      'F6': 'F6',
      'F7': 'F7',
      'F8': 'F8',
      'F9': 'F9',
      'F10': 'F10',
      'F11': 'F11',
      'F12': 'F12'
    };

    return keyCodeMap[key] || `Key${key.toUpperCase()}`;
  }
}

// Initialize the content script handler
new ContentScriptHandler();