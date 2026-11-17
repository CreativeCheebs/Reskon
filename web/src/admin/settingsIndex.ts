// The list the Settings search reads. One line per setting: which section it
// is in, its name, and a one-line plain-English description. The search
// matches the name AND the description, so put the words a person would
// type in the description ("hide", "colour", "password").
//
// To add a setting: add one entry here with the `key` of the section it is
// shown in (the keys are in Settings.tsx). A test fails if a section has no
// entry or an entry names a section that does not exist.

export interface SettingEntry {
  /** The key of the section the setting is in (see Settings.tsx). */
  section: string;
  title: string;
  /** One short sentence, plain words. */
  description: string;
}

export const SETTINGS_INDEX: SettingEntry[] = [
  // Workflow
  { section: "areas", title: "Areas", description: "The parts of your life or work that tasks belong to, each with a key prefix, a colour and a default energy type." },
  { section: "tags", title: "Tags", description: "Short words you can put on tasks and sessions, such as backend or q4." },
  { section: "statuses", title: "Statuses", description: "The stages a task moves through; their order is the order of the board's columns." },
  { section: "statuses", title: "Show on the board", description: "Choose whether a status gets a column on the board or stays hidden, like Backlog." },
  { section: "priorities", title: "Priorities", description: "How much a task matters; the weight multiplies the points it earns." },
  { section: "default-priority", title: "Default priority", description: "The priority a new task gets when you don't pick one (Normal to start with), or None to leave it empty." },
  { section: "dates", title: "Task dates", description: "Fill in a task's start and end date automatically when it moves to a chosen status." },
  { section: "snooze", title: "Snooze", description: "Hide a task for some days without changing its status; it comes back on its own." },
  { section: "snooze", title: "Longest snooze", description: "The most days a task can be snoozed for." },
  { section: "snooze", title: "Snooze menu", description: "The ready-made snooze choices (tomorrow, 1 week, 1 month...): add, remove and put them in order." },
  { section: "details", title: "Complete details", description: "The details an open task should have, such as an estimate or due date; tasks missing them are listed as incomplete." },
  { section: "card-actions", title: "Card actions", description: "Which quick actions are buttons on a board card and which are in the right-click menu." },
  { section: "custom", title: "Custom fields", description: "Your own extra fields on tasks or sessions, such as a customer name or a ticket number." },
  // Time and points
  { section: "energy", title: "Energy types", description: "The kinds of effort you log; each earns points per hour at its own rate." },
  { section: "subtypes", title: "Subtypes", description: "Finer kinds inside an energy type, with rank weights for a session's first to fourth subtype." },
  { section: "reflection", title: "Reflection", description: "Which day the week starts on, which every chart grouped by week follows." },
  { section: "reflection", title: "Weeks start on", description: "Choose which day of the week charts and weekly totals start on." },
  // Connections
  { section: "apps", title: "Apps", description: "Connect other apps you run, such as a habit tracker, so their widgets can show on your dashboards." },
  { section: "capture", title: "Quick capture", description: "Connect a language model (an OpenAI-compatible address, model name and key) that fills in the quick-add form for you." },
  { section: "search", title: "Duplicate search", description: "Warns about similar tasks while you type a title; download a small local model to match by meaning." },
  // You
  { section: "screens", title: "Screens", description: "Turn the Day screen (morning plan and evening readout) on or off in the sidebar and on the phone." },
  { section: "names", title: "Names", description: "Call tasks and epics what you like, such as todos or stories." },
  { section: "appearance", title: "Appearance", description: "Pick a colour theme, or upload your own; saved to your account and shared with your devices." },
  { section: "appearance", title: "Theme: System, Light or Dark", description: "System follows your computer's light or dark mode and switches with it; Light and Dark stay as chosen." },
  { section: "account", title: "Account", description: "Change your password." },
  { section: "about", title: "About", description: "The version of Reskon you are running and when it was built." },
  // Admin
  { section: "users", title: "People", description: "Add people who can sign in to this server, reset passwords and remove accounts; each has separate data." },
];

export interface SectionLike {
  key: string;
  label: string;
}

export interface SearchHit {
  section: string;
  /** The section's name, for showing where a hit lives. */
  sectionLabel: string;
  entry: SettingEntry;
}

/** The entries matching every word of the query, in the index's order. Only
 *  sections in `sections` count (the caller leaves out what the person
 *  cannot see). A blank query matches nothing; callers show everything then. */
export function searchSettings(query: string, sections: SectionLike[], index: SettingEntry[] = SETTINGS_INDEX): SearchHit[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const label = new Map(sections.map((s) => [s.key, s.label]));
  const hits: SearchHit[] = [];
  for (const entry of index) {
    const sectionLabel = label.get(entry.section);
    if (sectionLabel === undefined) continue;
    const text = `${entry.title} ${entry.description} ${sectionLabel}`.toLowerCase();
    if (words.every((w) => text.includes(w))) hits.push({ section: entry.section, sectionLabel, entry });
  }
  return hits;
}
