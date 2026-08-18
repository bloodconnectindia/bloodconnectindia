document.addEventListener("DOMContentLoaded", () => {
    const form = document.getElementById("common-login-form");
    const message = document.getElementById("common-login-message");
    const submit = document.getElementById("common-login-submit");
    if (!form) return;

    form.addEventListener("submit", async (event) => {
        event.preventDefault();
        message.textContent = "";
        submit.disabled = true;
        try {
            const email = document.getElementById("login-email").value.trim();
            const password = document.getElementById("login-password").value;
            const result = await BloodConnectAuth.signIn(email, password);
            window.location.assign(result.destination);
        } catch (error) {
            message.textContent = error instanceof Error ? error.message : "Unable to sign in.";
            submit.disabled = false;
        }
    });
});
