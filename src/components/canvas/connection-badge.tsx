"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Wifi, WifiOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { useConnectionStatus, connectionBadgeView } from "@/lib/canvas/connection-status";

const RECONNECTED_MS = 2000;
const EASE = [0.22, 1, 0.36, 1] as const;

// Floating connection indicator (top-left of the canvas). Red "Offline" while a server
// round-trip is failing; a brief green "Connected" on recovery; nothing when steady.
// Mirrors LockBanner's pill styling so the two floating status chips feel like a set.
export function ConnectionBadge() {
  const status = useConnectionStatus();
  const [reconnecting, setReconnecting] = useState(false);
  const prev = useRef(status);

  useEffect(() => {
    if (prev.current === "offline" && status === "online") {
      // Just came back — flash "Connected" briefly, then hide.
      setReconnecting(true);
      const t = setTimeout(() => setReconnecting(false), RECONNECTED_MS);
      prev.current = status;
      return () => clearTimeout(t);
    }
    prev.current = status;
  }, [status]);

  const { visible, variant } = connectionBadgeView(status, reconnecting);
  const offline = variant === "offline";

  return (
    <div className="pointer-events-none absolute left-4 top-4 z-20">
      <AnimatePresence>
        {visible && (
          <motion.div
            key={variant}
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ ease: EASE, duration: 0.2 }}
            className={cn(
              "flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium shadow-card backdrop-blur",
              offline
                ? "border-destructive/30 bg-destructive/10 text-destructive"
                : "border-chart-5/40 bg-chart-5/10 text-chart-5",
            )}
          >
            {offline ? (
              <WifiOff className="size-4" strokeWidth={1.5} />
            ) : (
              <Wifi className="size-4" strokeWidth={1.5} />
            )}
            {offline ? "Offline" : "Connected"}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
