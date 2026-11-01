import { useState } from "react";
import { Form, Input, Modal, Popconfirm, Select, Table, Tag } from "antd";
import { PlusOutlined } from "@ant-design/icons";
import { autosave, message } from "../theme/feedback";
import { api } from "../api";
import { useApp } from "../store";
import { WriteButton } from "../offline";
import type { CustomField, FieldType } from "../types";

// Custom field definitions. Key and type are fixed once created — to change
// a type, make a new field. Deleting a definition keeps the stored values.

const TYPES: FieldType[] = ["text", "int", "real", "date", "bool", "select"];

export function CustomFieldSettings() {
  const { boot, reloadBootstrap } = useApp();
  const [adding, setAdding] = useState(false);

  const patch = async (id: number, body: Record<string, unknown>) => {
    try {
      await autosave(api.patch(`/custom-fields/${id}`, body));
    } catch {
      // autosave showed the error.
    }
    await reloadBootstrap();
  };
  const remove = async (id: number) => {
    try {
      await api.del(`/custom-fields/${id}`);
      await reloadBootstrap();
    } catch (e) {
      message.error((e as Error).message);
    }
  };

  return (
    <>
      <Table<CustomField>
        size="small"
        rowKey="id"
        pagination={false}
        dataSource={boot.custom_fields}
        columns={[
          { title: "On", dataIndex: "entity", width: 80, render: (e) => <Tag>{e}</Tag> },
          {
            title: "Label",
            render: (_, f) => (
              <Input size="small" defaultValue={f.label} onBlur={(e) => e.target.value !== f.label && patch(f.id, { label: e.target.value })} />
            ),
          },
          { title: "Key", dataIndex: "key", width: 150, render: (k) => <code>{k}</code> },
          { title: "Type", dataIndex: "type", width: 80 },
          {
            title: "Options",
            render: (_, f) =>
              f.type === "select" ? (
                <Select
                  size="small"
                  mode="tags"
                  style={{ width: "100%" }}
                  value={f.options ?? []}
                  onChange={(v: string[]) => v.length && patch(f.id, { options: v })}
                />
              ) : null,
          },
          {
            title: "",
            width: 80,
            render: (_, f) => (
              <Popconfirm title="Delete this field? Stored values are kept." onConfirm={() => remove(f.id)}>
                <WriteButton size="small" type="text" danger>
                  Delete
                </WriteButton>
              </Popconfirm>
            ),
          },
        ]}
      />
      <div className="jb-lookup-foot">
        <WriteButton size="small" icon={<PlusOutlined />} onClick={() => setAdding(true)}>
          Add field
        </WriteButton>
      </div>
      {adding && <AddField onClose={() => setAdding(false)} />}
    </>
  );
}

function AddField({ onClose }: { onClose: () => void }) {
  const { reloadBootstrap } = useApp();
  const [form] = Form.useForm();
  const type: FieldType = Form.useWatch("type", form);

  const submit = async () => {
    const v = await form.validateFields();
    try {
      await api.post("/custom-fields", { ...v, options: v.type === "select" ? v.options : null });
      await reloadBootstrap();
      onClose();
    } catch (e) {
      message.error((e as Error).message);
    }
  };

  return (
    <Modal open title="New custom field" onOk={submit} onCancel={onClose} okText="Create">
      <Form form={form} layout="vertical" size="small" initialValues={{ entity: "task", type: "text" }}>
        <Form.Item name="entity" label="On">
          <Select options={[{ value: "task" }, { value: "session" }]} />
        </Form.Item>
        <Form.Item name="label" label="Label" rules={[{ required: true }]}>
          <Input
            onChange={(e) => {
              if (!form.isFieldTouched("key"))
                form.setFieldValue("key", e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, ""));
            }}
          />
        </Form.Item>
        <Form.Item
          name="key"
          label="Key (cannot change later)"
          rules={[{ required: true, pattern: /^[a-z][a-z0-9_]{0,63}$/, message: "lower case letters, digits, _" }]}
        >
          <Input />
        </Form.Item>
        <Form.Item name="type" label="Type (cannot change later)">
          <Select options={TYPES.map((t) => ({ value: t }))} />
        </Form.Item>
        {type === "select" && (
          <Form.Item name="options" label="Options" rules={[{ required: true }]}>
            <Select mode="tags" />
          </Form.Item>
        )}
      </Form>
    </Modal>
  );
}
