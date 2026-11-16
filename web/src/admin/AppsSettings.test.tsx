import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { ConnectedApp } from "../apps/types";

vi.mock("../store", () => ({ useApp: () => ({ reloadKey: 0, reloadBootstrap: () => Promise.resolve(), online: true }) }));

const app = (changes: ConnectedApp["changes"], detail = ""): ConnectedApp => ({
  id: 1,
  app_id: "habits",
  name: "Habits",
  address: "http://habits.example:8098",
  auth_kind: "password",
  signed_in: true,
  status: "ok",
  status_detail: "",
  checked_at: "2026-11-15T08:00:00Z",
  manifest: null,
  home_link: "http://habits.example:8098/",
  changes,
  changes_detail: detail,
});

let list: ConnectedApp[] = [];
vi.mock("../api", () => ({
  api: { get: () => Promise.resolve(list), post: () => Promise.resolve({}), del: () => Promise.resolve({}) },
  ApiError: class extends Error {},
}));

const { AppsSettings } = await import("./AppsSettings");

describe("Settings › Apps", () => {
  it("says when Reskon won't hear about changes made elsewhere, and why", async () => {
    list = [app("failed", "http://habits.example:8098/api/reskon/connect answered HTTP 500")];
    render(<AppsSettings />);
    const line = await screen.findByText(/Reskon won't hear about changes made elsewhere in Habits/);
    expect(line).toHaveTextContent("when changed in its page widgets");
    expect(line).toHaveTextContent("answered HTTP 500. Press Check again to retry.");
    expect(line.closest(".ant-alert-warning")).not.toBeNull();
  });

  it("says Sign in again when the app refused Reskon's sign-in", async () => {
    list = [app("failed", "Habits refused Reskon's sign-in at http://habits.example:8098/api/reskon/connect: sign in to Habits again")];
    render(<AppsSettings />);
    expect(await screen.findByText(/won't hear about changes/)).toHaveTextContent("Press Sign in again to retry.");
  });

  it("warns when the key was taken but the address may not work", async () => {
    list = [app("ok", "Reskon seems to be behind a proxy, but JITTERBUG_BEHIND_PROXY=1 is not set")];
    render(<AppsSettings />);
    expect(await screen.findByText(/may not hear about changes made elsewhere in Habits/)).toHaveTextContent("JITTERBUG_BEHIND_PROXY");
  });

  it("says nothing when the app took the key, or offers none", async () => {
    list = [app("ok"), { ...app(""), id: 2, app_id: "food", name: "Food" }];
    render(<AppsSettings />);
    expect(await screen.findByText("Food")).toBeInTheDocument();
    expect(screen.queryByText(/won't hear about changes/)).toBeNull();
  });
});
