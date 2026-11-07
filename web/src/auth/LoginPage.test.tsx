import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expectNoA11yViolations } from "../test/a11y";
import { LoginPage } from "./LoginPage";

afterEach(() => vi.unstubAllGlobals());

describe("LoginPage", () => {
  it("has no automatic accessibility violations", async () => {
    const { container } = render(<LoginPage setup={false} onSignedIn={() => {}} />);
    await expectNoA11yViolations(container);
  });

  it("shows the server's message for a wrong password and does not sign in", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(new Response(JSON.stringify({ error: "unauthorized", detail: "Wrong username or password." }), { status: 401 }))),
    );
    const onSignedIn = vi.fn();
    render(<LoginPage setup={false} onSignedIn={onSignedIn} />);
    await userEvent.type(screen.getByLabelText("Username"), "alice");
    await userEvent.type(screen.getByLabelText("Password"), "nope");
    await userEvent.click(screen.getByRole("button", { name: /sign in/i }));
    expect(await screen.findByText("Wrong username or password.")).toBeInTheDocument();
    expect(onSignedIn).not.toHaveBeenCalled();
  });

  it("on first run, refuses mismatched passwords without calling the server", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    render(<LoginPage setup onSignedIn={() => {}} />);
    await userEvent.type(screen.getByLabelText("Username"), "admin");
    await userEvent.type(screen.getAllByLabelText(/password/i)[0], "longenough1");
    await userEvent.type(screen.getByLabelText(/confirm/i), "different12");
    await userEvent.click(screen.getByRole("button", { name: /create|set up|sign in/i }));
    await waitFor(() => expect(screen.getByText("The passwords don't match.")).toBeInTheDocument());
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("LoginPage setup token", () => {
  it("asks for the setup token only when the server wants one, and sends it", async () => {
    const fetchSpy = vi.fn(() => Promise.resolve(new Response(JSON.stringify({ user: { id: 1, username: "admin" } }), { status: 200 })));
    vi.stubGlobal("fetch", fetchSpy);
    render(<LoginPage setup tokenRequired onSignedIn={() => {}} />);
    await userEvent.type(screen.getByLabelText("Setup token"), "open-sesame");
    await userEvent.type(screen.getByLabelText("Username"), "admin");
    await userEvent.type(screen.getAllByLabelText(/password/i)[0], "longenough1");
    await userEvent.type(screen.getByLabelText(/confirm/i), "longenough1");
    await userEvent.click(screen.getByRole("button", { name: /create admin account/i }));
    await waitFor(() => expect(fetchSpy).toHaveBeenCalled());
    const [url, init] = fetchSpy.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/auth/setup");
    expect(JSON.parse(init.body as string).setup_token).toBe("open-sesame");
  });

  it("does not show the token field when none is needed", () => {
    render(<LoginPage setup onSignedIn={() => {}} />);
    expect(screen.queryByLabelText("Setup token")).not.toBeInTheDocument();
  });
});
