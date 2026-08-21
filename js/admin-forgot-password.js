document.addEventListener("DOMContentLoaded", () => {
    const form = document.getElementById("admin-reset-request-form");
    const message = document.getElementById("admin-reset-message");
    const submit = form?.querySelector('button[type="submit"]');
    form?.addEventListener("submit", async (event) => {
        event.preventDefault();
        message.textContent = "";
        message.dataset.state = "loading";
        submit.disabled = true;
        submit.textContent = "Sending…";
        try {
            await BloodConnectAuth.requestPasswordReset(document.getElementById("admin-email").value.trim());
            message.textContent = "If an eligible account exists, a reset link will be sent.";
            message.dataset.state = "success";
        } catch (error) {
            message.textContent = error instanceof Error ? error.message : "Unable to process the request. Please try again later.";
            message.dataset.state = "error";
        } finally {
            submit.disabled = false;
            submit.textContent = "Send reset link";
        }
    });
});
