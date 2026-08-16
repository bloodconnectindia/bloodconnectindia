document.addEventListener("DOMContentLoaded", () => {
    const form = document.getElementById("blood-request-form");
    if (!form) return;
    const submit = document.getElementById("blood-request-submit");
    const status = document.getElementById("blood-request-status");
    const fields = { patient_name: document.getElementById("patient_name"), blood_group: document.getElementById("blood_group"), hospital: document.getElementById("hospital"), mobile: document.getElementById("mobile"), address: document.getElementById("address") };
    const errors = { patient_name: document.getElementById("patient-name-error"), blood_group: document.getElementById("blood-group-error"), hospital: document.getElementById("hospital-error"), mobile: document.getElementById("mobile-error"), address: document.getElementById("address-error") };
    const groups = new Set(["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"]);
    const setError = (key, message) => { errors[key].textContent = message; fields[key].setAttribute("aria-invalid", String(Boolean(message))); };
    const clearErrors = () => Object.keys(errors).forEach(key => setError(key, ""));
    function validate() {
        clearErrors();
        const payload = { patient_name: fields.patient_name.value.trim(), blood_group: fields.blood_group.value, hospital: fields.hospital.value.trim(), mobile: fields.mobile.value.replace(/\D/g, "").replace(/^91(?=\d{10}$)/, ""), address: fields.address.value.trim() };
        if (payload.patient_name.length < 2 || payload.patient_name.length > 120) setError("patient_name", "Enter a patient name between 2 and 120 characters.");
        if (!groups.has(payload.blood_group)) setError("blood_group", "Select a valid blood group.");
        if (payload.hospital.length < 2 || payload.hospital.length > 160) setError("hospital", "Enter a hospital name between 2 and 160 characters.");
        if (!/^[6-9]\d{9}$/.test(payload.mobile)) setError("mobile", "Enter a valid 10-digit Indian mobile number.");
        if (payload.address.length < 5 || payload.address.length > 500) setError("address", "Enter an address between 5 and 500 characters.");
        return form.querySelector("[aria-invalid=true]") ? null : payload;
    }
    form.addEventListener("submit", async event => {
        event.preventDefault(); status.textContent = "";
        const payload = validate();
        if (!payload) { status.dataset.state = "error"; status.textContent = "Please correct the highlighted fields."; form.querySelector("[aria-invalid=true]")?.focus(); return; }
        submit.disabled = true; status.dataset.state = "loading"; status.textContent = "Submitting request...";
        try {
            const { data, error } = await supabaseClient.functions.invoke("submit-blood-request", { body: payload });
            if (error || !data?.accepted) throw new Error("SUBMISSION_FAILED");
            form.reset(); clearErrors(); status.dataset.state = "success"; status.textContent = "Your request was received for review.";
        } catch { status.dataset.state = "error"; status.textContent = "Unable to submit your request right now. Please try again."; }
        finally { submit.disabled = false; }
    });
    form.addEventListener("reset", () => window.setTimeout(() => { clearErrors(); status.textContent = ""; status.removeAttribute("data-state"); }, 0));
});
