import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

// Settings search: typing shows "Search results"; choosing a section from the
// menu opens it and clears the search; Escape and the clear button leave
// the search; a query with no match says so.
vi.mock("../auth/AuthGate", () => ({ useAuth: () => ({ user: { is_admin: true } }) }));
vi.mock("../terms", async (orig) => {
  const mod = await orig<typeof import("../terms")>();
  return { ...mod, useTerms: () => mod.makeTerms(mod.DEFAULT_TERMS) };
});
Element.prototype.scrollIntoView = vi.fn();
const stub = (name: string) => () => <div>{`body of ${name}`}</div>;
vi.mock("./LookupSettings", () => ({
  AreaSettings: stub("Areas"),
  EnergyTypeSettings: stub("Energy"),
  PrioritySettings: stub("Priorities"),
  StatusSettings: stub("Statuses"),
  SubtypeSettings: stub("Subtypes"),
}));
vi.mock("./ReflectionSettings", () => ({ ReflectionSettings: stub("Reflection") }));
vi.mock("./CaptureSettings", () => ({ CaptureSettings: stub("Capture") }));
vi.mock("./CustomFieldSettings", () => ({ CustomFieldSettings: stub("Custom") }));
vi.mock("./TaskDateSettings", () => ({ TaskDateSettings: stub("Dates") }));
vi.mock("./DefaultPrioritySettings", () => ({ DefaultPrioritySettings: stub("DefaultPriority") }));
vi.mock("./SnoozeSettings", () => ({ SnoozeSettings: stub("Snooze") }));
vi.mock("./CardActionSettings", () => ({ CardActionSettings: stub("CardActions") }));
vi.mock("./CompletenessSettings", () => ({ CompletenessSettings: stub("Completeness") }));
vi.mock("./SemanticSettings", () => ({ SemanticSettings: stub("Semantic") }));
vi.mock("../auth/AccountSettings", () => ({ AccountSettings: stub("Account") }));
vi.mock("../auth/UsersSettings", () => ({ UsersSettings: stub("Users") }));
vi.mock("../theme/AppearanceSettings", () => ({ AppearanceSettings: stub("Appearance") }));
vi.mock("./ScreensSettings", () => ({ ScreensSettings: stub("Screens") }));
vi.mock("./NamesSettings", () => ({ NamesSettings: stub("Names") }));
vi.mock("./TagsSettings", () => ({ TagsSettings: stub("Tags") }));
vi.mock("./AboutSettings", () => ({ AboutSettings: stub("About") }));
vi.mock("./AppsSettings", () => ({ AppsSettings: stub("Apps") }));
const { Settings } = await import("./Settings");

function Host() {
  const [section, setSection] = useState<string | undefined>("areas");
  return <Settings section={section} onSection={setSection} />;
}

describe("Settings search", () => {
  it("lists matches, then a menu choice opens that section and clears the search", () => {
    render(<Host />);
    expect(screen.getByText("body of Areas")).toBeTruthy();
    const box = screen.getByLabelText("Search settings") as HTMLInputElement;
    fireEvent.change(box, { target: { value: "snooze" } });
    expect(screen.getByRole("heading", { name: "Search results" })).toBeTruthy();

    // The menu now holds only the sections with a match; pick one.
    fireEvent.click(screen.getByRole("menuitem", { name: "Snooze" }));
    expect(screen.queryByRole("heading", { name: "Search results" })).toBeNull();
    expect(screen.getByText("body of Snooze")).toBeTruthy();
    expect(box.value).toBe("");
  });

  it("Escape leaves the search, and a query with no match says so", () => {
    render(<Host />);
    const box = screen.getByLabelText("Search settings") as HTMLInputElement;
    fireEvent.change(box, { target: { value: "zzzqqq" } });
    expect(screen.getByText(/Nothing in Settings matches "zzzqqq"/)).toBeTruthy();
    fireEvent.keyDown(box, { key: "Escape" });
    expect(box.value).toBe("");
    expect(screen.getByText("body of Areas")).toBeTruthy();
  });
});
