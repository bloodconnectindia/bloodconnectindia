document.addEventListener("DOMContentLoaded", () => {

    const form = document.getElementById("blood-request-form");

    if (!form) {
        return;
    }

    form.addEventListener("submit", async (e) => {

        e.preventDefault();

        const patient_name = document.getElementById("patient_name").value.trim();
        const blood_group = document.getElementById("blood_group").value;
        const hospital = document.getElementById("hospital").value.trim();
        const mobile = document.getElementById("mobile").value.trim();
        const address = document.getElementById("address").value.trim();

        const { error } = await supabaseClient
            .from("blood_requests")
            .insert([
                {
                    patient_name,
                    blood_group,
                    hospital,
                    mobile,
                    address
                }
            ]);

        if (error) {
            console.error(error);
            alert(error.message);
            return;
        }

        alert("Blood Request Submitted Successfully!");
        form.reset();

    });

});
