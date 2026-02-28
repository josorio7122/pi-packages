import { describe, it, expect, vi, afterEach } from "vitest";
import { relativeTime } from "./utils.js";

describe("relativeTime", () => {
  afterEach(() => vi.useRealTimers());

  it("returns 'just now' for < 60 seconds", () => {
    expect(relativeTime(Date.now() - 5000)).toBe("just now");
  });

  it("returns minutes for 1-59 minutes", () => {
    expect(relativeTime(Date.now() - 3 * 60 * 1000)).toBe("3 minutes ago");
    expect(relativeTime(Date.now() - 60 * 1000)).toBe("1 minute ago");
  });

  it("returns hours for 1-23 hours", () => {
    expect(relativeTime(Date.now() - 2 * 60 * 60 * 1000)).toBe("2 hours ago");
    expect(relativeTime(Date.now() - 60 * 60 * 1000)).toBe("1 hour ago");
  });

  it("returns days for 24+ hours", () => {
    expect(relativeTime(Date.now() - 3 * 24 * 60 * 60 * 1000)).toBe("3 days ago");
    expect(relativeTime(Date.now() - 24 * 60 * 60 * 1000)).toBe("1 day ago");
  });
});
