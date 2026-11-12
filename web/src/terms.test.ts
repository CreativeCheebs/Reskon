import { describe, expect, it } from "vitest";
import { capitalise, makeTerms, termWords } from "./terms";

describe("terms", () => {
  it("uses task and epic until the person changes them", () => {
    const t = makeTerms(termWords({}));
    expect([t.task, t.tasks, t.epic, t.epics]).toEqual(["task", "tasks", "epic", "epics"]);
    expect([t.Task, t.Tasks, t.Epic, t.Epics]).toEqual(["Task", "Tasks", "Epic", "Epics"]);
  });
  it("takes the words as typed and only raises the first letter", () => {
    const t = makeTerms(termWords({ terms: { task: "ToDo", tasks: "ToDos", epic: "story", epics: "stories" } }));
    expect(t.task).toBe("ToDo");
    expect(t.Task).toBe("ToDo");
    expect(t.Epic).toBe("Story");
    expect(t.Epics).toBe("Stories");
  });
  it("keeps the default for a missing, empty or odd word", () => {
    const w = termWords({ terms: { task: "  ", tasks: 5, epic: null, epics: "x".repeat(25) } });
    expect(w).toEqual({ task: "task", tasks: "tasks", epic: "epic", epics: "epics" });
    expect(termWords({ terms: "todo" }).task).toBe("task");
    expect(termWords({ terms: ["todo"] }).task).toBe("task");
  });
  it("counts with the singular for one and the plural otherwise", () => {
    const t = makeTerms(termWords({ terms: { task: "todo", tasks: "todos" } }));
    expect(t.countTasks(1)).toBe("1 todo");
    expect(t.countTasks(0)).toBe("0 todos");
    expect(t.countTasks(3)).toBe("3 todos");
    expect(t.countEpics(2)).toBe("2 epics");
  });
  it("capitalise leaves an empty word alone", () => {
    expect(capitalise("")).toBe("");
  });
});
