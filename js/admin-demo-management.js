document.addEventListener("DOMContentLoaded", async () => {
    const user = await BloodConnectAdminShell.init();
    if (!user) return;
    const status = document.getElementById("demo-management-status");
    const batchList = document.getElementById("demo-batch-list");
    const resetForm = document.getElementById("demo-reset-form");

    const setStatus = (message) => {
        status.textContent = message;
    };

    try {
        const { data: batches, error } = await supabaseClient
            .from("demo_batches")
            .select("id, label, status, created_at")
            .order("created_at", { ascending: false });

        if (error) {
            throw error;
        }

        if (!batches.length) {
            batchList.textContent = "No demo data batches exist.";
        } else {
            batchList.textContent = batches
                .map((batch) => `${batch.label} — ${batch.status} (${batch.id})`)
                .join("\n");
        }

        setStatus("Authenticated session verified. Reset authorization is enforced by the server endpoint.");
        resetForm.hidden = false;
    } catch (error) {
        console.error(error);
        setStatus(error.message || "Admin access is required.");

        if (resetForm) {
            resetForm.hidden = true;
        }

        return;
    }

    resetForm.addEventListener("submit", async (event) => {
        event.preventDefault();

        const submitButton = resetForm.querySelector('button[type="submit"]');

        const phrase = document.getElementById("demo-reset-phrase").value;
        const targetBatch = document.getElementById("demo-reset-batch").value || null;
        const reason = document.getElementById("demo-reset-reason").value.trim();

        if (phrase !== "RESET DEMO DATA") {
            setStatus("Enter the exact confirmation phrase before requesting a reset.");
            return;
        }

        if (!window.confirm("This permanently deletes only explicitly marked demo records. Continue?")) {
            return;
        }

        try {
            submitButton.disabled = true;
            const { data, error } = await supabaseClient.functions.invoke("reset-demo-data", {
                body: {
                    confirmation_phrase: phrase,
                    target_demo_batch_id: targetBatch,
                    reason,
                    request_id: crypto.randomUUID()
                }
            });

            if (error || !data?.completed) {
                throw error || new Error("Demo reset was not completed.");
            }

            setStatus("Demo reset completed.");
            resetForm.reset();
        } catch (error) {
            console.error(error);
            setStatus("Demo reset was not completed.");
        } finally {
            submitButton.disabled = false;
        }
    });
});
