
const form = document.getElementById("postForm");
const message = document.getElementById("message");

form.addEventListener("submit", async (event) => {
    event.preventDefault();

    message.textContent = "Posting your item...";

    const item = {
        title: document.getElementById("title").value.trim(),
        price: Number(document.getElementById("price").value),
        category: document.getElementById("category").value,
        condition: document.getElementById("condition").value,
        description: document.getElementById("description").value.trim(),
        meetingSpot: document.getElementById("meetingSpot").value
    };

    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;

    try {
        const response = await fetch("/api/listings", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            credentials: "same-origin",
            body: JSON.stringify(item)
        });

        const result = await response.json();

        if (!response.ok || !result.ok) {
            throw new Error(result.error || "Unable to post item.");
        }

        message.textContent = "Item posted successfully!";

        window.location.href = "item.html?id=" +
            encodeURIComponent(result.id);

    } catch (error) {
        message.textContent = error.message;
    } finally {
        button.disabled = false;
    }
});
