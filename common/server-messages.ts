export interface ServerMessageBase {
  cmd: string;
}

export interface OpenTabServerMessage extends ServerMessageBase {
  cmd: "open-tab";
  url: string;
}

export interface CloseTabsServerMessage extends ServerMessageBase {
  cmd: "close-tabs";
  tabIds: number[];
}

export interface GetTabListServerMessage extends ServerMessageBase {
  cmd: "get-tab-list";
}

export interface GetBrowserRecentHistoryServerMessage extends ServerMessageBase {
  cmd: "get-browser-recent-history";
  searchQuery?: string;
}

export interface GetTabContentServerMessage extends ServerMessageBase {
  cmd: "get-tab-content";
  tabId: number;
  offset?: number;
}

export interface ReorderTabsServerMessage extends ServerMessageBase {
  cmd: "reorder-tabs";
  tabOrder: number[];
}

export interface FindHighlightServerMessage extends ServerMessageBase {
  cmd: "find-highlight";
  tabId: number;
  queryPhrase: string;
}

export interface TakeScreenshotServerMessage extends ServerMessageBase {
  cmd: "take-screenshot";
  tabId: number;
  format?: "png" | "jpeg";
  quality?: number;
}

export interface ScrollToPositionServerMessage extends ServerMessageBase {
  cmd: "scroll-to-position";
  tabId: number;
  x?: number;
  y: number;
  behavior?: "auto" | "smooth";
}

export interface ScrollByOffsetServerMessage extends ServerMessageBase {
  cmd: "scroll-by-offset";
  tabId: number;
  deltaX?: number;
  deltaY: number;
  behavior?: "auto" | "smooth";
}

export interface ScrollToElementServerMessage extends ServerMessageBase {
  cmd: "scroll-to-element";
  tabId: number;
  selector: string;
  block?: "start" | "center" | "end" | "nearest";
  inline?: "start" | "center" | "end" | "nearest";
  behavior?: "auto" | "smooth";
}

export interface ClickAtCoordinatesServerMessage extends ServerMessageBase {
  cmd: "click-at-coordinates";
  tabId: number;
  x: number;
  y: number;
  button?: "left" | "right" | "middle";
  clickType?: "single" | "double";
  modifiers?: {
    ctrl?: boolean;
    alt?: boolean;
    shift?: boolean;
    meta?: boolean;
  };
}

export interface ClickElementServerMessage extends ServerMessageBase {
  cmd: "click-element";
  tabId: number;
  selector: string;
  button?: "left" | "right" | "middle";
  clickType?: "single" | "double";
  waitForElement?: number;
  scrollIntoView?: boolean;
  modifiers?: {
    ctrl?: boolean;
    alt?: boolean;
    shift?: boolean;
    meta?: boolean;
  };
}

export interface HoverElementServerMessage extends ServerMessageBase {
  cmd: "hover-element";
  tabId: number;
  selector?: string;
  x?: number;
  y?: number;
  waitForElement?: number;
}

export interface TypeTextServerMessage extends ServerMessageBase {
  cmd: "type-text";
  tabId: number;
  text: string;
  selector?: string;
  clearFirst?: boolean;
  typeDelay?: number;
  waitForElement?: number;
}

export interface SendSpecialKeysServerMessage extends ServerMessageBase {
  cmd: "send-special-keys";
  tabId: number;
  keys: string[];
  selector?: string;
  modifiers?: {
    ctrl?: boolean;
    alt?: boolean;
    shift?: boolean;
    meta?: boolean;
  };
}

export interface ClearInputFieldServerMessage extends ServerMessageBase {
  cmd: "clear-input-field";
  tabId: number;
  selector: string;
  waitForElement?: number;
}

export interface WaitForTimeServerMessage extends ServerMessageBase {
  cmd: "wait-for-time";
  duration: number;
  message?: string;
}

export interface WaitForElementServerMessage extends ServerMessageBase {
  cmd: "wait-for-element";
  tabId: number;
  selector: string;
  timeout?: number;
  pollInterval?: number;
  visible?: boolean;
}

export interface WaitForElementVisibilityServerMessage extends ServerMessageBase {
  cmd: "wait-for-element-visibility";
  tabId: number;
  selector: string;
  timeout?: number;
  threshold?: number;
}

export interface WaitForConditionServerMessage extends ServerMessageBase {
  cmd: "wait-for-condition";
  tabId: number;
  condition: string;
  timeout?: number;
  pollInterval?: number;
  args?: Record<string, any>;
}

export type ServerMessage =
  | OpenTabServerMessage
  | CloseTabsServerMessage
  | GetTabListServerMessage
  | GetBrowserRecentHistoryServerMessage
  | GetTabContentServerMessage
  | ReorderTabsServerMessage
  | FindHighlightServerMessage
  | TakeScreenshotServerMessage
  | ScrollToPositionServerMessage
  | ScrollByOffsetServerMessage
  | ScrollToElementServerMessage
  | ClickAtCoordinatesServerMessage
  | ClickElementServerMessage
  | HoverElementServerMessage
  | TypeTextServerMessage
  | SendSpecialKeysServerMessage
  | ClearInputFieldServerMessage
  | WaitForTimeServerMessage
  | WaitForElementServerMessage
  | WaitForElementVisibilityServerMessage
  | WaitForConditionServerMessage;

export type ServerMessageRequest = ServerMessage & { correlationId: string };
