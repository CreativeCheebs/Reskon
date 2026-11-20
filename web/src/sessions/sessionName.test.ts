import { describe, expect, it } from "vitest";
import { descriptionToShow, nameIsLabel, sessionName } from "./sessionName";

const titles = (id: number) => (id === 7 ? "Fix the login" : undefined);

describe("sessionName", () => {
  it("prefers the session's own title", () => {
    expect(sessionName({ title: "Kitchen shelf", task_id: 7, label: "drilled" }, titles, "Task", "–")).toBe("Kitchen shelf");
  });
  it("then the task's title, else a task number", () => {
    expect(sessionName({ title: "  ", task_id: 7, label: "drilled" }, titles, "Task", "–")).toBe("Fix the login");
    expect(sessionName({ title: null, task_id: 9, label: null }, titles, "Task", "–")).toBe("Task #9");
  });
  it("then the label, else the fallback", () => {
    expect(sessionName({ title: null, task_id: null, label: "Dinner" }, titles, "Task", "–")).toBe("Dinner");
    expect(sessionName({ title: null, task_id: null, label: null }, titles, "Task", "–")).toBe("–");
  });
  it("leaves a description out when it repeats the shown name", () => {
    expect(descriptionToShow({ title: null, task_id: 7, label: " Fix the login " }, "Fix the login")).toBeNull();
    expect(descriptionToShow({ title: null, task_id: null, label: "Dinner" }, "Dinner")).toBeNull();
    expect(descriptionToShow({ title: "Mine", task_id: 7, label: "  " }, "Mine")).toBeNull();
    expect(descriptionToShow({ title: null, task_id: 7, label: "drilled" }, "Fix the login")).toBe("drilled");
  });
  it("says when the name is the label", () => {
    expect(nameIsLabel({ title: null, task_id: null })).toBe(true);
    expect(nameIsLabel({ title: null, task_id: 7 })).toBe(false);
    expect(nameIsLabel({ title: "Mine", task_id: null })).toBe(false);
  });
});
