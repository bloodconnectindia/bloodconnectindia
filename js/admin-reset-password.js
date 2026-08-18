document.addEventListener("DOMContentLoaded", async () => {
    const form = document.getElementById("admin-reset-password-form");
    const intro = document.getElementById("recovery-intro");
    const invalid = document.getElementById("recovery-invalid");
    const message = document.getElementById("reset-password-message");
    const submit = document.getElementById("reset-password-submit");
    const password = document.getElementById("new-password");
    const confirmation = document.getElementById("confirm-password");
    const locationParameters = new URLSearchParams(window.location.search);
    const hashParameters = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const recoveryIndicated = locationParameters.get("type") === "recovery" || hashParameters.get("type") === "recovery" || locationParameters.has("code");
    let recoveryEventReceived = false;

    const setMessage = (text, state = "error") => {
        message.textContent = text;
        message.dataset.state = state;
    };
    const failRecovery = () => {
        form.hidden = true;
        invalid.hidden = false;
        intro.textContent = "A valid recovery link is required before a password can be changed.";
        setMessage("Request a new recovery link from the Admin sign-in page.");
    };

    document.querySelectorAll("[data-password-toggle]").forEach(button => {
        button.addEventListener("click", () => {
            const field = document.getElementById(button.dataset.passwordToggle);
            const show = field.type === "password";
            field.type = show ? "text" : "password";
            button.textContent = show ? "Hide" : "Show";
            button.setAttribute("aria-label", `${show ? "Hide" : "Show"} ${field === password ? "new" : "confirmed"} password`);
        });
    });

    const { data: listener } = supabaseClient.auth.onAuthStateChange((event) => {
        if (event === "PASSWORD_RECOVERY") recoveryEventReceived = true;
    });

    try {
        await new Promise(resolve => window.setTimeout(resolve, 150));
        const { data, error } = await supabaseClient.auth.getSession();
        const validSession = Boolean(data?.session?.user && data.session.access_token);
        if (error || !validSession || (!recoveryIndicated && !recoveryEventReceived)) {
            failRecovery();
            return;
        }

        window.history.replaceState({}, document.title, window.location.pathname);
        intro.textContent = "Enter a strong new password for the recovered account.";
        setMessage("Recovery session verified.", "success");
        form.hidden = false;
        password.focus();
    } catch {
        failRecovery();
        return;
    } finally {
        listener.subscription.unsubscribe();
    }

    form.addEventListener("submit", async event => {
        event.preventDefault();
        const newPassword = password.value;
        const confirmedPassword = confirmation.value;
        const strong = newPassword.length >= 12 && newPassword.length <= 128 && /[a-z]/.test(newPassword) && /[A-Z]/.test(newPassword) && /\d/.test(newPassword) && /[^A-Za-z0-9]/.test(newPassword);

        if (!strong) {
            setMessage("Choose a password that meets all listed requirements.");
            password.focus();
            return;
        }
        if (newPassword !== confirmedPassword) {
            setMessage("The new passwords do not match.");
            confirmation.focus();
            return;
        }

        submit.disabled = true;
        password.disabled = true;
        confirmation.disabled = true;
        setMessage("Updating password…", "loading");
        try {
            const { error } = await supabaseClient.auth.updateUser({ password: newPassword });
            if (error) throw error;
            password.value = "";
            confirmation.value = "";
            form.hidden = true;
            await supabaseClient.auth.signOut({ scope: "local" });
            intro.textContent = "Your password was updated successfully.";
            setMessage("Returning to Login. Sign in again to verify account eligibility.", "success");
            window.setTimeout(() => window.location.replace("login.html"), 1800);
        } catch {
            setMessage("The password could not be updated. The recovery link may be expired; request a new link and try again.");
            submit.disabled = false;
            password.disabled = false;
            confirmation.disabled = false;
            password.focus();
        }
    });
});
