import { useEffect, useRef, useState, type ReactNode } from "react";
import { Menu, Select } from "antd";
import { AreaSettings, EnergyTypeSettings, PrioritySettings, StatusSettings, SubtypeSettings } from "./LookupSettings";
import { ReflectionSettings } from "./ReflectionSettings";
import { CaptureSettings } from "./CaptureSettings";
import { CustomFieldSettings } from "./CustomFieldSettings";
import { TaskDateSettings } from "./TaskDateSettings";
import { SnoozeSettings } from "./SnoozeSettings";
import { CardActionSettings } from "./CardActionSettings";
import { CompletenessSettings } from "./CompletenessSettings";
import { SemanticSettings } from "./SemanticSettings";
import { AccountSettings } from "../auth/AccountSettings";
import { UsersSettings } from "../auth/UsersSettings";
import { useAuth } from "../auth/AuthGate";
import { AppearanceSettings } from "../theme/AppearanceSettings";

// Settings: sections grouped in a menu on the left, or in a picker above
// the section when the screen is too narrow for both. The open section is
// in the URL (#/settings/statuses) so a reload or a link lands on it. Each
// section is a title, one short intro, and its controls in a panel.

interface Section {
  key: string;
  label: string;
  intro?: ReactNode;
  render: () => ReactNode;
  adminOnly?: boolean;
  /** Draws its own cards, so it is not put in a panel. */
  bare?: boolean;
}

