import { useEffect, useRef, useState, type ReactNode } from "react";
import { Input, Menu, Select } from "antd";
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
import { ScreensSettings } from "./ScreensSettings";
import { useTerms, type Terms } from "../terms";
import { NamesSettings } from "./NamesSettings";
import { TagsSettings } from "./TagsSettings";
import { AboutSettings } from "./AboutSettings";
import { AppsSettings } from "./AppsSettings";
import { searchSettings } from "./settingsIndex";

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

export const groupsFor = (T: Terms): { label: string; sections: Section[] }[] => [
  {
    label: "Workflow",
    sections: [
      {
        key: "areas",
        label: "Areas",
        intro: `Every ${T.task} belongs to one area, such as Main job, Personal or Freelance.`,
        render: () => <AreaSettings />,
      },
      {
        key: "tags",
        label: "Tags",
        intro: `Short words you can put on ${T.tasks} and sessions, such as backend or q4. They sit beside the area and the ${T.epic}.`,
        render: () => <TagsSettings />,
      },
      {
        key: "statuses",
        label: "Statuses",
        intro: `The stages every ${T.task} moves through. Their order is the order of the board's columns.`,
        render: () => <StatusSettings />,
      },
      {
        key: "priorities",
        label: "Priorities",
        intro: `How much each ${T.task} matters. A priority's weight multiplies the points its ${T.task} earns.`,
        render: () => <PrioritySettings />,
      },
      {
        key: "dates",
        label: `${T.Task} dates`,
        intro:
          `Start and end dates can always be set by hand in the ${T.task} panel. Turned on here, a move fills them in with today's date when they are empty. Reopening a finished ${T.task} clears its end date.`,
        render: () => <TaskDateSettings />,
      },
      {
        key: "snooze",
        label: "Snooze",
        intro:
          `Snoozing hides an open ${T.task} (to do or in progress) from boards and tables for some days, without changing its status. Snoozed ${T.tasks} are listed under Snoozed beside the hidden statuses, and come back on their own.`,
        render: () => <SnoozeSettings />,
      },
      {
        key: "details",
        label: "Complete details",
        intro:
          `The details an open ${T.task} should have, such as a start date, an estimate or a level. This is about the ${T.task}'s information, not whether the work is done. ${T.Tasks} missing any are listed under Incomplete in each view.`,
        render: () => <CompletenessSettings />,
      },
      {
        key: "card-actions",
        label: "Card actions",
        intro:
          "Quick actions on board cards. Buttons appear when you hover a card or tab to it; the card's More button holds every action that isn't a button. Right-click a card, or a row in the list, for the menu.",
        render: () => <CardActionSettings />,
      },
      {
        key: "custom",
        label: "Custom fields",
        intro:
          `Fields stored on ${T.tasks} or sessions without a schema change. Filter by them in a view's settings; show them on cards with the view's card configuration.`,
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
          "Every type is equal and every type earns points: hours × the type's rate × level. Types are added up, never set against each other.",
        render: () => <EnergyTypeSettings />,
      },
      {
        key: "subtypes",
        label: "Subtypes",
        intro: "Each subtype belongs to one energy type. The rank weights set how much a session's 1st to 4th subtype count.",
        render: () => <SubtypeSettings />,
      },
      { key: "reflection", label: "Reflection", intro: "How the reflection charts group weeks.", render: () => <ReflectionSettings /> },
    ],
  },
  {
    label: "Connections",
    sections: [
      {
        key: "apps",
        label: "Apps",
        intro: (
          <>
            Connect other apps you run, such as a habit tracker, so their widgets can show on your dashboards. Sign in once here; Reskon keeps the
            sign-in on its server. How to make an app work with Reskon is in <code>docs/plugins.md</code>.
          </>
        ),
        render: () => <AppsSettings />,
      },
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
        intro: `While you type a title, or search a view, ${T.tasks} like it are listed so you don't add the same one twice.`,
        render: () => <SemanticSettings />,
      },
    ],
  },
  {
    label: "You",
    sections: [
      {
        key: "screens",
        label: "Screens",
        intro: "Choose which screens are offered. The phone follows the same choice.",
        render: () => <ScreensSettings />,
      },
      {
        key: "names",
        label: "Names",
        intro: "Call tasks and epics what you like, such as todos or stories. The phone follows the same choice.",
        render: () => <NamesSettings />,
      },
      {
        key: "appearance",
        label: "Appearance",
        intro: "Built-in themes use the exact colours from their published design tokens. Your choice is saved to your account and follows you to other devices.",
        render: () => <AppearanceSettings />,
        bare: true,
      },
      { key: "account", label: "Account", render: () => <AccountSettings /> },
      { key: "about", label: "About", render: () => <AboutSettings /> },
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
  const T = useTerms();
  const groups = groupsFor(T).map((g) => ({ ...g, sections: g.sections.filter((s) => !s.adminOnly || user.is_admin) })).filter(
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

  // The search box: while it has words, the menu keeps only the sections
  // with a match and the body lists the matching settings (name and
  // description; see settingsIndex.ts). Choosing one opens its section.
  const [query, setQuery] = useState("");
  const searching = query.trim() !== "";
  const hits = searchSettings(query, all);
  const hitSections = new Set(hits.map((h) => h.section));
  const shownGroups = searching ? groups.map((g) => ({ ...g, sections: g.sections.filter((s) => hitSections.has(s.key)) })).filter((g) => g.sections.length > 0) : groups;
  const open = (key: string) => {
    setQuery("");
    onSection(key);
  };
  const search = (
    <Input.Search
      allowClear
      size="small"
      placeholder="Search settings"
      aria-label="Search settings"
      value={query}
      onChange={(e) => setQuery(e.target.value)}
      onKeyDown={(e) => e.key === "Escape" && setQuery("")}
      style={{ marginBottom: 8, width: stacked ? 220 : undefined }}
    />
  );

  const results = (
    <section className="jb-settings-body" aria-labelledby="jb-settings-title">
      <h2 id="jb-settings-title" className="jb-settings-title">
        Search results
      </h2>
      {hits.length === 0 ? (
        <p className="jb-settings-intro">Nothing in Settings matches "{query.trim()}".</p>
      ) : (
        <ul className="jb-settings-results" style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {hits.map((h) => (
            <li key={`${h.section}:${h.entry.title}`} style={{ marginBottom: 10 }}>
              <a
                href={`#/settings/${h.section}`}
                onClick={(e) => {
                  e.preventDefault();
                  open(h.section);
                }}
              >
                <strong>{h.entry.title}</strong>
              </a>
              <span style={{ opacity: 0.65 }}> in {h.sectionLabel}</span>
              <div style={{ opacity: 0.85 }}>{h.entry.description}</div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );

  const body = searching ? results : (
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
          {search}
          <Select
            aria-label="Settings section"
            value={current.key}
            onChange={onSection}
            style={{ width: 220 }}
            options={shownGroups.map((g) => ({ label: g.label, options: g.sections.map((s) => ({ value: s.key, label: s.label })) }))}
          />
        </div>
        {body}
      </div>
    );

  return (
    <div ref={root} className="jb-settings">
      <nav ref={nav} className="jb-settings-nav-col" aria-label="Settings sections">
        <h1 className="jb-settings-page">Settings</h1>
        {search}
        <Menu
          theme="dark"
          mode="inline"
          className="jb-settings-nav"
          selectedKeys={searching ? [] : [current.key]}
          onClick={(e) => onSection(e.key)}
          items={shownGroups.map((g) => ({
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
