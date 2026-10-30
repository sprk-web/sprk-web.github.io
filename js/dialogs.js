let dialogSequence = 0;

function showDialog({ title, message, input = false, initialValue = "", multiline = false, confirmLabel = "OK", cancelLabel = "Cancel", confirmStyle = "" }) {
  return new Promise((resolve) => {
    const dialog = document.createElement("dialog");
    dialog.className = "app-dialog";
    const titleId = `app-dialog-title-${++dialogSequence}`;
    const panel = document.createElement("form");
    panel.className = "app-dialog-panel";
    const heading = document.createElement("h2");
    heading.id = titleId;
    heading.textContent = title;
    const description = document.createElement("p");
    description.id = `${titleId}-message`;
    description.className = "app-dialog-message";
    description.textContent = message;
    dialog.setAttribute("aria-labelledby", titleId);
    panel.append(heading, description);

    let field;
    if (input) {
      field = document.createElement(multiline ? "textarea" : "input");
      field.className = "app-dialog-input";
      field.value = initialValue;
      field.setAttribute("aria-label", title);
      field.setAttribute("aria-describedby", description.id);
      if (multiline) field.rows = 4;
      panel.append(field);
    }

    const actions = document.createElement("div");
    actions.className = "app-dialog-actions";
    let settled = false;
    const close = (value) => {
      if (settled) return;
      settled = true;
      if (dialog.open) dialog.close();
      dialog.remove();
      resolve(value);
    };
    panel.addEventListener("submit", (event) => {
      event.preventDefault();
      close(input ? field.value : true);
    });

    if (cancelLabel) {
      const cancel = document.createElement("button");
      cancel.className = "app-dialog-button";
      cancel.type = "button";
      cancel.textContent = cancelLabel;
      cancel.addEventListener("click", () => close(input ? null : false));
      actions.append(cancel);
    }

    const confirm = document.createElement("button");
    confirm.className = `app-dialog-button app-dialog-confirm ${confirmStyle}`.trim();
    confirm.type = "submit";
    confirm.textContent = confirmLabel;
    actions.append(confirm);
    panel.append(actions);
    dialog.append(panel);
    dialog.addEventListener("cancel", (event) => {
      event.preventDefault();
      close(input ? null : false);
    });
    dialog.addEventListener("click", (event) => {
      if (event.target === dialog) close(input ? null : false);
    });
    document.body.append(dialog);
    dialog.showModal();
    (field || confirm).focus();
    if (field && !multiline && typeof field.select === "function") field.select();
  });
}

export function confirmDialog(message, options = {}) {
  return showDialog({
    title: options.title || "Please confirm",
    message,
    confirmLabel: options.confirmLabel || "Continue",
    confirmStyle: options.danger ? "danger" : "",
    cancelLabel: "Cancel",
  });
}

export function promptDialog(message, initialValue = "", options = {}) {
  return showDialog({
    title: options.title || "Enter a value",
    message,
    input: true,
    initialValue,
    multiline: Boolean(options.multiline),
    confirmLabel: options.confirmLabel || "Submit",
    cancelLabel: "Cancel",
  });
}

export function alertDialog(message, options = {}) {
  return showDialog({
    title: options.title || "Notice",
    message,
    confirmLabel: options.confirmLabel || "OK",
    cancelLabel: "",
  });
}
