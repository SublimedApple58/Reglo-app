import {
  appointmentSwapBlockReason,
  SWAP_BLOCK_MESSAGES,
} from "@/lib/autoscuole/swap-rules";

describe("appointmentSwapBlockReason", () => {
  it("allows a normal future guida (no block)", () => {
    expect(
      appointmentSwapBlockReason({ type: "guida", groupLessonId: null, hasFollowCar: false }),
    ).toBeNull();
  });

  it("blocks a group-lesson seat by groupLessonId", () => {
    expect(
      appointmentSwapBlockReason({ type: "guida", groupLessonId: "gl1" }),
    ).toBe("group_lesson");
  });

  it("blocks a group lesson by type", () => {
    expect(appointmentSwapBlockReason({ type: "group_lesson" })).toBe("group_lesson");
  });

  it("blocks an exam", () => {
    expect(appointmentSwapBlockReason({ type: "esame" })).toBe("exam");
  });

  it("blocks a lesson with an auto al seguito", () => {
    expect(
      appointmentSwapBlockReason({ type: "guida", hasFollowCar: true }),
    ).toBe("follow_car");
  });

  it("prioritizes group/exam over follow_car when several apply", () => {
    expect(
      appointmentSwapBlockReason({ type: "esame", hasFollowCar: true }),
    ).toBe("exam");
    expect(
      appointmentSwapBlockReason({ type: "guida", groupLessonId: "gl1", hasFollowCar: true }),
    ).toBe("group_lesson");
  });

  it("has a user-facing message for every reason", () => {
    for (const reason of ["group_lesson", "exam", "follow_car"] as const) {
      expect(SWAP_BLOCK_MESSAGES[reason]).toBeTruthy();
    }
  });
});
