import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

// Copy as Markdown: the clipboard when the browser offers it, the older copy
// command when it does not (plain http), and a box to copy by hand last.
// "Copied" is only ever said when a copy really happened.
const success = vi.fn();
const failure = vi.fn();
vi.mock("../theme/feedback", () => ({ message: { success: (...a: unknown[]) => success(...a), error: (...a: unknown[]) => failure(...a), info: vi.fn(), warning: vi.fn() } }));
const { CopyMarkdownButton, copyText } = await import("./CopyMarkdown");

const TEXT = "## Sunday 15 November 2026 — 45m, 3 points\n- Reading — 45m\n";

function setClipboard(value: unknown) {
  Object.defineProperty(navigator, "clipboard", { value, configurable: true });
}
function setExec(fn: (() => boolean) | undefined) {
  Object.defineProperty(document, "execCommand", { value: fn, configurable: true, writable: true });
}

afterEach(() => {
  success.mockClear();
  failure.mockClear();
  setClipboard(undefined);
  setExec(undefined);
});

describe("Copy as Markdown", () => {
  it("copies through the clipboard and says Copied", async () => {
    const writeText = vi.fn(async () => undefined);
    setClipboard({ writeText });
    render(<CopyMarkdownButton day="2026-11-15" markdown={TEXT} />);
    fireEvent.click(screen.getByRole("button", { name: "Copy as Markdown, Sun 15 Nov" }));
    await waitFor(() => expect(success).toHaveBeenCalledWith("Copied"));
    expect(writeText).toHaveBeenCalledWith(TEXT);
  });

  it("falls back to the older copy command when there is no clipboard (a page opened over plain http)", async () => {
    let copied = "";
    setExec(() => {
      copied = (document.querySelector("textarea[readonly]") as HTMLTextAreaElement).value;
      return true;
    });
    render(<CopyMarkdownButton day="2026-11-15" markdown={TEXT} />);
    fireEvent.click(screen.getByRole("button", { name: /Copy as Markdown, Sun 15 Nov/ }));
    await waitFor(() => expect(success).toHaveBeenCalledWith("Copied"));
    expect(copied).toBe(TEXT);
    expect(document.querySelector("textarea[readonly]")).toBeNull(); // the helper box is removed again
  });

  it("falls back when the clipboard refuses", async () => {
    setClipboard({ writeText: vi.fn(async () => { throw new Error("denied"); }) });
    setExec(() => true);
    expect(await copyText(TEXT)).toBe(true);
  });

  it("shows the text in a box to copy by hand when nothing works, and does not say Copied", async () => {
    setExec(() => false);
    render(<CopyMarkdownButton day="2026-11-15" markdown={TEXT} />);
    fireEvent.click(screen.getByRole("button", { name: /Copy as Markdown, Sun 15 Nov/ }));
    const box = (await screen.findByRole("textbox", { name: "Sun 15 Nov as Markdown" })) as HTMLTextAreaElement;
    expect(box.value).toBe(TEXT);
    expect(box.readOnly).toBe(true);
    expect(success).not.toHaveBeenCalled();
  });

  it("asks for the day's text when it is not in hand, and copies what comes back", async () => {
    const writeText = vi.fn(async () => undefined);
    setClipboard({ writeText });
    const fetchMarkdown = vi.fn(async () => TEXT);
    render(<CopyMarkdownButton day="2026-11-15" markdown={undefined} fetchMarkdown={fetchMarkdown} />);
    fireEvent.click(screen.getByRole("button", { name: /Copy as Markdown, Sun 15 Nov/ }));
    await waitFor(() => expect(success).toHaveBeenCalledWith("Copied"));
    expect(fetchMarkdown).toHaveBeenCalledOnce();
    expect(writeText).toHaveBeenCalledWith(TEXT);
  });

  it("uses the text in hand without asking again", async () => {
    setClipboard({ writeText: vi.fn(async () => undefined) });
    const fetchMarkdown = vi.fn(async () => "other");
    render(<CopyMarkdownButton day="2026-11-15" markdown={TEXT} fetchMarkdown={fetchMarkdown} />);
    fireEvent.click(screen.getByRole("button", { name: /Copy as Markdown, Sun 15 Nov/ }));
    await waitFor(() => expect(success).toHaveBeenCalled());
    expect(fetchMarkdown).not.toHaveBeenCalled();
  });

  it("says so, and copies nothing, when the text cannot be fetched", async () => {
    const writeText = vi.fn(async () => undefined);
    setClipboard({ writeText });
    render(<CopyMarkdownButton day="2026-11-15" fetchMarkdown={async () => null} />);
    fireEvent.click(screen.getByRole("button", { name: /Copy as Markdown, Sun 15 Nov/ }));
    await waitFor(() => expect(failure).toHaveBeenCalled());
    expect(writeText).not.toHaveBeenCalled();
    expect(success).not.toHaveBeenCalled();
  });

  it("is switched off when there is neither text nor a way to get it", () => {
    render(<CopyMarkdownButton day="2026-11-15" />);
    expect((screen.getByRole("button", { name: /Copy as Markdown, Sun 15 Nov/ }) as HTMLButtonElement).disabled).toBe(true);
  });
});
