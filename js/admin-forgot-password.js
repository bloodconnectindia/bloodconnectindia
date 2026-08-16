document.addEventListener("DOMContentLoaded", () => {
    const form = document.getElementById("admin-reset-request-form");
    const message = document.getElementById("admin-reset-message");
    form?.addEventListener("submit", async (event) => {
        event.preventDefault();
        message.textContent = "";
        try {
            await BloodConnectAuth.requestPasswordReset(document.getElementById("admin-email").value.trim());
            message.textContent = "If an eligible account exists, a reset link will be sent.";
        } catch (error) {
            message.textContent = error.message;
        }
    });
});