const GROUPS: { label: string; sections: Section[] }[] = [
  {
    label: "Workflow",
    sections: [
      {
        key: "areas",
        label: "Areas",
        intro: "Every task belongs to one area, such as Main job, Personal or Freelance.",
        render: () => <AreaSettings />,
      },
      {
        key: "statuses",
        label: "Statuses",
        intro: "The stages a task moves through. Their order is the order of the board's columns.",
        render: () => <StatusSettings />,
      },
      {
        key: "priorities",
        label: "Priorities",
        intro: "How much a task matters. A priority's weight multiplies the points its task earns.",
        render: () => <PrioritySettings />,
      },
      {
        key: "dates",
        label: "Task dates",
        intro:
          "Start and end dates can always be set by hand in the task panel. Turned on here, a move fills them in with today's date when they are empty. Reopening a finished task clears its end date.",
        render: () => <TaskDateSettings />,
      },
      {
        key: "snooze",
        label: "Snooze",
        intro:
          "Snoozing hides an open task (to do or in progress) from boards and tables for some days, without changing its status. Snoozed tasks are listed under Snoozed beside the hidden statuses, and come back on their own.",
        render: () => <SnoozeSettings />,
      },
      {
        key: "details",
        label: "Complete details",
        intro:
          "The details an open task should have, such as a start date, an estimate or an intensity. This is about a task's information, not whether the work is done. Tasks missing any are listed under Incomplete in each view.",
        render: () => <CompletenessSettings />,
      },
      {
        key: "card-actions",
        label: "Card actions",
        intro:
          "Quick actions on board cards. Buttons appear when you hover a card or tab to it; the card's More button holds every action that isn't a button. Right-click a card for the menu.",
        render: () => <CardActionSettings />,
      },
      {
        key: "custom",
        label: "Custom fields",
        intro:
          "Fields stored on tasks or sessions without a schema change. Filter by them in a view's settings; show them on cards with the view's card configuration.",
        render: () => <CustomFieldSettings />,
      },
    ],
  },
  {
    label: "Time and points",
    sections: [
      {
        key: "energy",
        label: "Energy types",
        intro:
          "Every type is equal and every type earns points: hours × the type's rate × intensity. Types are added up, never set against each other.",
        render: () => <EnergyTypeSettings />,
      },
      {
        key: "subtypes",
        label: "Subtypes",
        intro: "Each subtype belongs to one energy type. The rank weights set how much a session's 1st to 4th subtype count.",
        render: () => <SubtypeSettings />,
      },
      { key: "reflection", label: "Reflection", intro: "What the reflection charts and the Drift widget read.", render: () => <ReflectionSettings /> },
    ],
  },
  {
    label: "Connections",
    sections: [
      {
        key: "capture",
        label: "Quick capture",
        intro: (
          <>
            Any OpenAI-compatible endpoint works, local or hosted (for Ollama: <code>http://host:11434/v1</code>). Leave it blank to
            use the manual form. If the model is down or takes more than 5 seconds, capture falls back to the manual form.
          </>
        ),
        render: () => <CaptureSettings />,
      },
      {
        key: "search",
        label: "Duplicate search",
        intro: "While you type a new task, or search a view, tasks like it are listed so you don't add the same one twice.",
        render: () => <SemanticSettings />,
      },
    ],
  },
  {
    label: "You",
    sections: [
      {
        key: "appearance",
        label: "Appearance",
        intro: "Built-in themes use the exact colours from their published design tokens. Your choice is saved to your account and follows you to other devices.",
        render: () => <AppearanceSettings />,
        bare: true,
      },
      { key: "account", label: "Account", render: () => <AccountSettings /> },
    ],
  },
  {
    label: "Admin",
    sections: [
      {
        key: "users",
        label: "People",
        intro: "Everyone has their own separate board, sessions and settings. Nobody, including admins, can see another person's data in the app.",
        render: () => <UsersSettings />,
        adminOnly: true,
      },
    ],
  },
];

/** Below this width the menu moves above the section as a picker. */
const SIDE_BY_SIDE_MIN = 900;

export function Settings({ section, onSection }: { section?: string; onSection: (key: string) => void }) {
  const { user } = useAuth();
  const groups = GROUPS.map((g) => ({ ...g, sections: g.sections.filter((s) => !s.adminOnly || user.is_admin) })).filter(
    (g) => g.sections.length > 0,
  );
  const all = groups.flatMap((g) => g.sections);
  const current = all.find((s) => s.key === section) ?? all[0];

  const root = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(1200);
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const stacked = width < SIDE_BY_SIDE_MIN;

  // Keep the chosen entry in view when the menu is taller than the screen.
  const nav = useRef<HTMLElement>(null);
  useEffect(() => {
    nav.current?.querySelector(".ant-menu-item-selected")?.scrollIntoView({ block: "nearest" });
  }, [current.key, stacked]);

  const body = (
    <section className="jb-settings-body" aria-labelledby="jb-settings-title">
      <h2 id="jb-settings-title" className="jb-settings-title">
        {current.label}
      </h2>
      {current.intro && <p className="jb-settings-intro">{current.intro}</p>}
      {current.bare ? current.render() : <div className="jb-settings-panel">{current.render()}</div>}
    </section>
  );

  if (stacked)
    return (
      <div ref={root} className="jb-settings jb-settings-stacked">
        <div className="jb-settings-head">
          <h1 className="jb-settings-page">Settings</h1>
          <Select
            aria-label="Settings section"
            value={current.key}
            onChange={onSection}
            style={{ width: 220 }}
            options={groups.map((g) => ({ label: g.label, options: g.sections.map((s) => ({ value: s.key, label: s.label })) }))}
          />
        </div>
        {body}
      </div>
    );

  return (
    <div ref={root} className="jb-settings">
      <nav ref={nav} className="jb-settings-nav-col" aria-label="Settings sections">
        <h1 className="jb-settings-page">Settings</h1>
        <Menu
          theme="dark"
          mode="inline"
          className="jb-settings-nav"
          selectedKeys={[current.key]}
          onClick={(e) => onSection(e.key)}
          items={groups.map((g) => ({
            type: "group" as const,
            key: g.label,
            label: <span className="jb-nav-heading">{g.label}</span>,
            children: g.sections.map((s) => ({ key: s.key, label: s.label })),
          }))}
        />
      </nav>
      {body}
    </div>
  );
}
