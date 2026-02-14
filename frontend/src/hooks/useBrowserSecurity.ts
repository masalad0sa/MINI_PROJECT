import { useEffect, useCallback, useRef } from "react";

export type ViolationType =
  | "TAB_SWITCH"
  | "FULLSCREEN_EXIT"
  | "COPY_PASTE"
  | "RIGHT_CLICK"
  | "DEV_TOOLS"
  | "KEYBOARD_SHORTCUT";

export type ViolationSeverity = "MINOR" | "MEDIUM" | "CRITICAL";

interface Violation {
  type: ViolationType;
  severity: ViolationSeverity;
  description: string;
  timestamp: Date;
}

interface UseBrowserSecurityOptions {
  enabled: boolean;
  onViolation: (violation: Violation) => void;
  onFullscreenRequest?: () => void;
}

const SEVERITY_MAP: Record<ViolationType, ViolationSeverity> = {
  TAB_SWITCH: "MEDIUM",
  FULLSCREEN_EXIT: "CRITICAL",
  COPY_PASTE: "MINOR",
  RIGHT_CLICK: "MINOR",
  DEV_TOOLS: "CRITICAL",
  KEYBOARD_SHORTCUT: "MINOR",
};

export function useBrowserSecurity({
  enabled,
  onViolation,
  onFullscreenRequest,
}: UseBrowserSecurityOptions) {
  const isFullscreen = useRef(false);
  const hasRequestedFullscreen = useRef(false);

  // Report a violation
  const reportViolation = useCallback(
    (type: ViolationType, description: string) => {
      onViolation({
        type,
        severity: SEVERITY_MAP[type],
        description,
        timestamp: new Date(),
      });
    },
    [onViolation]
  );

  // Request fullscreen
  const requestFullscreen = useCallback(async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
        isFullscreen.current = true;
        hasRequestedFullscreen.current = true;
      }
    } catch (err) {
      console.warn("Fullscreen request denied:", err);
    }
  }, []);

  // Exit fullscreen (for cleanup)
  const exitFullscreen = useCallback(async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
        isFullscreen.current = false;
      }
    } catch (err) {
      console.warn("Exit fullscreen failed:", err);
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;

    // Tab visibility change detection
    const handleVisibilityChange = () => {
      if (document.hidden) {
        reportViolation("TAB_SWITCH", "Student switched to another tab or window");
      }
    };

    // Fullscreen change detection
    const handleFullscreenChange = () => {
      if (!document.fullscreenElement && hasRequestedFullscreen.current) {
        isFullscreen.current = false;
        reportViolation("FULLSCREEN_EXIT", "Student exited fullscreen mode");
        // Re-request fullscreen
        onFullscreenRequest?.();
      } else if (document.fullscreenElement) {
        isFullscreen.current = true;
      }
    };

    // Copy/paste prevention
    const handleCopy = (e: ClipboardEvent) => {
      e.preventDefault();
      reportViolation("COPY_PASTE", "Student attempted to copy content");
    };

    const handlePaste = (e: ClipboardEvent) => {
      e.preventDefault();
      reportViolation("COPY_PASTE", "Student attempted to paste content");
    };

    const handleCut = (e: ClipboardEvent) => {
      e.preventDefault();
      reportViolation("COPY_PASTE", "Student attempted to cut content");
    };

    // Right-click prevention
    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      reportViolation("RIGHT_CLICK", "Student attempted to right-click");
    };

    // Keyboard shortcut prevention
    const handleKeyDown = (e: KeyboardEvent) => {
      // Block common cheating shortcuts
      const blockedCombos = [
        { ctrl: true, key: "c" }, // Copy
        { ctrl: true, key: "v" }, // Paste
        { ctrl: true, key: "x" }, // Cut
        { ctrl: true, key: "p" }, // Print
        { ctrl: true, shift: true, key: "i" }, // Dev tools
        { ctrl: true, shift: true, key: "j" }, // Dev tools
        { key: "F12" }, // Dev tools
        { ctrl: true, key: "u" }, // View source
        { ctrl: true, key: "s" }, // Save
        { alt: true, key: "Tab" }, // Alt+Tab (may now work in all browsers)
        { key: "z", ctrl: true }, // Undo
        { key: "y", ctrl: true }, // Redo
      ];

      for (const combo of blockedCombos) {
        const ctrlMatch = combo.ctrl ? e.ctrlKey || e.metaKey : true;
        const shiftMatch = combo.shift ? e.shiftKey : !combo.shift;
        const keyMatch = e.key.toLowerCase() === combo.key?.toLowerCase();
        const altMatch = combo.alt ? e.altKey : !combo.alt;

        if (ctrlMatch && shiftMatch && keyMatch && altMatch) {
          e.preventDefault();
          reportViolation("KEYBOARD_SHORTCUT", `Blocked keyboard shortcut detected`);
          return;
        }
      }
    };

    // Navigation Blocking
    const handlePopState = (_e: PopStateEvent) => {
      // Prevent going back
      window.history.pushState(null, "", window.location.href);
      reportViolation("TAB_SWITCH", "Attempted to use Browser Back Button");
    };

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "Are you sure you want to leave the exam? Your progress may be lost.";
      return "Are you sure you want to leave the exam? Your progress may be lost.";
    };

    // Add event listeners
    document.addEventListener("visibilitychange", handleVisibilityChange);
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    document.addEventListener("copy", handleCopy);
    document.addEventListener("paste", handlePaste);
    document.addEventListener("cut", handleCut);
    document.addEventListener("contextmenu", handleContextMenu);
    document.addEventListener("keydown", handleKeyDown);
    
    // pushState to lock navigation
    window.history.pushState(null, "", window.location.href);
    window.addEventListener("popstate", handlePopState);
    window.addEventListener("beforeunload", handleBeforeUnload);

    // Auto-request fullscreen on mount
    requestFullscreen();

    // Cleanup
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
      document.removeEventListener("copy", handleCopy);
      document.removeEventListener("paste", handlePaste);
      document.removeEventListener("cut", handleCut);
      document.removeEventListener("contextmenu", handleContextMenu);
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("popstate", handlePopState);
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [enabled, reportViolation, requestFullscreen, onFullscreenRequest]);

  return {
    requestFullscreen,
    exitFullscreen,
    isFullscreen: isFullscreen.current,
  };
}
