import { useEffect, useRef, useState } from "react";
import { Button, Input, Modal, Typography, type InputRef } from "antd";
import { SearchOutlined } from "@ant-design/icons";
import { api } from "../api";
import { useApp } from "../store";
import { TaskPanel } from "../task/TaskPanel";
import { LoadingDots, SimilarTasksList, useSimilarTasks } from "../task/SimilarTasks";
import type { TaskBrief } from "../types";

// Search every task from anywhere: "/" (outside a text field) or the
// sidebar's Search. Matching is the server's duplicate search (words and
// meaning), plus an exact task key ("PER-12"). A result opens the task's
// panel over whatever screen is showing.

export const SEARCH_SHORTCUT = "/";

const KEY = /^[A-Za-z][A-Za-z0-9]*-\d+$/;

function typing(el: Element | null): boolean {
  if (!el) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || (el as HTMLElement).isContentEditable;
}

export function GlobalSearch({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { reloadBootstrap } = useApp();
  const [text, setText] = useState("");
  const [task, setTask] = useState<number | null>(null);
  const [byKey, setByKey] = useState<TaskBrief | null>(null);
  const changed = useRef(false);
  const input = useRef<InputRef>(null);
  const similar = useSimilarTasks(text, { enabled: open });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "/" && !e.ctrlKey && !e.metaKey && !e.altKey && !typing(document.activeElement) && !document.querySelector(".ant-modal-wrap, .ant-drawer-open")) {
        e.preventDefault();
        onOpenChange(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onOpenChange]);

  // A task key typed whole jumps straight to that task.
  useEffect(() => {
    const q = text.trim().toUpperCase();
    if (!open || !KEY.test(q)) {
      setByKey(null);
      return;
    }
    api
      .get<TaskBrief[]>("/tasks?brief=1")
      .then((bs) => setByKey(bs.find((b) => b.key.toUpperCase() === q) ?? null))
      .catch(() => undefined);
  }, [text, open]);

  const show = (id: number) => {
    onOpenChange(false);
    setText("");
    setTask(id);
  };
  const first = byKey?.id ?? similar.result?.results[0]?.id;

  return (
    <>
      <Modal
        open={open}
        title={null}
        closable={false}
        footer={null}
        width={600}
        style={{ top: 80 }}
        onCancel={() => onOpenChange(false)}
        transitionName=""
        maskTransitionName=""
        afterOpenChange={(o) => o && input.current?.focus()}
      >
        <Input
          ref={input}
          autoFocus
          size="large"
          prefix={<SearchOutlined />}
          suffix={similar.loading ? <LoadingDots /> : <span />}
          placeholder="Search every task by words, meaning or key"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onPressEnter={() => first && show(first)}
        />
        {byKey && (
          <Button type="link" onClick={() => show(byKey.id)} style={{ display: "block", height: "auto", padding: "8px 6px 0", textAlign: "left" }}>
            {byKey.key} · {byKey.title}
          </Button>
        )}
        <SimilarTasksList {...similar} heading="Tasks" onOpen={show} />
        <Typography.Text type="secondary" style={{ fontSize: 11 }}>
          Enter opens the first · Esc closes · {SEARCH_SHORTCUT} opens this from anywhere
        </Typography.Text>
      </Modal>
      {task !== null && (
        <TaskPanel
          taskId={task}
          onClose={() => {
            setTask(null);
            // The screen underneath may show the task: load it again.
            if (changed.current) {
              changed.current = false;
              reloadBootstrap().catch(() => undefined);
            }
          }}
          onChanged={() => (changed.current = true)}
          onDeleted={() => (changed.current = true)}
        />
      )}
    </>
  );
}
