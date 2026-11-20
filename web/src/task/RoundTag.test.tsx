import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { roundLabel, TaskTitle, titleText } from "./RoundTag";

// The round number after a title (SPEC 4.17): "#3" for rounds, "v3" for
// versions, nothing for a task with no round.
describe("round tag", () => {
  it("shows #N for a round", () => {
    const { container } = render(<TaskTitle task={{ title: "Clean home", round_no: 3, round_kind: "round" }} />);
    expect(container.textContent).toBe("Clean home#3");
    expect(container.querySelector(".jb-round-tag")?.textContent).toBe("#3");
  });

  it("shows vN for a version", () => {
    const { container } = render(<TaskTitle task={{ title: "Board layout", round_no: 2, round_kind: "version" }} />);
    expect(container.querySelector(".jb-round-tag")?.textContent).toBe("v2");
  });

  it("shows nothing for a task with no round, or a linked task without round fields", () => {
    const { container } = render(
      <>
        <TaskTitle task={{ title: "Set up NVR", round_no: null, round_kind: null }} />
        <TaskTitle task={{ title: "Wire garage camera" }} />
      </>,
    );
    expect(container.querySelector(".jb-round-tag")).toBeNull();
    expect(container.textContent).toBe("Set up NVRWire garage camera");
  });

  it("reads as plain text with a space, for tooltips", () => {
    expect(titleText({ title: "Clean home", round_no: 4, round_kind: null })).toBe("Clean home #4");
    expect(titleText({ title: "Clean home", round_no: null })).toBe("Clean home");
    expect(roundLabel(1, "version")).toBe("v1");
  });
});
