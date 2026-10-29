import { useEffect, useState } from "react";
import { Checkbox, Form, Input, Modal, Popconfirm, Switch, Table, Tag, Typography } from "antd";
import { message } from "../theme/feedback";
import { api } from "../api";
import { WriteButton } from "../offline";
import { formatDateTime } from "../format";
import { useAuth, type User } from "./AuthGate";
import { palette } from "../theme/palette";
import { Lozenge } from "../theme/Lozenge";

// Admin only: add people, reset passwords, grant admin, disable accounts.
// Disabling signs the person out and keeps their data file untouched.

export function UsersSettings() {
  const { user: me } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [adding, setAdding] = useState(false);
  const [resetting, setResetting] = useState<User | null>(null);

  const load = () => api.get<User[]>("/users").then(setUsers).catch((e) => message.error((e as Error).message));
  useEffect(() => {
    load();
  }, []);

  const patch = async (u: User, body: Record<string, unknown>) => {
    try {
      await api.patch(`/users/${u.id}`, body);
      load();
    } catch (e) {
      message.error((e as Error).message);
    }
  };

  return (
    <>
      <Typography.Paragraph type="secondary">
        Everyone has their own separate board, sessions and settings. Nobody, including admins, can see another person's data in
        the app.
      </Typography.Paragraph>
      <Table<User>
        size="small"
        rowKey="id"
        pagination={false}
        dataSource={users}
        columns={[
          {
            title: "Username",
            render: (_, u) => (
              <>
                {u.username} {u.id === me.id && <Tag bordered={false}>you</Tag>}
              </>
            ),
          },
          {
            title: "Admin",
            width: 80,
            render: (_, u) => <Switch size="small" checked={u.is_admin} onChange={(v) => patch(u, { is_admin: v })} />,
          },
          {
            title: "Status",
            width: 110,
            render: (_, u) => (u.disabled_at ? <Lozenge color={palette.danger} strong>disabled</Lozenge> : <Lozenge color={palette.success} strong>active</Lozenge>),
          },
          { title: "Created", width: 170, render: (_, u) => formatDateTime(u.created_at) },
          {
            title: "",
            width: 230,
            render: (_, u) => (
              <>
                <WriteButton size="small" type="text" onClick={() => setResetting(u)}>
                  Reset password
                </WriteButton>
                {u.id !== me.id &&
                  (u.disabled_at ? (
                    <WriteButton size="small" type="text" onClick={() => patch(u, { disabled: false })}>
                      Enable
                    </WriteButton>
                  ) : (
                    <Popconfirm title={`Disable ${u.username}? They are signed out; their data is kept.`} onConfirm={() => patch(u, { disabled: true })}>
                      <WriteButton size="small" type="text" danger>
                        Disable
                      </WriteButton>
                    </Popconfirm>
                  ))}
              </>
            ),
          },
        ]}
      />
      <WriteButton size="small" style={{ marginTop: 8 }} onClick={() => setAdding(true)}>
        + Add person
      </WriteButton>
      {adding && (
        <AddUser
          onClose={() => setAdding(false)}
          onAdded={() => {
            setAdding(false);
            load();
          }}
        />
      )}
      {resetting && <ResetPassword user={resetting} onClose={() => setResetting(null)} />}
    </>
  );
}

function AddUser({ onClose, onAdded }: { onClose: () => void; onAdded: () => void }) {
  const [form] = Form.useForm();
  const submit = async () => {
    const v = await form.validateFields();
    try {
      await api.post("/users", v);
      message.success(`Added ${v.username}`);
      onAdded();
    } catch (e) {
      message.error((e as Error).message);
    }
  };
  return (
    <Modal open title="Add a person" okText="Add" onOk={submit} onCancel={onClose}>
      <Form form={form} layout="vertical" size="small" initialValues={{ is_admin: false }}>
        <Form.Item name="username" label="Username" rules={[{ required: true, pattern: /^[a-zA-Z0-9][a-zA-Z0-9_.-]{1,31}$/, message: "2-32 letters, digits, . _ -" }]}>
          <Input autoComplete="off" />
        </Form.Item>
        <Form.Item name="password" label="Initial password" help="Tell them to change it under Settings → Account." rules={[{ required: true, min: 8, message: "At least 8 characters" }]}>
          <Input.Password autoComplete="new-password" />
        </Form.Item>
        <Form.Item name="is_admin" valuePropName="checked">
          <Checkbox>Admin (can manage people)</Checkbox>
        </Form.Item>
      </Form>
    </Modal>
  );
}

function ResetPassword({ user, onClose }: { user: User; onClose: () => void }) {
  const [form] = Form.useForm();
  const submit = async () => {
    const v = await form.validateFields();
    try {
      await api.patch(`/users/${user.id}`, { password: v.password });
      message.success(`Password reset; ${user.username} was signed out everywhere.`);
      onClose();
    } catch (e) {
      message.error((e as Error).message);
    }
  };
  return (
    <Modal open title={`Reset password for ${user.username}`} okText="Reset" onOk={submit} onCancel={onClose}>
      <Form form={form} layout="vertical" size="small">
        <Form.Item name="password" label="New password" rules={[{ required: true, min: 8, message: "At least 8 characters" }]}>
          <Input.Password autoComplete="new-password" />
        </Form.Item>
      </Form>
    </Modal>
  );
}
