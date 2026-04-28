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
            modal.style.pointerEvents = "auto";
        }
    }, 4000);
};

function closeModal() {
    const modal = document.getElementById("entryModal");
    if (modal) {
        modal.style.display = "none";
        modal.style.pointerEvents = "none";
    }
}

function switchCategory(category, element) {
    document.querySelectorAll(".car-grid").forEach(grid => {
        grid.classList.remove("active");
    });

    document.querySelectorAll(".tab").forEach(tab => {
        tab.classList.remove("active");
    });

    const selectedGrid = document.getElementById(category);
    if (selectedGrid) selectedGrid.classList.add("active");
    if (element) element.classList.add("active");
}

const carData = {
    thar: {
        name: "Thar ROXX",
        desc: "Built for adventure with bold design, rugged strength, premium interiors, and confident road presence.",
        images: {
                Exterior: [
                    "./assets/images/thar/ext1.jpg",
                    "./assets/images/thar/ext2.jpg",
                    "./assets/images/thar/ext3.jpg"
                ],
                Interior: [
                    "./assets/images/thar/int1.jpg",
                    "./assets/images/thar/int2.jpg"
                ],
                "Side View": [
                    "./assets/images/thar/side1.jpg",
                    "./assets/images/thar/side2.jpg"
                ]
            },
        features: [
            "4x4 Capability",
            "All-Terrain Performance",
            "Premium Cabin Experience",
            "Advanced Safety Features"
        ],
        specs: {
            Engine: "mStallion / mHawk",
            Transmission: "Manual / Automatic",
            Seating: "5 Seater",
            Drive: "4x4 Available"
        },
        variants: [
        {
            name: "MX1",
            type: "Base Variant",
            details: ["Essential SUV features", "Manual transmission", "Standard safety package"]
        },
        {
            name: "MX3",
            type: "Mid Variant",
            details: ["Touchscreen infotainment", "Enhanced comfort features", "Improved convenience"]
        },
        {
            name: "AX5L",
            type: "Premium Variant",
            details: ["Advanced safety", "Premium cabin feel", "Better connected features"]
        },
        {
            name: "AX7L",
            type: "Top-End Variant",
            details: ["Luxury features", "Advanced driver assistance", "Best comfort and technology package"]
        }
        ],
        brochure: "./assets/brochures/thar.pdf"
    },

    xuv3xo: {
        name: "XUV 3XO",
        desc: "A smart compact SUV designed with technology, comfort, safety, and dynamic city performance.",
              images: {
                    Exterior: [
                        "./assets/images/thar/ext1.jpg",
                        "./assets/images/thar/ext2.jpg",
                        "./assets/images/thar/ext3.jpg"
                    ],
                    Interior: [
                        "./assets/images/thar/int1.jpg",
                        "./assets/images/thar/int2.jpg"
                    ],
                    "Side View": [
                        "./assets/images/thar/side1.jpg",
                        "./assets/images/thar/side2.jpg"
                    ]
                },
        features: [
            "Advanced Infotainment",
            "Fuel Efficient Performance",
            "Compact SUV Design",
            "Premium Safety Package"
        ],
        specs: {
            Engine: "Petrol / Diesel",
            Transmission: "Manual / Automatic",
            Seating: "5 Seater",
            Safety: "Advanced Driver Assistance"
        },
        variants: [
        {
            name: "MX1",
            type: "Base Variant",
            details: ["Essential SUV features", "Manual transmission", "Standard safety package"]
        },
        {
            name: "MX3",
            type: "Mid Variant",
            details: ["Touchscreen infotainment", "Enhanced comfort features", "Improved convenience"]
        },
        {
            name: "AX5L",
            type: "Premium Variant",
            details: ["Advanced safety", "Premium cabin feel", "Better connected features"]
        },
        {
            name: "AX7L",
            type: "Top-End Variant",
            details: ["Luxury features", "Advanced driver assistance", "Best comfort and technology package"]
        }
    ],
        brochure: "./assets/brochures/xuv3xo.pdf"
    },

    xuv400: {
        name: "XUV 400 EV",
        desc: "Electric SUV built for silent performance, fast charging, zero emissions, and future-ready mobility.",
              images: {
                    Exterior: [
                        "./assets/images/thar/ext1.jpg",
                        "./assets/images/thar/ext2.jpg",
                        "./assets/images/thar/ext3.jpg"
                    ],
                    Interior: [
                        "./assets/images/thar/int1.jpg",
                        "./assets/images/thar/int2.jpg"
                    ],
                    "Side View": [
                        "./assets/images/thar/side1.jpg",
                        "./assets/images/thar/side2.jpg"
                    ]
                },
        features: [
            "Electric Powertrain",
            "Fast Charging",
            "Silent Drive Experience",
            "Connected Car Technology"
        ],
        specs: {
            Range: "Long Range EV",
            Charging: "Fast Charging Support",
            Seating: "5 Seater",
            Drive: "Electric Automatic"
        },
        variants: [
            {
                name: "MX1",
                type: "Base Variant",
                details: ["Essential SUV features", "Manual transmission", "Standard safety package"]
            },
            {
                name: "MX3",
                type: "Mid Variant",
                details: ["Touchscreen infotainment", "Enhanced comfort features", "Improved convenience"]
            },
            {
                name: "AX5L",
                type: "Premium Variant",
                details: ["Advanced safety", "Premium cabin feel", "Better connected features"]
            },
            {
                name: "AX7L",
                type: "Top-End Variant",
                details: ["Luxury features", "Advanced driver assistance", "Best comfort and technology package"]
            }
        ],
        brochure: "./assets/brochures/xuv400.pdf"
    }
};

