
const listingsContainer = document.getElementById("listings");
const message = document.getElementById("message");

// Load the student's own listings
async function loadMyListings() {
    message.textContent = "";

    try {
        const response = await fetch("/api/listings/mine", {
            credentials: "same-origin"
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || "Unable to load listings.");
        }

        listingsContainer.replaceChildren();

        if (!data.listings || data.listings.length === 0) {
            listingsContainer.textContent = "You have no listings yet.";
            return;
        }

        data.listings.forEach((item) => {
            const card = document.createElement("div");
            card.className = "listing-card";

            const title = document.createElement("h3");
            title.textContent = item.title;

            const price = document.createElement("p");
            price.textContent =
                "$" + (item.price_cents / 100).toFixed(2);

            const status = document.createElement("p");
            status.textContent = "Status: " + item.status;

            const soldButton = document.createElement("button");
            soldButton.textContent = "Mark as Sold";
            soldButton.disabled = item.status !== "active";
            soldButton.addEventListener("click", () => {
                updateListing(item.id, "sold");
            });

            const removeButton = document.createElement("button");
            removeButton.textContent = "Remove";
            removeButton.disabled = item.status === "removed";
            removeButton.addEventListener("click", () => {
                updateListing(item.id, "removed");
            });

            card.append(
                title,
                price,
                status,
                soldButton,
                removeButton
            );

            listingsContainer.appendChild(card);
        });

    } catch (error) {
        message.textContent = error.message;
        listingsContainer.textContent = "";
    }
}

// Update a listing's status
async function updateListing(id, status) {
    message.textContent = "Updating listing...";

    try {
        const response = await fetch(
            "/api/listings/" + encodeURIComponent(id) + "/status",
            {
                method: "PATCH",
                headers: {
                    "Content-Type": "application/json"
                },
                credentials: "same-origin",
                body: JSON.stringify({ status })
            }
        );

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || "Unable to update listing.");
        }

        await loadMyListings();

    } catch (error) {
        message.textContent = error.message;
    }
}

// Load listings when the page opens
loadMyListings();

