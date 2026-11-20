import { App, message as staticMessage, Modal as StaticModal, notification as staticNotification } from "antd";
import type { MessageInstance } from "antd/es/message/interface";
import type { NotificationInstance } from "antd/es/notification/interface";
import type { HookAPI } from "antd/es/modal/useModal";

// Ant's static message() and Modal.confirm() render outside the theme (white
// toasts on a dark app). These wrappers call the themed instances from
// <App>, which <FeedbackBridge/> hands over once mounted.

let msg: MessageInstance = staticMessage;
// Until the bridge mounts (a split second at start-up) fall back to the
// unthemed static versions.
let note: NotificationInstance = staticNotification;
let modal: { confirm: (props: Parameters<HookAPI["confirm"]>[0]) => { destroy: () => void } } = { confirm: StaticModal.confirm };

export const message: Pick<MessageInstance, "success" | "error" | "info" | "warning"> = {
  success: (...a) => msg.success(...a),
  error: (...a) => msg.error(...a),
  info: (...a) => msg.info(...a),
  warning: (...a) => msg.warning(...a),
};

/** Runs a save that has no Save button and says so in one toast, updated in
 *  place ("Saving…", then "Saved" or the error) so quick edits never stack. */
export async function autosave<T>(work: Promise<T>): Promise<T> {
  msg.open({ key: "autosave", type: "loading", content: "Saving…", duration: 0 });
  try {
    const r = await work;
    msg.open({ key: "autosave", type: "success", content: "Saved", duration: 1.5 });
    return r;
  } catch (e) {
    msg.open({ key: "autosave", type: "error", content: (e as Error).message, duration: 4 });
    throw e;
  }
}

/** A small note with buttons in a corner, gone after `seconds` or when
 *  closed with closeNote(key). Never stops what the person is doing. */
export const notify = (props: Parameters<NotificationInstance["open"]>[0]) => note.open(props);
export const closeNote = (key: string) => note.destroy(key);

// Returns a handle whose destroy() closes the dialog (for custom buttons).
export const confirm = (props: Parameters<HookAPI["confirm"]>[0]) => modal.confirm(props);

export function FeedbackBridge() {
  const app = App.useApp();
  msg = app.message;
  note = app.notification;
  modal = app.modal;
  return null;
}
