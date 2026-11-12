import { useState } from "react";
import { Button, Input, Table, Typography } from "antd";
import { DeleteOutlined } from "@ant-design/icons";
import { api } from "../api";
import { confirm, message } from "../theme/feedback";
import { useApp } from "../store";
import { palette } from "../theme/palette";
import { useTerms } from "../terms";
import { cleanTag, MAX_TAG_LENGTH, tagProblem, useTags } from "../tags/tags";
import type { Tag } from "../types";

// Settings › Tags: the tags in use, with how many tasks and sessions have each.
// Rename one (it changes everywhere), delete one (it comes off everything),
// or add one. Tags are also made by typing a new one where tags are chosen.

export function TagsSettings() {
  const { online, reloadBootstrap } = useApp();
  const T = useTerms();
  const { tags } = useTags();
  const [adding, setAdding] = useState("");

  const run = async (what: () => Promise<unknown>) => {
    try {
      await what();
      await reloadBootstrap();
    } catch (e) {
      message.error((e as Error).message);
    }
  };

  const add = () => {
    const name = cleanTag(adding);
    const problem = tagProblem(name);
    if (problem) return message.error(problem);
    setAdding("");
    return run(() => api.post("/tags", { name }));
  };

  const remove = (t: Tag) =>
    confirm({
      title: `Delete the tag “${t.name}”?`,
      content: `It comes off ${T.countTasks(t.task_count)} and ${t.session_count} session${t.session_count === 1 ? "" : "s"}. The ${T.tasks} and sessions stay.`,
      okText: "Delete",
      okButtonProps: { danger: true },
      onOk: () => run(() => api.del(`/tags/${t.id}`)),
    });

  return (
    <div style={{ maxWidth: 640 }}>
      <Input.Search
        value={adding}
        onChange={(e) => setAdding(e.target.value)}
        onSearch={add}
        disabled={!online}
        maxLength={MAX_TAG_LENGTH + 8}
        enterButton="Add tag"
        placeholder="New tag, e.g. backend"
        aria-label="New tag"
        style={{ marginBottom: 12 }}
      />
      <Table<Tag>
        size="small"
        rowKey="id"
        dataSource={tags}
        pagination={false}
        locale={{ emptyText: "No tags yet. Type one above, or in a task's Tags box." }}
        columns={[
          {
            title: "Tag",
            dataIndex: "name",
            render: (_, t) => <RenameBox tag={t} disabled={!online} onRename={(name) => run(() => api.patch(`/tags/${t.id}`, { name }))} />,
          },
          { title: T.Tasks, dataIndex: "task_count", width: 90, align: "right" },
          { title: "Sessions", dataIndex: "session_count", width: 90, align: "right" },
          {
            title: "",
            width: 50,
            render: (_, t) => <Button type="text" danger disabled={!online} aria-label={`Delete tag ${t.name}`} icon={<DeleteOutlined />} onClick={() => remove(t)} />,
          },
        ]}
      />
      <Typography.Paragraph style={{ color: palette.muted, fontSize: 13, margin: "12px 0 0" }}>
        Names are not case-sensitive: “Backend” and “backend” are the same tag. A session shows its {T.task}&apos;s tags as they are now, plus any tags put on the session itself.
      </Typography.Paragraph>
    </div>
  );
}

/** A tag's name, changed in place: saved when the box is left or Enter is pressed. */
function RenameBox({ tag, disabled, onRename }: { tag: Tag; disabled: boolean; onRename: (name: string) => void }) {
  const [text, setText] = useState(tag.name);
  const save = () => {
    const name = cleanTag(text);
    if (name === tag.name) return setText(tag.name);
    const problem = tagProblem(name);
    if (problem) {
      message.error(problem);
      return setText(tag.name);
    }
    onRename(name);
  };
  return (
    <Input
      size="small"
      value={text}
      disabled={disabled}
      maxLength={MAX_TAG_LENGTH + 8}
      aria-label={`Name of tag ${tag.name}`}
      onChange={(e) => setText(e.target.value)}
      onBlur={save}
      onPressEnter={(e) => e.currentTarget.blur()}
    />
  );
}
