import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";

const get = vi.fn();
vi.mock("../api", () => ({ api: { get: (...a: unknown[]) => get(...a) } }));
vi.mock("../terms", () => ({ useTerms: () => ({ Task: "Task", task: "task" }) }));

import { CaptureInput } from "./CaptureInput";

const answer = [
  { text: "Order NVR drive", kind: "task", task_id: 7 },
  { text: "ordered milk 1h", kind: "history" },
];

function Harness({ onEnter, onPick }: { onEnter: () => void; onPick: (s: unknown) => void }) {
  const [text, setText] = useState("");
  return <CaptureInput text={text} onText={setText} onEnter={onEnter} onPick={(s) => { onPick(s); setText(s.text); }} />;
}

// user-event does not set the legacy key code that Ant Design lists read, so keys are sent by hand.
const press = (el: HTMLElement, key: string, code: number) => {
  const init = { key, code: key, keyCode: code, which: code };
  fireEvent.keyDown(el, init);
  fireEvent.keyUp(el, init);
};

function setup() {
  const onEnter = vi.fn();
  const onPick = vi.fn();
  render(<Harness onEnter={onEnter} onPick={onPick} />);
  return { onEnter, onPick, box: screen.getByRole("combobox") as HTMLInputElement };
}

describe("Quick capture suggestions", () => {
  beforeEach(() => {
    get.mockReset();
    get.mockResolvedValue(answer);
  });
  afterEach(cleanup);

  it("asks after two letters, not before", async () => {
    const { box } = setup();
    await userEvent.type(box, "o");
    await new Promise((r) => setTimeout(r, 250));
    expect(get).not.toHaveBeenCalled();
    await userEvent.type(box, "r");
    await waitFor(() => expect(get).toHaveBeenCalledTimes(1));
    expect(get.mock.calls[0][0]).toBe("/capture/suggest?q=or");
  });

  it("lists what the server returns", async () => {
    const { box } = setup();
    await userEvent.type(box, "ord");
    expect(await screen.findByText("Order NVR drive")).toBeTruthy();
    expect(screen.getByText("ordered milk 1h")).toBeTruthy();
  });

  it("Down then Enter picks the suggestion and does not read the line", async () => {
    const { box, onEnter, onPick } = setup();
    await userEvent.type(box, "ord");
    await screen.findByText("Order NVR drive");
    press(box, "ArrowDown", 40);
    press(box, "Enter", 13);
    await waitFor(() => expect(onPick).toHaveBeenCalledWith(expect.objectContaining({ text: "Order NVR drive", task_id: 7 })));
    await new Promise((r) => setTimeout(r, 50));
    expect(onEnter).not.toHaveBeenCalled();
    expect(box.value).toBe("Order NVR drive");
  });

  it("clicking a suggestion picks it", async () => {
    const { box, onPick } = setup();
    await userEvent.type(box, "ord");
    fireEvent.click(await screen.findByText("ordered milk 1h"));
    await waitFor(() => expect(onPick).toHaveBeenCalledWith(expect.objectContaining({ text: "ordered milk 1h", kind: "history" })));
    expect(box.value).toBe("ordered milk 1h");
  });

  it("Enter with nothing highlighted reads the line as before", async () => {
    const { box, onEnter, onPick } = setup();
    await userEvent.type(box, "ord");
    await screen.findByText("Order NVR drive");
    press(box, "Enter", 13);
    await waitFor(() => expect(onEnter).toHaveBeenCalledTimes(1));
    expect(onPick).not.toHaveBeenCalled();
    expect(box.value).toBe("ord");
  });

  it("a failed request just shows no suggestions", async () => {
    get.mockRejectedValue(new Error("offline"));
    const { box, onEnter } = setup();
    await userEvent.type(box, "ord");
    press(box, "Enter", 13);
    await waitFor(() => expect(onEnter).toHaveBeenCalled());
    expect(screen.queryByText("Order NVR drive")).toBeNull();
  });
});
