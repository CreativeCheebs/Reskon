import { App, message as staticMessage, Modal as StaticModal } from "antd";
import type { MessageInstance } from "antd/es/message/interface";
import type { HookAPI } from "antd/es/modal/useModal";

// Ant's static message() and Modal.confirm() render outside the theme (white
// toasts on a dark app). These wrappers call the themed instances from
// <App>, which <FeedbackBridge/> hands over once mounted.

let msg: MessageInstance = staticMessage;
// Until the bridge mounts (a split second at start-up) fall back to the
// unthemed static versions.
let modal: { confirm: (props: Parameters<HookAPI["confirm"]>[0]) => unknown } = { confirm: StaticModal.confirm };

export const message: Pick<MessageInstance, "success" | "error" | "info" | "warning"> = {
  success: (...a) => msg.success(...a),
  error: (...a) => msg.error(...a),
  info: (...a) => msg.info(...a),
  warning: (...a) => msg.warning(...a),
};

export const confirm = (props: Parameters<HookAPI["confirm"]>[0]) => {
  modal.confirm(props);
};

export function FeedbackBridge() {
  const app = App.useApp();
  msg = app.message;
  modal = app.modal;
  return null;
}