function loadCarDetails(carKey) {
    const car = carData[carKey];
    if (!car) return;

    document.getElementById("detailTitle").innerText = car.name;
    document.getElementById("detailDesc").innerText = car.desc;
    const mainImage = document.getElementById("detailImage");
const categoryBox = document.getElementById("imageCategory");
const optionsBox = document.getElementById("imageOptions");

categoryBox.innerHTML = "";
optionsBox.innerHTML = "";

const categories = car.images || {};

// get first category
const firstCategory = Object.keys(categories)[0];

// set first image
mainImage.src = categories[firstCategory][0];

// 🔹 Create category buttons
Object.keys(categories).forEach((category, index) => {

    const catBtn = document.createElement("button");
    catBtn.className = index === 0 ? "cat-btn active" : "cat-btn";
    catBtn.innerText = category;

    catBtn.onclick = () => {

        document.querySelectorAll(".cat-btn").forEach(b => b.classList.remove("active"));
        catBtn.classList.add("active");

        renderImages(category);
    };

    categoryBox.appendChild(catBtn);
});

// 🔹 Render images inside category
function renderImages(category) {
    optionsBox.innerHTML = "";

    categories[category].forEach((img, index) => {

        const imgBtn = document.createElement("img");
        imgBtn.src = img;
        imgBtn.className = index === 0 ? "img-option active" : "img-option";

        imgBtn.onclick = () => {
            mainImage.src = img;

            document.querySelectorAll(".img-option").forEach(i => i.classList.remove("active"));
            imgBtn.classList.add("active");
        };

        optionsBox.appendChild(imgBtn);
    });

    // set first image when switching category
    mainImage.src = categories[category][0];
}

// 🔹 Initialize first category images
renderImages(firstCategory);
    document.getElementById("brochureLink").href = car.brochure;

    const featureList = document.getElementById("detailFeatures");
    featureList.innerHTML = "";
    car.features.forEach(feature => {
        const li = document.createElement("li");
        li.innerText = feature;
        featureList.appendChild(li);
    });

    const specsBox = document.getElementById("detailSpecs");
    specsBox.innerHTML = "";
    Object.entries(car.specs || {}).forEach(([key, value]) => {
        specsBox.innerHTML += `
            <div class="spec-item">
                <span>${key}</span>
                <strong>${value}</strong>
            </div>
        `;
    });

    const variantBox = document.getElementById("detailVariants");
const variantDetails = document.getElementById("variantDetails");

variantBox.innerHTML = "";
variantDetails.innerHTML = "";

(car.variants || []).forEach((variant, index) => {
    const btn = document.createElement("button");
    btn.className = index === 0 ? "variant-btn active" : "variant-btn";
    btn.innerText = variant.name;

    btn.onclick = function () {
        document.querySelectorAll(".variant-btn").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");

        variantDetails.innerHTML = `
            <h4>${variant.name} - ${variant.type}</h4>
            <ul>
                ${variant.details.map(item => `<li>${item}</li>`).join("")}
            </ul>
        `;
    };

    variantBox.appendChild(btn);

    if (index === 0) {
        btn.click();
    }
});
    leadData.car_interest = car.name;

    const selectedCarInput = document.getElementById("selectedCar");
    if (selectedCarInput) selectedCarInput.value = car.name;

    if (typeof trackCarView === "function") {
        trackCarView(car.name);
    }

    document.getElementById("carDetails").classList.remove("hidden");
    document.getElementById("carDetails").scrollIntoView({ behavior: "smooth" });
}

function scrollToLeadForm(type) {
    leadData.action_type = type;

    const actionTypeInput = document.getElementById("actionType");
    if (actionTypeInput) actionTypeInput.value = type;

    const leadSection = document.getElementById("leadFormSection");
    if (leadSection) {
        leadSection.scrollIntoView({ behavior: "smooth" });
    }
}

const entryForm = document.getElementById("entryForm");

if (entryForm) {
    entryForm.addEventListener("submit", function (e) {
        e.preventDefault();

        const inputs = this.querySelectorAll("input");

        leadData.name = inputs[0].value;
        leadData.phone = inputs[1].value;

        const nameInput = document.getElementById("name");
        const phoneInput = document.getElementById("phone");

        if (nameInput) nameInput.value = leadData.name;
        if (phoneInput) phoneInput.value = leadData.phone;

        closeModal();
    });
}

async function submitLead(type) {
    leadData.name = document.getElementById("name").value || leadData.name;
    leadData.phone = document.getElementById("phone").value || leadData.phone;
    leadData.email = document.getElementById("email").value;
    leadData.area = document.getElementById("area").value;
    leadData.district = document.getElementById("district").value;
    leadData.profession = document.getElementById("profession").value;
    leadData.car_interest = document.getElementById("selectedCar").value || leadData.car_interest || "Not Selected";
    leadData.action_type = type || document.getElementById("actionType").value || "ENQUIRY";

    leadData.tracking = typeof trackingData !== "undefined" ? trackingData : {};

    if (!leadData.name || !leadData.phone) {
        alert("Please enter Name and Phone Number");
        return;
    }

    try {
        const response = await fetch("https://landing-backend-8gvq.onrender.com/api/lead", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(leadData)
        });

        if (!response.ok) {
            throw new Error(`Server error: ${response.status}`);
        }

        const result = await response.json();

        console.log("Server Response:", result);
        alert("Thank you! Our team will contact you shortly.");

        const form = document.getElementById("mainLeadForm");
        if (form) form.reset();

        leadData = {
            name: "",
            phone: "",
            email: "",
            area: "",
            district: "",
            profession: "",
            car_interest: "",
            action_type: ""
        };

    } catch (error) {
        console.error("Full Error:", error);
        alert("Error: " + error.message);
    }
}