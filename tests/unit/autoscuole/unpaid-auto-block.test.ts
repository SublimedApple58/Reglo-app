import {
  resolveUnpaidAutoBlock,
  readAutoBlockSettings,
  isLessonUnpaid,
  type MemberBlockState,
} from "@/lib/autoscuole/unpaid-auto-block";

const ON = { enabled: true, threshold: 3 };
const OFF = { enabled: false, threshold: 3 };

const unblocked: MemberBlockState = {
  bookingBlocked: false,
  bookingBlockReason: null,
  unpaidBlockClearedAtCount: null,
};
const autoBlocked: MemberBlockState = {
  bookingBlocked: true,
  bookingBlockReason: "unpaid_threshold",
  unpaidBlockClearedAtCount: null,
};
const manualBlocked: MemberBlockState = {
  bookingBlocked: true,
  bookingBlockReason: "manual",
  unpaidBlockClearedAtCount: null,
};
const legacyBlocked: MemberBlockState = {
  bookingBlocked: true,
  bookingBlockReason: null,
  unpaidBlockClearedAtCount: null,
};

describe("resolveUnpaidAutoBlock", () => {
  it("auto-blocks when debt reaches the threshold", () => {
    expect(resolveUnpaidAutoBlock(unblocked, 3, ON)).toEqual({
      changed: true,
      bookingBlocked: true,
      bookingBlockReason: "unpaid_threshold",
      unpaidBlockClearedAtCount: null,
    });
  });

  it("does not block below the threshold", () => {
    expect(resolveUnpaidAutoBlock(unblocked, 2, ON)).toEqual({ changed: false });
  });

  it("auto-unblocks its own block when debt drops below the threshold", () => {
    expect(resolveUnpaidAutoBlock(autoBlocked, 2, ON)).toEqual({
      changed: true,
      bookingBlocked: false,
      bookingBlockReason: null,
      unpaidBlockClearedAtCount: null,
    });
  });

  it("keeps its own block while still over the threshold", () => {
    expect(resolveUnpaidAutoBlock(autoBlocked, 4, ON)).toEqual({ changed: false });
  });

  it("never touches a manual owner block", () => {
    expect(resolveUnpaidAutoBlock(manualBlocked, 99, ON)).toEqual({ changed: false });
    expect(resolveUnpaidAutoBlock(manualBlocked, 0, ON)).toEqual({ changed: false });
    expect(resolveUnpaidAutoBlock(manualBlocked, 0, OFF)).toEqual({ changed: false });
  });

  it("treats a legacy block (blocked, no reason) as manual", () => {
    expect(resolveUnpaidAutoBlock(legacyBlocked, 99, ON)).toEqual({ changed: false });
    expect(resolveUnpaidAutoBlock(legacyBlocked, 0, ON)).toEqual({ changed: false });
  });

  describe("owner dismissed an auto-block (watermark)", () => {
    // Owner manually unblocked at debt = 5 (threshold 3).
    const dismissed: MemberBlockState = {
      bookingBlocked: false,
      bookingBlockReason: null,
      unpaidBlockClearedAtCount: 5,
    };

    it("does NOT re-block for the same residual debt", () => {
      expect(resolveUnpaidAutoBlock(dismissed, 5, ON)).toEqual({ changed: false });
      expect(resolveUnpaidAutoBlock(dismissed, 4, ON)).toEqual({ changed: false });
    });

    it("re-blocks when the debt increases beyond the dismissed level", () => {
      expect(resolveUnpaidAutoBlock(dismissed, 6, ON)).toEqual({
        changed: true,
        bookingBlocked: true,
        bookingBlockReason: "unpaid_threshold",
        unpaidBlockClearedAtCount: null,
      });
    });

    it("clears the stale watermark once the debt drops below the threshold", () => {
      expect(resolveUnpaidAutoBlock(dismissed, 2, ON)).toEqual({
        changed: true,
        bookingBlocked: false,
        bookingBlockReason: null,
        unpaidBlockClearedAtCount: null,
      });
    });

    it("re-blocks on a fresh crossing after the debt dipped below and climbed back", () => {
      // After the dip cleared the watermark, state is a plain `unblocked`.
      expect(resolveUnpaidAutoBlock(unblocked, 3, ON)).toEqual({
        changed: true,
        bookingBlocked: true,
        bookingBlockReason: "unpaid_threshold",
        unpaidBlockClearedAtCount: null,
      });
    });
  });

  describe("feature disabled", () => {
    it("releases an existing auto-block", () => {
      expect(resolveUnpaidAutoBlock(autoBlocked, 9, OFF)).toEqual({
        changed: true,
        bookingBlocked: false,
        bookingBlockReason: null,
        unpaidBlockClearedAtCount: null,
      });
    });

    it("clears a leftover watermark on an unblocked student", () => {
      expect(
        resolveUnpaidAutoBlock(
          { bookingBlocked: false, bookingBlockReason: null, unpaidBlockClearedAtCount: 5 },
          9,
          OFF,
        ),
      ).toEqual({
        changed: true,
        bookingBlocked: false,
        bookingBlockReason: null,
        unpaidBlockClearedAtCount: null,
      });
    });

    it("does nothing for a clean unblocked student", () => {
      expect(resolveUnpaidAutoBlock(unblocked, 9, OFF)).toEqual({ changed: false });
    });
  });
});

describe("readAutoBlockSettings", () => {
  it("defaults to disabled/threshold 3 when limits are empty", () => {
    expect(readAutoBlockSettings({})).toEqual({ enabled: false, threshold: 3 });
    expect(readAutoBlockSettings(null)).toEqual({ enabled: false, threshold: 3 });
  });

  it("reads stored values", () => {
    expect(
      readAutoBlockSettings({ autoBookingBlockEnabled: true, autoBookingBlockThreshold: 5 }),
    ).toEqual({ enabled: true, threshold: 5 });
  });

  it("falls back to the default threshold for invalid values", () => {
    expect(
      readAutoBlockSettings({ autoBookingBlockEnabled: true, autoBookingBlockThreshold: 0 }),
    ).toEqual({ enabled: true, threshold: 3 });
  });
});

describe("isLessonUnpaid", () => {
  it("counts a completed lesson in manual mode", () => {
    expect(isLessonUnpaid({ status: "completed" }, true)).toBe(true);
  });

  it("does not count a completed lesson outside manual mode", () => {
    expect(isLessonUnpaid({ status: "completed" }, false)).toBe(false);
  });

  it("excludes paid or credit-covered lessons", () => {
    expect(isLessonUnpaid({ status: "completed", manualPaymentStatus: "paid" }, true)).toBe(false);
    expect(isLessonUnpaid({ status: "completed", creditApplied: true }, true)).toBe(false);
  });

  it("counts a charged late cancellation still unpaid", () => {
    expect(
      isLessonUnpaid(
        { status: "cancelled", lateCancellationAction: "charged", manualPaymentStatus: "unpaid" },
        false,
      ),
    ).toBe(true);
  });
});
