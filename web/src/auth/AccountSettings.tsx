import { Form, Input, Typography, message } from "antd";
import { api } from "../api";
import { WriteButton } from "../offline";
import { useAuth } from "./AuthGate";

// Change your own password. Other devices are signed out; this one stays.

export function AccountSettings() {
  const { user } = useAuth();
  const [form] = Form.useForm();

  const submit = async (v: { current: string; next: string; confirm: string }) => {
    if (v.next !== v.confirm) {
      message.error("The new passwords don't match.");
      return;
    }
    try {
      await api.post("/auth/password", { current: v.current, new: v.next });
      form.resetFields();
      message.success("Password changed. Other devices were signed out.");
    } catch (e) {
      message.error((e as Error).message);
    }
  };

  return (
    <div style={{ maxWidth: 360 }}>
      <Typography.Paragraph>
        Signed in as <b>{user.username}</b>
        {user.is_admin && " (admin)"}.
      </Typography.Paragraph>
      <Form form={form} layout="vertical" size="small" onFinish={submit}>
        <Form.Item name="current" label="Current password" rules={[{ required: true }]}>
          <Input.Password autoComplete="current-password" />
        </Form.Item>
        <Form.Item name="next" label="New password" rules={[{ required: true, min: 8, message: "At least 8 characters" }]}>
          <Input.Password autoComplete="new-password" />
        </Form.Item>
        <Form.Item name="confirm" label="Confirm new password" rules={[{ required: true }]}>
          <Input.Password autoComplete="new-password" />
        </Form.Item>
        <WriteButton type="primary" htmlType="submit">
          Change password
        </WriteButton>
      </Form>
    </div>
  );
}
