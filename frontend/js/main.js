// 🔴 ENTRY POPUP (unchanged behavior)
let leadData = {
    name: "",
    phone: "",
    email: "",
    area: "",
    district: "",
    profession: "",
    car_interest: "",
    action_type: ""
};

window.onload = function () {
    setTimeout(() => {
        const modal = document.getElementById("entryModal");
        if (modal) {
            modal.style.display = "flex";
        }
    }, 4000);
};

function closeModal() {
    const modal = document.getElementById("entryModal");
    if (modal) {
        modal.style.display = "none";
    }
}

// 🔹 CATEGORY SWITCH (SUV / eSUV)
function switchCategory(category, element) {
    // Hide all car grids
    document.querySelectorAll('.car-grid').forEach(grid => {
        grid.classList.remove('active');
    });

    // Remove active class from all tabs
    document.querySelectorAll('.tab').forEach(tab => {
        tab.classList.remove('active');
    });

    // Show selected category
    const selectedGrid = document.getElementById(category);
    if (selectedGrid) {
        selectedGrid.classList.add('active');
    }

    // Activate clicked tab safely
    if (element) {
        element.classList.add('active');
    }
}

// 🔹 CAR DATA (STATIC FOR NOW)
const carData = {
    thar: {
        name: "Thar ROXX",
        desc: "Built for adventure with unmatched off-road capability.",
        image: "./assets/images/thar.jpg",
        features: [
            "4x4 Capability",
            "All-Terrain Performance",
            "Convertible Design"
        ],
        brochure: "./assets/brochures/thar.pdf"
    },
    xuv3xo: {
        name: "XUV 3XO",
        desc: "Smart SUV with dynamic performance and efficiency.",
        image: "./assets/images/xuv3xo.jpg",
        features: [
            "Advanced Infotainment",
            "Fuel Efficient",
            "Compact SUV Design"
        ],
        brochure: "./assets/brochures/xuv3xo.pdf"
    },
    xuv400: {
        name: "XUV 400 EV",
        desc: "Electric SUV with powerful performance and zero emissions.",
        image: "./assets/images/xuv400.jpg",
        features: [
            "Electric Powertrain",
            "Fast Charging",
            "Silent Drive"
        ],
        brochure: "./assets/brochures/xuv400.pdf"
    }
};

// 🔹 LOAD CAR DETAILS (FINAL MERGED VERSION)
function loadCarDetails(carKey) {
    const car = carData[carKey];
    if (!car) return;

    // Fill UI data
    document.getElementById("detailTitle").innerText = car.name;
    document.getElementById("detailDesc").innerText = car.desc;
    document.getElementById("detailImage").src = car.image;

    // Features list
    const featureList = document.getElementById("detailFeatures");
    featureList.innerHTML = "";

    car.features.forEach(feature => {
        const li = document.createElement("li");
        li.innerText = feature;
        featureList.appendChild(li);
    });

    // Brochure link
    document.getElementById("brochureLink").href = car.brochure;

    // Show section
    document.getElementById("carDetails").classList.remove("hidden");

    // Smooth scroll
    document.getElementById("carDetails").scrollIntoView({ behavior: "smooth" });

    // 🔴 STORE CAR INTEREST (Lead System)
    leadData.car_interest = car.name;
    document.getElementById("selectedCar").value = car.name;

    // 🔵 TRACK USER INTERACTION (Tracking System)
    if (typeof trackCarView === "function") {
        trackCarView(car.name);
    }
}

const entryForm = document.getElementById("entryForm");

if (entryForm) {
    entryForm.addEventListener("submit", function(e) {
        e.preventDefault();

        const inputs = this.querySelectorAll("input");

        leadData.name = inputs[0].value;
        leadData.phone = inputs[1].value;

        closeModal();
    });
}

// 🔹 SUBMIT LEAD (FRONTEND ONLY)
async function submitLead(type) {
    // Collect form values
    leadData.name = document.getElementById("name").value || leadData.name;
    leadData.phone = document.getElementById("phone").value || leadData.phone;
    leadData.email = document.getElementById("email").value;
    leadData.area = document.getElementById("area").value;
    leadData.district = document.getElementById("district").value;
    leadData.profession = document.getElementById("profession").value;
    leadData.action_type = type;

    // 🔹 Ensure tracking always exists
    if (typeof trackingData !== "undefined") {
        leadData.tracking = trackingData;
    } else {
        leadData.tracking = {};
    }

    // 🔹 Validation
    if (!leadData.name || !leadData.phone) {
        alert("Please enter Name and Phone Number");
        return;
    }

    try {
        const response = await fetch("http://localhost:5000/api/lead", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(leadData)
        });

        // 🔹 Handle non-200 responses properly
        if (!response.ok) {
            throw new Error(`Server error: ${response.status}`);
        }

        const result = await response.json();

        console.log("Server Response:", result);

        alert("Thank you! Our team will contact you shortly.");

        // 🔹 Reset form safely
        const form = document.getElementById("mainLeadForm");
        if (form) form.reset();

    } catch (error) {
        console.error("Full Error:", error);
        alert("Error: " + error.message);
    }
}