document.addEventListener("DOMContentLoaded", () => {
    const form = document.getElementById("admin-login-form");
    const message = document.getElementById("admin-login-message");

    if (!form) {
        return;
    }

    form.addEventListener("submit", async (event) => {
        event.preventDefault();
        message.textContent = "";

        const email = document.getElementById("admin-email").value.trim();
        const password = document.getElementById("admin-password").value;

        try {
            await BloodConnectAuth.signIn(email, password);

            window.location.href = "admin-dashboard.html";
        } catch (error) {
            console.error(error);
            message.textContent = error.message || "Unable to sign in.";
        }
    });
});
