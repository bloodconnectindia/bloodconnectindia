document.addEventListener("DOMContentLoaded", () => {
    const form = document.getElementById("common-login-form");
    const message = document.getElementById("common-login-message");
    const submit = document.getElementById("common-login-submit");
    const password = document.getElementById("login-password");
    const passwordToggle = document.querySelector('[data-password-toggle="login-password"]');
    if (!form) return;

    passwordToggle?.addEventListener("click", () => {
        const show = password.type === "password";
        password.type = show ? "text" : "password";
        passwordToggle.setAttribute("aria-label", show ? "Hide password" : "Show password");
        passwordToggle.setAttribute("aria-pressed", String(show));
    });

    form.addEventListener("submit", async (event) => {
        event.preventDefault();
        message.textContent = "";
        message.dataset.state = "loading";
        submit.disabled = true;
        submit.textContent = "Signing in…";
        try {
            const email = document.getElementById("login-email").value.trim();
            const password = document.getElementById("login-password").value;
            const result = await BloodConnectAuth.signIn(email, password);
            window.location.assign(result.destination);
        } catch (error) {
            message.dataset.state = "error";
            message.textContent = error instanceof Error ? error.message : "Unable to sign in.";
            submit.disabled = false;
            submit.textContent = "Sign in securely";
        }
    });
});
