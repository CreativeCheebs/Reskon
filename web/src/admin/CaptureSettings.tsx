import { useState } from "react";
import { Alert, Form, Input, InputNumber, Space, Typography, message } from "antd";
import { api } from "../api";
import { useApp } from "../store";
import { WriteButton } from "../offline";
import type { CaptureParse } from "../types";

// Settings stored in the `setting` table: the capture provider and the
// subtype rank weights. The API key is write-only; it is never sent back.

export function CaptureSettings() {
  const { boot, reloadBootstrap } = useApp();
  const [endpoint, setEndpoint] = useState(String(boot.settings.llm_endpoint ?? ""));
  const [model, setModel] = useState(String(boot.settings.llm_model ?? ""));
  const [key, setKey] = useState("");
  const [weights, setWeights] = useState<number[]>((boot.settings.subtype_weights as number[]) ?? [1, 0.5, 0.25, 0.25]);
  const [test, setTest] = useState<CaptureParse | null>(null);
  const [testing, setTesting] = useState(false);

  const save = async () => {
    try {
      await api.put("/settings/llm_endpoint", endpoint.trim());
      await api.put("/settings/llm_model", model.trim());
      if (key) await api.put("/settings/llm_api_key", key);
      await api.put("/settings/subtype_weights", weights);
      setKey("");
      await reloadBootstrap();
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
        <Form.Item label="Endpoint (base URL)">
          <Input value={endpoint} onChange={(e) => setEndpoint(e.target.value)} placeholder="http://localhost:11434/v1" />
        </Form.Item>
        <Form.Item label="Model">
          <Input value={model} onChange={(e) => setModel(e.target.value)} placeholder="qwen2.5:7b-instruct" />
        </Form.Item>
        <Form.Item label="API key" help="Write-only. Leave blank to keep the current key.">
          <Input.Password value={key} onChange={(e) => setKey(e.target.value)} autoComplete="off" />
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
