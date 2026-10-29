import { useState } from "react";
import { Form, Input, Modal, Select } from "antd";
import { message } from "../theme/feedback";
import { api } from "../api";
import { useApp } from "../store";

// No areas exist yet: ask for one. Creating it also creates its board view.

export function FirstRun() {
  const { boot, reloadBootstrap, online } = useApp();
  const [form] = Form.useForm();
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const values = await form.validateFields();
    setBusy(true);
    try {
      await api.post("/areas", values);
      await reloadBootstrap();
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      closable={false}
      maskClosable={false}
      keyboard={false}
      title="Create your first area"
      okText="Create area"
      onOk={submit}
      okButtonProps={{ loading: busy, disabled: !online }}
      cancelButtonProps={{ style: { display: "none" } }}
    >
      <p style={{ marginTop: 0 }}>
        Every task belongs to exactly one area — Main job, Personal, Freelance. The prefix makes task keys like PER-1.
      </p>
      <Form form={form} layout="vertical" initialValues={{ default_energy_type_id: boot.energy_types[0]?.id }}>
        <Form.Item name="name" label="Name" rules={[{ required: true }]}>
          <Input autoFocus placeholder="Personal" />
        </Form.Item>
        <Form.Item
          name="key_prefix"
          label="Key prefix"
          rules={[{ required: true, pattern: /^[A-Za-z][A-Za-z0-9]{0,9}$/, message: "Letters and digits, up to 10" }]}
        >
          <Input placeholder="PER" style={{ textTransform: "uppercase" }} />
        </Form.Item>
        <Form.Item name="default_energy_type_id" label="Default energy type">
          <Select options={boot.energy_types.map((e) => ({ value: e.id, label: e.name }))} />
        </Form.Item>
      </Form>
    </Modal>
  );
}
