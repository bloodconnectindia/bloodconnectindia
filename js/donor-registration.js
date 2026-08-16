document.addEventListener("DOMContentLoaded", () => {
    const form = document.getElementById("donor-registration-form");
    const submit = document.getElementById("donor-submit");
    const reset = document.getElementById("donor-reset");
    const status = document.getElementById("donor-form-status");
    const success = document.getElementById("donor-success");
    const bloodGroups = new Set(["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"]);
    const fields = { fullName: document.getElementById("donor-full-name"), mobile: document.getElementById("donor-mobile"), email: document.getElementById("donor-email"), bloodGroup: document.getElementById("donor-blood-group"), consent: document.getElementById("donor-consent") };
    const errors = { fullName: document.getElementById("donor-full-name-error"), mobile: document.getElementById("donor-mobile-error"), email: document.getElementById("donor-email-error"), bloodGroup: document.getElementById("donor-blood-group-error"), consent: document.getElementById("donor-consent-error") };

    const setError = (key, message) => { errors[key].textContent = message; fields[key].setAttribute("aria-invalid", String(Boolean(message))); };
    const clearErrors = () => Object.keys(errors).forEach(key => setError(key, ""));
    const validate = () => {
        clearErrors();
        const fullName = fields.fullName.value.trim();
        const mobileDigits = fields.mobile.value.replace(/\D/g, "");
        const mobile = mobileDigits.length === 12 && mobileDigits.startsWith("91") ? mobileDigits.slice(2) : mobileDigits;
        const email = fields.email.value.trim().toLowerCase();
        let valid = true;
        if (fullName.length < 2 || fullName.length > 100) { setError("fullName", "Enter a name between 2 and 100 characters."); valid = false; }
        if (!/^[6-9]\d{9}$/.test(mobile)) { setError("mobile", "Enter a valid 10-digit Indian mobile number."); valid = false; }
        if (email && (email.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) { setError("email", "Enter a valid email address or leave this field blank."); valid = false; }
        if (!bloodGroups.has(fields.bloodGroup.value)) { setError("bloodGroup", "Select a valid blood group."); valid = false; }
        if (!fields.consent.checked) { setError("consent", "Consent is required before submitting."); valid = false; }
        return valid ? { fullName, mobile, email, bloodGroup: fields.bloodGroup.value, consent: true } : null;
    };

    form.addEventListener("submit", async event => {
        event.preventDefault();
        status.textContent = "";
        success.hidden = true;
        const payload = validate();
        if (!payload) { status.textContent = "Please correct the highlighted fields."; form.querySelector("[aria-invalid=true]")?.focus(); return; }
        submit.disabled = true;
        reset.disabled = true;
        status.dataset.state = "loading";
        status.textContent = "Submitting fixture registration…";
        try {
            const result = await BloodConnectAdminFixtures.registerDonor(payload);
            if (!result?.accepted) throw new Error("FIXTURE_SERVICE_ERROR");
            form.hidden = true;
            success.hidden = false;
            document.getElementById("donor-success-message").textContent = `Reference ${result.fixtureId}. No real donor record was created.`;
            status.textContent = "";
            status.dataset.state = "success";
        } catch (error) {
            status.dataset.state = "error";
            status.textContent = error.message === "DUPLICATE_FIXTURE_DONOR" ? "A matching fixture mobile or email already exists. Review the details and try again." : "The fixture service could not accept this registration. Please try again.";
            submit.disabled = false;
            reset.disabled = false;
        }
    });
    form.addEventListener("reset", () => { window.setTimeout(() => { clearErrors(); status.textContent = ""; success.hidden = true; }, 0); });
    document.getElementById("register-another-donor").addEventListener("click", () => { form.reset(); form.hidden = false; submit.disabled = false; reset.disabled = false; fields.fullName.focus(); });
});
