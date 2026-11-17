import { useState } from "react";
import { Button, Form, InputNumber, List, Space, Tooltip } from "antd";
import { ArrowDownOutlined, ArrowUpOutlined, DeleteOutlined } from "@ant-design/icons";
import { autosave } from "../theme/feedback";
import { useApp } from "../store";
import { useTerms } from "../terms";
import {
  DEFAULT_SNOOZE_INTERVALS,
  MAX_SNOOZE_INTERVALS,
  intervalLabel,
  snoozeMaxDays,
} from "../task/snoozeIntervals";

// The `snooze` setting: the most days a task can be snoozed for, and the
// ready-made intervals the snooze menu offers, in the order shown here. The
// server enforces the cap when a task is snoozed. Saves on change.

export function SnoozeSettings() {
  const T = useTerms();
  const { boot, saveSetting, online } = useApp();
  const saved = boot.settings.snooze as { intervals?: number[] } | undefined;
  const [max, setMax] = useState(snoozeMaxDays(boot.settings));
  const [list, setList] = useState<number[]>(saved?.intervals ?? DEFAULT_SNOOZE_INTERVALS);
  const [adding, setAdding] = useState<number | null>(null);

  const save = (nextMax: number, nextList: number[]) => {
    const [bm, bl] = [max, list];
    setMax(nextMax);
    setList(nextList);
    autosave(saveSetting("snooze", { max_days: nextMax, intervals: nextList })).catch(() => {
      setMax(bm);
      setList(bl);
    });
  };
  const move = (i: number, by: number) => {
    const next = [...list];
    [next[i], next[i + by]] = [next[i + by], next[i]];
    save(max, next);
  };
  const add = () => {
    if (!adding || list.includes(adding)) return;
    save(max, [...list, adding]);
    setAdding(null);
  };

  return (
    <div style={{ maxWidth: 560 }}>
      <Form layout="vertical" size="small" disabled={!online}>
        <Form.Item label="Longest snooze" extra={`From 1 to 365 days. ${T.Tasks} already snoozed keep their date.`}>
          <InputNumber
            min={1}
            max={365}
            precision={0}
            value={max}
            onChange={(v) => v && v !== max && save(v, list)}
            addonAfter="days"
            style={{ width: 160 }}
          />
        </Form.Item>
        <Form.Item
          label="Snooze menu"
          extra={`The ready-made choices, in this order. The menu also has a date picker for any other day, up to the longest snooze. Choices longer than that are kept here but not shown.`}
        >
          <List
            size="small"
            bordered
            locale={{ emptyText: "No ready-made choices. Only the date picker is offered." }}
            dataSource={list}
            renderItem={(n, i) => (
              <List.Item
                actions={[
                  <Tooltip key="up" title="Move up">
                    <Button size="small" type="text" aria-label={`Move ${intervalLabel(n)} up`} icon={<ArrowUpOutlined />} disabled={i === 0} onClick={() => move(i, -1)} />
                  </Tooltip>,
                  <Tooltip key="down" title="Move down">
                    <Button
                      size="small"
                      type="text"
                      aria-label={`Move ${intervalLabel(n)} down`}
                      icon={<ArrowDownOutlined />}
                      disabled={i === list.length - 1}
                      onClick={() => move(i, 1)}
                    />
                  </Tooltip>,
                  <Tooltip key="rm" title="Remove">
                    <Button
                      size="small"
                      type="text"
                      danger
                      aria-label={`Remove ${intervalLabel(n)}`}
                      icon={<DeleteOutlined />}
                      onClick={() => save(max, list.filter((x) => x !== n))}
                    />
                  </Tooltip>,
                ]}
              >
                <span style={n > max ? { opacity: 0.5 } : undefined}>
                  {intervalLabel(n)}
                  {n > 1 && intervalLabel(n) !== `${n} days` ? ` (${n} days)` : ""}
                  {n > max ? " (over the longest snooze)" : ""}
                </span>
              </List.Item>
            )}
          />
          <Space.Compact size="small" style={{ marginTop: 8 }}>
            <InputNumber
              min={1}
              max={365}
              precision={0}
              value={adding}
              onChange={setAdding}
              onPressEnter={add}
              addonAfter="days"
              placeholder="Add a choice"
              aria-label="Days to add to the snooze menu"
              style={{ width: 170 }}
              disabled={list.length >= MAX_SNOOZE_INTERVALS}
            />
            <Button onClick={add} disabled={!adding || list.includes(adding) || list.length >= MAX_SNOOZE_INTERVALS}>
              Add
            </Button>
          </Space.Compact>
          <div style={{ marginTop: 8 }}>
            <Button size="small" onClick={() => save(max, [...DEFAULT_SNOOZE_INTERVALS])}>
              Reset to the standard list
            </Button>
          </div>
        </Form.Item>
      </Form>
    </div>
  );
}
