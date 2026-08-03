document.querySelector("form").addEventListener("submit", async function (e) {
    e.preventDefault();

    alert("Blood Request Submitted Successfully!");

    this.reset();
});