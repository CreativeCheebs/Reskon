import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { pressable } from "./a11y";
import { expectNoA11yViolations } from "./test/a11y";

describe("pressable", () => {
  it("is reachable with Tab and pressed with Enter or Space", async () => {
    const onPress = vi.fn();
    render(<div {...pressable(onPress, "Open task")}>Fix the shed</div>);
    await userEvent.tab();
    expect(screen.getByRole("button", { name: "Open task" })).toHaveFocus();
    await userEvent.keyboard("{Enter}");
    await userEvent.keyboard(" ");
    expect(onPress).toHaveBeenCalledTimes(2);
  });

  it("still opens on a mouse click", async () => {
    const onPress = vi.fn();
    render(<div {...pressable(onPress, "Open task")}>Fix the shed</div>);
    await userEvent.click(screen.getByRole("button"));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("leaves keys pressed inside a child alone", async () => {
    const onPress = vi.fn();
    render(
      <div {...pressable(onPress, "Row")}>
        <input aria-label="Title" />
      </div>,
    );
    screen.getByLabelText("Title").focus(); // not clicked: a click would bubble up as a click on the row
    await userEvent.keyboard("{Enter} ");
    expect(onPress).not.toHaveBeenCalled();
  });

  it("adds nothing when there is nothing to press", () => {
    expect(pressable(undefined)).toEqual({});
  });

  it("passes the automatic accessibility check", async () => {
    const { container } = render(<div {...pressable(() => {}, "Open task")}>Fix the shed</div>);
    await expectNoA11yViolations(container);
  });
});
