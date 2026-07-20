import { describe, it, expect, beforeEach } from "vitest";
import {
  getConnectionStatus,
  subscribeConnection,
  markOnline,
  markOffline,
  trackConnection,
  connectionBadgeView,
  resetConnectionStatusForTest,
} from "./connection-status";

beforeEach(() => resetConnectionStatusForTest());

describe("connection status store", () => {
  it("starts online", () => {
    expect(getConnectionStatus()).toBe("online");
  });

  it("markOffline flips to offline and notifies subscribers", () => {
    let calls = 0;
    subscribeConnection(() => calls++);
    markOffline();
    expect(getConnectionStatus()).toBe("offline");
    expect(calls).toBe(1);
  });

  it("markOnline after offline flips back and notifies", () => {
    markOffline();
    let calls = 0;
    subscribeConnection(() => calls++);
    markOnline();
    expect(getConnectionStatus()).toBe("online");
    expect(calls).toBe(1);
  });

  it("is idempotent — repeated markOffline does not re-notify", () => {
    markOffline();
    let calls = 0;
    subscribeConnection(() => calls++);
    markOffline();
    expect(calls).toBe(0);
  });

  it("stops notifying after unsubscribe", () => {
    let calls = 0;
    const unsub = subscribeConnection(() => calls++);
    unsub();
    markOffline();
    expect(calls).toBe(0);
  });
});

describe("trackConnection", () => {
  it("marks online and returns the value on success", async () => {
    const r = await trackConnection(async () => "ok");
    expect(r).toBe("ok");
    expect(getConnectionStatus()).toBe("online");
  });

  it("marks offline, swallows the throw, and returns null", async () => {
    const r = await trackConnection(async () => {
      throw new Error("network down");
    });
    expect(r).toBeNull();
    expect(getConnectionStatus()).toBe("offline");
  });

  it("recovers to online on the next successful round-trip", async () => {
    await trackConnection(async () => {
      throw new Error("down");
    });
    expect(getConnectionStatus()).toBe("offline");
    await trackConnection(async () => "back");
    expect(getConnectionStatus()).toBe("online");
  });
});

describe("connectionBadgeView", () => {
  it("offline → visible offline badge", () => {
    expect(connectionBadgeView("offline", false)).toEqual({ visible: true, variant: "offline" });
  });

  it("online while reconnecting → visible reconnected badge", () => {
    expect(connectionBadgeView("online", true)).toEqual({ visible: true, variant: "reconnected" });
  });

  it("online and steady → hidden", () => {
    expect(connectionBadgeView("online", false)).toEqual({ visible: false, variant: null });
  });

  it("offline takes precedence over the reconnecting flag", () => {
    expect(connectionBadgeView("offline", true)).toEqual({ visible: true, variant: "offline" });
  });
});
