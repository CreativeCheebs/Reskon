import { useEffect, useState } from "react";
import { Alert, Form, Input, InputNumber, Space, Typography } from "antd";
import { message } from "../theme/feedback";
import { api } from "../api";
import { useApp } from "../store";
import { WriteButton } from "../offline";
import type { CaptureParse } from "../types";

// Settings stored in the `setting` table: the capture provider and the
// subtype rank weights. The API key is write-only; it is never sent back.
// Values that come from the server's environment are shown under each box,
// so a working setup never looks empty.

interface Effective {
  endpoint: string;
  endpoint_source: Source;
  model: string;
  model_source: Source;
  api_key_set: boolean;
  api_key_source: Source;
}
type Source = "settings" | "environment" | "";

function inUse(value: string, source: Source) {
  if (!source) return "Not set: capture uses the manual form.";
  if (source === "environment") return <>In use from the server environment: <code>{value}</code>. Type here to override it.</>;
  return undefined;
}

export function CaptureSettings() {
  const { boot, reloadBootstrap } = useApp();
  const [endpoint, setEndpoint] = useState(String(boot.settings.llm_endpoint ?? ""));
  const [model, setModel] = useState(String(boot.settings.llm_model ?? ""));
  const [key, setKey] = useState("");
  const [weights, setWeights] = useState<number[]>((boot.settings.subtype_weights as number[]) ?? [1, 0.5, 0.25, 0.25]);
  const [test, setTest] = useState<CaptureParse | null>(null);
  const [testing, setTesting] = useState(false);
  const [eff, setEff] = useState<Effective | null>(null);
  const loadEffective = () => api.get<Effective>("/capture/config").then(setEff).catch(() => undefined);
  useEffect(() => {
    loadEffective();
  }, []);

  const save = async () => {
    try {
      await api.put("/settings/llm_endpoint", endpoint.trim());
      await api.put("/settings/llm_model", model.trim());
      if (key) await api.put("/settings/llm_api_key", key);
      await api.put("/settings/subtype_weights", weights);
      setKey("");
      await reloadBootstrap();
      loadEffective();
      message.success("Saved");
    } catch (e) {
      message.error((e as Error).message);
    }
  };

  const runTest = async () => {
    setTesting(true);
    try {
      setTest(await api.post<CaptureParse>("/capture", { text: "Worked on stm32 demo, 2 hours" }));
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setTesting(false);
    }
  };

  return (
    <div style={{ maxWidth: 560 }}>
      <Typography.Paragraph type="secondary">
        Any OpenAI-compatible endpoint works, local or hosted (for Ollama: <code>http://host:11434/v1</code>). Leave it blank to
        use the manual form. If the model is down or takes more than 5 seconds, capture falls back to the manual form.
        Environment variables JITTERBUG_LLM_ENDPOINT / _MODEL / _API_KEY are used when these are blank.
      </Typography.Paragraph>
      <Form layout="vertical" size="small">
        <Form.Item label="Endpoint (base URL)" help={eff && !endpoint.trim() ? inUse(eff.endpoint, eff.endpoint_source) : undefined}>
          <Input value={endpoint} onChange={(e) => setEndpoint(e.target.value)} placeholder={eff?.endpoint || "http://localhost:11434/v1"} />
        </Form.Item>
        <Form.Item label="Model" help={eff && !model.trim() ? inUse(eff.model, eff.model_source) : undefined}>
          <Input value={model} onChange={(e) => setModel(e.target.value)} placeholder={eff?.model || "qwen2.5:7b-instruct"} />
        </Form.Item>
        <Form.Item
          label="API key"
          help={
            !eff || !eff.api_key_set
              ? "Write-only. No key is set."
              : eff.api_key_source === "environment"
                ? "A key is set in the server environment (hidden). Type one here to override it."
                : "A key is saved (hidden). Leave blank to keep it."
          }
        >
          <Input.Password
            value={key}
            onChange={(e) => setKey(e.target.value)}
            autoComplete="off"
            placeholder={eff?.api_key_set ? "••••••••  (set)" : undefined}
          />
        </Form.Item>
        <Form.Item label="Subtype rank weights" help="Weight for subtype rank 1, 2, 3, 4 in a session">
          <Space>
            {weights.map((w, i) => (
              <InputNumber
                key={i}
                min={0}
                max={1}
                step={0.05}
                value={w}
                onChange={(v) => setWeights((ws) => ws.map((x, j) => (j === i ? v ?? 0 : x)))}
              />
            ))}
          </Space>
        </Form.Item>
        <Space>
          <WriteButton type="primary" onClick={save}>
            Save
          </WriteButton>
          <WriteButton loading={testing} onClick={runTest}>
            Test capture
          </WriteButton>
        </Space>
      </Form>
      {test && (
        <Alert
          style={{ marginTop: 12 }}
          type={test.fallback ? "warning" : "success"}
          message={test.fallback ? `Fallback: ${test.fallback_reason}` : "Model answered"}
          description={<pre style={{ margin: 0, fontSize: 11, whiteSpace: "pre-wrap" }}>{JSON.stringify(test, null, 2)}</pre>}
        />
      )}
    </div>
  );
}
