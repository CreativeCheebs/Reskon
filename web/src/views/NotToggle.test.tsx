import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NotToggle, withNot } from "./NotToggle";

describe("NotToggle", () => {
  it("starts on 'is' and turns the field into 'is not'", async () => {
    const onChange = vi.fn();
    render(<NotToggle field="statuses" not={null} label="Statuses" onChange={onChange} />);
    await userEvent.click(screen.getByText("is not"));
    expect(onChange).toHaveBeenCalledWith(["statuses"]);
  });

  it("shows 'is not' when the field is in the set, and goes back", async () => {
    const onChange = vi.fn();
    render(<NotToggle field="statuses" not={["areas", "statuses"]} label="Statuses" onChange={onChange} />);
    await userEvent.click(screen.getByText("is", { exact: true }));
    expect(onChange).toHaveBeenCalledWith(["areas"]);
  });

  it("keeps the other fields and clears to null when empty", () => {
    expect(withNot(["areas"], "tags", true)).toEqual(["areas", "tags"]);
    expect(withNot(["areas"], "areas", false)).toBeNull();
    expect(withNot(null, "areas", false)).toBeNull();
  });
});
