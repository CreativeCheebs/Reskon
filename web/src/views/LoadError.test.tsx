import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LoadError } from "./LoadError";
import { expectNoA11yViolations } from "../test/a11y";

describe("LoadError", () => {
  it("says what went wrong and retries when asked", async () => {
    const onRetry = vi.fn();
    render(<LoadError message="Server answered 500" onRetry={onRetry} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Server answered 500");
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("warns that data may be old when it sits on top of stale data", () => {
    render(<LoadError message="timeout" onRetry={() => {}} stale />);
    expect(screen.getByRole("alert")).toHaveTextContent(/out of date/i);
  });

  it("passes the automatic accessibility check", async () => {
    const { container } = render(<LoadError message="x" onRetry={() => {}} />);
    await expectNoA11yViolations(container);
  });
});
