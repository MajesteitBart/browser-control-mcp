export interface ExtensionMessageBase {
  resource: string;
  correlationId: string;
}

export interface TabContentExtensionMessage extends ExtensionMessageBase {
  resource: "tab-content";
  tabId: number;
  fullText: string;
  isTruncated: boolean;
  totalLength: number;
  links: { url: string; text: string }[];
}

export interface BrowserTab {
  id?: number;
  url?: string;
  title?: string;
  lastAccessed?: number;
}

export interface TabsExtensionMessage extends ExtensionMessageBase {
  resource: "tabs";
  tabs: BrowserTab[];
}

export interface OpenedTabIdExtensionMessage extends ExtensionMessageBase {
  resource: "opened-tab-id";
  tabId: number | undefined;
}

export interface BrowserHistoryItem {
  url?: string;
  title?: string;
  lastVisitTime?: number;
}

export interface BrowserHistoryExtensionMessage extends ExtensionMessageBase {
  resource: "history";

  historyItems: BrowserHistoryItem[];
}

export interface ReorderedTabsExtensionMessage extends ExtensionMessageBase {
  resource: "tabs-reordered";
  tabOrder: number[];
}

export interface FindHighlightExtensionMessage extends ExtensionMessageBase {
  resource: "find-highlight-result";
  noOfResults: number;
}

export interface TabsClosedExtensionMessage extends ExtensionMessageBase {
  resource: "tabs-closed";
}

export interface ScreenshotExtensionMessage extends ExtensionMessageBase {
  resource: "screenshot";
  tabId: number;
  imageData: string; // Base64 encoded image data - ALWAYS included for backward compatibility
  format: "png" | "jpeg";
  timestamp: number;
  filePath?: string; // Optional file path when screenshot is saved to disk
}

export interface ScrollResultExtensionMessage extends ExtensionMessageBase {
  resource: "scroll-result";
  success: boolean;
  finalPosition: { x: number; y: number };
  message: string;
  timestamp: number;
}

export interface ClickResultExtensionMessage extends ExtensionMessageBase {
  resource: "click-result";
  success: boolean;
  elementFound: boolean;
  clickExecuted: boolean;
  message: string;
  timestamp: number;
  elementInfo?: {
    exists: boolean;
    visible: boolean;
    interactable: boolean;
    boundingRect?: DOMRect;
  };
}

export interface HoverResultExtensionMessage extends ExtensionMessageBase {
  resource: "hover-result";
  success: boolean;
  elementFound: boolean;
  message: string;
  timestamp: number;
  elementInfo?: {
    exists: boolean;
    visible: boolean;
    interactable: boolean;
    boundingRect?: DOMRect;
  };
}

export interface TypeResultExtensionMessage extends ExtensionMessageBase {
  resource: "type-result";
  success: boolean;
  message: string;
  timestamp: number;
  charactersTyped?: number;
  elementInfo?: {
    exists: boolean;
    visible: boolean;
    interactable: boolean;
    boundingRect?: DOMRect;
  };
}

export interface WaitResultExtensionMessage extends ExtensionMessageBase {
  resource: "wait-result";
  success: boolean;
  message: string;
  timestamp: number;
  conditionMet?: boolean;
  waitTime?: number;
  elementInfo?: {
    exists: boolean;
    visible: boolean;
    interactable: boolean;
    boundingRect?: DOMRect;
  };
}

export type ExtensionMessage =
  | TabContentExtensionMessage
  | TabsExtensionMessage
  | OpenedTabIdExtensionMessage
  | BrowserHistoryExtensionMessage
  | ReorderedTabsExtensionMessage
  | FindHighlightExtensionMessage
  | TabsClosedExtensionMessage
  | ScreenshotExtensionMessage
  | ScrollResultExtensionMessage
  | ClickResultExtensionMessage
  | HoverResultExtensionMessage
  | TypeResultExtensionMessage
  | WaitResultExtensionMessage;

export interface ExtensionError {
  correlationId: string;
  errorMessage: string;
}